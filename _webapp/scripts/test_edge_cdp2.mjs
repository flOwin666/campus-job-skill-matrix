/**
 * 测试: 用CDP Edge访问百度详情页，尝试多种等待策略
 */
import { chromium } from 'playwright';

async function test() {
  console.log('[测试] 连接Edge CDP...');
  const browser = await chromium.connectOverCDP('http://localhost:9223');
  const contexts = browser.contexts();
  
  // 新开标签页
  const page = await contexts[0].newPage();
  
  // 先访问列表页（确认基本可用）
  console.log('[测试1] 访问列表页...');
  await page.goto('https://talent.baidu.com/jobs/list?search=AI&type=INTERN', { waitUntil: 'networkidle', timeout: 20000 });
  const listText = await page.$eval('body', el => el.textContent || '').catch(() => '');
  console.log(`[测试1] 列表页body长度: ${listText.length}`);
  if (listText.length > 50) {
    console.log(`[测试1] 前300字: ${listText.substring(0, 300)}`);
  }

  // 列表页能渲染的话，说明不需要登录。详情页可能需要不同的等待方式
  console.log('\n[测试2] 访问详情页（长等待）...');
  await page.goto('https://talent.baidu.com/jobs/detail/INTERN/85921', { waitUntil: 'load', timeout: 30000 });
  
  // 等待更久
  await page.waitForTimeout(10000);
  
  // 检查DOM结构
  const html = await page.content();
  console.log(`[测试2] HTML长度: ${html.length}`);
  
  // 看看有没有关键元素
  const bodyText = await page.$eval('body', el => el.textContent || '').catch(() => '');
  console.log(`[测试2] body文本长度: ${bodyText.length}`);
  
  // 检查是否有#app或其他容器
  const appEl = await page.$('#app');
  const appHtml = appEl ? await appEl.innerHTML() : '';
  console.log(`[测试2] #app HTML长度: ${appHtml.length}`);
  if (appHtml.length > 0 && appHtml.length < 1000) {
    console.log(`[测试2] #app内容: ${appHtml}`);
  }

  // 检查script标签
  const scriptCount = await page.$$eval('script', els => els.length);
  console.log(`[测试2] script标签数: ${scriptCount}`);

  // 检查页面标题
  const title = await page.title();
  console.log(`[测试2] 页面标题: ${title}`);

  // 监听网络请求 - 刷新并捕获
  console.log('\n[测试3] 刷新详情页并监听网络请求...');
  const apiRequests = [];
  page.on('request', req => {
    if (req.url().includes('api') || req.url().includes('extern')) {
      apiRequests.push({ method: req.method(), url: req.url() });
    }
  });
  page.on('response', async resp => {
    if (resp.url().includes('externapi') || resp.url().includes('api/job')) {
      const text = await resp.text().catch(() => '');
      console.log(`  [API] ${resp.status()} ${resp.url()} → ${text.substring(0, 200)}`);
    }
  });

  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  console.log(`[测试3] API请求数: ${apiRequests.length}`);
  for (const r of apiRequests) {
    console.log(`  ${r.method} ${r.url}`);
  }

  // 截图
  await page.screenshot({ path: 'C:\\temp\\baidu_detail_screenshot.png', fullPage: true }).catch(() => {});
  console.log('[测试] 截图保存到 C:\\temp\\baidu_detail_screenshot.png');

  await page.close();
  // 不关闭CDP浏览器
  browser.close();
}

test().catch(console.error);
