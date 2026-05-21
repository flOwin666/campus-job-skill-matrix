const {execSync} = require('child_process');
const path = require('path');
const xb = path.join('D:', 'QClaw', 'resources', 'openclaw', 'config', 'skills', 'xbrowser', 'scripts', 'xb.cjs');
const url = 'https://jobs.bytedance.com/campus/position/7622243665091528965/detail';
try {
  console.log('xb path:', xb);
  console.log('exists:', require('fs').existsSync(xb));
  const cmd = 'node "' + xb + '" run --browser cft open "' + url + '"';
  console.log('cmd:', cmd);
  const r = execSync(cmd, {timeout:30000, encoding:'utf-8', stdio:'pipe'});
  console.log('open OK:', r.trim().substring(0,100));
  execSync('node "' + xb + '" run --browser cft wait --load networkidle', {timeout:15000, encoding:'utf-8', stdio:'pipe'});
  console.log('wait OK');
  const r3 = execSync('node "' + xb + '" run --browser cft get text body', {timeout:15000, encoding:'utf-8', stdio:'pipe'});
  const d = JSON.parse(r3);
  const t = d && d.data && d.data.result && d.data.result.data && d.data.result.data.text;
  console.log('text length:', t ? t.length : 0);
} catch(e) {
  console.log('ERROR:', e.message.substring(0,500));
}
