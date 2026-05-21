/**
 * meituan.mjs — 美团岗位爬虫（Playwright 详情页抓取 + 种子数据回退）
 */
import { ScraperBase, extractSkills, splitJD } from '../core/ScraperBase.mjs';
import { COMPANIES } from '../companies.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class MeituanScraper extends ScraperBase {
  constructor() {
    super(COMPANIES.meituan);
    this.seedFile = path.resolve(__dirname, '../../_work/_jd_all.json');
  }

  _loadSeedData() {
    try {
      const all = JSON.parse(fs.readFileSync(this.seedFile, 'utf8'));
      const slice = all.results.slice(18, 31);
      return slice.map((j, i) => {
        const text = j.text || '';
        const name = j.name || '';
        const title = name.replace(/^美团-/, '');
        const url = j.url || '';
        const jobIdMatch = url.match(/jobUnionId=([0-9]+)/);
        const jobId = jobIdMatch ? String(jobIdMatch[1]) : String(i + 1);
        return { jobId, title, url, seedText: text, seedSkills: extractSkills(text, this.config.skills) };
      });
    } catch (e) {
      this._slog('error', `[美团] 种子文件读取失败: ${e.message}`);
      return [];
    }
  }

  async list() {
    this._slog('info', '[美团] 启动...');
    const seeds = this._loadSeedData();
    if (seeds.length === 0) return [];

    const urls = seeds.map(s => s.url).filter(Boolean);
    let browser, context;
    try {
      ({ browser, context } = await this.launchBrowser());
    } catch (e) {
      this._slog('error', `[美团] 浏览器启动失败，退回种子模式: ${e.message}`);
      return seeds.map(s => this._seedJob(s));
    }

    const jobs = [];
    const CONCURRENCY = 2;
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
            const { reqText, descText, bonusText } = splitJD(result.jdText);
            const skills = extractSkills(reqText, this.config.skills);
            const descSkills = extractSkills(descText, this.config.skills).filter(s => !skills.includes(s));
            const bonusSkills = extractSkills(bonusText, this.config.skills).filter(s => !skills.includes(s));
            // 从页面提取真实标题（种子数据中只有编号）
            const realTitle = this._extractTitle(result.jdText) || seed.title;
            this._slog('info', `[美团] 🌐 ${realTitle} — ${skills.length}+${bonusSkills.length} 个技能`);
            jobs.push({
              jobId: seed.jobId, title: realTitle, company: '美团',
              url: seed.url, location: result.location || '',
              jdText: result.jdText.substring(0, 3000), skills, descSkills, bonusSkills
            });
          } else {
            const reason = result?._error || 'empty_page';
            this.addFailure({ jobId: seed.jobId, title: seed.title, url: seed.url, reason });
            this._slog('info', `[美团] ⚠️ 回退种子: ${seed.title} (${reason})`);
            jobs.push(this._seedJob(seed));
          }
        }
        await Promise.all(pages.map(p => p.close()));
      }
    } catch (e) {
      this._slog('error', `[美团] Playwright 抓取出错: ${e.message}`);
      for (const seed of seeds) {
        if (!jobs.find(j => j.jobId === seed.jobId)) jobs.push(this._seedJob(seed));
      }
    } finally {
      await browser.close();
    }
    this._slog('info', `[美团] 完成，共 ${jobs.length} 个岗位`);
    return jobs;
  }

  /** 从页面文本提取真实岗位标题 */
  _extractTitle(bodyText) {
    const lines = bodyText.split('\n');
    const loginIdx = lines.findIndex(l => l.trim() === '登录');
    if (loginIdx >= 0) {
      for (let i = loginIdx + 1; i < lines.length; i++) {
        const ln = lines[i].trim();
        if (ln.length >= 3 && !ln.includes('实习-') && !ln.includes('招聘')) {
          return ln.replace(/^【.*?】/, '').trim();
        }
      }
    }
    return '';
  }

  _seedJob(seed) {
    const lines = seed.seedText.split('\n');
    let location = '';
    for (const line of lines) {
      if (line.indexOf('工作地点：') >= 0) { location = line.split('工作地点：')[1] || ''; break; }
    }
    const { reqText, descText, bonusText } = splitJD(seed.seedText);
    const skills = extractSkills(reqText, this.config.skills);
    const descSkills = extractSkills(descText, this.config.skills).filter(s => !skills.includes(s));
    const bonusSkills = extractSkills(bonusText, this.config.skills).filter(s => !skills.includes(s) && !descSkills.includes(s));
    return {
      jobId: seed.jobId, title: seed.title, company: '美团',
      url: seed.url || '#', location,
      jdText: seed.seedText.substring(0, 3000), skills, descSkills, bonusSkills
    };
  }
}

if (process.argv[1]?.endsWith('meituan.mjs')) {
  new MeituanScraper().run().catch(console.error);
}
