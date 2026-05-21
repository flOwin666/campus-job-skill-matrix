/**
 * run-all.mjs — 依次运行全部 5 个平台爬虫 + 合并
 * 用法: node scripts/run-all.mjs
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJ  = path.resolve(__dirname, '..');
const SCRAPERS = ['baidu','bytedance','alibaba','meituan','tencent'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function run(script) {
  return new Promise((resolve) => {
    const name = script.replace('scrapers/', '').replace('.mjs', '');
    console.log(`\n=== [${name}] 开始 ===`);
    const p = spawn('node', [`${script}`], {
      cwd: PROJ,
      stdio: 'inherit',
      shell: true
    });
    p.on('close', code => {
      console.log(`=== [${name}] 完成 code=${code} ===\n`);
      resolve(code);
    });
  });
}

async function main() {
  const start = Date.now();

  for (const name of SCRAPERS) {
    await run(`scrapers/${name}.mjs`);
    await sleep(1000); // 避免端口冲突
  }

  console.log('\n=== [合并] 开始 ===');
  const mp = spawn('node', ['scripts/merge.mjs'], {
    cwd: PROJ,
    stdio: 'inherit',
    shell: true
  });
  mp.on('close', code => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n=== 全部完成！耗时 ${elapsed}s ===`);
  });
}

main().catch(console.error);
