/**
 * bytedance.mjs — 字节跳动岗位爬虫（Playwright 详情页抓取 + 种子数据回退）
 */
import { ScraperBase, extractSkills, splitJD } from '../core/ScraperBase.mjs';
import { COMPANIES } from '../companies.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class BytedanceScraper extends ScraperBase {
  constructor() {
    super(COMPANIES.bytedance);
    this.seedFile = path.resolve(__dirname, '../../_work/_jd_all.json');
  }

  /** 从种子文件读取原始数据（用作 URL 来源和回退） */
  _loadSeedData() {
    try {
      const all = JSON.parse(fs.readFileSync(this.seedFile, 'utf8'));
      const slice = all.results.slice(0, 13);
      return slice.map(j => {
        const name = j.name || '';
        const title = name.replace(/^字节-/, '');
        const text = j.text || '';
        const url = j.url || '';

        const jobIdMatch = url.match(/(\d+)\/detail$/);
        const jobId = jobIdMatch ? String(jobIdMatch[1]) : title;

        return { jobId, title, url, seedText: text, seedSkills: extractSkills(text, this.config.skills) };
      });
    } catch (e) {
      this._slog('error', `[字节] 种子文件读取失败: ${e.message}`);
      return [];
    }
  }

  async list() {
    this._slog('info', '[字节] 启动...');
    const seeds = this._loadSeedData();
    if (seeds.length === 0) return [];

    const urls = seeds.map(s => s.url).filter(Boolean);
    if (urls.length === 0) {
      this._slog('info', '[字节] 无有效URL，退回纯种子模式');
      return seeds.map(s => this._seedJob(s));
    }

    // 尝试 Playwright 抓取
    let browser, context;
    try {
      ({ browser, context } = await this.launchBrowser());
    } catch (e) {
      this._slog('error', `[字节] 浏览器启动失败，退回种子模式: ${e.message}`);
      return seeds.map(s => this._seedJob(s));
    }

    const jobs = [];
    const CONCURRENCY = 2; // 最多 2 个 page 并行

    try {
      for (let i = 0; i < urls.length; i += CONCURRENCY) {
        if (await this._checkController()) break;
        const batch = urls.slice(i, i + CONCURRENCY);
        const pages = await Promise.all(batch.map(() => context.newPage()));

        const results = await Promise.all(batch.map((url, idx) =>
          this.fetchDetail(pages[idx], url, 15000)
        ));

        for (let j = 0; j < batch.length; j++) {
          const seed = seeds[i + j];
          const result = results[j];

          if (result && result.jdText && result.jdText.length > 200) {
            // Playwright 成功 → 用网页真实数据
            const pageTitle = (result.title || '').replace(/^【.*?】/, '').replace(/\s*[-–].*$/, '').trim();
            const title = (pageTitle.length >= 3 ? pageTitle : '') || seed.title;
            const { reqText, descText, bonusText } = splitJD(result.jdText);
            const skills = extractSkills(reqText, this.config.skills);
            const descSkills = extractSkills(descText, this.config.skills).filter(s => !skills.includes(s));
            const bonusSkills = extractSkills(bonusText, this.config.skills).filter(s => !skills.includes(s));
            this._slog('info', `[字节] 🌐 ${title} — ${skills.length}+${bonusSkills.length} 个技能`);
            jobs.push({
              jobId: seed.jobId,
              title,
              company: '字节跳动',
              url: seed.url,
              location: result.location || '',
              jdText: result.jdText.substring(0, 3000),
              skills,
              descSkills,
              bonusSkills
            });
          } else {
            const reason = result?._error || 'empty_page';
            this.addFailure({ jobId: seed.jobId, title: seed.title, url: seed.url, reason });
            this._slog('info', `[字节] ⚠️ 回退种子: ${seed.title} (${reason})`);
            jobs.push(this._seedJob(seed));
          }
        }

        await Promise.all(pages.map(p => p.close()));
      }
    } catch (e) {
      this._slog('error', `[字节] Playwright 抓取出错，退回种子模式: ${e.message}`);
      // 补充未抓取的种子
      for (const seed of seeds) {
        if (!jobs.find(j => j.jobId === seed.jobId)) {
          jobs.push(this._seedJob(seed));
        }
      }
    } finally {
      await browser.close();
    }

    this._slog('info', `[字节] 完成，共 ${jobs.length} 个岗位`);
    return jobs;
  }

  /** 从种子数据构造岗位（回退用） */
  _seedJob(seed) {
    const locMatch = seed.seedText.match(/([^\n]{2,6}(?:北京|上海|深圳|杭州|广州|成都|武汉|西安|南京))[^\n]*/);
    const { reqText, descText, bonusText } = splitJD(seed.seedText);
    const skills = extractSkills(reqText, this.config.skills);
    const descSkills = extractSkills(descText, this.config.skills).filter(s => !skills.includes(s));
    const bonusSkills = extractSkills(bonusText, this.config.skills).filter(s => !skills.includes(s) && !descSkills.includes(s));
    return {
      jobId: seed.jobId,
      title: seed.title,
      company: '字节跳动',
      url: seed.url || '#',
      location: locMatch ? locMatch[0].replace(/\n/g, '').substring(0, 20) : '',
      jdText: seed.seedText.substring(0, 3000),
      skills,
      descSkills,
      bonusSkills
    };
  }
}

if (process.argv[1]?.endsWith('bytedance.mjs')) {
  new BytedanceScraper().run().catch(console.error);
}
