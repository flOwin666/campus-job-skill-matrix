var fs = require('fs');
var code = [
/**
 * meituan.mjs — 美团岗位爬虫（继承ScraperBase）
 * 数据来源：本地种子文件 _work/_jd_all.json，results[18..30] = 13个美团岗位
 */
import { ScraperBase, extractSkills } from '../core/ScraperBase.mjs';
import { COMPANIES } from '../companies.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class MeituanScraper extends ScraperBase {
  constructor() {
    super(COMPANIES.meituan);
    this.seedFile = path.resolve(__dirname, '../../_work/_jd_all.json');
  }

  async list() {
    console.log('[美团] 启动...');
    const jobs = [];

    try {
      const all = JSON.parse(fs.readFileSync(this.seedFile, 'utf8'));
      const slice = all.results.slice(18, 31);

      for (const j of slice) {
        const text = j.text || '';
        const url  = j.url  || '';

        // 美团种子 name 字段是 " 美团-1\，真实岗位名在 text 中
 // text 格式：\...\\n大模型数据实习生\\n实习-日常实习\\n工作地点：...\
 const lines = text.split('\\n');
 const titleRaw = lines.find(l => l.trim().length > 0) || '';
 const title = titleRaw.replace(/^\\u3010.*?\\u3011/, '').trim() || j.name?.replace(/^\\u7f51\\u5740-/, '') || '\\u672a\\u77e5\\u5c97\\u4f4d';

 // 城市：从 text 中提取 \工作地点：...\ 字段
 const cityMatch = text.match(/\\u5de5\\u4f5c\\u5730\\u70b9[\\uff1a:]([^\\n]+)/);
 const location = cityMatch ? cityMatch[1].trim().replace(/[\\u3002\\/]/g, '/') : '';

 const jobIdMatch = url.match(/jobUnionId=(\\d+)/);
 const jobId = jobIdMatch ? String(jobIdMatch[1]) : String(slice.indexOf(j) + 1);

 jobs.push({
 jobId,
 title,
 company: '\\u7f8e\\u56e2',
 url: url || '#',
 location,
 jdText: text.substring(0, 3000),
 skills: extractSkills(text, this.config.skills)
 });
 }

 console.log([\\u7f8e\\u56e2] \\u4ece\\u79cd\\u5b50\\u52a0\\u8f7d \ \\u4e2a\\u5c97\\u4f4d);
 } catch (e) {
 console.log('[\\u7f8e\\u56e2] \\u79cd\\u5b50\\u6587\\u4ef6\\u8bfb\\u53d6\\u5931\\u8d25:', e.message);
 }

 return jobs;
 }
}

const scraper = new MeituanScraper();
scraper.run().catch(console.error);

];
fs.writeFileSync('D:/岗位信息爬取网页项目/_webapp/scrapers/meituan.mjs', code[0], 'utf8');
console.log('done');