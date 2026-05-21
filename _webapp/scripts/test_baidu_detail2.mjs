/**
 * 测试百度详情页 - 方案对比
 * 1. headless: false (有头浏览器)
 * 2. 复用本地Chrome CDP
 */
import { chromium } from 'playwright';

const TEST_URL = 'https://talent.baidu.com/jobs/detail/INTERN/85921';

async function testHeaded() {
  console.log('=== 方案1: headed浏览器 ===');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('[headed] 等待8秒...');
  await page.waitForTimeout(8000);

  const bodyText = await page.$eval('body', el => (el.textContent || '')).catch(() => '');
  console.log(`[headed] body长度: ${bodyText.length}`);
  if (bodyText.length > 50) {
    console.log(`[headed] 前800字:\n${bodyText.substring(0, 800)}`);
  } else {
    console.log('[headed] body为空，SPA未渲染');
  }

  // 检查网络请求
  const apiUrls = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('api') || url.includes('job') || url.includes('intern')) {
      apiUrls.push({ url, status: resp.status() });
    }
  });
  await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(5000);
  console.log(`[headed] API请求: ${apiUrls.length} 个`);
  for (const r of apiUrls.slice(0, 10)) {
    console.log(`  ${r.status} ${r.url}`);
  }

  // 尝试拦截API响应获取JD数据
  for (const r of apiUrls) {
    try {
      const resp = await page.context().request.get(r.url);
      const text = await resp.text().catch(() => '');
      if (text.length > 100 && (text.includes('任职') || text.includes('职责') || text.includes('要求'))) {
        console.log(`\n[headed-API] ${r.url} 含JD关键词! 长度:${text.length}`);
        console.log(`  前500字: ${text.substring(0, 500)}`);
      }
    } catch {}
  }

  await browser.close();
}

async function testCDP() {
  console.log('\n=== 方案2: CDP复用本地Chrome ===');
  // 尝试连接到本地已打开的Chrome
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    console.log(`[CDP] 已连接，${contexts.length} 个上下文`);
    const page = await contexts[0].newPage();
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(8000);
    const bodyText = await page.$eval('body', el => (el.textContent || '')).catch(() => '');
    console.log(`[CDP] body长度: ${bodyText.length}`);
    if (bodyText.length > 50) {
      console.log(`[CDP] 前800字:\n${bodyText.substring(0, 800)}`);
    }
    await page.close();
    await browser.close();
  } catch (e) {
    console.log(`[CDP] 连接失败: ${e.message}`);
    console.log('[CDP] 需要先启动Chrome并开启远程调试: chrome --remote-debugging-port=9222');
  }
}

async function main() {
  await testHeaded();
  await testCDP();
}

main().catch(console.error);
