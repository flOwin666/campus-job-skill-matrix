const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join('D:', '校招文件', '岗位需求', '_jd_all.json'), 'utf-8'));
const jobs = data.results;

// Skill definitions: [category, skillName, keywords]
const skillDefs = [
  // AI基础
  ['AI基础', '机器学习', [/机器学习/i]],
  ['AI基础', '深度学习', [/深度学习/i]],
  ['AI基础', 'Transformer', [/transformer/i]],
  ['AI基础', 'LLaMA/GPT', [/llama|gpt/i]],
  // 大模型训练
  ['大模型训练', '预训练', [/预训练|继续预训练/i]],
  ['大模型训练', 'SFT微调', [/sft|指令微调|精调微调|微调策略|supervised\s*fine/i]],
  ['大模型训练', 'RL/RLHF', [/强化学习|rlhf|rlaif|dpo|grpo|ppo|奖励模型|reward\s*model|agentic\s*rl/i]],
  ['大模型训练', 'DeepSpeed', [/deepspeed/i]],
  ['大模型训练', 'Megatron', [/megatron/i]],
  ['大模型训练', '分布式训练', [/分布式训练|数据并行|模型并行|序列并行|流水线并行|fsdp|张量并行|tensor\s*并行/i]],
  // AI应用开发
  ['AI应用开发', 'Prompt工程', [/prompt\s*工程|prompt\s*设计|prompt\s*编写|prompt\s*调优|prompt\s*优化|prompt\s*管理|prompt\s*实践|context\s*engineer/i]],
  ['AI应用开发', 'RAG', [/rag|检索增强|检索增强推理|检索增强生成|long-context\s*rag/i]],
  ['AI应用开发', 'LangChain', [/langchain|langgraph|autogen|llamaindex|coze|dify/i]],
  ['AI应用开发', '知识图谱', [/知识图谱|知识检索/i]],
  ['AI应用开发', 'AI产品思维', [/产品化|产品经理|用户体验设计|ai产品|产品落地/i]],
  // 模型优化推理
  ['模型优化推理', '模型量化', [/量化|quantiz/i]],
  ['模型优化推理', '模型蒸馏', [/蒸馏|distill/i]],
  ['模型优化推理', 'vLLM推理', [/vllm|推理优化|推理加速|推理框架|推理部署|推理效率/i]],
  ['模型优化推理', 'CUDA编程', [/cuda|nccl|rdma|npu编程|gpu编程/i]],
  // 编程语言
  ['编程语言', 'Python', [/python/i]],
  ['编程语言', 'C/C++', [/\bc\+\+|c\/c\+\+|\bc语言|\bc编程/i]],
  ['编程语言', 'Java', [/\bjava\b/i]],
  ['编程语言', 'Go', [/\bgolang|(?<=如|如：|包括)\s*go|go\/java|java\/go|c\+\+\/python\/go|golang/i]],
  ['编程语言', '前端JS/TS', [/javascript|typescript|react|vue|前端|html|css|node\.?js/i]],
  ['编程语言', 'SQL/Shell', [/\bsql\b|shell|spark|hive|hadoop|flink/i]],
  // 后端架构
  ['后端架构', '分布式系统', [/分布式系统|分布式/i]],
  ['后端架构', '高并发', [/高并发|并发/i]],
  ['后端架构', '微服务', [/微服务/i]],
  ['后端架构', 'API设计', [/api\s*设计|接口设计|openapi|rpc/i]],
  ['后端架构', '系统设计', [/系统设计能力|系统设计经验|系统架构设计/i]],
  // 算法方向
  ['算法方向', 'NLP', [/\bnlp\b|自然语言处理/i]],
  ['算法方向', 'CV', [/\bcv\b|计算机视觉|图像处理|图像识别|目标检测|视觉/i]],
  ['算法方向', '推荐算法', [/推荐算法|推荐系统|召回|排序(?!序)/i]],
  ['算法方向', '多模态', [/多模态/i]],
  ['算法方向', 'Diffusion', [/diffusion|stable\s*diffusion|sd\b|di\b|flow.matching|图像生成|视频生成|文生图|文生视频/i]],
  ['算法方向', 'MoE', [/\bmoe\b|mixture\s*of\s*experts/i]],
  ['算法方向', 'GNN', [/图神经网络|gnn|graph\s*neural/i]],
  // 基础设施
  ['基础设施', 'PyTorch', [/pytorch|pytorche|pytorche|pytorx/i]],
  ['基础设施', 'TensorFlow', [/tensorflow|tensorfl|tf\b/i]],
  ['基础设施', 'PaddlePaddle', [/paddlepaddle|飞桨|paddle/i]],
  ['基础设施', 'Docker/K8s', [/docker|kubernetes|k8s|容器化/i]],
  ['基础设施', 'Linux', [/linux/i]],
  // 加分项
  ['加分项', '顶会论文', [/顶会|论文发表|neurips|icml|iclr|acl|cvpr|icassp|aaai|ijcai|emnlp|icse|fse|colm|kdd|sigir|期刊/i]],
  ['加分项', '编程竞赛', [/acm|icpc|noi|ioi|top\s*coder|kaggle|编程竞赛/i]],
  ['加分项', '开源项目', [/开源|github/i]],
  ['加分项', 'Git', [/\bgit\b/i]],
  // Agent专项
  ['Agent专项', 'Agent框架', [/agent.*框架|智能体.*框架|agent.*架构|多agent|multi.?agent|agent.*系统|agentic\s*ai|agent.*平台|agent.*基建|agent.*底座/i]],
  ['Agent专项', 'Tool Calling', [/工具调用|tool\s*call|tool\s*use|tools?\s*调度/i]],
  ['Agent专项', 'MCP协议', [/\bmcp\b|mcp协议|model\s*context\s*protocol/i]],
  ['Agent专项', 'AI Coding', [/ai\s*coding|coding\s*agent|cursor|copilot|claude\s*code|windsurf|ai.*编程.*工具|ai.*辅助.*编程|ai.*代码.*生成/i]],
  ['Agent专项', '强化学习', [/强化学习|agentic\s*rl|on.policy.*learn|online.*learn|bandit|ppo|dpo|grpo|rlhf|序列决策/i]],
  ['Agent专项', '记忆机制', [/记忆|memory|上下文管理|context\s*engineer|长期记忆|工作记忆|情景记忆|长上下文/i]],
  ['Agent专项', 'PRM过程监督', [/prm|过程奖励|process\s*reward|可验证/i]],
];

// Build category order and skill names
const categories = [];
const catSkills = {};
for (const [cat, skill] of skillDefs) {
  if (!catSkills[cat]) { categories.push(cat); catSkills[cat] = []; }
  catSkills[cat].push(skill);
}

const results = [];
let totalChecked = 0;

for (const job of jobs) {
  const text = job.text;
  const skills = {};
  let jobChecked = 0;
  
  for (const cat of categories) {
    skills[cat] = {};
    for (const skill of catSkills[cat]) {
      const def = skillDefs.find(d => d[0] === cat && d[1] === skill);
      let matched = false;
      for (const regex of def[2]) {
        if (regex.test(text)) { matched = true; break; }
      }
      skills[cat][skill] = matched;
      if (matched) jobChecked++;
    }
  }
  totalChecked += jobChecked;
  
  results.push({
    name: job.name,
    company: job.name.startsWith('字节') ? '字节' : job.name.startsWith('阿里') ? '阿里' : job.name.startsWith('腾讯') ? '腾讯' : job.name.startsWith('美团') ? '美团' : '百度',
    skills: skills,
    skillCount: jobChecked,
    url: job.url
  });
  
  console.log(job.name + ': ' + jobChecked + ' skills');
}

console.log('\nTotal checked: ' + totalChecked + ' across ' + results.length + ' jobs');
console.log('Average: ' + (totalChecked / results.length).toFixed(1) + ' per job');

fs.writeFileSync(path.join('D:', '校招文件', '岗位需求', '_skill_analysis.json'), JSON.stringify(results, null, 2), 'utf-8');
console.log('Written to _skill_analysis.json');
