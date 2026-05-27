import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { scrapeAll } from '../_webapp/core/JobManager.mjs';
import { mergeJobs } from '../_webapp/scripts/merge.mjs';
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
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const LLM_KEY = process.env.LLM_KEY || '';
const SYSTEM_PROMPT = `你是校招岗位技能矩阵的AI助手。你可以帮助用户：
1. 分析岗位技能需求
2. 推荐适合的岗位
3. 解释技术栈含义
4. 提供求职建议
当前系统中有以下公司的校招数据：字节跳动、阿里巴巴、腾讯、美团、百度。
如果用户询问的岗位数据系统中没有，告诉他们管理员可以刷新数据来获取最新信息。
请用简洁专业的中文回答。`;

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

// 数据刷新接口（需管理员密码）
app.get('/api/refresh', adminAuth, (req, res) => {
  if (refreshing) {
    res.status(409).json({ error: '已有刷新任务在运行' });
    return;
  }
  refreshing = true;
  refreshControl = { paused: false, stopped: false };

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
      mergeJobs({
        onLog: ({ message }) => {
          res.write(`data: ${JSON.stringify({ type: 'log', message })}\n\n`);
        }
      });
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

// 列出所有技能 + 使用统计
app.get('/api/skills', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf-8'));
    const allSkills = getAllSkills();
    // 统计每个技能在 jobsData 中的匹配数
    const jobsFile = path.join(__dirname, 'src/jobsData.json');
    let counts = {}, descCounts = {};
    try {
      const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
      for (const skill of allSkills) {
        let c = 0, dc = 0;
        for (const j of jobs.results || []) {
          if ((j.skills || []).includes(skill)) c++;
          if ((j.descSkills || []).includes(skill)) dc++;
        }
        counts[skill] = c;
        descCounts[skill] = dc;
      }
    } catch {}

    const result = allSkills.map(name => ({ name, count: counts[name] || 0, descCount: descCounts[name] || 0 }));
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

// ========== AI 对话（OpenAI 兼容） ==========
const chatLimiter = new Map(); // ip → {count, resetTime}

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

  try {
    const fullMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
    const llmRes = await fetch(`${LLM_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_KEY}`
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: fullMessages,
        stream: true,
        max_tokens: 1024
      })
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text();
      console.error('[LLM] API 错误:', llmRes.status, errText);
      return res.status(502).json({ error: `LLM 服务异常 (${llmRes.status})` });
    }

    // SSE 流式转发
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const reader = llmRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch {}
        }
      }
    }
    res.end();
  } catch (e) {
    console.error('[LLM] 连接错误:', e.message);
    res.status(502).json({ error: 'LLM 连接失败: ' + e.message });
  }
});

app.listen(PORT, () => {
  console.log(`后端服务器运行在 http://localhost:${PORT}`);
  console.log(`LLM: ${LLM_MODEL} @ ${LLM_ENDPOINT} ${LLM_KEY ? '(已配置)' : '(未配置)'}`);
});
