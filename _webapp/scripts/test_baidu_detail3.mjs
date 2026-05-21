/**
 * 测试百度详情页 - 方案3: 绕过SPA检测
 * 1. 使用完整Chromium参数（伪装真实浏览器）
 * 2. 注入脚本模拟浏览器环境
 * 3. 等待更长时间
 */
import { chromium, devices } from 'playwright';

const TEST_URL = 'https://talent.baidu.com/jobs/detail/INTERN/85921';

async function testStealth() {
  console.log('=== 方案: 伪装真实浏览器 ===');
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-size=1920,1080',
    ]
  });

  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });

  // 注入反检测脚本
  await context.addInitScript(() => {
    // 隐藏 webdriver 标记
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // 模拟 chrome 对象
    window.chrome = { runtime: {}, csi: function(){}, loadTimes: function(){} };
    // 模拟 permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
    // 模拟 plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    // 模拟 languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en'],
    });
  });

  const page = await context.newPage();

  // 监听网络请求
  const allRequests = [];
  const allResponses = [];
  page.on('request', req => {
    allRequests.push({ url: req.url(), method: req.method() });
  });
  page.on('response', resp => {
    allResponses.push({ url: resp.url(), status: resp.status(), contentType: resp.headers()['content-type'] || '' });
  });

  console.log('[stealth] 访问详情页...');
  await page.goto(TEST_URL, { waitUntil: 'commit', timeout: 30000 });
  
  // 等待更长时间
  console.log('[stealth] 等待10秒...');
  await page.waitForTimeout(10000);

  // 检查渲染结果
  const bodyText = await page.$eval('body', el => (el.textContent || '')).catch(() => '');
  console.log(`[stealth] body长度: ${bodyText.length}`);
  if (bodyText.length > 50) {
    console.log(`[stealth] 前800字:\n${bodyText.substring(0, 800)}`);
  }

  const bodyHtml = await page.$eval('body', el => el.innerHTML).catch(() => '');
  console.log(`[stealth] HTML长度: ${bodyHtml.length}`);
  if (bodyHtml.length > 50 && bodyHtml.length < 500) {
    console.log(`[stealth] HTML内容:\n${bodyHtml}`);
  }

  // 输出网络请求
  console.log(`\n[stealth] 网络请求: ${allRequests.length} 个`);
  const apiReqs = allRequests.filter(r => r.url.includes('api') || r.url.includes('job') || r.url.includes('intern') || r.url.includes('talent'));
  console.log(`[stealth] API相关请求: ${apiReqs.length} 个`);
  for (const r of apiReqs.slice(0, 15)) {
    console.log(`  ${r.method} ${r.url}`);
  }

  console.log(`\n[stealth] 网络响应: ${allResponses.length} 个`);
  const apiResps = allResponses.filter(r => r.url.includes('api') || r.url.includes('job') || r.url.includes('intern') || r.url.includes('talent'));
  console.log(`[stealth] API相关响应: ${apiResps.length} 个`);
  for (const r of apiResps.slice(0, 15)) {
    console.log(`  ${r.status} [${r.contentType.substring(0, 30)}] ${r.url}`);
  }

  // 尝试直接访问百度API
  console.log('\n[stealth] 尝试直接请求API...');
  const possibleApis = [
    'https://talent.baidu.com/api/job/detail?jobId=85921',
    'https://talent.baidu.com/api/intern/detail/85921',
    'https://talent.baidu.com/api/job/INTERN/85921',
    'https://talent.baidu.com/externapi/job/detail?jobId=85921',
    'https://talent.baidu.com/externapi/intern/detail/85921',
  ];
  for (const apiUrl of possibleApis) {
    try {
      const resp = await page.context().request.get(apiUrl, {
        headers: { 'Referer': 'https://talent.baidu.com/', 'Accept': 'application/json' }
      });
      const text = await resp.text();
      console.log(`  [${resp.status()}] ${apiUrl} → 长度:${text.length}`);
      if (text.length > 10 && text.length < 2000) {
        console.log(`    内容: ${text.substring(0, 300)}`);
      }
    } catch (e) {
      console.log(`  [ERR] ${apiUrl}: ${e.message}`);
    }
  }

  await browser.close();
  console.log('\n[stealth] 完成');
}

testStealth().catch(console.error);
