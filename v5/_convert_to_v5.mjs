// 转换脚本：将新爬虫格式 jobs.json → v5 技能矩阵格式
// 用法: node _convert_to_v5.mjs
// 输出: v5/_skill_analysis.json（覆盖）

const fs = require('fs');
const path = require('path');

// 10大技能分类（和 _gen_html.js 保持一致）
const categories = [
  { name: 'AI基础', skills: ['机器学习/深度学习', 'Transformer/LLaMA/GPT'] },
  { name: '大模型训练', skills: ['预训练', 'SFT微调', 'RL/RLHF', 'DeepSpeed/Megatron', '分布式训练'] },
  { name: '模型优化推理', skills: ['量化/vLLM/CUDA', 'FlashAttention'] },
  { name: 'AI应用开发', skills: ['Prompt工程', 'RAG', 'LangChain', 'AI产品思维'] },
  { name: '算法方向', skills: ['NLP', 'CV', '推荐/多模态/Diffusion'] },
  { name: '编程语言', skills: ['Python', 'C/C++', 'Java', 'Go', 'JS/TS/SQL/Shell'] },
  { name: '后端架构', skills: ['分布式/高并发/微服务', 'API/系统设计'] },
  { name: '基础设施', skills: ['PyTorch/TF/Paddle', 'Docker/K8s/Linux/Git'] },
  { name: '加分项', skills: ['顶会论文/竞赛/开源'] },
  { name: 'Agent专项', skills: ['Agent框架/Tool Call/MCP', 'AI Coding/强化学习/记忆'] },
];

// 关键词映射表：技能名 → 匹配关键词列表
const skillKeywords = {};
for (const cat of categories) {
  for (const skill of cat.skills) {
    // 每个技能名本身就是一个关键词
    skillKeywords[skill] = skill;
  }
}

// 加载新爬虫数据
const jobsData = JSON.parse(fs.readFileSync(
  'D:/岗位信息爬取网页项目/_webapp/data/jobs.json', 'utf-8'
));
const jobs = jobsData.results;

console.log(`加载 ${jobs.length} 个岗位`);

// 转换函数
function convertJob(job) {
  // 公司名映射（id前缀 → v5公司名）
  const companyMap = {
    'baidu': '百度',
    'bytedance': '字节',
    'alibaba': '阿里',
    'tencent': '腾讯',
    'meituan': '美团',
  };
  const rawCompany = job.company || job.id.split('_')[0];
  const company = companyMap[rawCompany] || rawCompany;

  // 生成 name（v5 格式："百度-AI技术生态运营"）
  const name = `${company}-${job.title}`;

  // 构建 skills 对象
  const jobSkills = {};
  let totalCount = 0;

  for (const cat of categories) {
    jobSkills[cat.name] = {};
    for (const skill of cat.skills) {
      // 匹配：检查 jdText 或 skills 数组中是否包含该技能关键词
      const jdText = (job.jdText || '').toLowerCase();
      const skillLower = skill.toLowerCase();
      // 从技能名中提取关键词（"机器学习/深度学习" → ["机器学习", "深度学习"]）
      const keywords = skill.split('/');
      const matched = keywords.some(kw => {
        const kwLower = kw.trim().toLowerCase();
        // 检查 jdText 或 flat skills 数组
        const jdMatch = jdText.includes(kwLower);
        const skillArrayMatch = Array.isArray(job.skills) &&
          job.skills.some(s => s.toLowerCase().includes(kwLower) || kwLower.includes(s.toLowerCase()));
        return jdMatch || skillArrayMatch;
      });
      jobSkills[cat.name][skill] = matched;
      if (matched) totalCount++;
    }
  }

  return {
    name,
    company,
    displayName: job.title + (job.location ? ` (${job.location})` : ''),
    url: job.url || '#',
    skills: jobSkills,
    skillCount: totalCount,
  };
}

// 转换所有岗位
const analysis = jobs.map(convertJob);

// 排序：字节→阿里→腾讯→美团→百度，岗位名升序
const order = ['字节', '阿里', '腾讯', '美团', '百度'];
analysis.sort((a, b) => {
  const ci = order.indexOf(a.company) - order.indexOf(b.company);
  if (ci !== 0) return ci;
  return a.name.localeCompare(b.name, 'zh');
});

// 统计
const counts = {};
for (const j of analysis) counts[j.company] = (counts[j.company] || 0) + 1;
console.log('转换结果:', counts);

// 输出到 v5/_skill_analysis.json
const outPath = 'D:/岗位信息爬取网页项目/v5/_skill_analysis.json';
const enc = new TextEncoder();
fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2), 'utf-8');
console.log('写入:', outPath);

// 同步更新 v5/_jd_all.json（只含 results 数组，供 _gen_html.js 用）
const jdAll = {
  results: analysis.map(j => ({
    name: j.name,
    url: j.url,
    displayName: j.displayName,
    company: j.company,
  }))
};
fs.writeFileSync('D:/岗位信息爬取网页项目/v5/_jd_all.json', JSON.stringify(jdAll, null, 2), 'utf-8');
console.log('写入 v5/_jd_all.json');

// 生成 HTML
const genHtml = require('D:/岗位信息爬取网页项目/v5/_gen_html.js');
console.log('调用 _gen_html.js 生成 HTML...');
