/**
 * run.mjs — 统一入口
 * 用法:
 *   node run.mjs                      # 跑全部平台
 *   node run.mjs --company=baidu      # 只跑百度
 *   node run.mjs --company=baidu,alibaba  # 跑多个平台
 *
 * 底层调用 core/JobManager.mjs 的 scrapeCompany / scrapeAll
 */
import { scrapeAll, scrapeCompany } from './core/JobManager.mjs';

// ---- CLI 解析 ----
const args = process.argv.slice(2);
const companyArg = args.find(a => a.startsWith('--company='));
const targets = companyArg
  ? companyArg.split('=')[1].split(',').map(s => s.trim())
  : null;

const onLog = ({ level, message }) => {
  if (level === 'failures_batch') return; // 仅 server.js SSE 使用，CLI 静默
  if (level === 'error') console.error(message);
  else console.log(message);
};

if (targets) {
  console.log(`[run] 目标平台: ${targets.join(', ')}`);
  (async () => {
    let total = 0;
    for (const key of targets) {
      const result = await scrapeCompany(key, { onLog });
      total += result.total;
    }
    console.log(`[run] ✅ 全部完成，共 ${total} 个岗位`);
  })().catch(err => {
    console.error('[run] ❌ 失败:', err);
    process.exit(1);
  });
} else {
  console.log(`[run] 目标平台: (全部)`);
  scrapeAll({ onLog })
    .then(result => {
      console.log(`[run] ✅ 全部完成，共 ${result.total} 个岗位`);
    })
    .catch(err => {
      console.error('[run] ❌ 失败:', err);
      process.exit(1);
    });
}
