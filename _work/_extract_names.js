const fs = require('fs');
const data = JSON.parse(fs.readFileSync('D:/校招文件/岗位需求/_jd_all.json', 'utf-8'));

const names = {};
for (const r of data.results) {
  const t = r.text;
  let name = '';
  
  // 百度: "大模型算法实习生（J99230）..."
  const bm = t.match(/^(.{4,35}(?:实习生|工程师))\s*（/);
  if (bm) name = bm[1].trim();
  
  // 腾讯: "算法-推荐算法方向"
  if (!name) {
    const tx = t.match(/^(.{2,30}(?:算法|方向))\s*$/m);
    if (tx && t.indexOf(tx[0]) < 200) name = tx[1].trim();
  }
  
  // 阿里: look for meaningful line before 职位描述
  if (!name) {
    const lines = t.split(/\n/).map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      if (/(?:实习|工程师|研发|算法|技术|P\d)/.test(lines[i]) 
          && lines[i].length > 3 && lines[i].length < 35 
          && !/登录|首页|产品|招聘|社会|技术人才|职位描述|团队介绍|职位ID|投递|相关职位/.test(lines[i])) {
        name = lines[i]; break;
      }
    }
  }
  
  // 美团: try to find job title from URL params or text
  if (!name) {
    // 美团JD中找"工作职责"前面的标题或第一个有意义的行
    const lines = t.split(/\n/).map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      if (lines[i].length > 4 && lines[i].length < 40 
          && !/首页|北斗|社会|校园|赛事|了解|登录|招聘|职位详情|jobUnionId|web/.test(lines[i])
          && /[\u4e00-\u9fa5]{3,}/.test(lines[i])) {
        name = lines[i]; break;
      }
    }
  }
  
  if (!name) name = r.name;
  names[r.name] = name;
  console.log(r.name + ' => ' + name);
}

fs.writeFileSync('D:/校招文件/岗位需求/_job_names.json', JSON.stringify(names, null, 2), 'utf-8');
