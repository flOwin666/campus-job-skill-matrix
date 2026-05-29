// Vercel Serverless — 技能列表（从 GitHub raw 拉数据 + 内存缓存）
let cache = null;
let cacheTime = 0;
const TTL = 5 * 60 * 1000; // 5 分钟缓存

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 缓存有效直接返回
    if (cache && Date.now() - cacheTime < TTL) {
      return res.json(cache);
    }

    const BASE = 'https://raw.githubusercontent.com/flOwin666/campus-job-skill-matrix/main';

    // 并行拉取 companies.json + jobsData.json
    const [compRes, jobsRes] = await Promise.all([
      fetch(`${BASE}/_webapp/companies.json`),
      fetch(`${BASE}/v6/src/jobsData.json`)
    ]);

    if (!compRes.ok) return res.status(502).json({ error: '无法加载技能配置' });

    const companies = await compRes.json();
    const jobsData = jobsRes.ok ? await jobsRes.json() : { results: [] };
    const jobs = jobsData.results || [];

    // 提取所有技能
    const skillSet = new Set();
    for (const key of Object.keys(companies)) {
      if (companies[key]?.skills) {
        companies[key].skills.forEach(s => skillSet.add(s));
      }
    }

    // 统计三色出现次数
    const result = [...skillSet].sort().map(name => {
      let count = 0, bonusCount = 0, descCount = 0;
      for (const j of jobs) {
        if ((j.skills || []).includes(name)) count++;
        if ((j.bonusSkills || []).includes(name)) bonusCount++;
        if ((j.descSkills || []).includes(name)) descCount++;
      }
      return { name, count, bonusCount, descCount };
    });

    cache = result;
    cacheTime = Date.now();
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: '加载失败: ' + e.message });
  }
}
