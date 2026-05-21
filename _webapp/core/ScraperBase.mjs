/**
 * ScraperBase.mjs — 爬虫基类
 * 所有平台爬虫继承此类，获得通用方法
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 睡眠工具（防封禁） */
export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** 保存 JSON 文件 */
export function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/** HTTP GET */
export function httpGet(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : require('http');
    const mod = url.startsWith('https') ? https : require('http');
    mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/** 技能提取（公共逻辑） */
export function extractSkills(text, skillList) {
  const s = new Set();
  if (!text) return [];
  for (const p of skillList) {
    try {
      // 转义正则特殊字符
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let pattern;
      // 英文普通词用 \b 词边界，避免 ML 误匹配 AML；C++/C# 等特殊字符跳过 \b
      if (/^[a-zA-Z]/.test(p) && !/[+#]/.test(p)) {
        pattern = new RegExp('\\b' + escaped + '\\b', 'i');
      } else {
        pattern = new RegExp(escaped, 'i');
      }
      if (pattern.test(text)) {
        let skill = p;
        // 标准化
        if (skill === '飞桨') skill = 'PaddlePaddle';
        if (['文心', '文心一言', '文心大模型', 'Ernie'].includes(skill)) skill = '文心大模型';
        s.add(skill);
      }
    } catch {}
  }
  return [...s];
}

/** JD 文本分割：职位描述 vs 职位要求 vs 加分项 */
export function splitJD(text) {
  if (!text) return { reqText: '', descText: '', bonusText: '' };

  const descMarkers = [
    '职位描述', '岗位描述', '部门描述',
    '职位介绍', '岗位介绍', '部门介绍',
    '岗位职责', '工作职责',
    '团队介绍',
    'Responsibilities', 'Job Description'
  ];
  const reqMarkers = [
    '职位要求', '岗位要求',
    '任职要求', '任职资格',
    '岗位基本要求',
    'Qualifications', 'Requirements'
  ];
  const bonusMarkers = [
    '加分项', '具备以下条件优先', '具有以下条件者优先',
    '优先条件', 'Nice to Have', 'Preferred'
  ];

  function findMarker(markers) {
    for (const m of markers) {
      const esc = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^(?:#{1,3}\\s*)?${esc}[：:]?\\s*$`, 'im');
      const match = text.match(re);
      if (match) return match;
    }
    return null;
  }

  const reqMatch = findMarker(reqMarkers);
  const descMatch = findMarker(descMarkers);
  const bonusMatch = findMarker(bonusMarkers);

  let reqText = '', descText = '', bonusText = '';

  if (reqMatch) {
    const reqStart = reqMatch.index + reqMatch[0].length;
    const bonusAfterReq = bonusMatch && bonusMatch.index > reqMatch.index;

    // 找页面尾部截断点（投递、相关职位等）
    const endMarkers = ['投递', '相关职位', '联系我们', '相关网站', '分享', '立即申请'];
    let endIdx = undefined;
    for (const em of endMarkers) {
      const emEsc = em.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const emRe = new RegExp(`^(?:#{1,3}\\s*)?${emEsc}[：:]?\\s*$`, 'im');
      const emMatch = text.match(emRe);
      if (emMatch && emMatch.index > reqStart && (!endIdx || emMatch.index < endIdx)) {
        endIdx = emMatch.index;
      }
    }

    if (bonusAfterReq) {
      const bonusStart = bonusMatch.index + bonusMatch[0].length;
      reqText   = text.substring(reqStart, bonusMatch.index);
      bonusText = text.substring(bonusStart, endIdx);
    } else {
      reqText = text.substring(reqStart, endIdx);
    }
    descText = text.substring(0, reqMatch.index);
  } else if (descMatch) {
    descText = text.substring(descMatch.index + descMatch[0].length);
    reqText = text.substring(0, descMatch.index);
  } else {
    reqText = text;
    descText = '';
  }

  return { reqText: reqText.trim(), descText: descText.trim(), bonusText: bonusText.trim() };
}

/** 标题相似度（用于种子数据匹配） */
export function calcSimilarity(title1, title2) {
  if (!title1 || !title2) return 0;
  if (title1.includes(title2) || title2.includes(title1)) return 1;
  const words1 = new Set(title1.split(/[-\/\s]+/).filter(w => w.length >= 2));
  const words2 = new Set(title2.split(/[-\/\s]+/).filter(w => w.length >= 2));
  let overlap = 0;
  for (const w of words1) { if (words2.has(w)) overlap++; }
  return overlap / Math.max(words1.size, words2.size, 1);
}

/** 从旧种子数据补充技能 */
export function supplementFromSeed(job, seedData, skillList) {
  if (job.skills.length >= 3) return job;
  let bestSeed = null, bestScore = 0;
  for (const seed of seedData) {
    const score = calcSimilarity(job.title, seed.title);
    if (score > bestScore) { bestScore = score; bestSeed = seed; }
  }
  if (bestSeed && bestScore >= 0.3) {
    const extra = extractSkills(bestSeed.text || '', skillList).filter(s => !job.skills.includes(s));
    if (extra.length > 0) {
      job.skills = [...job.skills, ...extra];
    }
  }
  return job;
}

/** 格式化输出岗位对象 */
export function formatJob(raw, companyKey, source) {
  return {
    id: `${companyKey}_${raw.jobId}`,
    company: raw.company || companyKey,
    title: raw.title || `未知岗位${raw.jobId}`,
    url: raw.url || '',
    location: raw.location || raw.city || '',
    source,
    updatedAt: new Date().toISOString(),
    jdText: (raw.jdText || '').substring(0, 4000),
    skills: raw.skills || []
  };
}

/** ScraperBase 基类 */
export class ScraperBase {
  constructor(config) {
    this.config = config;
    this.name = config.name;
    this.outDir = path.resolve(__dirname, '../data');
    this._failures = [];
    this.onLog = null;      // 由 JobManager 注入
    this.controller = null; // 暂停/停止控制
  }

  outFile(name) {
    return path.join(this.outDir, name);
  }

  async list() {
    throw new Error(`[${this.name}] 子类必须实现 list() 方法`);
  }

  async detail(job) {
    return job; // 默认直接返回，可被子类重写
  }

  /** 爬虫内部日志（有回调时交给回调，无回调时输出控制台） */
  _slog(level, message) {
    if (this.onLog) {
      try { this.onLog({ level, message }); }
      catch (e) { console.error('[Scraper] onLog callback error:', e.message); }
    } else {
      if (level === 'error') console.error(message);
      else console.log(message);
    }
  }

  /** 暂停/停止检查（子类在批次循环中调用） */
  async _checkController() {
    while (this.controller?.paused && !this.controller?.stopped) {
      await new Promise(r => setTimeout(r, 500));
    }
    return this.controller?.stopped;
  }

  /** 记录抓取失败 */
  addFailure({ jobId, title, url, reason = 'unknown' }) {
    this._failures.push({ jobId, title, url, reason });
  }

  async run() {
    console.log(`[${this.name}] 启动...`);
    const rawJobs = await this.list();
    console.log(`[${this.name}] 发现 ${rawJobs.length} 个岗位`);
    if (rawJobs.length === 0) return;

    const jobs = rawJobs.map(j => formatJob(j, this.config.name, this.name));
    jobs.forEach(j => console.log(`[${this.name}] ✅ ${j.title} (${j.location}) [${j.skills.join(',')}]`));

    saveJson(this.outFile(`jobs_${this.name}.json`), jobs);
    console.log(`[${this.name}] ✅ 写文件: ${this.outFile(`jobs_${this.name}.json`)}`);
  }

  // ========== Playwright 辅助方法 ==========

  /** 启动带反检测的浏览器，返回 { browser, context } */
  async launchBrowser() {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai'
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
      window.chrome = { runtime: {} };
    });
    return { browser, context };
  }

  /**
   * 访问岗位详情页，提取 JD 文本
   * @param {Page} page
   * @param {string} url
   * @param {number} timeout
   * @returns {{ title, location, jdText } | null}  失败返回 null
   */
  async fetchDetail(page, url, timeout = 10000, waitMs = 5000, waitUntil = 'domcontentloaded') {
    try {
      await page.goto(url, { waitUntil, timeout });

      // 轮询等待内容稳定，而非盲等
      const deadline = Date.now() + waitMs;
      let bodyText = '', prevLen = 0, stableCount = 0;
      while (Date.now() < deadline) {
        bodyText = await page.evaluate(() => document.body.innerText);
        if (bodyText.length > 300 && bodyText.length === prevLen) {
          stableCount++;
          if (stableCount >= 2) break;  // 连续两次长度不变，内容已稳定
        } else {
          stableCount = 0;
        }
        prevLen = bodyText.length;
        await new Promise(r => setTimeout(r, 1000));
      }

      const title = await page.title();
      if (!bodyText) bodyText = await page.evaluate(() => document.body.innerText);

      const cities = ['北京', '上海', '深圳', '杭州', '广州', '成都', '武汉', '西安', '南京'];
      const location = cities.find(c => bodyText.includes(c)) || '';

      return {
        title: title || '',
        location,
        jdText: bodyText || ''
      };
    } catch (err) {
      console.error(`[${this.name}] fetchDetail 失败: ${url} — ${err.message}`);
      const reason = err.message?.includes('Timeout') ? 'timeout' : 'network_error';
      return { title: '', location: '', jdText: '', _error: reason };
    }
  }
}