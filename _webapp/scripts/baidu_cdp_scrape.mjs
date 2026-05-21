/**
 * 方案4: 通过复用本地已登录Edge浏览器来爬取百度详情页
 * 需要先以远程调试模式启动Edge
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../data');
const OUT_FILE = path.join(OUT_DIR, 'jobs_baidu.json');
const JD_FILE = path.resolve(__dirname, '../../_work/_jd_all.json');

const SKILLS = [
  'Python','PyTorch','TensorFlow','PaddlePaddle','LLM','NLP','CV',
  'RAG','LangChain','Agent','SFT','LoRA','DPO','RLHF',
  'CUDA','GPU','Transformer','VLM','Diffusion','AIGC',
  'C\\+\\+','Java','Golang','Go','JavaScript','SQL','Redis',
  'Hadoop','Spark','Flink','Kafka','Docker','K8s',
  'ML','Deep Learning','Machine Learning',
  'Prompt','Embedding','DeepSpeed','Megatron','MCP',
  'Vue','React','Webpack','vite','Node','CSS','HTML',
  'Linux','Git','Shell','HDFS','Hive','GraphQL','gRPC',
  'MySQL','MongoDB','PostgreSQL','NoSQL',
  '搜索','推荐','排序','大模型','多模态','Stable Diffusion'
];

function extractSkills(text) {
  const s = new Set();
  for (const p of SKILLS) {
    try { if (new RegExp(p, 'i').test(text)) s.add(p.replace(/\\\+/g, '+')); } catch {}
  }
  return [...s];
}

const CDP_PORT = 9223; // 用9223避免和已有9222冲突

async function scrapeBaidu() {
  console.log('[百度] 启动详情页爬虫（CDP模式）...');

  // 检查是否有已启动的调试模式Edge
  let browser;
  try {
    console.log(`[百度] 尝试连接 CDP localhost:${CDP_PORT}...`);
    browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    console.log('[百度] ✅ 已连接到Edge');
  } catch (e) {
    console.log(`[百度] CDP连接失败: ${e.message}`);
    console.log('[百度] 请先以调试模式启动Edge:');
    console.log(`  msedge --remote-debugging-port=${CDP_PORT} --user-data-dir="C:\\temp\\edge-debug"`);
    console.log('[百度] 启动后手动登录百度账号，然后重新运行此脚本');
    process.exit(1);
  }

  const contexts = browser.contexts();
  const page = await contexts[0].newPage();

  // 读取已有岗位列表（从列表页爬虫的结果）
  const existingJobs = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  console.log(`[百度] 已有 ${existingJobs.length} 个岗位，开始补充详情页数据...`);

  let updated = 0;
  for (const job of existingJobs) {
    if (!job.url) continue;
    try {
      console.log(`[百度] 访问: ${job.title} → ${job.url}`);
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);

      // 尝试获取页面文本
      const bodyText = await page.$eval('body', el => (el.textContent || '')).catch(() => '');
      
      if (bodyText && bodyText.length > 100) {
        // 检查是否包含"任职要求"或"职位要求"
        const hasRequirements = /任职要求|职位要求|岗位要求|任职资格|岗位资格|要求/.test(bodyText);
        if (hasRequirements) {
          console.log(`[百度] ✅ ${job.title}: 获取到完整JD (${bodyText.length}字)`);
          job.jdText = bodyText.substring(0, 4000);
          job.skills = extractSkills(bodyText);
          job.updatedAt = new Date().toISOString();
          updated++;
        } else {
          console.log(`[百度] ⚠️ ${job.title}: 有内容但缺任职要求 (${bodyText.length}字)`);
        }
      } else {
        console.log(`[百度] ❌ ${job.title}: 页面为空或内容过少`);
      }

      // 礼貌等待
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log(`[百度] 跳过 ${job.title}: ${e.message}`);
    }
  }

  await page.close();
  // 注意：不关闭browser，因为是复用的用户浏览器

  // 输出结果
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(existingJobs, null, 2), 'utf8');
  console.log(`\n[百度] ✅ 更新 ${updated}/${existingJobs.length} 个岗位 → ${OUT_FILE}`);
  existingJobs.forEach(j => console.log(`  · ${j.title} (${j.location}) [${j.skills.join(',')}]`));
}

scrapeBaidu().catch(console.error);
