const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const xb = path.join('D:', 'QClaw', 'resources', 'openclaw', 'config', 'skills', 'xbrowser', 'scripts', 'xb.cjs');

const jobs = [
  ['字节-抖音大模型训练', 'https://jobs.bytedance.com/campus/position/7628894203847117109/detail'],
  ['字节-后端开发AML', 'https://jobs.bytedance.com/campus/position/7506796111286831378/detail'],
  ['字节-TikTok多模态', 'https://jobs.bytedance.com/campus/position/7628090692501522741/detail'],
  ['字节-大模型算法AML', 'https://jobs.bytedance.com/campus/position/7506794873661851912/detail'],
  ['字节-AIGC优化Seed', 'https://jobs.bytedance.com/campus/position/7622243665091528965/detail'],
  ['字节-训练推理优化Seed', 'https://jobs.bytedance.com/campus/position/7622925236257933573/detail'],
  ['字节-Agent架构Seed', 'https://jobs.bytedance.com/campus/position/7621895637056358661/detail'],
  ['字节-AIGC算法', 'https://jobs.bytedance.com/campus/position/7452233714001824007/detail'],
  ['字节-Agent研发抖音', 'https://jobs.bytedance.com/campus/position/7543188075808639250/detail'],
  ['字节-大模型Agent剪映', 'https://jobs.bytedance.com/campus/position/7600401280228165893/detail'],
  ['字节-大模型Agent穿山甲', 'https://jobs.bytedance.com/campus/position/7588106512728820021/detail'],
  ['字节-大模型算法抖音', 'https://jobs.bytedance.com/campus/position/7574643701982398773/detail'],
  ['字节-AI大模型抖音研发', 'https://jobs.bytedance.com/campus/position/7625710890532669749/detail'],
  ['阿里-淘天1', 'https://campus-talent.alibaba.com/campus/position/199904080009?deptCodes='],
  ['阿里-淘天2', 'https://campus-talent.alibaba.com/campus/position/199904360006?deptCodes='],
  ['阿里-淘天3', 'https://campus-talent.alibaba.com/campus/position/199904320007?deptCodes='],
  ['阿里-淘天4', 'https://campus-talent.alibaba.com/campus/position/199904260007?deptCodes='],
  ['腾讯-推荐算法', 'https://join.qq.com/post_detail.html?postid=1217109396824518656'],
  ['美团-1', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=3695916926'],
  ['美团-2', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=4241405977'],
  ['美团-3', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=4360384786'],
  ['美团-4', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=4275554474'],
  ['美团-5', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=3375639537'],
  ['美团-6', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=4302562168'],
  ['美团-7', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=4306214875'],
  ['美团-8', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=3647684690'],
  ['美团-9', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=2912154756'],
  ['美团-10', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=4288959124'],
  ['美团-11', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=4186951948'],
  ['美团-12', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=4249416960'],
  ['美团-13', 'https://zhaopin.meituan.com/web/position/detail?jobUnionId=3786372696'],
  ['百度-1', 'https://talent.baidu.com/jobs/detail/INTERN/f8a467f0-2a4a-4238-a21c-412408f85c2e'],
  ['百度-2', 'https://talent.baidu.com/jobs/detail/INTERN/c0fc797e-13e9-4554-9c0d-39e8f5d839bd'],
  ['百度-3', 'https://talent.baidu.com/jobs/detail/INTERN/81ef7d83-f2f7-4923-b30d-db51deb2e6d6'],
  ['百度-4', 'https://talent.baidu.com/jobs/detail/INTERN/6f85641f-2a8e-4806-bbb5-4bbbf4705741'],
  ['百度-5', 'https://talent.baidu.com/jobs/detail/INTERN/7a6fd93d-d78f-49bd-8dad-1b5f3e2e2c76'],
];

const outPath = path.join('D:', '校招文件', '岗位需求', '_jd_all.json');
let existing = {};
try { existing = JSON.parse(fs.readFileSync(outPath, 'utf-8')); } catch(e) {}
const results = existing.results || [];

function fetch(name, url) {
  const cmd_open = 'node "' + xb + '" run --browser cft open "' + url + '"';
  const cmd_wait = 'node "' + xb + '" run --browser cft wait --load networkidle';
  const cmd_text = 'node "' + xb + '" run --browser cft get text body';
  
  execSync(cmd_open, {timeout: 45000, encoding: 'utf-8'});
  execSync(cmd_wait, {timeout: 20000, encoding: 'utf-8'});
  const out = execSync(cmd_text, {timeout: 20000, encoding: 'utf-8'});
  const d = JSON.parse(out);
  return (d && d.data && d.data.result && d.data.result.data && d.data.result.data.text) || '';
}

for (const [name, url] of jobs) {
  const existingIdx = results.findIndex(r => r.name === name && !r.text.startsWith('ERROR'));
  if (existingIdx >= 0) {
    console.log('SKIP: ' + name);
    continue;
  }
  try {
    process.stdout.write('Fetching: ' + name + '... ');
    const text = fetch(name, url);
    const idx = results.findIndex(r => r.name === name);
    if (idx >= 0) results.splice(idx, 1);
    results.push({name, url, text: text.substring(0, 8000)});
    console.log('OK (' + text.length + ' chars)');
  } catch(e) {
    console.log('FAIL (' + e.message.substring(0, 80) + ')');
    const idx = results.findIndex(r => r.name === name);
    if (idx >= 0) results.splice(idx, 1);
    results.push({name, url, text: 'ERROR: ' + e.message.substring(0, 200)});
  }
  fs.writeFileSync(outPath, JSON.stringify({results, updatedAt: new Date().toISOString()}, null, 2), 'utf-8');
}
console.log('\nDone! ' + results.filter(r => !r.text.startsWith('ERROR')).length + '/' + jobs.length + ' success');
