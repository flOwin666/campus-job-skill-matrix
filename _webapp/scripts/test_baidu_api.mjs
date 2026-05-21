/**
 * 测试百度列表页API - 寻找无需登录的API模式
 */
import { chromium, devices } from 'playwright';

const LIST_URL = 'https://talent.baidu.com/jobs/list?search=AI&type=INTERN';

async function test() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {}, csi: function(){}, loadTimes: function(){} };
  });

  const page = await context.newPage();

  // 监听所有网络请求
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('externapi') || req.url().includes('api')) {
      apiCalls.push({
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        postData: req.postData()
      });
    }
  });
  page.on('response', async resp => {
    if (resp.url().includes('externapi') || (resp.url().includes('api') && !resp.url().includes('.js'))) {
      try {
        const text = await resp.text().catch(() => '');
        const entry = apiCalls.find(c => c.url === resp.url());
        console.log(`\n[API响应] ${resp.status()} ${resp.url()}`);
        console.log(`  请求方法: ${entry?.method || '?'}`);
        console.log(`  请求头: cookie=${entry?.headers?.cookie?.substring(0, 100) || '无'}`);
        console.log(`  响应长度: ${text.length}`);
        if (text.length > 0 && text.length < 3000) {
          console.log(`  响应内容: ${text.substring(0, 500)}`);
        } else if (text.length >= 3000) {
          console.log(`  前500字: ${text.substring(0, 500)}`);
        }
      } catch {}
    }
  });

  console.log('[列表页] 访问...');
  await page.goto(LIST_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // 也试试直接用page.evaluate获取页面上的数据
  console.log('\n[列表页] 检查页面JS全局变量...');
  const globalVars = await page.evaluate(() => {
    const vars = {};
    // 常见的SPA全局变量
    for (const key of ['__INITIAL_STATE__', '__NEXT_DATA__', '__NUXT__', '__APP_DATA__', 'window.__data__']) {
      try {
        const val = eval(key);
        if (val) vars[key] = JSON.stringify(val).substring(0, 500);
      } catch {}
    }
    return vars;
  });
  for (const [k, v] of Object.entries(globalVars)) {
    console.log(`  ${k}: ${v}`);
  }

  // 现在用从列表页获取的cookie来请求详情页API
  console.log('\n[详情API] 用列表页cookie请求详情...');
  const cookies = await context.cookies();
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log(`[详情API] Cookie: ${cookieStr.substring(0, 150)}...`);

  const detailApis = [
    `https://talent.baidu.com/externapi/job/detail?jobId=85921`,
    `https://talent.baidu.com/externapi/job/detail?postId=85921`,
    `https://talent.baidu.com/externapi/intern/detail?jobId=85921`,
    `https://talent.baidu.com/externapi/intern/detail?postId=85921`,
  ];

  for (const apiUrl of detailApis) {
    try {
      const resp = await page.context().request.get(apiUrl, {
        headers: {
          'Cookie': cookieStr,
          'Referer': 'https://talent.baidu.com/jobs/detail/INTERN/85921',
          'Accept': 'application/json',
        }
      });
      const text = await resp.text();
      console.log(`  [${resp.status()}] ${apiUrl} → ${text.substring(0, 300)}`);
    } catch (e) {
      console.log(`  [ERR] ${apiUrl}: ${e.message}`);
    }
  }

  // 看看详情页加载时会发什么请求
  console.log('\n[详情页] 在同一context中访问详情页...');
  const detailApiCalls = [];
  page.on('request', req => {
    if (req.url().includes('externapi') || (req.url().includes('api') && !req.url().includes('.js') && !req.url().includes('.css'))) {
      detailApiCalls.push({ url: req.url(), method: req.method(), postData: req.postData() });
    }
  });
  page.on('response', async resp => {
    if (resp.url().includes('externapi') || (resp.url().includes('api') && !resp.url().includes('.js') && !resp.url().includes('.css') && !resp.url().includes('cdn'))) {
      try {
        const text = await resp.text().catch(() => '');
        console.log(`  [详情API] ${resp.status()} ${resp.url()} → ${text.substring(0, 300)}`);
      } catch {}
    }
  });

  await page.goto('https://talent.baidu.com/jobs/detail/INTERN/85921', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(8000);

  console.log(`\n[详情页] 详情页API调用: ${detailApiCalls.length} 个`);
  for (const c of detailApiCalls) {
    console.log(`  ${c.method} ${c.url}`);
  }

  await browser.close();
}

test().catch(console.error);
