/**
 * tencent.mjs — 腾讯岗位爬虫（Playwright 详情页抓取 + 种子数据回退）
 */
import { ScraperBase, extractSkills, splitJD } from '../core/ScraperBase.mjs';
import { COMPANIES } from '../companies.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class TencentScraper extends ScraperBase {
  constructor() {
    super(COMPANIES.tencent);
    this.seedFile = path.resolve(__dirname, '../../_work/_jd_all.json');
  }

  _loadSeedData() {
    try {
      const all = JSON.parse(fs.readFileSync(this.seedFile, 'utf8'));
      const slice = all.results.slice(17, 18);
      return slice.map((j, i) => {
        const text = j.text || '';
        const name = j.name || '';
        const title = name.replace(/^腾讯-/, '');
        const url = j.url || '';
        const jobIdMatch = url.match(/postid=(\d+)/);
        const jobId = jobIdMatch ? String(jobIdMatch[1]) : String(i + 1);
        return { jobId, title, url, seedText: text, seedSkills: extractSkills(text, this.config.skills) };
      });
    } catch (e) {
      this._slog('error', `[腾讯] 种子文件读取失败: ${e.message}`);
      return [];
    }
  }

  async list() {
    this._slog('info', '[腾讯] 启动...');
    const seeds = this._loadSeedData();
    if (seeds.length === 0) return [];

    const urls = seeds.map(s => s.url).filter(Boolean);
    let browser, context;
    try {
      ({ browser, context } = await this.launchBrowser());
    } catch (e) {
      this._slog('error', `[腾讯] 浏览器启动失败，退回种子模式: ${e.message}`);
      return seeds.map(s => this._seedJob(s));
    }

    const jobs = [];
    const CONCURRENCY = 2;
    try {
      for (let i = 0; i < urls.length; i += CONCURRENCY) {
        const batch = urls.slice(i, i + CONCURRENCY);
        const pages = await Promise.all(batch.map(() => context.newPage()));
        const results = await Promise.all(batch.map((url, idx) =>
          this.fetchDetail(pages[idx], url, 15000)
        ));
        for (let j = 0; j < batch.length; j++) {
          const seed = seeds[i + j];
          const result = results[j];
          if (result && result.jdText && result.jdText.length > 200) {
            const { reqText, descText, bonusText } = splitJD(result.jdText);
            const skills = extractSkills(reqText, this.config.skills);
            const descSkills = extractSkills(descText, this.config.skills).filter(s => !skills.includes(s));
            const bonusSkills = extractSkills(bonusText, this.config.skills).filter(s => !skills.includes(s));
            this._slog('info', `[腾讯] 🌐 ${seed.title} — ${skills.length}+${bonusSkills.length} 个技能`);
            jobs.push({
              jobId: seed.jobId, title: seed.title, company: '腾讯',
              url: seed.url, location: result.location || '',
              jdText: result.jdText.substring(0, 3000), skills, descSkills, bonusSkills
            });
          } else {
            const reason = result?._error || 'empty_page';
            this.addFailure({ jobId: seed.jobId, title: seed.title, url: seed.url, reason });
            this._slog('info', `[腾讯] ⚠️ 回退种子: ${seed.title} (${reason})`);
            jobs.push(this._seedJob(seed));
          }
        }
        await Promise.all(pages.map(p => p.close()));
      }
    } catch (e) {
      this._slog('error', `[腾讯] Playwright 抓取出错: ${e.message}`);
      for (const seed of seeds) {
        if (!jobs.find(j => j.jobId === seed.jobId)) jobs.push(this._seedJob(seed));
      }
    } finally {
      await browser.close();
    }
    this._slog('info', `[腾讯] 完成，共 ${jobs.length} 个岗位`);
    return jobs;
  }

  _seedJob(seed) {
    const { reqText, descText, bonusText } = splitJD(seed.seedText);
    const skills = extractSkills(reqText, this.config.skills);
    const descSkills = extractSkills(descText, this.config.skills).filter(s => !skills.includes(s));
    const bonusSkills = extractSkills(bonusText, this.config.skills).filter(s => !skills.includes(s) && !descSkills.includes(s));
    return {
      jobId: seed.jobId, title: seed.title, company: '腾讯',
      url: seed.url || '#', location: '',
      jdText: seed.seedText.substring(0, 3000), skills, descSkills, bonusSkills
    };
  }
}

if (process.argv[1]?.endsWith('tencent.mjs')) {
  new TencentScraper().run().catch(console.error);
}
