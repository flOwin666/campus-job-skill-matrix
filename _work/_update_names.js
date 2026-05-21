const fs = require('fs');
const data = JSON.parse(fs.readFileSync('D:/校招文件/岗位需求/_jd_all.json', 'utf-8'));
const analysis = JSON.parse(fs.readFileSync('D:/校招文件/岗位需求/_skill_analysis.json', 'utf-8'));

// 从书签提取的完整岗位名映射
const nameMap = {
  '字节-抖音大模型训练': '抖音大模型训练与应用-抖音AI',
  '字节-后端开发AML': '后端开发实习生-Data AML',
  '字节-TikTok多模态': 'TikTok短剧多模态理解和生成-TikTok研发',
  '字节-大模型算法AML': '大模型算法实习生-Data AML',
  '字节-AIGC优化Seed': 'AIGC模型优化实习生-Seed',
  '字节-训练推理优化Seed': '大模型训练/推理优化实习生-Seed',
  '字节-Agent架构Seed': 'Agent应用架构实习生-Seed',
  '字节-AIGC算法': 'AIGC算法实习生-智能创作',
  '字节-Agent研发抖音': 'Agent研发实习生-抖音',
  '字节-大模型Agent剪映': '大模型算法实习生(Agent方向)-剪映',
  '字节-大模型Agent穿山甲': '大模型Agent算法实习生-穿山甲',
  '字节-大模型算法抖音': '大模型算法实习生-抖音',
  '字节-AI大模型抖音研发': 'AI大模型算法开发实习生-抖音研发',
  '阿里-淘天1': '多模态算法(音乐方向)-未来生活实验室',
  '阿里-淘天2': 'Agentic大模型算法工程师',
  '阿里-淘天3': 'AI应用算法工程师(LLM)',
  '阿里-淘天4': 'AI Agent算法工程师',
  '腾讯-推荐算法': '算法-推荐算法方向',
  '美团-1': '大模型数据实习生',
  '美团-2': '多模态大模型训练系统工程师',
  '美团-3': '机器学习算法工程师',
  '美团-4': 'Agent Research Intern(大模型智能体学习方向)',
  '美团-5': '大模型应用算法项目实习生',
  '美团-6': 'AI Coding全栈工程师',
  '美团-7': 'Agent开发实习生(AI产品方向)',
  '美团-8': '财务科技-全栈开发实习生',
  '美团-9': 'AI Coding项目实习生',
  '美团-10': '机器学习基础架构工程师',
  '美团-11': '大模型应用开发项目实习生',
  '美团-12': 'AI方向后端开发工程师',
  '美团-13': '大模型应用-数据开发实习生',
  '百度-1': '大模型算法实习生',
  '百度-2': '智能体应用开发实习生',
  '百度-3': 'AI全栈创意设计技术实习生',
  '百度-4': 'Agent策略算法实习生',
  '百度-5': 'AIGC算法-视频生成方向实习生',
};

// 从JD原文再次尝试提取美团-4,7, 百度-5的真实名称
for (const r of data.results) {
  if (r.name === '美团-4' || r.name === '美团-7') {
    // 看URL或JD找线索
    const lines = r.text.split(/\n/).map(l=>l.trim()).filter(Boolean);
    console.log(r.name + ' URL: ' + r.url);
    console.log(r.name + ' first 10 lines:', lines.slice(0,10).join(' | '));
    console.log();
  }
}

// Fix百度-5 from JD
const bd5 = data.results.find(r => r.name === '百度-5');
if (bd5 && bd5.text.includes('视频生成')) {
  nameMap['百度-5'] = 'AIGC算法-视频生成方向实习生';
}

// Update analysis
for (const a of analysis) {
  a.displayName = nameMap[a.name] || a.name;
}
fs.writeFileSync('D:/校招文件/岗位需求/_skill_analysis.json', JSON.stringify(analysis, null, 2), 'utf-8');
console.log('\nUpdated _skill_analysis.json with displayName for all jobs');

// Also print final mapping for verification
for (const a of analysis) {
  console.log(a.name + ' => ' + a.displayName);
}
