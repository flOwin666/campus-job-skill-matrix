/**
 * JobManager.mjs — 配置驱动的岗位管理统一入口
 *
 * 设计目标：
 * 1. 从 companies.mjs 读取所有平台配置（source of truth）
 * 2. 每个平台对应一个 Scraper（子类各自实现 list()）
 * 3. JobManager 负责：调度 → 收集 → 去重（company|title|location）→ 合并 → 输出 jobs.json
 * 4. 同时更新各平台的单独 JSON 文件（jobs_{platform}.json），供前端单独展示
 *
 * 使用方式：
 *   import { JobManager } from './core/JobManager.mjs';
 *   const jm = new JobManager({ companies: ['baidu', 'bytedance'] });
 *   await jm.run();
 *
 * CLI（通过 run.mjs 调用）：
 *   node run.mjs                      # 全部平台
 *   node run.mjs --company=baidu      # 单平台
 *   node run.mjs --company=baidu,alibaba  # 多平台
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { COMPANIES } from '../companies.mjs';
import { formatJob, saveJson, sleep } from './ScraperBase.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = path.resolve(__dirname, '../data');
const OUT_FILE   = path.join(DATA_DIR, 'jobs.json');

// ---- 平台 key → Scraper 模块路径映射 ----
const SCRAPER_MAP = {
  baidu:     '../scrapers/baidu.mjs',
  bytedance: '../scrapers/bytedance.mjs',
  alibaba:   '../scrapers/alibaba.mjs',
  tencent:   '../scrapers/tencent.mjs',
  meituan:   '../scrapers/meituan.mjs',
};

/**
 * 统一去重 key：company | title | location
 * 不同城市同标题岗位视为不同岗位（允许重复城市）
 */
function dedupKey(job) {
  return `${job.company || ''}|${job.title || ''}|${job.location || ''}|${job.id || ''}`;
}

/**
 * 规范化字段名（merge.mjs 兼容）
 */
function normalizeJob(raw, source) {
  return {
    id:        raw.id       || `${source}_${raw.jobId || Date.now()}`,
    company:   raw.company  || source,
    title:     raw.title    || raw.name || '未知岗位',
    url:       raw.url      || '#',
    location:  raw.location || '',
    source,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    jdText:     (raw.jdText  || raw.text  || '').substring(0, 3000),
    skills:      Array.isArray(raw.skills) ? raw.skills : [],
    descSkills:  Array.isArray(raw.descSkills) ? raw.descSkills : [],
    bonusSkills: Array.isArray(raw.bonusSkills) ? raw.bonusSkills : [],
  };
}

/**
 * JobManager — 统一调度所有平台爬虫，去重，合并
 */
export class JobManager {
  /**
   * @param {Object} options
   * @param {string[]} [options.companies]  — 要运行的平台 key，默认全部
   * @param {number}    [options.delay=800]  — 平台间延迟（ms），防封禁
   */
  constructor({ companies = null, delay = 800, onLog = null, controller = null } = {}) {
    // 默认全量平台，按固定顺序
    this.allKeys = Object.keys(COMPANIES);
    this.targetKeys = companies
      ? this.allKeys.filter(k => companies.includes(k))
      : [...this.allKeys];

    // 过滤掉未启用或不存在配置的平台
    this.targetKeys = this.targetKeys.filter(k => {
      const c = COMPANIES[k];
      return c && c.enabled !== false;
    });

    this.delay = delay;
    this.onLog = onLog;
    this.results = [];
    this._allFailures = [];
  }

  /** 统一日志：有回调时交给回调，无回调时输出控制台 */
  _log(level, message) {
    if (this.onLog) {
      try { this.onLog({ level, message }); }
      catch (e) { console.error('[JobManager] onLog callback error:', e.message); }
    } else {
      if (level === 'error') console.error(message);
      else console.log(message);
    }
  }

  /** 仅收集结果，不写文件（被 run 调用） */
  async collect() {
    const seen = new Set();
    const jobs = [];

    for (const key of this.targetKeys) {
      const conf = COMPANIES[key];
      this._log('info', `\n=== [JobManager] 启动 ${conf.displayName}(${key}) ===`);

      try {
        const scraper = await this._loadScraper(key);
        if (!scraper) {
          this._log('info', `  ⚠️  scraper 加载失败，跳过`);
          continue;
        }

        // 将 onLog 传递给爬虫，使其内部日志也能推送 SSE
        scraper.onLog = this.onLog;

        const rawJobs = await scraper.list();
        this._log('info', `  → 获取 ${rawJobs.length} 个岗位`);

        for (const raw of rawJobs) {
          const job = normalizeJob(raw, key);
          const key3 = dedupKey(job);

          if (seen.has(key3)) {
            this._log('info', `  🔸 去重: ${job.title} (${job.location})`);
            continue;
          }
          seen.add(key3);
          jobs.push(job);

          // 同时更新单独平台文件
          const pf = path.join(DATA_DIR, `jobs_${key}.json`);
          const platformJobs = jobs.filter(j => j.source === key);
          saveJson(pf, platformJobs);
        }

        // 收集并发送该公司的失败日志
        if (scraper && scraper._failures && scraper._failures.length > 0) {
          const batch = { company: key, failures: scraper._failures };
          this._allFailures.push(...scraper._failures);
          if (this.onLog) {
            try { this.onLog({ level: 'failures_batch', message: JSON.stringify(batch) }); }
            catch {}
          }
        }

        this._log('info', `  ✅ ${conf.displayName} 完成，当前合计 ${jobs.length} 个岗位`);
      } catch (err) {
        this._log('error', `  ❌ ${conf.displayName} 出错: ${err.message}`);
      }

      if (this.delay > 0 && key !== this.targetKeys[this.targetKeys.length - 1]) {
        await sleep(this.delay);
      }
    }

    return jobs;
  }

  /** 加载某个平台的 Scraper 类（按需导入） */
  async _loadScraper(key) {
    const modulePath = SCRAPER_MAP[key];
    if (!modulePath) {
      this._log('error', `  ❌ 未知平台: ${key}`);
      return null;
    }

    try {
      const mod = await import(modulePath + `?t=${Date.now()}`);
      // Scraper 类名 = 平台名首字母大写 + 'Scraper'（BaiduScraper / BytedanceScraper / ...）
      const className = key.charAt(0).toUpperCase() + key.slice(1) + 'Scraper';
      const ScraperClass = mod[className];
      if (!ScraperClass) {
        this._log('error', `  ❌ ${modulePath} 未导出类 ${className}`);
        return null;
      }
      return new ScraperClass();
    } catch (err) {
      this._log('error', `  ❌ 导入 ${modulePath} 失败: ${err.message}`);
      return null;
    }
  }

  /** 运行完整流程：收集 → 去重 → 写文件 */
  async run() {
    const t0 = Date.now();
    this._log('info', `[JobManager] 开始，平台: ${this.targetKeys.join(', ')}`);

    const jobs = await this.collect();

    // 写入最终合并文件
    const result = {
      lastUpdated: new Date().toISOString(),
      total:     jobs.length,
      byCompany: {},
      results:   jobs,
      failures:  this._allFailures,
    };

    for (const j of jobs) {
      result.byCompany[j.company] = (result.byCompany[j.company] || 0) + 1;
    }

    saveJson(OUT_FILE, result);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    this._log('info', `\n[JobManager] ✅ 完成！共 ${jobs.length} 个岗位 (${elapsed}s)`);
    for (const [c, n] of Object.entries(result.byCompany)) {
      this._log('info', `  · ${c}: ${n} 个`);
    }
    this._log('info', `  → ${OUT_FILE}`);

    return result;
  }
}

/**
 * 单公司调用（LLM / 外部 API 主用）
 * @param {string} key  平台 key（baidu/bytedance/alibaba/tencent/meituan）
 * @param {Object} [options]
 * @param {number} [options.delay=800]
 * @param {Function} [options.onLog]  日志回调 ({ level, message }) => void
 * @returns {Promise<{lastUpdated, total, byCompany, results}>}
 */
export async function scrapeCompany(key, { delay = 800, onLog, controller } = {}) {
  const jm = new JobManager({ companies: [key], delay, onLog, controller });
  return jm.run();
}

/**
 * 全量调用（刷新按钮主用）
 * @param {Object} [options]
 * @param {number} [options.delay=800]
 * @param {Function} [options.onLog]  日志回调 ({ level, message }) => void
 * @param {Object} [options.controller] 暂停/停止控制器 { paused, stopped }
 * @returns {Promise<{lastUpdated, total, byCompany, results}>}
 */
export async function scrapeAll({ delay = 800, onLog, controller } = {}) {
  const jm = new JobManager({ companies: null, delay, onLog, controller });
  return jm.run();
}
