const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const xb = path.join('D:', 'QClaw', 'resources', 'openclaw', 'config', 'skills', 'xbrowser', 'scripts', 'xb.cjs');

const jobs = [
  ['美团-12', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=4249416960'],
  ['美团-13', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=3786372696'],
  ['百度-1', 'https://talent.baidu.com/jobs/detail/INTERN/f8a467f0-2a4a-4238-a21c-412408f85c2e'],
  ['百度-2', 'https://talent.baidu.com/jobs/detail/INTERN/c0fc797e-13e9-4554-9c0d-39e8f5d839bd'],
  ['百度-3', 'https://talent.baidu.com/jobs/detail/INTERN/81ef7d83-f2f7-4923-b30d-db51deb2e6d6'],
  ['百度-4', 'https://talent.baidu.com/jobs/detail/INTERN/6f85641f-2a8e-4806-bbb5-4bbbf4705741'],
  ['百度-5', 'https://talent.baidu.com/jobs/detail/INTERN/7a6fd93d-d78f-49bd-8dad-1b5f3e2e2c76'],
];

const outPath = path.join('D:', '校招文件', '岗位需求', '_jd_all.json');
const existing = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
const results = existing.results || [];

for (const [name, url] of jobs) {
  try {
    process.stdout.write('Fetching: ' + name + '... ');
    execSync('node "' + xb + '" run --browser cft open "' + url + '"', {timeout: 45000, encoding: 'utf-8'});
    execSync('node "' + xb + '" run --browser cft wait --load networkidle', {timeout: 20000, encoding: 'utf-8'});
    const out = execSync('node "' + xb + '" run --browser cft get text body', {timeout: 20000, encoding: 'utf-8'});
    const d = JSON.parse(out);
    const text = (d && d.data && d.data.result && d.data.result.data && d.data.result.data.text) || '';
    const idx = results.findIndex(r => r.name === name);
    if (idx >= 0) results.splice(idx, 1);
    results.push({name, url, text: text.substring(0, 8000)});
    console.log('OK (' + text.length + ' chars)');
  } catch(e) {
    console.log('FAIL (' + e.message.substring(0, 80) + ')');
  }
  fs.writeFileSync(outPath, JSON.stringify({results, updatedAt: new Date().toISOString()}, null, 2), 'utf-8');
}
const ok = results.filter(r => !r.text.startsWith('ERROR')).length;
console.log('\nDone! ' + ok + '/' + results.length + ' total success');
