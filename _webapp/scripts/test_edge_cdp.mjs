/**
 * 快速测试: 连接到调试模式Edge，检查百度详情页是否渲染
 */
import { chromium } from 'playwright';

async function test() {
  console.log('[测试] 连接Edge CDP...');
  const browser = await chromium.connectOverCDP('http://localhost:9223');
  const contexts = browser.contexts();
  console.log(`[测试] ${contexts.length} 个上下文`);

  // 找到百度页面
  for (const ctx of contexts) {
    const pages = ctx.pages();
    for (const p of pages) {
      const url = p.url();
      if (url.includes('talent.baidu.com')) {
        console.log(`[测试] 找到百度页面: ${url}`);
        await p.waitForTimeout(3000);
        const text = await p.$eval('body', el => el.textContent || '').catch(() => '');
        console.log(`[测试] body长度: ${text.length}`);
        if (text.length > 50) {
          console.log(`[测试] 前1000字:\n${text.substring(0, 1000)}`);
        } else {
          console.log('[测试] 页面为空，可能需要登录');
          // 截图看看
          await p.screenshot({ path: 'C:/temp/baidu_debug.png' });
          console.log('[测试] 截图保存到 C:/temp/baidu_debug.png');
        }
        break;
      }
    }
  }

  // 不关闭浏览器
  browser.close();
}

test().catch(console.error);
