/**
 * 测试百度详情页 Playwright 渲染
 * 目标：确认 headless Playwright 能否获取百度详情页的完整JD文本
 */
import { chromium } from 'playwright';

const TEST_URL = 'https://talent.baidu.com/jobs/detail/INTERN/85921';

async function test() {
  console.log('[测试] 启动浏览器...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('[测试] 访问详情页:', TEST_URL);
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // 等待更久，给SPA渲染时间
  console.log('[测试] 等待5秒让SPA渲染...');
  await page.waitForTimeout(5000);

  // 方式1: body.textContent
  const bodyText = await page.$eval('body', el => (el.textContent || '')).catch(() => '');
  console.log('\n[方式1] body.textContent 长度:', bodyText.length);
  if (bodyText.length > 100) {
    console.log('[方式1] 前500字:', bodyText.substring(0, 500));
  }

  // 方式2: innerHTML
  const bodyHtml = await page.$eval('body', el => el.innerHTML).catch(() => '');
  console.log('\n[方式2] body.innerHTML 长度:', bodyHtml.length);
  if (bodyHtml.length > 100) {
    console.log('[方式2] 前500字:', bodyHtml.substring(0, 500));
  }

  // 方式3: 查找特定选择器
  const selectors = [
    '.job-detail', '.detail-content', '.job-content',
    '.position-detail', '.job-description', '.jd-content',
    '[class*="detail"]', '[class*="job"]', '[class*="desc"]',
    '[class*="require"]', '[class*="respons"]',
    'main', '#app', '.container'
  ];
  for (const sel of selectors) {
    const text = await page.$eval(sel, el => el.textContent?.trim() || '').catch(() => '');
    if (text.length > 50) {
      console.log(`\n[方式3] ${sel} 匹配! 长度:${text.length}`);
      console.log(`  前300字: ${text.substring(0, 300)}`);
    }
  }

  // 方式4: 网络请求 - 查看是否有API请求
  console.log('\n[方式4] 检查网络请求...');
  const apiResponses = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('api') || url.includes('job') || url.includes('detail') || url.includes('position')) {
      apiResponses.push({ url, status: resp.status() });
    }
  });

  // 刷新页面以捕获网络请求
  await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);

  console.log(`[方式4] 捕获到 ${apiResponses.length} 个相关API请求:`);
  for (const r of apiResponses) {
    console.log(`  ${r.status} ${r.url}`);
  }

  // 尝试从API响应中获取数据
  for (const r of apiResponses) {
    if (r.url.includes('detail') || r.url.includes('job') || r.url.includes('position')) {
      try {
        const resp = await page.context().request.get(r.url);
        const json = await resp.json().catch(() => null);
        if (json) {
          const str = JSON.stringify(json);
          console.log(`\n[API数据] ${r.url} 返回JSON长度:${str.length}`);
          console.log(`  前500字: ${str.substring(0, 500)}`);
        }
      } catch (e) {
        console.log(`[API数据] ${r.url} 非JSON: ${e.message}`);
      }
    }
  }

  await browser.close();
  console.log('\n[测试] 完成');
}

test().catch(console.error);
