// 将新爬虫数据转换为v5技能矩阵HTML
// 读取: _webapp/data/jobs.json
// 输出: 校招岗位技能矩阵表.html

const fs = require('fs');
const path = require('path');

const BASE = 'D:/岗位信息爬取网页项目/';
const OUT_HTML = BASE + 'v5/校招岗位技能矩阵表_v5.html';

const jobs = JSON.parse(fs.readFileSync(BASE + '_webapp/data/jobs.json', 'utf8')).results;

// 10大技能分类
const categories = [
  {name:'AI基础',color:'#34d399',skills:['机器学习/深度学习','Transformer/LLaMA/GPT']},
  {name:'大模型训练',color:'#60a5fa',skills:['预训练','SFT微调','RL/RLHF','DeepSpeed/Megatron','分布式训练']},
  {name:'模型优化推理',color:'#f472b6',skills:['量化/vLLM/CUDA','FlashAttention']},
  {name:'AI应用开发',color:'#a78bfa',skills:['Prompt工程','RAG','LangChain','AI产品思维']},
  {name:'算法方向',color:'#38bdf8',skills:['NLP','CV','推荐/多模态/Diffusion']},
  {name:'编程语言',color:'#fbbf24',skills:['Python','C/C++','Java','Go','JS/TS/SQL/Shell']},
  {name:'后端架构',color:'#fb923c',skills:['分布式/高并发/微服务','API/系统设计']},
  {name:'基础设施',color:'#4ade80',skills:['PyTorch/TF/Paddle','Docker/K8s/Linux/Git']},
  {name:'加分项',color:'#f87171',skills:['顶会论文/竞赛/开源']},
  {name:'Agent专项',color:'#c084fc',skills:['Agent框架/Tool Call/MCP','AI Coding/强化学习/记忆']},
];

const companyMap = {'baidu':'百度','bytedance':'字节','alibaba':'阿里','tencent':'腾讯','meituan':'美团'};
const companyColors = {
  '字节':{bg:'rgba(0,210,255,0.08)',border:'#00d2ff',text:'#00d2ff',badge:'字节跳动'},
  '阿里':{bg:'rgba(255,102,0,0.08)',border:'#ff6600',text:'#ff6600',badge:'阿里·淘天'},
  '腾讯':{bg:'rgba(50,180,255,0.08)',border:'#32b4ff',text:'#32b4ff',badge:'腾讯'},
  '美团':{bg:'rgba(255,145,0,0.08)',border:'#ff9100',text:'#ff9100',badge:'美团'},
  '百度':{bg:'rgba(76,175,80,0.08)',border:'#4caf50',text:'#4caf50',badge:'百度'},
};
const companyOrder = ['字节','阿里','腾讯','美团','百度'];

// 转换
function convertJob(job) {
  const raw = job.company || job.id.split('_')[0];
  const company = companyMap[raw] || raw;
  const name = company + '-' + job.title;
  const jd = (job.jdText || '').toLowerCase();
  const arr = Array.isArray(job.skills) ? job.skills.map(s => s.toLowerCase()) : [];
  const jobSkills = {};
  let cnt = 0;
  for (const cat of categories) {
    jobSkills[cat.name] = {};
    for (const skill of cat.skills) {
      const kwList = skill.split('/').map(k => k.trim().toLowerCase());
      const matched = kwList.some(kw => jd.includes(kw) || arr.some(s => s.includes(kw) || kw.includes(s)));
      jobSkills[cat.name][skill] = matched;
      if (matched) cnt++;
    }
  }
  return {name, company, displayName: job.title + (job.location ? ' (' + job.location + ')' : ''), url: job.url || '#', skills: jobSkills, skillCount: cnt};
}

const analysis = jobs.map(convertJob);
analysis.sort((a, b) => {
  const ci = companyOrder.indexOf(a.company) - companyOrder.indexOf(b.company);
  return ci !== 0 ? ci : a.name.localeCompare(b.name, 'zh');
});

const allSkillNames = categories.flatMap(c => c.skills);
const allSkillNamesLower = allSkillNames.map(s => s.toLowerCase());

const companyCounts = {};
for (const j of analysis) companyCounts[j.company] = (companyCounts[j.company] || 0) + 1;
const totalSkills = categories.reduce((s, c) => s + c.skills.length, 0);

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// 技能搜索索引
const skillIndex = {};
for (let i = 0; i < analysis.length; i++) {
  for (const cat of categories) {
    for (const skill of cat.skills) {
      if (analysis[i].skills[cat.name] && analysis[i].skills[cat.name][skill]) {
        const key = skill.toLowerCase();
        if (!skillIndex[key]) skillIndex[key] = [];
        skillIndex[key].push(i);
      }
    }
  }
}

// 生成 HTML
let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>校招岗位技能矩阵表 v5</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:"Microsoft YaHei","PingFang SC",sans-serif; background:#0f1419; color:#e7e9ea; font-size:12px; line-height:1.5; }
.header { background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); padding:24px 20px 16px; text-align:center; border-bottom:1px solid #2f3336; }
.header h1 { font-size:24px; font-weight:800; letter-spacing:2px; margin-bottom:8px; color:#fff; }
.header .sub { color:#8b98a5; font-size:13px; margin-bottom:14px; }
.badges { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; }
.badge { padding:4px 14px; border-radius:20px; font-size:12px; font-weight:600; }
.legend { background:#16202a; padding:8px 16px; display:flex; justify-content:center; gap:20px; flex-wrap:wrap; border-bottom:1px solid #2f3336; font-size:11px; }
.legend span { display:flex; align-items:center; gap:4px; }
.dot { width:10px; height:10px; border-radius:2px; flex-shrink:0; }
.controls { background:#16202a; padding:8px 16px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; border-bottom:1px solid #2f3336; }
.controls label { color:#8b98a5; font-size:11px; }
.controls select, .controls input { background:#0f1419; color:#e7e9ea; border:1px solid #2f3336; border-radius:4px; padding:4px 8px; font-size:11px; }
.controls select:focus, .controls input:focus { outline:none; border-color:#1d9bf0; }
.btn { background:#1d9bf0; color:#fff; border:none; border-radius:4px; padding:5px 14px; font-size:11px; cursor:pointer; font-weight:600; }
.btn:hover { background:#1a8cd8; }
.search-hint { color:#8b98a5; font-size:10px; margin-left:4px; }
.search-result { color:#1d9bf0; font-size:10px; margin-left:4px; }
.wrap { overflow-x:auto; max-height:calc(100vh - 200px); }
table { width:100%; border-collapse:collapse; min-width:1600px; }
thead th { position:sticky; top:0; z-index:10; }
.cat-row th { padding:7px 6px; font-size:11px; font-weight:700; text-align:center; border-bottom:1px solid #2f3336; }
.skill-row th { padding:5px 4px; font-size:9px; font-weight:600; text-align:center; color:#8b98a5; border-bottom:1px solid #2f3336; background:#1a2332; cursor:pointer; user-select:none; line-height:1.3; }
.skill-row th:hover { color:#1d9bf0; background:#1a2d40; }
.skill-row th.highlight { color:#1d9bf0; background:rgba(29,155,240,0.15); }
th.first-col { position:sticky; left:0; z-index:15; min-width:180px; max-width:200px; text-align:left; padding:6px 10px; background:#16202a; border-right:2px solid #2f3336; }
.cat-row th.first-col { background:#1a2332; }
tbody td { padding:4px 3px; text-align:center; border-right:1px solid rgba(47,51,54,0.4); border-bottom:1px solid rgba(47,51,54,0.3); }
tbody td:first-child { position:sticky; left:0; z-index:5; text-align:left; padding:5px 10px; background:#0f1419; border-right:2px solid #2f3336; max-width:200px; }
tbody tr:hover td { background:rgba(29,155,240,0.04); }
tbody tr:hover td:first-child { background:rgba(29,155,240,0.06); }
.company-sep td { background:rgba(22,32,42,0.8) !important; padding:4px 10px; font-weight:700; font-size:11px; border:none; color:#8b98a5; }
.yes { background:rgba(29,155,240,0.2); color:#1d9bf0; font-weight:700; font-size:12px; }
.yes.highlight-cell { background:rgba(29,155,240,0.45); color:#7dd3fc; box-shadow: inset 0 0 0 1px rgba(29,155,240,0.5); }
.no { color:#2f3336; font-size:10px; }
.job-link { color:#e7e9ea; text-decoration:none; font-weight:600; font-size:11px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.job-link:hover { color:#1d9bf0; text-decoration:underline; }
.job-link:visited { color:#8b949e; }
.job-count { font-size:9px; color:#8b98a5; }
.cat-border-r { border-right:2px solid rgba(255,255,255,0.15) !important; }
.skill-border-r { border-right:2px solid rgba(255,255,255,0.15) !important; }
.footer { text-align:center; padding:16px; color:#536471; font-size:10px; border-top:1px solid #2f3336; }
.data-source { color:#4ade80; font-size:10px; margin-left:8px; }
</style>
</head>
<body>

<div class="header">
  <h1>校招岗位技能矩阵表 v5</h1>
  <div class="sub">
    <span>实时爬取数据</span> | <span>${analysis.length}个岗位</span> | <span>10大类${totalSkills}项技能</span> | <span>数据来源: _webapp/data/jobs.json</span>
  </div>
  <div class="badges">
${Object.entries(companyCounts).map(([c,n]) => {
  const cc = companyColors[c];
  return `<span class="badge" style="background:${cc.bg};color:${cc.text};border:1px solid ${cc.border}">${cc.badge} (${n})</span>`;
}).join('\n')}
  </div>
</div>

<div class="legend">
  <span><span class="dot" style="background:rgba(29,155,240,0.2);border:1px solid #1d9bf0"></span> JD明确提及</span>
  <span><span class="dot" style="background:#0f1419;border:1px solid #2f3336"></span> 未提及</span>
  <span style="color:#f87171">注：点击表头技能名搜索，点击岗位名跳转招聘页</span>
  <span class="data-source">🔄 数据为爬虫实时采集 | 飞桨岗位已修复多城市显示</span>
</div>

<div class="controls">
  <label>公司:</label>
  <select id="fCompany" onchange="filter()">
    <option value="all">全部 (${analysis.length})</option>
${Object.entries(companyCounts).map(([c,n]) => `<option value="${c}">${companyColors[c].badge} (${n})</option>`).join('\n')}
  </select>
  <label>搜索:</label>
  <input type="text" id="fSearch" placeholder="岗位名称或技能名..." oninput="filter()" style="width:280px">
  <span id="searchHint" class="search-hint">支持岗位+技能搜索</span>
  <span id="searchResult" class="search-result"></span>
  <button class="btn" onclick="refresh()">🔄 重新生成</button>
</div>

<div class="wrap">
<table>
<thead>
<tr class="cat-row">
  <th class="first-col">岗位</th>
${categories.map((c,i) => `<th colspan="${c.skills.length}" style="color:${c.color};border-left:2px solid ${c.color};background:#1a2332">${c.name}</th>`).join('\n')}
</tr>
<tr class="skill-row">
  <th class="first-col"></th>
${categories.flatMap(c => c.skills.map((s,i) => {
  const last = i === c.skills.length - 1;
  return `<th class="${last ? 'skill-border-r' : ''}" onclick="searchSkill('${esc(s)}')" title="点击搜索「${esc(s)}」">${esc(s)}</th>`;
})).join('\n')}
</tr>
</thead>
<tbody>
`;

let lastCompany = '';
for (let idx = 0; idx < analysis.length; idx++) {
  const job = analysis[idx];
  if (job.company !== lastCompany) {
    html += `<tr class="company-sep"><td colspan="${totalSkills + 1}" style="color:${companyColors[job.company].text}">${companyColors[job.company].badge}</td></tr>\n`;
    lastCompany = job.company;
  }
  const skillList = [];
  for (const cat of categories) {
    for (const skill of cat.skills) {
      if (job.skills[cat.name] && job.skills[cat.name][skill]) skillList.push(skill);
    }
  }
  html += `<tr data-company="${job.company}" data-name="${esc(job.displayName)}" data-skills="${esc(skillList.join(','))}" data-idx="${idx}">`;
  html += `<td><a class="job-link" href="${esc(job.url)}" target="_blank" title="${esc(job.displayName)}">${esc(job.displayName)}</a><span class="job-count">${job.skillCount}项</span></td>`;
  for (const cat of categories) {
    for (let si = 0; si < cat.skills.length; si++) {
      const skill = cat.skills[si];
      const matched = job.skills[cat.name] && job.skills[cat.name][skill];
      const last = si === cat.skills.length - 1;
      html += `<td class="${matched ? 'yes' : 'no'} ${last ? 'cat-border-r' : ''}" data-skill="${skill.toLowerCase()}">${matched ? '●' : '—'}</td>`;
    }
  }
  html += '</tr>\n';
}

html += `</tbody></table></div>

<div class="footer">
  数据来源：字节跳动/阿里·淘天/腾讯/美团/百度校招官网 | 技能匹配基于JD关键词自动提取 | v5 实时版 ${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}
</div>

<script>
const skillIndex = ${JSON.stringify(skillIndex)};
const allSkillNames = ${JSON.stringify(allSkillNames)};
const allSkillNamesLower = ${JSON.stringify(allSkillNamesLower)};

function filter() {
  const c = document.getElementById('fCompany').value;
  const s = document.getElementById('fSearch').value.trim().toLowerCase();
  const hintEl = document.getElementById('searchHint');
  const resultEl = document.getElementById('searchResult');
  const matchedSkills = s ? allSkillNamesLower.filter(n => n.includes(s) || s.includes(n)) : [];
  const skillMatchSet = new Set(matchedSkills);
  let visibleCount = 0;
  document.querySelectorAll('tbody tr[data-company]').forEach(r => {
    const mc = c === 'all' || r.dataset.company === c;
    const nameMatch = !s || r.dataset.name.toLowerCase().includes(s);
    const skillMatch = !s || r.dataset.skills.toLowerCase().includes(s);
    r.style.display = (mc && (nameMatch || skillMatch)) ? '' : 'none';
    if (mc && (nameMatch || skillMatch)) visibleCount++;
  });
  document.querySelectorAll('.skill-row th').forEach(th => th.classList.remove('highlight'));
  document.querySelectorAll('td[data-skill]').forEach(td => td.classList.remove('highlight-cell'));
  if (matchedSkills.length > 0) {
    document.querySelectorAll('.skill-row th').forEach(th => {
      if (matchedSkills.some(m => th.textContent.toLowerCase().includes(m) || m.includes(th.textContent.toLowerCase()))) {
        th.classList.add('highlight');
      }
    });
    document.querySelectorAll('td[data-skill]').forEach(td => {
      if (matchedSkills.some(m => td.dataset.skill.includes(m) || m.includes(td.dataset.skill))) {
        td.classList.add('highlight-cell');
      }
    });
  }
  document.querySelectorAll('tbody tr.company-sep').forEach(r => {
    if (c === 'all' && !s) { r.style.display = ''; return; }
    const comp = r.querySelector('td').textContent.trim();
    const cc = comp.includes('字节')?'字节':comp.includes('阿里')?'阿里':comp.includes('腾讯')?'腾讯':comp.includes('美团')?'美团':'百度';
    r.style.display = (c === 'all' || c === cc) ? '' : 'none';
  });
  if (s) {
    resultEl.textContent = visibleCount + '个岗位';
    hintEl.textContent = matchedSkills.length > 0 ? '匹配技能: ' + matchedSkills.slice(0,3).map(m => allSkillNames[allSkillNamesLower.indexOf(m)] || m).join(', ') + (matchedSkills.length > 3 ? '...' : '') : '';
  } else {
    resultEl.textContent = '';
    hintEl.textContent = '支持岗位+技能搜索';
  }
}

function searchSkill(skillName) {
  document.getElementById('fSearch').value = skillName;
  filter();
}

function refresh() { location.reload(); }
</script>
</body></html>`;

fs.writeFileSync(OUT_HTML, html, 'utf-8');
console.log('✅ HTML生成完成:', OUT_HTML);
console.log('   岗位总数:', analysis.length, '| 公司分布:', companyCounts);
const fei = analysis.find(x => x.name.includes('飞桨'));
console.log('   飞桨岗位:', fei ? fei.displayName + ' | ' + fei.url : '未找到');
