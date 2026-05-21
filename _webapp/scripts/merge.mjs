/**
 * merge.mjs — 合并各平台爬虫输出为统一的 jobs.json
 * 用法: node scripts/merge.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 输出到Vue项目的src目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const OUTPUT_FILE = 'D:\\岗位信息爬取网页项目\\v6\\src\\jobsData.json';

const PLATFORM_FILES = {
  'baidu':    'jobs_baidu.json',
  'bytedance':'jobs_bytedance.json',
  'alibaba':  'jobs_alibaba.json',
  'meituan':  'jobs_meituan.json',
  'tencent':  'jobs_tencent.json',
};

function loadPlatform(name, filename) {
  const file = path.join(DATA_DIR, filename);
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // 统一字段名
    return (Array.isArray(data) ? data : data.results || []).map(j => ({
      id:       j.id       || `${name}_${Date.now()}`,
      company:  j.company  || name,
      title:    j.title     || j.name    || '未知岗位',
      url:      j.url       || '#',
      location: j.location  || j.city     || '',
      source:   name,
      updatedAt:j.updatedAt || new Date().toISOString(),
      jdText:     (j.jdText || j.text || '').substring(0, 3000),
      skills:      Array.isArray(j.skills) ? j.skills : [],
      descSkills:  Array.isArray(j.descSkills) ? j.descSkills : [],
      bonusSkills: Array.isArray(j.bonusSkills) ? j.bonusSkills : []
    }));
  } catch (e) {
    console.log(`[合并] ${name} 文件不存在或解析失败（正常，首次运行）`);
    return [];
  }
}

export function mergeJobs({ onLog } = {}) {
  const log = (msg) => { if (onLog) onLog({ level: 'info', message: msg }); else console.log(msg); };
  log('[合并] 开始...');
  const all = [];

  for (const [name, file] of Object.entries(PLATFORM_FILES)) {
    const jobs = loadPlatform(name, file);
    log(`  ${name}: ${jobs.length} 个`);
    all.push(...jobs);
  }

  // 去重（同 id 去重，id 包含 jobId 不会误判）
  const seen = new Set();
  const deduped = all.filter(j => {
    const key = j.id || `${j.company}|${j.title}|${j.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result = {
    lastUpdated: new Date().toISOString(),
    total: deduped.length,
    byCompany: {},
    results: deduped
  };

  log(`[合并] 最后更新时间: ${result.lastUpdated}`);

  for (const j of deduped) {
    result.byCompany[j.company] = (result.byCompany[j.company] || 0) + 1;
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  log(`\n[合并] ✅ 完成！共 ${deduped.length} 个岗位`);
  for (const [c, n] of Object.entries(result.byCompany)) {
    log(`  · ${c}: ${n} 个`);
  }
  log(`  → ${OUTPUT_FILE}`);

  return result;
}

// CLI 直接运行时执行合并
if (process.argv[1]?.includes('merge.mjs')) {
  mergeJobs();
}
