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
const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://api.deepseek.com';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash';
const LLM_KEY = process.env.LLM_KEY || '';

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
  return `你是"校招岗位技能矩阵"网页的AI求职助手。

网页功能介绍：
- 矩阵视图：横轴技能×纵轴岗位，展示技能需求分布（绿色=必需/金色=加分/蓝色=描述）
- 列表视图：卡片式浏览所有岗位
- 技能标签云：点击技能快速筛选
- 搜索过滤：按公司、城市、技能、岗位名筛选
- 设置面板（右下齿轮）：技能管理、管理员功能、数据刷新

当前数据：更新于 ${jobs.lastUpdated || '未知'}，共 ${jobs.total || 0} 个岗位。
公司分布：${coList}。

能力：
- search_jobs 搜索岗位（按公司/技能/岗位名/城市）
- list_companies 浏览公司概况
- list_skills 了解技能热度
- get_job_detail 查看岗位完整JD
- 发送岗位链接可分析技能并制定学习路线

规则：
- 只回答校招求职、岗位信息、技能学习相关问题
- 超出范围礼貌拒绝（"抱歉，我是求职助手，只能回答岗位和技能相关问题"）
- 查询数据必须用工具，不凭记忆回答
- 简洁专业，用中文回答`;
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
      description: '获取指定岗位的完整JD描述',
      parameters: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: '岗位ID，从 search_jobs 结果中获取' }
        },
        required: ['job_id']
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
      snippet: (j.jdText || '').substring(0, 200)
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

function executeTool(name, args) {
  switch (name) {
    case 'search_jobs': return execSearchJobs(args);
    case 'list_companies': return execListCompanies();
    case 'list_skills': return execListSkills(args);
    case 'get_job_detail': return execGetJobDetail(args);
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
  if (r.count >= 10) return false;
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
    body: JSON.stringify({ model: LLM_MODEL, messages, tools: CHAT_TOOLS, stream, max_tokens: 2048 })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM 服务异常 (${res.status}): ${errText}`);
  }
  return res;
}

function buildChatMessages(userMessages) {
  return [{ role: 'system', content: buildSystemPrompt() }, ...userMessages];
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
    const llmMessages = buildChatMessages(messages);
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
          return res.end();
        }
      }
    }

    // 工具调用循环（最多5轮）
    let maxLoops = 5;
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
              if (c) sseSend(res, { content: c });
            } catch {}
          }
        }
        return res.end();
      }

      // 执行工具调用
      llmMessages.push(msg);
      for (const tc of msg.tool_calls) {
        const fnName = tc.function.name;
        const fnArgs = JSON.parse(tc.function.arguments || '{}');
        sseSend(res, { type: 'tool_start', tool: fnName, args: fnArgs });
        const result = executeTool(fnName, fnArgs);
        sseSend(res, { type: 'tool_result', tool: fnName });
        llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
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
