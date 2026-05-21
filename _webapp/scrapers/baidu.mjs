/**
 * baidu.mjs — 百度岗位爬虫
 * 策略：HTTP列表页提取（服务端渲染），详情页SPA需登录兜底用种子数据
 * 继承 ScraperBase：公共逻辑复用基类
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ScraperBase, httpGet, extractSkills, calcSimilarity, sleep, splitJD } from '../core/ScraperBase.mjs';
import { COMPANIES } from '../companies.mjs';

/** 已知多城市岗位的城市映射（从详情页手动确认） */
const knownMultiCity = {
  '85301': '深圳/北京/上海', // 飞桨-AI异构计算研发工程师
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const conf = COMPANIES.baidu;

// ========== SSR JSON 提取（主方案） ==========

/** 从 HTML 中提取 window.__INITIAL_DATA__ JSON（大括号计数法，不依赖正则非贪婪） */
function extractSSRData(html) {
  const match = html.match(/window\.__INITIAL_DATA__\s*=\s*\{/);
  if (!match) return null;
  let depth = 1, end = match.index + match[0].length;
  while (end < html.length && depth > 0) {
    if (html[end] === '{') depth++;
    if (html[end] === '}') depth--;
    end++;
  }
  if (depth !== 0) return null;
  let jsonStr = html.slice(match.index + match[0].length - 1, end);
  jsonStr = jsonStr.replace(/:\s*undefined/g, ':null');  // undefined ≠ JSON
  try { return JSON.parse(jsonStr); }
  catch (e) { return null; }
}

/** 清洗标题：去掉 J-ID 后缀 */
function cleanTitle(name) {
  return (name || '')
    .replace(/\s*\(?J-ID:\s*\w+\)?$/i, '')
    .replace(/\s*-\s*J\d+$/i, '')
    .replace(/\(J\d+\)$/g, '')
    .trim();
}

/** 从 SSR 字段拼接完整 JD 文本 */
function buildJD(item) {
  let jd = (item.workContent || '') + '\n';
  if (item.serviceCondition?.trim()) {
    jd += '职位要求\n' + item.serviceCondition;
  }
  return jd.trim();
}

/** SSR JSON → 岗位列表（失败时回退旧 HTML 解析） */
function parseSSRData(html) {
  const data = extractSSRData(html);
  if (!data?.listData?.listDetailData?.length) {
    console.warn('[百度] SSR 数据缺失，回退旧解析器');
    return parseListPage(html);
  }
  return data.listData.listDetailData
    .filter(item => item.postId && (item.serviceCondition || item.workContent))
    .map(item => ({
      jobId: item.postId,
      title: cleanTitle(item.name),
      location: item.workPlace || '未知',
      url: `https://talent.baidu.com/jobs/detail/${item.recruitType || 'GRADUATE'}/${item.postId}`,
      jdText: buildJD(item),
      company: 'baidu'
    }));
}

// ========== 旧 HTML 解析（兜底） ==========

// J-ID → UUID 映射（旧解析器兜底用）
const BAIDU_URL_MAP = {
  'J86156': 'GRADUATE/acefb4fa-590c-40de-9c79-ae2d5d189a9c',
  'J86245': 'GRADUATE/ea710654-a661-4127-a7a5-3983c14febf0',
  'J86041': 'GRADUATE/a82ee8af-e0fa-4ea7-9272-f46a1db16521',
  'J86020': 'GRADUATE/3378548b-c07d-487b-920d-f4a7c4926577',
  'J86070': 'GRADUATE/36fb1915-09c5-4173-aecb-99c21fbf395a',
  'J85936': 'GRADUATE/d74e940f-e8c9-495c-8e67-dacf55eb985f',
  'J86033': 'GRADUATE/cd8451a2-cae0-4d11-806e-8839ffccc374',
  'J99964': 'GRADUATE/fe876a65-1a6c-499a-9506-2169009a02a1',
  'J86134': 'GRADUATE/81b1bb5d-4ceb-4665-bc72-6b78fe612394',
  'J85921': 'GRADUATE/2712b6b5-0973-4465-8846-91a0e063515e',
};

/** 解析列表页HTML → 原始岗位列表 */
function parseListPage(html) {
  const jobs = [];
  const seen = new Set();
  const blocks = html.split(/(?=post-item__)/);

  for (const block of blocks) {
    const idMatch = block.match(/\(J(\d+)\)/);
    if (!idMatch) continue;
    const jobId = idMatch[1];
    if (seen.has(jobId)) continue;
    seen.add(jobId);

    // 提取标题
    const titleMatch = block.match(/>([\u4e00-\u9fa5A-Za-z0-9\/\s（）().\-]+)\(J\d+\)</);
    let title = '', city = '';
    if (titleMatch) {
      const raw = titleMatch[1].trim();
      const parts = raw.split('-');
      const cities = ['北京','上海','深圳','杭州','广州','成都','武汉','西安','南京'];
      if (parts.length === 1) {
        title = parts[0].trim();
      } else if (cities.includes(parts[0].trim())) {
        city = parts[0].trim();
        title = parts.slice(1).join('-').trim();
      } else {
        title = parts.slice(0, -1).join('-').trim();
      }
    }
    if (!title) title = `百度岗位${jobId}`;

    // 提取类别标签
    const catMatch = block.match(/post-subtitle-item[^>]*>([^<]+)<\/span/g);
    const categories = catMatch
      ? catMatch.map(m => m.replace(/<[^>]+>/g, '').trim())
          .filter(c => c && !c.match(/^\d+人$/) && !c.match(/^\d{4}-\d{2}-\d{2}$/))
      : [];
    // 提取JD文本（提前提取，城市兜底要用）
    const contentMatch = block.match(/post-content[^>]*>([\s\S]*?)<\/div>/);
    let jdText = '';
    if (contentMatch) {
      jdText = contentMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ').trim();
    }

    // 城市兜底：从JD文本里匹配
    if (!city) {
      const allCities = ['北京','上海','深圳','杭州','广州','成都','武汉','西安','南京'];
      // 优先匹配"工作地点：XXX"格式
      const locMatch = jdText.match(/工作地点[：:]?\s*([北京上海深圳杭州广州成都武汉西安南京]+(?:\/[北京上海深圳杭州广州成都武汉西安南京]+)*)/);
      if (locMatch) {
        city = locMatch[1].trim();
      } else {
        // 从文本里找城市名（兜底）
        city = allCities.find(c => jdText.includes(c)) || '';
      }
    }

    // 已知多城市覆盖（手动确认的岗位）
    if (knownMultiCity[jobId]) city = knownMultiCity[jobId];

    jobs.push({ jobId, title, location: city, categories, jdText, company: 'baidu',
      url: BAIDU_URL_MAP[`J${jobId}`]
        ? `https://talent.baidu.com/jobs/detail/${BAIDU_URL_MAP[`J${jobId}`]}`
        : conf.detailUrlTemplate.replace('{jobId}', jobId) });
  }
  return jobs;
}

/** 从旧种子数据补充技能（baidu特有逻辑） */
function loadSeedData() {
  try {
    const seedPath = path.resolve(__dirname, conf.seedFile);
    const all = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    return all.results.slice(...conf.seedIndexes).map(j => ({
      title: j.name.replace(/^百度-/, ''),
      text: j.text || ''
    }));
  } catch { return []; }
}

export class BaiduScraper extends ScraperBase {
  constructor() { super(conf); }

  /** 抓取+解析列表页 */
  async list() {
    this._slog('info', `[${this.name}] 获取列表页...`);
    const html = await httpGet(conf.seedUrl);
    const rawJobs = parseSSRData(html);
    this._slog('info', `[${this.name}] 列表页发现 ${rawJobs.length} 个岗位`);

    // 提取技能（区分职位要求/描述）
    const jobs = rawJobs.map(j => {
      const { reqText, descText, bonusText } = splitJD(j.jdText);
      const skills = extractSkills(reqText, conf.skills);
      return {
        ...j,
        skills,
        descSkills: extractSkills(descText, conf.skills).filter(s => !skills.includes(s)),
        bonusSkills: extractSkills(bonusText, conf.skills).filter(s => !skills.includes(s))
      };
    });

    // 种子数据补充
    const seedData = loadSeedData();
    this._slog('info', `[${this.name}] 种子数据 ${seedData.length} 条（补充技能用）`);

    jobs.forEach(j => this._slog('info', `[${this.name}] 🌐 ${j.title} — ${(j.skills || []).length} 个技能`));

    return jobs.map(j => {
      if (j.skills.length >= 3) return j;
      let bestSeed = null, bestScore = 0;
      for (const seed of seedData) {
        const score = calcSimilarity(j.title, seed.title);
        if (score > bestScore) { bestScore = score; bestSeed = seed; }
      }
      if (bestSeed && bestScore >= 0.3) {
        const extra = extractSkills(bestSeed.text || '', conf.skills)
          .filter(s => !j.skills.includes(s));
        if (extra.length > 0) {
          this._slog('info', `  [${this.name}] 种子补充: ${j.title} ← ${bestSeed.title} (+${extra.length}技能)`);
          j.skills = [...j.skills, ...extra];
          if (j.jdText.length < bestSeed.text.length) {
            j.jdText = bestSeed.text.substring(0, 4000);
          }
        }
      }
      return j;
    });
  }
}

// 直接运行（供 node baidu.mjs 独立执行）
if (process.argv[1]?.endsWith('baidu.mjs')) {
  new BaiduScraper().run().catch(console.error);
}