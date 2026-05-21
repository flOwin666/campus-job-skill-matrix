const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join('D:', '校招文件', '岗位需求', '_jd_all.json'), 'utf-8'));
const jobs = data.results;

// 新技能树定义：[category, skillName, keywords]
const skillDefs = [
  // 1. AI基础（理论根基）
  ['AI基础', '机器学习/深度学习', [/机器学习|深度学习|ml\s*基础|dl\s*基础|模式识别|统计学习|监督学习|无监督学习|强化学习基础/i],
   '理论根基'],
  ['AI基础', 'Transformer/LLaMA/GPT', [/transformer|llama|gpt[\\d-]*|bert|大语言模型|llm|基座模型|基础模型|通用模型|qwen|通义|文心|chatglm|deepseek|claude|gemini|大模型\s*(?!应用)/i],
   '理论根基'],
  
  // 2. 大模型训练（核心技术）
  ['大模型训练', '预训练', [/预训练|继续预训练|二次预训练|pretrain|训练数据\s*构建|数据\s*飞轮/i],
   '训练流程'],
  ['大模型训练', 'SFT微调', [/sft|指令微调|有监督微调|精调微调|微调策略|finetun|supervised\s*fine|全量微调|lora|qlora/i],
   '训练流程'],
  ['大模型训练', 'RL/RLHF', [/强化学习|rlhf|rlaif|dpo|grpo|ppo|奖励模型|reward\s*model|agentic\s*rl|rl\s*训练|后训练|post.train|on.policy|online.learn/i],
   '训练流程'],
  ['大模型训练', 'DeepSpeed/Megatron', [/deepspeed|megatron|colossalai|训练框架/i],
   '工具框架'],
  ['大模型训练', '分布式训练', [/分布式训练|数据并行|模型并行|序列并行|流水线并行|fsdp|张量并行|tensor.*并行|多机多卡|多卡训练|gpu集群|算力调度/i],
   '工具框架'],
  
  // 3. 模型优化推理（部署优化）
  ['模型优化推理', '量化/vLLM/CUDA', [/量化|quantiz|vllm|推理优化|推理加速|推理框架|推理部署|推理效率|cuda|nccl|rdma|npu编程|gpu编程|triton|tensorrt|onnx|模型压缩|模型加速/i],
   '推理优化'],
  ['模型优化推理', 'FlashAttention', [/flash.?attention|flash.?attn|注意力优化|attention.*优化/i],
   '加速技术'],
  
  // 4. AI应用开发（业务落地）
  ['AI应用开发', 'Prompt工程', [/prompt|提示词|提示工程|context\s*window|上下文工程|context\s*engineer|few.?shot|zero.?shot|chain.?of.?thought|cot|指令设计/i],
   '核心开发'],
  ['AI应用开发', 'RAG', [/rag|检索增强|检索增强推理|检索增强生成|long.?context\s*rag|知识检索|向量检索|embedding|向量数据库|文档问答/i],
   '核心开发'],
  ['AI应用开发', 'LangChain', [/langchain|langgraph|llamaindex|autogen|coze|dify|agent框架|智能体框架/i],
   '核心开发'],
  ['AI应用开发', 'AI产品思维', [/产品|用户体验|落地|场景|业务|商业化|应用\s*开发|产品化/i],
   '应用场景'],
  
  // 5. 算法方向（场景细分）
  ['算法方向', 'NLP', [/\bnlp\b|自然语言处理|文本理解|文本生成|语言模型|对话系统|问答系统|文本分类|命名实体|情感分析|机器翻译|摘要生成|文本\s*算法/i],
   '基础'],
  ['算法方向', 'CV', [/\bcv\b|计算机视觉|图像处理|图像识别|目标检测|图像分割|视觉算法|图像生成|视频理解|ocr|人脸识别|图像\s*算法|视觉\s*技术/i],
   '基础'],
  ['算法方向', '推荐/多模态/Diffusion', [/推荐算法|推荐系统|召回|排序|协同过滤|多模态|multimodal|diffusion|stable\s*diffusion|sd\b|文生图|文生视频|图像生成|视频生成|diff.*模型|moe|mixture.*expert|图神经网络|gnn|graph.*neural|知识图谱/i],
   '拓展'],
  
  // 6. 编程语言（工具栈）
  ['编程语言', 'Python', [/python/i], '核心'],
  ['编程语言', 'C/C++', [/\bc\+\+|c\/c\+\+|\bc语言|\bc编程|cpp/i], '核心'],
  ['编程语言', 'Java', [/\bjava\b/i], '核心'],
  ['编程语言', 'Go', [/\bgolang|(?<=如|如：|包括)\s*go|go\/java|java\/go|c\+\+\/python\/go|golang/i], '核心'],
  ['编程语言', 'JS/TS/SQL/Shell', [/javascript|typescript|js\b|ts\b|node\.?js|react|vue|前端|sql\b|shell|spark|hive|hadoop|flink|脚本/i], '前端/工具'],
  
  // 7. 后端架构（工程支撑）
  ['后端架构', '分布式/高并发/微服务', [/分布式系统|分布式|高并发|高可用|高扩展|微服务|service.*mesh|服务化|负载均衡|容灾/i], '架构能力'],
  ['后端架构', 'API/系统设计', [/api\s*设计|接口设计|openapi|restful|rpc|系统设计|架构设计|模块设计|抽象能力|服务设计/i], '核心设计'],
  
  // 8. 基础设施（工程底座）
  ['基础设施', 'PyTorch/TF/Paddle', [/pytorch|tensorflow|tf\b|paddlepaddle|飞桨|paddle|深度学习框架|训练框架/i], '框架'],
  ['基础设施', 'Docker/K8s/Linux/Git', [/docker|kubernetes|k8s|容器化|linux|git|版本控制|devops|ci\/cd|jenkins/i], '运维/工具'],
  
  // 9. 加分项（综合能力）
  ['加分项', '顶会论文/竞赛/开源', [/顶会|论文发表|neurips|icml|iclr|acl|cvpr|icassp|aaai|ijcai|emnlp|icse|fse|colm|kdd|sigir|期刊|acm|icpc|noi|ioi|top.?coder|kaggle|编程竞赛|开源项目|github|开源贡献/i], '综合'],
  
  // 10. Agent专项（高级应用）
  ['Agent专项', 'Agent框架/Tool Call/MCP', [/agent.*框架|智能体.*框架|agent.*架构|多agent|multi.?agent|agent.*系统|agentic|agent.*平台|agent.*基建|agent.*底座|tool.?call|tool.?use|tools?\s*调用|工具调用|函数调用|function.?call|mcp|model\s*context\s*protocol/i], '核心能力'],
  ['Agent专项', 'AI Coding/强化学习/记忆', [/ai\s*coding|coding\s*agent|cursor|copilot|claude.?code|windsurf|ai.*编程|ai.*代码|代码生成|强化学习|记忆|memory|上下文管理|长期记忆|工作记忆|prm|过程奖励|process.?reward|可验证|plan.?execute|react|反思/i], '辅助技术'],
];

// Build category order and skill names
const categories = [];
const catSkills = {};
for (const [cat, skill] of skillDefs) {
  if (!catSkills[cat]) { categories.push(cat); catSkills[cat] = []; }
  if (!catSkills[cat].includes(skill)) catSkills[cat].push(skill);
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
      const defs = skillDefs.filter(d => d[0] === cat && d[1] === skill);
      let matched = false;
      for (const def of defs) {
        for (const regex of def[2]) {
          if (regex.test(text)) { matched = true; break; }
        }
        if (matched) break;
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

// 输出美团-6的详细匹配结果，用于验证
const mt6 = results.find(r => r.name === '美团-6');
console.log('\n美团-6 (AI Coding全栈工程师) 匹配技能:');
for (const cat of categories) {
  const matched = Object.entries(mt6.skills[cat]).filter(([k,v]) => v).map(([k]) => k);
  if (matched.length) console.log('  ' + cat + ': ' + matched.join(', '));
}

fs.writeFileSync(path.join('D:', '校招文件', '岗位需求', '_skill_analysis.json'), JSON.stringify(results, null, 2), 'utf-8');
console.log('\nWritten to _skill_analysis.json');
