import 'dotenv/config'
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { scrapeAll } from '../_webapp/core/JobManager.mjs';
import { mergeJobs } from '../_webapp/scripts/merge.mjs';

function syncJobsToPublic() {
  try {
    const src = path.join(__dirname, 'src/jobsData.json');
    const dst = path.join(__dirname, 'public/jobsData.json');
    fs.copyFileSync(src, dst);
  } catch {}
}
import { COMPANIES } from '../_webapp/companies.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 管理员密码
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '200633';

// 连续失败追踪（jobId → 累计失败次数）
const consecutiveFails = new Map();

// 刷新控制
let refreshing = false;
let refreshControl = { paused: false, stopped: false };

// 中间件
app.use(express.json({ limit: '1mb' }));

// CORS（允许 GitHub Pages 跨域）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ========== 管理员认证中间件 ==========
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token === ADMIN_PASSWORD) return next();
  res.status(401).json({ error: '需要管理员密码' });
}

// ========== LLM 配置 ==========
const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://api.deepseek.com/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash';
const LLM_KEY = process.env.LLM_KEY || '';

// ========== 技能知识库 ==========
let _skillsKnow = null;
function loadSkillsKnowledge() {
  if (!_skillsKnow) {
    try { _skillsKnow = JSON.parse(fs.readFileSync(path.join(__dirname, 'server-data/skills_knowledge.json'), 'utf8')); }
    catch { _skillsKnow = {}; }
  }
  return _skillsKnow;
}

// ========== 对话记忆（短期，最多保留最近 3 轮对话摘要） ==========
const chatMemory = new Map();  // ip → [{ role, content }]
const MEMORY_MAX_ROUNDS = 3;
function updateMemory(ip, messages) {
  const recent = messages.slice(-MEMORY_MAX_ROUNDS * 2); // 每轮=user+assistant
  chatMemory.set(ip, recent);
}
function getMemoryContext(ip) {
  const mem = chatMemory.get(ip);
  if (!mem || mem.length === 0) return '';
  const lines = mem.map(m => `[${m.role === 'user' ? '用户' : '助手'}]: ${(m.content || '').substring(0, 300)}`).join('\n');
  return `\n\n[近期对话回顾]\n${lines}\n（以上为历史对话摘要，请结合上下文理解用户当前问题）`;
}

// ========== 岗位数据缓存 ==========
const JOBS_FILE = path.join(__dirname, 'src/jobsData.json');
let _jobsCache = null;
let _jobsCacheAt = 0;
const JOBS_CACHE_TTL = 30_000;

function loadJobs() {
  if (!_jobsCache || Date.now() - _jobsCacheAt > JOBS_CACHE_TTL) {
    try { _jobsCache = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')); _jobsCacheAt = Date.now(); }
    catch { _jobsCache = { lastUpdated: '', total: 0, byCompany: {}, results: [] }; }
  }
  return _jobsCache;
}

// ========== 公司别名 ==========
const COMPANY_ALIASES = {
  '字节跳动': 'bytedance', 'bytedance': 'bytedance', '字节': 'bytedance',
  '阿里巴巴': 'alibaba', 'alibaba': 'alibaba', '阿里': 'alibaba',
  '腾讯': 'tencent', 'tencent': 'tencent',
  '美团': 'meituan', 'meituan': 'meituan',
  '百度': 'baidu', 'baidu': 'baidu',
};

// ========== 动态系统提示词 ==========
function buildSystemPrompt() {
  const jobs = loadJobs();
  const coList = Object.entries(jobs.byCompany || {})
    .map(([k, v]) => `${k}(${v}个)`).join('、') || '暂无数据';
  const skillsKnow = loadSkillsKnowledge();

  // 构建技能知识摘要（按分类组织，取重要的供给 LLM）
  const catMap = {};
  for (const [name, info] of Object.entries(skillsKnow)) {
    if (!catMap[info.category]) catMap[info.category] = [];
    catMap[info.category].push(`${name}(${info.difficulty === 'advanced' ? '高级' : info.difficulty === 'intermediate' ? '中级' : '入门'}, 前置: ${info.prerequisites.length ? info.prerequisites.slice(0, 3).join('/') : '无'})`);
  }
  const skillSummary = Object.entries(catMap).map(([cat, items]) =>
    `【${cat}】${items.slice(0, 12).join('、')}${items.length > 12 ? '等' : ''}`
  ).join('\n');

  return `你是"校招岗位技能矩阵"的AI求职助手，服务于一位正在找AI/算法方向校招岗位的学生。你的核心职责是帮助用户理解岗位技能需求、评估自身技术栈匹配度、制定有实操性的学习路线。

## 当前数据库概况
更新时间：${jobs.lastUpdated || '未知'}，总计 ${jobs.total || 0} 个岗位。
公司分布：${coList}。

## 技能知识库（供你回答时参考，了解技能之间的前置关系）
${skillSummary}

## 回答规范
1. **岗位搜索问题**（"有没有AI Agent相关的岗位""哪些公司在招CV方向""有没有字节的Python实习岗"）：
   - 必须调用 search_jobs，把用户提到的技术方向/技能名填入 skill 参数（如 skill="Agent"、"CV"、"Python"）。
   - 如果首次搜索结果为空，换一个同义关键词再搜一次（如 "Agent" 无结果 → 试 "AI Agent" 或 "LLM"）。
   - 搜索结果必须逐条列出，每条包含：**岗位名**、公司、城市、关键技能标签。最后给出总数和下一步建议（如"想看哪个的详细JD？"）。
   - 示例输出格式：
\`\`\`
找到 3 个与 AI Agent 相关的岗位：

**1. AI技术生态运营** | 百度 | 上海
技能：大模型、Agent、Prompt、深度学习

**2. AI应用开发工程师** | 字节跳动 | 北京
技能：LLM、Agent、LangChain、Python

**3. 大模型应用开发** | 美团 | 北京
技能：RAG、Agent、LLM、Python

共 3 个相关岗位。想看哪个岗位的完整 JD 和学习路线？告诉我序号或岗位名即可。
\`\`\`
2. **简短问题**（如"有多少Python岗位""有哪些公司"）→ 直接给数字/列表，不超过3句话。
3. **分析型问题**（如"这个岗位适合我吗""Python和Java哪个更好"）→ 列出关键对比点，给出明确建议，控制在100-200字。
4. **学习路线问题**分为两类：
   a) **针对岗位的学习路线**（"帮我分析这个岗位需要学什么""给我制定一个学习计划"）：
      - 先用 get_job_detail 拉JD → 对关键技能用 get_skill_info 查前置 → 最后用 generate_study_plan 生成路线。
   b) **针对技能的学习路线**（"怎么学Python""LangChain怎么入门""想学CUDA"）：
      - 必须调用 generate_skill_roadmap 工具，它会生成完整的分阶段学习路线（简介→前置知识→三阶段→资源→提示）。
      - 如果用户同时问多个技能（"怎么学Python和PyTorch"），一次调用传入多个技能名。
5. 所有回答用中文，Markdown 结构，技能名用**加粗**，代码用反引号。

## 工具的选用指南
- 用户按技能/技术方向找岗位 → **必须**用 search_jobs(skill="关键词")，不要用 title 参数去猜
- 用户问公司有哪些岗位 → 用 search_jobs(company="公司名")
- 用户问公司概况 → 用 list_companies
- 用户问技能热度/趋势 → 用 list_skills 查频率
- 用户点某个具体岗位要详细分析 → 用 get_job_detail 拉 JD，再结合技能知识库分析
- 用户要学习路线 → 先用 get_job_detail 拉 JD，再用 generate_study_plan 生成结构化路线
- 用户问"xx是什么" → 用 get_skill_info 查技能知识库
- 不要在没查数据的情况下编造岗位信息
- 搜索岗位时 skill 参数用简短的技能关键词（如"Agent"而非"AI Agent应用开发"），提高匹配率

## Few-shot 示例

### 示例1：按技能/领域搜索岗位
用户："有什么有关AI Agent应用开发的岗位"
你的做法：调用 search_jobs(skill="Agent") → 得到结果
你输出：
\`\`\`
找到 3 个与 Agent 相关的岗位：

**1. AI技术生态运营** | 百度 | 上海
技能：大模型、Agent、Prompt、深度学习

**2. AI应用开发工程师** | 字节跳动 | 北京
技能：LLM、Agent、LangChain、Python

**3. 大模型应用开发** | 美团 | 北京
技能：RAG、Agent、LLM、Python

共 3 个相关岗位。想看哪个岗位的完整 JD 和学习路线？告诉我序号或岗位名即可。
\`\`\`

用户："有没有做计算机视觉的岗位"
你的做法：调用 search_jobs(skill="CV") → 如果没有结果，再试 search_jobs(skill="计算机视觉")
你输出：列出搜到的岗位，逐条包含岗位名、公司、城市、技能标签

### 示例2：简单查询
用户："现在有哪些公司在招人"
你的做法：调用 list_companies → 得到结果
你输出："当前数据库覆盖5家公司：百度(2个AI实习岗)、字节跳动(14个)、阿里巴巴(4个)、腾讯(1个)、美团(13个)。总计34个岗位，想了解哪家公司的详情？"

### 示例3：岗位学习路线
用户："帮我分析一下百度的AI技术生态运营这个岗位，看看我需要学什么"
你的做法：
1. search_jobs(company="baidu") 找到目标岗位 → 拿到 job_id
2. get_job_detail(job_id="...") 拉完整 JD
3. 对JD中每个技能，用 get_skill_info 查前置知识
4. generate_study_plan(job_id="...") 生成结构化路线

### 示例3：技能学习路线
用户："我想学LangChain，应该从哪里开始？"
你的做法：
1. generate_skill_roadmap(skill_names=["LangChain"]) → 工具返回完整的含前置知识+三阶段+资源的学习路线
2. 系统会自动展示完整路线，你只需简短收尾：问用户是否需要深入了解某个阶段

用户："怎么同时学Python和PyTorch？"
你的做法：
1. generate_skill_roadmap(skill_names=["Python", "PyTorch"]) → 一次查询两个技能
2. 系统自动展示完整路线，你简短收尾

### 示例4：超出范围
用户："今天天气怎么样" / "帮我写个爬虫脚本"
你输出："抱歉，我是求职助手，只能回答校招岗位、技能分析和学习路线相关的问题。你可以问我：有哪些AI岗位？需要学什么技能？某个岗位的具体JD是什么？"

## 边界规则
- 只回答校招求职、岗位技能、学习路线相关问题，超出范围礼貌拒绝
- 查询数据必须用工具，不要凭记忆编造
- 如果工具返回空或失败，如实告知用户，不要编结果
- **重要：** 当 generate_study_plan 返回结果后，你必须将其 studyPlan 字段的 Markdown 内容**完整、逐字**输出给用户。绝对不能删减、概括为"以上就是完整的学习路线"，也不能用"可以参考以上内容"等模糊表述替代。把这个当作硬性要求。`;
}

// ========== 工具定义 ==========
const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_jobs',
      description: '搜索岗位数据库。按公司、技能、岗位名、城市筛选。',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: '公司名称（支持中文名或英文key）' },
          skill: { type: 'string', description: '技能名称' },
          title: { type: 'string', description: '岗位名关键词' },
          city: { type: 'string', description: '城市' },
          limit: { type: 'integer', description: '最多返回多少条，默认5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_companies',
      description: '列出所有公司的岗位数量和概况',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: '列出技能及其在岗位中的出现频率',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '可选，按关键词过滤技能名' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_job_detail',
      description: '获取指定岗位的完整JD描述、技能列表和岗位链接',
      parameters: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: '岗位ID，从 search_jobs 结果中获取' }
        },
        required: ['job_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_skill_info',
      description: '查询特定技能的定义、难度、分类、前置技能和学习建议。可一次查询多个技能。',
      parameters: {
        type: 'object',
        properties: {
          skill_names: { type: 'array', items: { type: 'string' }, description: '要查询的技能名称列表，如 ["PyTorch", "CUDA", "LLM"]' }
        },
        required: ['skill_names']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_skill_roadmap',
      description: '用户询问"如何学习某个技能"时调用。根据技能名称，生成该技能的分阶段学习路线（含前置知识、推荐资源、项目练习）。可一次为多个技能生成路线。',
      parameters: {
        type: 'object',
        properties: {
          skill_names: { type: 'array', items: { type: 'string' }, description: '要生成学习路线的技能名称列表，如 ["LangChain", "CUDA"]' }
        },
        required: ['skill_names']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_study_plan',
      description: '根据岗位ID，结合完整JD和技能知识库，生成分阶段的结构化学习路线（含时间线、资源推荐、项目建议）',
      parameters: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: '岗位ID，从 search_jobs 或 get_job_detail 结果中获取' }
        },
        required: ['job_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'trigger_crawl',
      description: '触发爬虫重新抓取岗位数据（仅管理员可用）。可指定公司或抓取全部。',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: '可选，指定公司名称（如"baidu""bytedance"），不填则抓取全部' }
        }
      }
    }
  }
];

// ========== 工具执行器 ==========
function execSearchJobs(args) {
  const data = loadJobs();
  let results = data.results || [];
  const company = args.company || '';
  const skill = args.skill || '';
  const title = args.title || '';
  const city = args.city || '';
  const limit = args.limit || 5;

  if (company) {
    const key = COMPANY_ALIASES[company] || company;
    results = results.filter(j => j.source === key || j.company === key);
  }
  if (skill) {
    const q = skill.toLowerCase();
    results = results.filter(j =>
      [...(j.skills || []), ...(j.descSkills || []), ...(j.bonusSkills || [])]
        .some(s => s.toLowerCase().includes(q))
    );
  }
  if (title) {
    const q = title.toLowerCase();
    results = results.filter(j => j.title.toLowerCase().includes(q));
  }
  if (city) {
    results = results.filter(j => (j.location || '').includes(city));
  }
  return {
    total_matches: results.length,
    showing: Math.min(results.length, limit),
    jobs: results.slice(0, limit).map(j => ({
      id: j.id, company: j.company, title: j.title,
      location: j.location, url: j.url,
      skills: j.skills || [], descSkills: j.descSkills || [], bonusSkills: j.bonusSkills || [],
      snippet: results.length === 1
        ? (j.jdText || '').substring(0, 3000)
        : (j.jdText || '').substring(0, 200)
    }))
  };
}

function execListCompanies() {
  const data = loadJobs();
  return {
    companies: Object.entries(data.byCompany || {}).map(([name, count]) => ({ name, count })),
    total: data.total || 0,
    lastUpdated: data.lastUpdated || ''
  };
}

function execListSkills(args) {
  const data = loadJobs();
  const keyword = (args.keyword || '').toLowerCase();
  const skillMap = {};
  for (const j of data.results || []) {
    for (const s of [...(j.skills || []), ...(j.descSkills || []), ...(j.bonusSkills || [])]) {
      skillMap[s] = (skillMap[s] || 0) + 1;
    }
  }
  let list = Object.entries(skillMap).map(([name, count]) => ({ name, count }));
  if (keyword) list = list.filter(s => s.name.toLowerCase().includes(keyword));
  list.sort((a, b) => b.count - a.count);
  return { skills: list.slice(0, 30), total_distinct: Object.keys(skillMap).length };
}

function execGetJobDetail(args) {
  const data = loadJobs();
  const job = (data.results || []).find(j => j.id === args.job_id);
  if (!job) return { error: '岗位未找到' };
  return {
    id: job.id, company: job.company, title: job.title, location: job.location,
    url: job.url, skills: job.skills || [],
    descSkills: job.descSkills || [], bonusSkills: job.bonusSkills || [],
    jdText: job.jdText || '暂无描述'
  };
}

function execGetSkillInfo(args) {
  const skillsKnow = loadSkillsKnowledge();
  const names = args.skill_names || [];
  const results = {};
  const notFound = [];
  for (const name of names) {
    // 尝试精确匹配或忽略大小写匹配
    const keys = Object.keys(skillsKnow);
    const match = keys.find(k => k.toLowerCase() === name.toLowerCase());
    if (match) {
      const info = skillsKnow[match];
      results[match] = {
        category: info.category,
        difficulty: info.difficulty,
        prerequisites: info.prerequisites,
        description: info.desc,
        learningPath: info.prerequisites.length
          ? `建议先学 ${info.prerequisites.join(' → ')} → ${match}`
          : `${match} 可独立入门学习`
      };
    } else {
      notFound.push(name);
    }
  }
  return { found: results, notFound, totalFound: Object.keys(results).length, totalQueried: names.length };
}

function execGenerateSkillRoadmap(args) {
  const skillsKnow = loadSkillsKnowledge();
  const names = args.skill_names || [];
  const roadmaps = [];
  const notFound = [];

  for (const name of names) {
    const keys = Object.keys(skillsKnow);
    const match = keys.find(k => k.toLowerCase() === name.toLowerCase());
    if (!match) { notFound.push(name); continue; }

    const info = skillsKnow[match];
    const diffLabel = info.difficulty === 'advanced' ? '高级' : info.difficulty === 'intermediate' ? '中级' : '入门';

    // 递归查所有前置技能的前置
    function collectPrereqs(skillName, depth, visited) {
      if (depth > 3 || visited.has(skillName.toLowerCase())) return [];
      visited.add(skillName.toLowerCase());
      const k = Object.keys(skillsKnow).find(x => x.toLowerCase() === skillName.toLowerCase());
      if (!k || !skillsKnow[k].prerequisites.length) return [];
      const prereqs = [];
      for (const p of skillsKnow[k].prerequisites) {
        const pInfo = skillsKnow[Object.keys(skillsKnow).find(x => x.toLowerCase() === p.toLowerCase())] || null;
        prereqs.push({ name: p, desc: pInfo?.desc || '', difficulty: pInfo?.difficulty || 'beginner' });
        prereqs.push(...collectPrereqs(p, depth + 1, visited));
      }
      return prereqs;
    }
    const allPrereqs = collectPrereqs(match, 0, new Set());

    // 去重
    const seen = new Set();
    const uniquePrereqs = [];
    for (const p of allPrereqs) {
      if (!seen.has(p.name.toLowerCase())) { seen.add(p.name.toLowerCase()); uniquePrereqs.push(p); }
    }

    const needsPrereqs = uniquePrereqs.length > 0;
    const prereqList = needsPrereqs
      ? uniquePrereqs.map(p => `- **${p.name}**（${p.difficulty === 'advanced' ? '高级' : p.difficulty === 'intermediate' ? '中级' : '入门'}）：${p.desc}`).join('\n')
      : '无需特殊前置知识，可直接开始学习。';

    const roadmap = `## 🎯 学习目标：${match}（${info.category} · ${diffLabel}）

### 📖 技能简介
${info.desc}

### 🔗 前置知识
${prereqList}

### 🪜 第一阶段：基础入门（1-2周）
${info.prerequisites.length > 0
  ? `先掌握前置技能：**${info.prerequisites.join('、')}**。`
  : `直接上手 ${match} 的基础概念和核心API。`}
${info.difficulty === 'beginner'
  ? `- 阅读官方文档 Quickstart 部分\n- 完成 2-3 个官方 Tutorial\n- 在 GitHub 找 1 个简单的 ${match} Demo 项目跑通`
  : info.difficulty === 'intermediate'
    ? `- 通读官方文档核心章节，理解设计理念\n- 复现官方示例，理解每个组件的作用\n- 阅读 1-2 篇 ${match} 的架构解析博客`
    : `- 先精通前置技能链\n- 阅读 ${match} 的论文或技术白皮书\n- 阅读源码中核心模块的实现`}

### 🪜 第二阶段：核心实战（2-4周）
- 做一个中等复杂度的实战项目
- 遇到问题查阅官方文档 + GitHub Issues + Stack Overflow
- 关注 ${match} 的 Best Practices 和常见反模式
${info.category === '大模型' || info.category === 'AI框架'
  ? `- 尝试在 Kaggle / Colab 上跑通一个完整的 ${match} Pipeline\n- 对比 ${match} 与同类工具的设计差异`
  : `- 在实际项目中替换现有方案为 ${match}\n- 编写测试用例，验证边界条件`}

### 🪜 第三阶段：深入优化（2-4周）
- 阅读 ${match} 的核心源码（至少理解关键模块）
- 学习性能调优和常见问题排查
- 写一篇技术博客总结学习心得（教给别人是最好的学习方式）
${info.difficulty === 'advanced'
  ? `- 尝试为 ${match} 提交 PR 或写插件扩展\n- 关注 ${match} 的最新论文/Release Notes`
  : `- 在项目中推广 ${match} 的最佳实践\n- 帮助团队其他成员上手`}

### 📚 推荐资源
- **官方文档**：${match} 官方文档（首选）
- **实战课程**：在 B站/YouTube/Coursera 搜索 "${match} tutorial"
- **社区**：GitHub Discussions、Reddit、知乎、掘金上的 ${match} 标签
- **书籍**：搜索 "${match} 实战" 或 "${match} in Action" 系列

### ⚠️ 学习提示
- 不要试图一次学完所有内容，按阶段循序渐进
- 每个阶段结束做一个 mini-project 巩固
- 遇到报错先去 GitHub Issues 搜索，大概率有人遇到过
- ${needsPrereqs ? `前置技能 ${uniquePrereqs.slice(0, 3).map(p => p.name).join('、')} 如果有薄弱环节，建议先补上再深入 ${match}` : '可以直接开始，入门门槛低'}`;

    roadmaps.push({ skill: match, roadmap });
  }

  return { roadmaps, notFound, totalGenerated: roadmaps.length };
}

function execGenerateStudyPlan(args) {
  const data = loadJobs();
  const skillsKnow = loadSkillsKnowledge();
  const job = (data.results || []).find(j => j.id === args.job_id);
  if (!job) return { error: '岗位未找到' };

  const allSkills = [...new Set([...(job.skills || []), ...(job.descSkills || []), ...(job.bonusSkills || [])])];

  // 为每个技能查前置，构建技能树
  const skillTree = [];
  const seen = new Set();
  for (const s of allSkills) {
    if (seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    const info = skillsKnow[s] || skillsKnow[Object.keys(skillsKnow).find(k => k.toLowerCase() === s.toLowerCase())] || null;
    skillTree.push({
      name: s,
      category: info?.category || '未知',
      difficulty: info?.difficulty || 'beginner',
      prerequisites: info?.prerequisites || [],
      desc: info?.desc || ''
    });
  }

  // 按难度和学习依赖排序
  const diffOrder = { beginner: 0, intermediate: 1, advanced: 2 };
  skillTree.sort((a, b) => {
    if (diffOrder[a.difficulty] !== diffOrder[b.difficulty]) return diffOrder[a.difficulty] - diffOrder[b.difficulty];
    return a.prerequisites.length - b.prerequisites.length;
  });

  const beginners = skillTree.filter(s => s.difficulty === 'beginner');
  const intermediates = skillTree.filter(s => s.difficulty === 'intermediate');
  const advanced = skillTree.filter(s => s.difficulty === 'advanced');

  // 生成完整的学习路线 Markdown 文本
  const plan = `## 📍 目标岗位：${job.company} — ${job.title}

### 🪜 第一阶段：基础入门（1-2周）
${beginners.length > 0
  ? beginners.map((s, i) => `${i + 1}. **${s.name}** — ${s.desc}${s.prerequisites.length ? ` | 前置知识：${s.prerequisites.join('、')}` : ''}`).join('\n')
  : '1. 熟悉 Python 编程基础和常用数据结构'}

**推荐资源：**
- Python官方文档 / 《Python编程：从入门到实践》
- LeetCode 简单题每天2道（数组、字符串、哈希表）
- 吴恩达《机器学习》Coursera 前3周

### 🪜 第二阶段：核心技能（2-4周）
${intermediates.length > 0
  ? intermediates.slice(0, 6).map((s, i) => `${i + 1}. **${s.name}** — ${s.desc}`).join('\n')
  : '1. 学习深度学习基础：反向传播、CNN/RNN、优化器原理'}

**推荐资源：**
- 李沐《动手学深度学习》在线版（d2l.ai）
- PyTorch 官方教程
- 吴恩达 Deep Learning Specialization
- 每周2-3道中等难度 LeetCode

### 🪜 第三阶段：高级进阶（1-3个月）
${advanced.length > 0
  ? advanced.slice(0, 6).map((s, i) => `${i + 1}. **${s.name}** — ${s.desc}`).join('\n')
  : '1. 深入研究大模型架构：Transformer、注意力机制、预训练/微调范式'}

**推荐资源：**
- Andrej Karpathy "Neural Networks: Zero to Hero" YouTube系列
- 《Attention Is All You Need》论文精读
- HuggingFace Transformers 文档
- 参与开源项目（如 vLLM、LangChain 提交 PR）

### 🪜 第四阶段：实战项目（2-4周）
选择一个与目标岗位直接相关的项目：

1. **RAG知识库问答系统** — 用 LangChain + 向量数据库搭建，覆盖 Embedding、检索、生成全链路
2. **大模型微调实践** — 用 LoRA 微调一个开源 LLM，部署到 HuggingFace Spaces
3. **简历技能项目** — 从 JD 中提炼核心技能，做一个能写进简历的项目（GitHub 仓库 + 技术博客）

### ⚠️ 注意事项
- 不要试图同时学所有技能，按阶段循序渐进
- 每个阶段结束时做一个 mini-project 巩固
- 优先掌握 ${allSkills.slice(0, 4).join('、')} 等核心技能，其余了解即可
- 校招面试更看重基础和思维，不要过度追求"会用"而忽略"理解原理"`;

  return {
    jobTitle: job.title,
    company: job.company,
    allSkills,
    skillTree: skillTree.map(s => ({ name: s.name, difficulty: s.difficulty, category: s.category })),
    studyPlan: plan,
    instruction: '请将 studyPlan 字段中的完整学习路线 Markdown 原文输出给用户，不要做任何删减或总结。可以加一句简短的个人化建议作为开头。'
  };
}

async function execTriggerCrawl(args) {
  const company = args.company || '';
  try {
    const { scrapeAll } = await import('../_webapp/core/JobManager.mjs');
    const companies = company ? [company] : undefined;
    // 异步启动爬虫，不等待完成
    scrapeAll({ companies, onLog: (msg) => console.log('[爬虫]', msg) })
      .then(() => { mergeJobs({ onLog: () => {} }); syncJobsToPublic(); pushToDataRepo(); })
      .catch(err => console.error('[爬虫] 失败:', err.message));
    return {
      triggered: true,
      message: company
        ? `已触发 ${company} 的爬虫任务，预计需要1-3分钟完成数据抓取和合并。`
        : '已触发全部公司的爬虫任务，预计需要3-10分钟。刷新完成后页面数据会自动更新。'
    };
  } catch (e) {
    return { triggered: false, error: '爬虫模块加载失败: ' + e.message };
  }
}

function executeTool(name, args) {
  switch (name) {
    case 'search_jobs': return execSearchJobs(args);
    case 'list_companies': return execListCompanies();
    case 'list_skills': return execListSkills(args);
    case 'get_job_detail': return execGetJobDetail(args);
    case 'get_skill_info': return execGetSkillInfo(args);
    case 'generate_skill_roadmap': return execGenerateSkillRoadmap(args);
    case 'generate_study_plan': return execGenerateStudyPlan(args);
    case 'trigger_crawl': return execTriggerCrawl(args);
    default: return { error: '未知工具: ' + name };
  }
}

// ========== 外部链接抓取（轻量，不需要 Playwright） ==========
async function scrapeExternalUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobSkillMatrix/1.0)' }
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    // 简易提取文本
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, '\n')
      .trim()
      .substring(0, 3000);
    return text.length > 200 ? text : null;
  } catch {
    return null;
  }
}

// ========== Playwright 浏览器复用 ==========
import pw from '../_webapp/node_modules/playwright/index.js';
const { chromium } = pw;
let sharedBrowser = null;
let fixCount = 0;

async function getBrowser() {
  if (!sharedBrowser || !sharedBrowser.isConnected() || fixCount >= 50) {
    if (sharedBrowser) { try { await sharedBrowser.close(); } catch {} }
    sharedBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
    });
    fixCount = 0;
  }
  fixCount++;
  return sharedBrowser;
}

/** 通用抓取详情页 */
async function scrapeUrl(url, reason) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN'
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });
  const page = await context.newPage();

  try {
    // 各 reason 差异化策略
    if (reason === 'timeout' || reason === 'network_error') {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    } else if (reason === 'empty_page') {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(8000);
    } else if (reason === 'rate_limited') {
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
    }

    const bodyText = await page.evaluate(() => document.body.innerText);

    // 检查登录墙
    if (bodyText.includes('请登录') || bodyText.includes('立即登录')) {
      await context.close();
      return { success: false, reason: 'login_required', jdText: '' };
    }

    // 检查下架
    if (bodyText.includes('已关闭') || bodyText.includes('已下线') || bodyText.includes('不存在')) {
      await context.close();
      return { success: false, reason: 'job_closed', jdText: '' };
    }

    await context.close();
    return { success: bodyText.length > 200, jdText: bodyText, reason: bodyText.length > 200 ? 'ok' : 'empty_page' };
  } catch (err) {
    await context.close();
    return { success: false, reason: err.message?.includes('Timeout') ? 'timeout' : 'network_error', jdText: '' };
  }
}

// 密码验证接口
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: '密码错误' });
  }
});

// 数据刷新接口（SSE 不支持 header，用 query 参数认证）
app.get('/api/refresh', (req, res) => {
  if (req.query.token !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '需要管理员密码' });
    return;
  }
  if (refreshing) {
    res.status(409).json({ error: '已有刷新任务在运行' });
    return;
  }
  refreshing = true;
  refreshControl = { paused: false, stopped: false };

  // 加载旧数据，用于检测技能变化
  let oldJobsMap = new Map();
  try {
    const oldData = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    (oldData.results || []).forEach(j => {
      oldJobsMap.set(j.id, {
        skills: new Set([...(j.skills || []), ...(j.descSkills || []), ...(j.bonusSkills || [])])
      });
    });
  } catch {}

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'start', message: '开始刷新数据...' })}\n\n`);

  scrapeAll({
    controller: refreshControl,
    onLog: ({ level, message }) => {
      if (level === 'failures_batch') {
        try {
          const batch = JSON.parse(message);
          for (const f of batch.failures) {
            const count = (consecutiveFails.get(f.jobId) || 0) + 1;
            consecutiveFails.set(f.jobId, count);
            f.consecutiveFails = count;
          }
          res.write(`data: ${JSON.stringify({ type: 'failures_batch', company: batch.company, failures: batch.failures })}\n\n`);
        } catch {}
        return;
      }
      const type = level === 'error' ? 'error' : 'log';
      res.write(`data: ${JSON.stringify({ type, message })}\n\n`);
    }
  }).then(result => {
    const stopped = refreshControl.stopped;
    if (stopped) {
      res.write(`data: ${JSON.stringify({ type: 'partial_done', total: result.total, message: `刷新已终止。已爬取数据保存至各公司文件，未合并至前端（仅全量刷新更新）。` })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'log', message: '\n[合并] 正在生成前端数据文件...' })}\n\n`);

      // 检测技能变化（对比新旧数据中同一岗位的技能标记）
      const changes = [];
      let totalAdded = 0, totalRemoved = 0;

      for (const job of (result.results || [])) {
        const old = oldJobsMap.get(job.id);
        if (!old) continue;

        const newSkills = new Set([
          ...(job.skills || []), ...(job.descSkills || []), ...(job.bonusSkills || [])
        ]);
        const added = [...newSkills].filter(s => !old.skills.has(s));
        const removed = [...old.skills].filter(s => !newSkills.has(s));

        if (added.length > 0 || removed.length > 0) {
          changes.push({
            jobId: job.id,
            company: COMPANIES[job.source]?.displayName || job.source,
            title: job.title,
            added,
            removed
          });
          totalAdded += added.length;
          totalRemoved += removed.length;
        }
      }

      const byCompany = {};
      for (const c of changes) {
        const co = c.company;
        if (!byCompany[co]) byCompany[co] = { added: 0, removed: 0 };
        byCompany[co].added += c.added.length;
        byCompany[co].removed += c.removed.length;
      }

      res.write(`data: ${JSON.stringify({
        type: 'skill_diff',
        totalAdded,
        totalRemoved,
        byCompany,
        changes
      })}\n\n`);

      mergeJobs({
        onLog: ({ message }) => {
          res.write(`data: ${JSON.stringify({ type: 'log', message })}\n\n`);
        }
      });
      syncJobsToPublic();
      pushToDataRepo();
      res.write(`data: ${JSON.stringify({ type: 'log', message: '\n[GitHub] 数据已同步到 GitHub' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'success', message: `数据刷新成功！共 ${result.total} 个岗位` })}\n\n`);
    }
  }).catch(err => {
    res.write(`data: ${JSON.stringify({ type: 'failure', message: '刷新失败: ' + err.message })}\n\n`);
  }).finally(() => {
    refreshing = false;
    res.end();
  });
});

// 暂停/继续
app.post('/api/refresh/pause', adminAuth, (req, res) => {
  refreshControl.paused = !refreshControl.paused;
  res.json({ paused: refreshControl.paused });
});

// 停止
app.post('/api/refresh/stop', adminAuth, (req, res) => {
  refreshControl.stopped = true;
  refreshControl.paused = false;
  res.json({ ok: true });
});

// 修复失败岗位（单个）
const retryCounts = new Map();

app.post('/api/refresh/fix', adminAuth, async (req, res) => {
  const { url, company, reason } = req.body;
  if (!url) return res.status(400).json({ error: '缺少 url' });

  const result = await scrapeUrl(url, reason);
  if (result.success) {
    // 更新公司数据文件
    const file = path.join(__dirname, '../_webapp/data', `jobs_${company}.json`);
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const idx = data.findIndex(j => j.url === url);
      if (idx >= 0) {
        data[idx].jdText = result.jdText.substring(0, 3000);
        data[idx].updatedAt = new Date().toISOString();
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      }
    } catch {}
    retryCounts.delete(url);
    // 合并到前端数据，立即可见
    await mergeJobs({ onLog: () => {} });
    syncJobsToPublic();
    return res.json({ success: true });
  }

  const count = (retryCounts.get(url) || 0) + 1;
  retryCounts.set(url, count);
  res.json({ success: false, reason: result.reason, retryCount: count, unfixable: count >= 3 });
});

// 批量修复
app.post('/api/refresh/fix-all', adminAuth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const failures = req.body.failures || [];
  let fixed = 0, failed = 0;

  for (let i = 0; i < failures.length; i++) {
    const f = failures[i];
    const result = await scrapeUrl(f.url, f.reason);
    if (result.success) { fixed++; } else { failed++; }
    res.write(`data: ${JSON.stringify({ type: 'fix_progress', done: i + 1, total: failures.length, fixed, failed })}\n\n`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // 合并到前端数据
  await mergeJobs({ onLog: ({ message }) => {} });
  res.write(`data: ${JSON.stringify({ type: 'fix_done', fixed, failed, message: `修复完成：成功 ${fixed} 个，失败 ${failed} 个` })}\n\n`);
  res.end();
});

// 删除种子数据
app.post('/api/refresh/delete-seed', adminAuth, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: '缺少 url' });

  const seedFile = path.join(__dirname, '../_work/_jd_all.json');
  try {
    const data = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    const before = data.results.length;
    data.results = data.results.filter(r => r.url !== url);
    if (data.results.length < before) {
      fs.writeFileSync(seedFile, JSON.stringify(data, null, 2), 'utf8');
      return res.json({ success: true, removed: before - data.results.length });
    }
    return res.json({ success: false, message: '未找到该 URL' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ========== 技能管理 ==========

const SKILLS_JSON = path.join(__dirname, '../_webapp/companies.json');

function getAllSkills() {
  const data = JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf-8'));
  const all = new Set();
  for (const key of Object.keys(data).filter(k => data[k]?.skills)) {
    data[key].skills.forEach(s => all.add(s));
  }
  return [...all].sort();
}

function getAllCompanyKeys(data) {
  return Object.keys(data).filter(k => data[k]?.skills);
}

function saveSkillsAtomic(data) {
  const tmp = SKILLS_JSON + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, SKILLS_JSON);
}

// 列出所有技能名称（纯列表，给前端 allSkills 用）
app.get('/api/skills/config', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf-8'));
    const all = new Set();
    for (const key of Object.keys(data).filter(k => data[k]?.skills)) {
      data[key].skills.forEach(s => all.add(s));
    }
    res.json({ skills: [...all].sort() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 列出所有技能 + 使用统计
app.get('/api/skills', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf-8'));
    const allSkills = getAllSkills();
    // 统计每个技能在 jobsData 中的匹配数
    const jobsFile = path.join(__dirname, 'src/jobsData.json');
    let counts = {}, bonusCounts = {}, descCounts = {};
    try {
      const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
      for (const skill of allSkills) {
        let c = 0, bc = 0, dc = 0;
        for (const j of jobs.results || []) {
          if ((j.skills || []).includes(skill)) c++;
          if ((j.bonusSkills || []).includes(skill)) bc++;
          if ((j.descSkills || []).includes(skill)) dc++;
        }
        counts[skill] = c;
        bonusCounts[skill] = bc;
        descCounts[skill] = dc;
      }
    } catch {}

    const result = allSkills.map(name => ({ name, count: counts[name] || 0, bonusCount: bonusCounts[name] || 0, descCount: descCounts[name] || 0 }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 新增技能
app.post('/api/skills', adminAuth, (req, res) => {
  const skill = (req.body.skill || '').trim();
  if (!skill) return res.status(400).json({ error: '技能名称不能为空' });
  if (skill.length > 30) return res.status(400).json({ error: '技能名称不超过 30 字符' });
  if (/[;&{}()]/.test(skill)) return res.status(400).json({ error: '包含非法字符' });

  const allSkills = getAllSkills();
  const dup = allSkills.find(s => s.toLowerCase() === skill.toLowerCase());
  if (dup) return res.status(409).json({ error: '该技能已存在', existingName: dup });

  try {
    const data = JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf-8'));
    for (const key of getAllCompanyKeys(data)) {
      data[key].skills.push(skill);
      data[key].skills.sort();
      // 同步更新内存中的 COMPANIES（ES module 静态 import 会缓存，必须 mutate）
      if (COMPANIES[key]) COMPANIES[key].skills = [...data[key].skills];
    }
    saveSkillsAtomic(data);
    res.json({ success: true, message: `技能 "${skill}" 已添加。下次刷新数据后生效。` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除技能
app.delete('/api/skills', adminAuth, (req, res) => {
  const skill = (req.body.skill || '').trim();
  if (!skill) return res.status(400).json({ error: '技能名称不能为空' });

  try {
    const data = JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf-8'));
    for (const key of getAllCompanyKeys(data)) {
      data[key].skills = data[key].skills.filter(s => s !== skill);
      if (COMPANIES[key]) COMPANIES[key].skills = [...data[key].skills];
    }
    saveSkillsAtomic(data);
    // 删除后重新合并前端数据
    mergeJobs({ onLog: () => {} });
    res.json({ success: true, message: `技能 "${skill}" 已删除` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const DATA_REPO = path.join(__dirname, '../_github-data');

function pushToDataRepo() {
  try {
    fs.copyFileSync(path.join(__dirname, 'src/jobsData.json'), path.join(DATA_REPO, 'jobsData.json'));
    fs.copyFileSync(path.join(__dirname, '../_webapp/companies.json'), path.join(DATA_REPO, 'companies.json'));
    fs.copyFileSync(path.join(__dirname, '../_work/_jd_all.json'), path.join(DATA_REPO, '_jd_all.json'));
  } catch (e) { console.error('[GitHub] 复制文件失败:', e.message); }

  exec('git add -A && git commit -m "refresh: ' + new Date().toISOString() + '" && git push', { cwd: DATA_REPO }, (err, stdout, stderr) => {
    if (err) console.error('[GitHub] 推送失败:', stderr || err.message);
    else console.log('[GitHub] 数据已推送');
  });
}

// ========== AI 对话（工具调用 + SSE 流式） ==========
const chatLimiter = new Map();

function checkChatLimit(ip) {
  const now = Date.now();
  const r = chatLimiter.get(ip);
  if (!r || now > r.resetTime) {
    chatLimiter.set(ip, { count: 1, resetTime: now + 5 * 60 * 1000 });
    return true;
  }
  if (r.count >= 30) { console.error('[限流] IP:', ip, '已达30次上限'); return false; }
  r.count++;
  return true;
}

function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function callLLM(messages, stream = false) {
  const res = await fetch(`${LLM_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM_KEY}` },
    body: JSON.stringify({ model: LLM_MODEL, messages, tools: CHAT_TOOLS, stream, max_tokens: 4096 })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM 服务异常 (${res.status}): ${errText}`);
  }
  return res;
}

function buildChatMessages(userMessages, ip) {
  const memoryCtx = getMemoryContext(ip);
  const sysPrompt = buildSystemPrompt() + memoryCtx;
  // 只保留 role 和 content，去掉 hidden 等前端字段
  const clean = userMessages.map(m => ({ role: m.role, content: m.content || '' }));
  return [{ role: 'system', content: sysPrompt }, ...clean];
}

function detectJobUrl(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') {
      const match = (m.content || '').match(/(https?:\/\/[^\s]*(?:jobs|zhaopin|talent|career)[^\s]*)/i);
      if (match) return match[1];
    }
  }
  return null;
}

app.post('/api/chat', async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkChatLimit(ip)) {
    return res.status(429).json({ error: '请求过于频繁，请 5 分钟后再试' });
  }

  const { messages } = req.body;
  if (!messages || !messages.length) {
    return res.status(400).json({ error: '缺少对话内容' });
  }
  if (!LLM_KEY) {
    return res.status(503).json({ error: 'LLM 未配置（缺少 LLM_KEY 环境变量）' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const llmMessages = buildChatMessages(messages, ip);
    const jobUrl = detectJobUrl(messages);

    // 检查外部链接
    if (jobUrl) {
      const urlLower = jobUrl.toLowerCase();
      const isInternal = ['talent.baidu.com', 'jobs.bytedance.com', 'alibaba.com', 'tencent.com', 'meituan.com']
        .some(d => urlLower.includes(d)) && (loadJobs().results || []).some(j => j.url === jobUrl);

      if (!isInternal) {
        sseSend(res, { type: 'tool_progress', message: '识别到外部链接，正在尝试访问...' });
        const scraped = await scrapeExternalUrl(jobUrl);
        if (scraped) {
          sseSend(res, { type: 'tool_progress', message: '成功获取外部页面内容，正在分析...' });
          llmMessages.push({
            role: 'user',
            content: `[用户粘贴的外部链接] ${jobUrl}\n\n页面内容：\n${scraped}\n\n这是一个外部链接（不在数据库中）。请根据以上内容分析该岗位需要的技能，并制定学习路线。同时告知用户这是外部链接。`
          });
        } else {
          sseSend(res, { type: 'tool_progress', message: '无法访问外部链接' });
          const aiMsg = { role: 'assistant', content: '抱歉，无法访问该外部链接（网站可能需要登录或有反爬保护）。请把岗位的 JD 文字内容复制粘贴给我，我来帮你分析制定学习路线。' };
          sseSend(res, { content: aiMsg.content, done: true });
          updateMemory(ip, [...messages, { role: 'assistant', content: aiMsg.content }]);
          return res.end();
        }
      }
    }

    // 工具调用循环（最多5轮）
    let maxLoops = 5;
    let finalContent = '';
    while (maxLoops-- > 0) {
      const llmRes = await callLLM(llmMessages, false);
      const data = await llmRes.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) break;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        // 最终回复 → 流式输出
        llmMessages.push(msg);
        const streamRes = await callLLM(llmMessages, true);
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const d = line.slice(6);
            if (d === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }
            try {
              const c = JSON.parse(d).choices?.[0]?.delta?.content;
              if (c) { sseSend(res, { content: c }); finalContent += c; }
            } catch {}
          }
        }
        updateMemory(ip, [...messages, { role: 'assistant', content: finalContent }]);
        return res.end();
      }

      // 执行工具调用
      llmMessages.push(msg);
      for (const tc of msg.tool_calls) {
        const fnName = tc.function.name;
        const fnArgs = JSON.parse(tc.function.arguments || '{}');
        sseSend(res, { type: 'tool_start', tool: fnName, args: fnArgs });
        const result = await executeTool(fnName, fnArgs);
        sseSend(res, { type: 'tool_result', tool: fnName });

        // 特殊处理 search_jobs：直接把格式化岗位列表推给用户
        if (fnName === 'search_jobs' && result.jobs && result.jobs.length > 0) {
          const skillLabel = (fnArgs.skill || fnArgs.title || fnArgs.company || '');
          const label = skillLabel ? `与 "${skillLabel}" 相关的` : '匹配的';
          const lines = result.jobs.map((j, i) =>
            `**${i + 1}. ${j.title}** | ${j.company} | ${j.location || '未知'}\n技能：${[...(j.skills||[]),...(j.descSkills||[])].slice(0,8).join('、')}`
          );
          const totalNote = result.total_matches > result.showing
            ? `（共 ${result.total_matches} 个，显示前 ${result.showing} 个）` : `共 ${result.showing} 个`;
          const formatted = `\n\n找到 ${label}岗位：\n\n${lines.join('\n\n')}\n\n${totalNote}。想看哪个岗位的完整 JD 和学习路线？告诉我序号或岗位名即可。\n\n`;
          sseSend(res, { content: formatted });
          finalContent += formatted;
          llmMessages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ ...result, jobs: '[已格式化展示给用户]', instruction: '岗位列表已展示给用户。请简短收尾（1-2句话），引导用户选择具体岗位查看JD或学习路线。' })
          });
        } else if (fnName === 'search_jobs' && (!result.jobs || result.jobs.length === 0)) {
          const skillLabel = (fnArgs.skill || fnArgs.title || fnArgs.company || '该条件');
          const msg = `\n\n抱歉，没有找到与 "${skillLabel}" 相关的岗位。\n\n建议：\n· 试试换一个关键词（如用简称"CV"代替"计算机视觉"）\n· 用 list_companies 查看覆盖了哪些公司\n· 用 list_skills 查看数据库有哪些技能标签\n\n`;
          sseSend(res, { content: msg });
          finalContent += msg;
          llmMessages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ ...result, instruction: '空结果已告知用户。请引导用户换关键词或查看数据概况。' })
          });
        } else if (fnName === 'generate_study_plan' && result.studyPlan) {
          sseSend(res, { content: '\n\n' + result.studyPlan + '\n\n' });
          finalContent += '\n\n' + result.studyPlan + '\n\n';
          llmMessages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ ...result, studyPlan: '[已直接展示给用户]', instruction: '学习路线已经展示给用户了。请简短收尾（1-2句话），问用户是否需要深入了解某个阶段的技能。' })
          });
        } else if (fnName === 'generate_skill_roadmap' && result.roadmaps) {
          const roadmapText = result.roadmaps.map(r => r.roadmap).join('\n\n---\n\n');
          sseSend(res, { content: '\n\n' + roadmapText + '\n\n' });
          finalContent += '\n\n' + roadmapText + '\n\n';
          llmMessages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ ...result, roadmaps: '[已直接展示给用户]', instruction: '技能学习路线已经展示给用户了。请简短收尾（1-2句话），问用户是否需要更深入了解某个阶段。' })
          });
        } else {
          llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
      }
    }

    sseSend(res, { content: '抱歉，处理请求时遇到了问题，请换个方式问试试。', done: true });
    res.end();
  } catch (e) {
    console.error('[LLM] 错误:', e.message);
    sseSend(res, { type: 'error', message: 'AI 服务异常: ' + e.message, done: true });
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`后端服务器运行在 http://localhost:${PORT}`);
  console.log(`LLM: ${LLM_MODEL} @ ${LLM_ENDPOINT} ${LLM_KEY ? '(已配置)' : '(未配置)'}`);
});
