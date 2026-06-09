// Vercel Serverless Function: /api/chat v2
// 处理求职助手 AI 对话（SSE 流式 + 工具调用 + CORS）

// ========== 技能知识库（内嵌） ==========
const SKILLS_KNOW = {
  "Python":{cat:"编程语言",diff:"beginner",pre:[],desc:"最常用的AI/ML编程语言，拥有PyTorch等丰富的科学生态"},
  "C++":{cat:"编程语言",diff:"intermediate",pre:["C语言基础"],desc:"高性能计算首选，CUDA编程和推理引擎的核心语言"},
  "Java":{cat:"编程语言",diff:"intermediate",pre:[],desc:"企业级后端主流语言，大数据生态原生支持"},
  "JavaScript":{cat:"编程语言",diff:"beginner",pre:["HTML","CSS"],desc:"Web前端核心语言"},
  "TypeScript":{cat:"编程语言",diff:"beginner",pre:["JavaScript"],desc:"JS超集，现代框架标准开发语言"},
  "Go":{cat:"编程语言",diff:"beginner",pre:[],desc:"高性能并发编程语言，云原生工具链主力"},
  "Golang":{cat:"编程语言",diff:"beginner",pre:[],desc:"Go语言的另一种称呼"},
  "Shell":{cat:"编程语言",diff:"beginner",pre:["Linux"],desc:"Linux命令行脚本，自动化任务"},
  "SQL":{cat:"编程语言",diff:"beginner",pre:[],desc:"关系型数据库查询语言"},
  "HTML":{cat:"编程语言",diff:"beginner",pre:[],desc:"网页标记语言"},
  "CSS":{cat:"编程语言",diff:"beginner",pre:["HTML"],desc:"网页样式语言"},
  "PyTorch":{cat:"AI框架",diff:"intermediate",pre:["Python","深度学习"],desc:"Meta开源深度学习框架，学术界和工业界主流"},
  "TensorFlow":{cat:"AI框架",diff:"intermediate",pre:["Python","深度学习"],desc:"Google开源深度学习框架，工业部署成熟"},
  "PaddlePaddle":{cat:"AI框架",diff:"intermediate",pre:["Python","深度学习"],desc:"百度自研深度学习框架"},
  "JAX":{cat:"AI框架",diff:"advanced",pre:["Python"],desc:"Google数值计算和ML库，TPU友好"},
  "MXNet":{cat:"AI框架",diff:"intermediate",pre:["Python"],desc:"Apache开源深度学习框架"},
  "LangChain":{cat:"AI框架",diff:"intermediate",pre:["Python","LLM"],desc:"大模型应用开发框架，Prompt/RAG/Agent抽象"},
  "vLLM":{cat:"AI框架",diff:"intermediate",pre:["Python","LLM","CUDA"],desc:"高性能大模型推理引擎"},
  "LLM":{cat:"大模型",diff:"advanced",pre:["PyTorch","Transformer","深度学习"],desc:"大语言模型，涵盖预训练、微调、推理全链路"},
  "GPT":{cat:"大模型",diff:"advanced",pre:["Transformer","LLM"],desc:"OpenAI生成式预训练大模型"},
  "BERT":{cat:"大模型",diff:"intermediate",pre:["Transformer","NLP"],desc:"Google预训练双向编码器"},
  "Transformer":{cat:"大模型",diff:"intermediate",pre:["深度学习"],desc:"注意力机制架构，所有现代大模型的基础"},
  "Agent":{cat:"大模型",diff:"intermediate",pre:["LLM","LangChain"],desc:"大模型智能体，自主规划使用工具"},
  "RAG":{cat:"大模型",diff:"intermediate",pre:["LLM","Embedding","向量检索"],desc:"检索增强生成"},
  "Prompt":{cat:"大模型",diff:"beginner",pre:["LLM"],desc:"提示词工程"},
  "VLM":{cat:"大模型",diff:"advanced",pre:["LLM","CV"],desc:"视觉语言多模态大模型"},
  "AIGC":{cat:"大模型",diff:"intermediate",pre:["LLM","Diffusion"],desc:"AI生成内容"},
  "SFT":{cat:"模型训练",diff:"intermediate",pre:["PyTorch","LLM"],desc:"有监督微调"},
  "RLHF":{cat:"模型训练",diff:"advanced",pre:["SFT","PPO"],desc:"基于人类反馈的强化学习"},
  "DPO":{cat:"模型训练",diff:"intermediate",pre:["SFT"],desc:"直接偏好优化"},
  "GRPO":{cat:"模型训练",diff:"advanced",pre:["RLHF","PPO"],desc:"分组相对策略优化"},
  "PPO":{cat:"模型训练",diff:"advanced",pre:["强化学习"],desc:"近端策略优化算法"},
  "LoRA":{cat:"模型训练",diff:"intermediate",pre:["PyTorch","LLM"],desc:"低秩适应，参数高效微调"},
  "DeepSpeed":{cat:"模型训练",diff:"advanced",pre:["PyTorch","分布式训练"],desc:"微软分布式训练优化库"},
  "Megatron":{cat:"模型训练",diff:"advanced",pre:["PyTorch","分布式训练","CUDA"],desc:"NVIDIA大模型训练框架"},
  "FlashAttention":{cat:"模型训练",diff:"advanced",pre:["CUDA","Transformer"],desc:"高效注意力计算算法"},
  "分布式训练":{cat:"模型训练",diff:"advanced",pre:["PyTorch","GPU","Linux"],desc:"多卡/多机并行训练"},
  "训练加速":{cat:"模型训练",diff:"advanced",pre:["PyTorch","CUDA","DeepSpeed"],desc:"混合精度/编译优化加速训练"},
  "ONNX":{cat:"模型部署",diff:"intermediate",pre:["PyTorch"],desc:"开放神经网络交换格式"},
  "TensorRT-LLM":{cat:"模型部署",diff:"advanced",pre:["CUDA","LLM"],desc:"NVIDIA大模型推理加速引擎"},
  "推理加速":{cat:"模型部署",diff:"advanced",pre:["CUDA","TensorRT-LLM","量化"],desc:"模型剪枝/量化/算子融合降低延迟"},
  "量化":{cat:"模型部署",diff:"intermediate",pre:["PyTorch","深度学习"],desc:"模型参数压缩到INT8/INT4"},
  "算子优化":{cat:"模型部署",diff:"advanced",pre:["CUDA","C++"],desc:"编写高性能算子kernel"},
  "编译优化":{cat:"模型部署",diff:"advanced",pre:["编译器原理","CUDA"],desc:"计算图编译优化"},
  "CV":{cat:"计算机视觉",diff:"intermediate",pre:["Python","深度学习","PyTorch"],desc:"计算机视觉，图像分类/检测/分割"},
  "Diffusion":{cat:"计算机视觉",diff:"intermediate",pre:["PyTorch","深度学习"],desc:"扩散模型，逐步去噪生成数据"},
  "Stable Diffusion":{cat:"计算机视觉",diff:"intermediate",pre:["Diffusion","PyTorch"],desc:"开源文生图大模型"},
  "图像生成":{cat:"计算机视觉",diff:"intermediate",pre:["Diffusion","CV","AIGC"],desc:"从文本/噪声生成图像"},
  "视频生成":{cat:"计算机视觉",diff:"advanced",pre:["Diffusion","图像生成","VLM"],desc:"从文本生成视频"},
  "NLP":{cat:"自然语言处理",diff:"intermediate",pre:["Python","深度学习"],desc:"自然语言处理"},
  "Embedding":{cat:"自然语言处理",diff:"beginner",pre:["NLP"],desc:"文本/图像转稠密向量"},
  "信息抽取":{cat:"自然语言处理",diff:"intermediate",pre:["NLP","BERT"],desc:"抽取实体/关系/事件"},
  "文本生成":{cat:"自然语言处理",diff:"intermediate",pre:["LLM","NLP"],desc:"语言模型自动生成文本"},
  "知识图谱":{cat:"自然语言处理",diff:"intermediate",pre:["NLP"],desc:"图结构表示实体关系"},
  "Spark":{cat:"大数据",diff:"intermediate",pre:["Java或Python"],desc:"Apache大数据分布式计算引擎"},
  "Flink":{cat:"大数据",diff:"intermediate",pre:["Java"],desc:"实时流处理框架"},
  "Hadoop":{cat:"大数据",diff:"intermediate",pre:["Java","Linux"],desc:"大数据存储和批处理平台"},
  "Hive":{cat:"大数据",diff:"beginner",pre:["SQL","Hadoop"],desc:"Hadoop数据仓库SQL接口"},
  "Kafka":{cat:"大数据",diff:"intermediate",pre:["Java"],desc:"分布式消息队列"},
  "HDFS":{cat:"大数据",diff:"beginner",pre:["Hadoop","Linux"],desc:"Hadoop分布式文件系统"},
  "React":{cat:"前端开发",diff:"intermediate",pre:["JavaScript","HTML","CSS"],desc:"Meta开源前端UI框架"},
  "Vue":{cat:"前端开发",diff:"beginner",pre:["JavaScript","HTML","CSS"],desc:"渐进式前端框架"},
  "Vite":{cat:"前端开发",diff:"beginner",pre:["JavaScript"],desc:"新一代前端构建工具"},
  "Webpack":{cat:"前端开发",diff:"intermediate",pre:["JavaScript","Node.js"],desc:"前端模块打包工具"},
  "Node.js":{cat:"前端开发",diff:"beginner",pre:["JavaScript"],desc:"JS服务端运行环境"},
  "Node":{cat:"前端开发",diff:"beginner",pre:["JavaScript"],desc:"同Node.js"},
  "GraphQL":{cat:"前端开发",diff:"intermediate",pre:[],desc:"API查询语言"},
  "REST API":{cat:"前端开发",diff:"beginner",pre:[],desc:"RESTful架构风格接口设计"},
  "Docker":{cat:"基础设施",diff:"beginner",pre:["Linux"],desc:"容器化平台"},
  "Kubernetes":{cat:"基础设施",diff:"intermediate",pre:["Docker","Linux"],desc:"容器编排平台"},
  "Linux":{cat:"基础设施",diff:"beginner",pre:[],desc:"开源操作系统"},
  "Git":{cat:"基础设施",diff:"beginner",pre:[],desc:"分布式版本控制"},
  "gRPC":{cat:"基础设施",diff:"intermediate",pre:["Protocol Buffers"],desc:"高性能RPC框架"},
  "CUDA":{cat:"硬件/加速",diff:"intermediate",pre:["C++","GPU"],desc:"NVIDIA并行计算平台"},
  "GPU":{cat:"硬件/加速",diff:"intermediate",pre:["CUDA"],desc:"图形处理器，深度学习主力硬件"},
  "CPU":{cat:"硬件/加速",diff:"beginner",pre:[],desc:"中央处理器"},
  "TPU":{cat:"硬件/加速",diff:"intermediate",pre:["JAX","TensorFlow"],desc:"Google自研AI加速芯片"},
  "NPU":{cat:"硬件/加速",diff:"intermediate",pre:["量化","推理加速"],desc:"神经网络处理器"},
  "FPGA":{cat:"硬件/加速",diff:"advanced",pre:["Verilog/VHDL"],desc:"现场可编程门阵列"},
  "ASIC":{cat:"硬件/加速",diff:"advanced",pre:["数字电路设计"],desc:"专用集成电路"},
  "HPC":{cat:"硬件/加速",diff:"advanced",pre:["Linux","MPI","CUDA"],desc:"高性能计算"},
  "高性能计算":{cat:"硬件/加速",diff:"advanced",pre:["HPC","CUDA"],desc:"同HPC"},
  "Redis":{cat:"数据库/存储",diff:"beginner",pre:[],desc:"开源内存数据库"},
  "MongoDB":{cat:"数据库/存储",diff:"beginner",pre:[],desc:"文档型NoSQL数据库"},
  "MySQL":{cat:"数据库/存储",diff:"beginner",pre:["SQL"],desc:"最流行的开源关系型数据库"},
  "PostgreSQL":{cat:"数据库/存储",diff:"beginner",pre:["SQL"],desc:"高级开源关系型数据库"},
  "NoSQL":{cat:"数据库/存储",diff:"beginner",pre:[],desc:"非关系型数据库统称"},
  "深度学习":{cat:"AI基础",diff:"intermediate",pre:["Python","机器学习"],desc:"多层神经网络自动特征学习"},
  "机器学习":{cat:"AI基础",diff:"beginner",pre:["Python","数学基础"],desc:"AI支柱领域"},
  "Machine Learning":{cat:"AI基础",diff:"beginner",pre:["Python"],desc:"同机器学习"},
  "Deep Learning":{cat:"AI基础",diff:"intermediate",pre:["机器学习","PyTorch"],desc:"同深度学习"},
  "ML":{cat:"AI基础",diff:"beginner",pre:["Python"],desc:"机器学习缩写"},
  "多模态":{cat:"AI应用",diff:"advanced",pre:["LLM","CV","VLM"],desc:"融合多种数据模态"},
  "大模型":{cat:"AI应用",diff:"advanced",pre:["LLM","分布式训练"],desc:"数十亿参数以上的深度学习模型"},
  "搜索":{cat:"AI应用",diff:"intermediate",pre:["NLP","向量检索"],desc:"搜索引擎技术"},
  "推荐":{cat:"AI应用",diff:"intermediate",pre:["机器学习","排序"],desc:"推荐系统"},
  "广告":{cat:"AI应用",diff:"intermediate",pre:["推荐","机器学习"],desc:"计算广告"},
  "排序":{cat:"AI应用",diff:"intermediate",pre:["机器学习"],desc:"排序学习"},
  "向量检索":{cat:"AI应用",diff:"intermediate",pre:["Embedding"],desc:"基于向量相似度的检索"},
  "文心大模型":{cat:"AI应用",diff:"intermediate",pre:["LLM","PaddlePaddle"],desc:"百度自研大语言模型"}
};

// ========== LLM 配置 ==========
const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://api.deepseek.com/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const LLM_KEY = process.env.LLM_KEY || '';

// ========== 公司别名 ==========
const COMPANY_ALIASES = {
  '字节跳动':'bytedance','bytedance':'bytedance','字节':'bytedance',
  '阿里巴巴':'alibaba','alibaba':'alibaba','阿里':'alibaba',
  '腾讯':'tencent','tencent':'tencent',
  '美团':'meituan','meituan':'meituan',
  '百度':'baidu','baidu':'baidu',
};

// ========== 岗位数据（从 GitHub Raw 拉取） ==========
const DATA_URL = 'https://raw.githubusercontent.com/flOwin666/campus-job-skill-matrix-data/main/jobsData.json';
let _jobsCache = null;
let _jobsCacheAt = 0;
const JOBS_CACHE_TTL = 60_000; // 1分钟缓存

async function loadJobs() {
  if (_jobsCache && Date.now() - _jobsCacheAt < JOBS_CACHE_TTL) return _jobsCache;
  try {
    const res = await fetch(DATA_URL);
    if (res.ok) { _jobsCache = await res.json(); _jobsCacheAt = Date.now(); return _jobsCache; }
  } catch {}
  return _jobsCache || { lastUpdated: '', total: 0, byCompany: {}, results: [] };
}

// ========== 系统提示词 ==========
function buildSystemPrompt(jobs) {
  const coList = Object.entries(jobs.byCompany || {}).map(([k,v]) => `${k}(${v}个)`).join('、') || '暂无数据';
  const catMap = {};
  for (const [name, info] of Object.entries(SKILLS_KNOW)) {
    if (!catMap[info.cat]) catMap[info.cat] = [];
    const dl = info.diff==='advanced'?'高级':info.diff==='intermediate'?'中级':'入门';
    catMap[info.cat].push(`${name}(${dl})`);
  }
  const skillSummary = Object.entries(catMap).map(([cat,items]) =>
    `【${cat}】${items.slice(0,12).join('、')}${items.length>12?'等':''}`
  ).join('\n');

  return `你是"校招岗位技能矩阵"的AI求职助手，服务于正在找AI/算法方向校招岗位的学生。核心职责：帮助用户理解岗位技能需求、评估技术栈匹配度、制定有实操性的学习路线。

## 当前数据库概况
更新时间：${jobs.lastUpdated || '未知'}，总计 ${jobs.total || 0} 个岗位。公司：${coList}。

## 技能知识库（技能之间的前置关系参考）
${skillSummary}

## 回答规范
1. **岗位搜索问题**（"有没有AI Agent相关的岗位""哪些公司在招CV方向"）→ 必须调用 search_jobs，把技术方向填入 skill 参数（如 skill="Agent"、"CV"）。首次无结果则换同义词再搜。结果必须逐条列出：**岗位名**、公司、城市、技能标签。最后给总数+下一步建议。
   示例输出格式：
   \`\`\`
   找到 3 个与 Agent 相关的岗位：

   **1. AI技术生态运营** | 百度 | 上海
   技能：大模型、Agent、Prompt、深度学习

   **2. AI应用开发工程师** | 字节跳动 | 北京
   技能：LLM、Agent、LangChain、Python

   共 3 个。想看哪个岗位的完整 JD？告诉我序号即可。
   \`\`\`
2. **简短问题**（"有多少Python岗位"）→ 直接给数字/列表，不超过3句话。
3. **分析型问题**（"这个岗位适合我吗"）→ 列出关键对比点，100-200字。
4. **岗位学习路线**（"帮我分析这个岗位需要学什么"）→ 先用 get_job_detail 拉JD，对关键技能用 get_skill_info，最后用 generate_study_plan 生成路线。
5. **技能学习路线**（"怎么学LangChain"）→ 必须调用 generate_skill_roadmap，系统会自动展示完整路线，你只需简短收尾。
6. 用中文，Markdown结构，技能名**加粗**。

## Few-shot 示例
用户："有什么有关AI Agent应用开发的岗位"
做法：调用 search_jobs(skill="Agent") → 如果无结果则试 search_jobs(skill="AI Agent") → 逐条列出结果（岗位名、公司、城市、技能标签）

用户："现在有哪些公司在招人"
做法：调用 list_companies → 输出公司列表+岗位数

用户："怎么学LangChain"
做法：调用 generate_skill_roadmap(skill_names=["LangChain"]) → 系统自动展示完整路线，你简短收尾。

用户："帮我分析百度AI技术生态运营岗位"
做法：1.search_jobs(company="baidu")→2.get_job_detail(job_id)→3.get_skill_info→4.generate_study_plan(job_id)

用户："今天天气怎么样"
输出："抱歉，我是求职助手，只能回答校招岗位、技能分析和学习路线相关问题。"

## 工具选用指南 + 边界规则
- 按技能/技术方向找岗位 → **必须**用 search_jobs(skill="关键词")，skill 用简短关键词（如"Agent"而非"AI Agent应用开发"）
- 按公司找岗位 → search_jobs(company="公司名")
- 查技能热度 → list_skills
- 只回答校招求职、岗位技能、学习路线相关问题
- 查询数据必须用工具，不要编造。工具返回空则如实告知
- generate_study_plan / generate_skill_roadmap 返回后系统已自动展示，你只需简短收尾（1-2句话）`;
}

// ========== 工具定义 ==========
const CHAT_TOOLS = [
  { type:'function', function:{ name:'search_jobs', description:'搜索岗位数据库。按公司、技能、岗位名、城市筛选。',
    parameters:{ type:'object', properties:{
      company:{type:'string',description:'公司名称（中文名或英文key）'},
      skill:{type:'string',description:'技能名称'},
      title:{type:'string',description:'岗位名关键词'},
      city:{type:'string',description:'城市'},
      limit:{type:'integer',description:'最多返回多少条，默认5'}
  }}}},
  { type:'function', function:{ name:'list_companies', description:'列出所有公司的岗位数量和概况',
    parameters:{ type:'object', properties:{} }}},
  { type:'function', function:{ name:'list_skills', description:'列出技能及其在岗位中的出现频率',
    parameters:{ type:'object', properties:{ keyword:{type:'string',description:'可选，按关键词过滤技能名'} }}}},
  { type:'function', function:{ name:'get_job_detail', description:'获取指定岗位的完整JD描述',
    parameters:{ type:'object', properties:{ job_id:{type:'string',description:'岗位ID'} }, required:['job_id'] }}},
  { type:'function', function:{ name:'get_skill_info', description:'查询特定技能的定义、难度、前置技能',
    parameters:{ type:'object', properties:{ skill_names:{type:'array',items:{type:'string'},description:'技能名称列表'} }, required:['skill_names'] }}},
  { type:'function', function:{ name:'generate_study_plan', description:'根据岗位生成分阶段结构化学习路线',
    parameters:{ type:'object', properties:{ job_id:{type:'string',description:'岗位ID'} }, required:['job_id'] }}},
  { type:'function', function:{ name:'generate_skill_roadmap', description:'根据技能名生成学习路线（前置知识+三阶段+资源）',
    parameters:{ type:'object', properties:{ skill_names:{type:'array',items:{type:'string'},description:'技能名称列表'} }, required:['skill_names'] }}}
];

// ========== 工具执行器 ==========
function execSearchJobs(jobs, args) {
  let results = jobs.results || [];
  const { company, skill, title, city, limit=5 } = args;
  if (company) { const key = COMPANY_ALIASES[company] || company; results = results.filter(j => j.source===key || j.company===key); }
  if (skill) { const q = skill.toLowerCase(); results = results.filter(j => [...(j.skills||[]),...(j.descSkills||[]),...(j.bonusSkills||[])].some(s=>s.toLowerCase().includes(q))); }
  if (title) { const q = title.toLowerCase(); results = results.filter(j => j.title.toLowerCase().includes(q)); }
  if (city) { results = results.filter(j => (j.location||'').includes(city)); }
  const isSingle = results.length === 1;
  return { total_matches:results.length, showing:Math.min(results.length,limit),
    jobs:results.slice(0,limit).map(j=>({ id:j.id, company:j.company, title:j.title, location:j.location, url:j.url,
      skills:j.skills||[], descSkills:j.descSkills||[], bonusSkills:j.bonusSkills||[],
      snippet:isSingle ? (j.jdText||'').substring(0,3000) : (j.jdText||'').substring(0,200) })) };
}

function execListCompanies(jobs) {
  return { companies:Object.entries(jobs.byCompany||{}).map(([name,count])=>({name,count})), total:jobs.total||0, lastUpdated:jobs.lastUpdated||'' };
}

function execListSkills(jobs, args) {
  const keyword = (args.keyword||'').toLowerCase();
  const skillMap = {};
  for (const j of jobs.results||[]) { for (const s of [...(j.skills||[]),...(j.descSkills||[]),...(j.bonusSkills||[])]) { skillMap[s]=(skillMap[s]||0)+1; } }
  let list = Object.entries(skillMap).map(([name,count])=>({name,count}));
  if (keyword) list = list.filter(s=>s.name.toLowerCase().includes(keyword));
  list.sort((a,b)=>b.count-a.count);
  return { skills:list.slice(0,30), total_distinct:Object.keys(skillMap).length };
}

function execGetJobDetail(jobs, args) {
  const job = (jobs.results||[]).find(j=>j.id===args.job_id);
  if (!job) return { error:'岗位未找到' };
  return { id:job.id, company:job.company, title:job.title, location:job.location, url:job.url,
    skills:job.skills||[], descSkills:job.descSkills||[], bonusSkills:job.bonusSkills||[], jdText:job.jdText||'暂无描述' };
}

function execGetSkillInfo(args) {
  const names = args.skill_names || [];
  const results = {}, notFound = [];
  for (const name of names) {
    const keys = Object.keys(SKILLS_KNOW);
    const match = keys.find(k => k.toLowerCase() === name.toLowerCase());
    if (match) {
      const info = SKILLS_KNOW[match];
      results[match] = { category:info.cat, difficulty:info.diff, prerequisites:info.pre, description:info.desc,
        learningPath: info.pre.length ? `建议先学 ${info.pre.join(' → ')} → ${match}` : `${match} 可独立入门学习` };
    } else { notFound.push(name); }
  }
  return { found:results, notFound, totalFound:Object.keys(results).length, totalQueried:names.length };
}

function execGenerateStudyPlan(jobs, args) {
  const job = (jobs.results||[]).find(j=>j.id===args.job_id);
  if (!job) return { error:'岗位未找到' };
  const allSkills = [...new Set([...(job.skills||[]),...(job.descSkills||[]),...(job.bonusSkills||[])])];
  const skillTree = []; const seen = new Set();
  for (const s of allSkills) {
    if (seen.has(s.toLowerCase())) continue; seen.add(s.toLowerCase());
    const info = SKILLS_KNOW[s] || SKILLS_KNOW[Object.keys(SKILLS_KNOW).find(k=>k.toLowerCase()===s.toLowerCase())] || null;
    skillTree.push({ name:s, category:info?.cat||'未知', difficulty:info?.diff||'beginner', prerequisites:info?.pre||[], desc:info?.desc||'' });
  }
  const diffOrder = { beginner:0, intermediate:1, advanced:2 };
  skillTree.sort((a,b)=>diffOrder[a.difficulty]!==diffOrder[b.difficulty]?diffOrder[a.difficulty]-diffOrder[b.difficulty]:a.prerequisites.length-b.prerequisites.length);
  const beginners = skillTree.filter(s=>s.difficulty==='beginner');
  const intermediates = skillTree.filter(s=>s.difficulty==='intermediate');
  const advanced = skillTree.filter(s=>s.difficulty==='advanced');

  const plan = `## 📍 目标岗位：${job.company} — ${job.title}

### 🪜 第一阶段：基础入门（1-2周）
${beginners.length>0 ? beginners.map((s,i)=>`${i+1}. **${s.name}** — ${s.desc}${s.prerequisites.length?` | 前置：${s.prerequisites.join('、')}`:''}`).join('\n') : '1. 熟悉 Python 编程基础和常用数据结构'}

**推荐资源：**
- Python官方文档 / 《Python编程：从入门到实践》
- LeetCode 简单题每天2道
- 吴恩达《机器学习》Coursera 前3周

### 🪜 第二阶段：核心技能（2-4周）
${intermediates.length>0 ? intermediates.slice(0,6).map((s,i)=>`${i+1}. **${s.name}** — ${s.desc}`).join('\n') : '1. 学习深度学习基础：反向传播、CNN/RNN'}

**推荐资源：**
- 李沐《动手学深度学习》(d2l.ai)
- PyTorch 官方教程
- 吴恩达 Deep Learning Specialization

### 🪜 第三阶段：高级进阶（1-3个月）
${advanced.length>0 ? advanced.slice(0,6).map((s,i)=>`${i+1}. **${s.name}** — ${s.desc}`).join('\n') : '1. 深入研究大模型架构'}

**推荐资源：**
- Andrej Karpathy "Neural Networks: Zero to Hero"
- 《Attention Is All You Need》论文精读
- HuggingFace Transformers 文档

### 🪜 第四阶段：实战项目（2-4周）
1. **RAG知识库问答系统** — LangChain + 向量数据库，覆盖全链路
2. **大模型微调实践** — LoRA微调开源LLM，部署到HuggingFace Spaces
3. **简历项目** — GitHub仓库 + 技术博客

### ⚠️ 注意事项
- 按阶段循序渐进，不要同时学所有技能
- 优先掌握 ${allSkills.slice(0,4).join('、')} 等核心技能
- 校招面试更看重基础和思维，不要过度追求"会用"而忽略"理解原理"`;

  return { jobTitle:job.title, company:job.company, allSkills, skillTree:skillTree.map(s=>({name:s.name,difficulty:s.difficulty,category:s.category})), studyPlan:plan, instruction:'studyPlan已直接展示给用户，请简短收尾' };
}

function execGenerateSkillRoadmap(args) {
  const names = args.skill_names || [];
  const roadmaps = [], notFound = [];
  for (const name of names) {
    const keys = Object.keys(SKILLS_KNOW);
    const match = keys.find(k=>k.toLowerCase()===name.toLowerCase());
    if (!match) { notFound.push(name); continue; }
    const info = SKILLS_KNOW[match];
    const dl = info.diff==='advanced'?'高级':info.diff==='intermediate'?'中级':'入门';

    function collectPrereqs(skillName, depth, visited) {
      if (depth>3||visited.has(skillName.toLowerCase())) return [];
      visited.add(skillName.toLowerCase());
      const k = Object.keys(SKILLS_KNOW).find(x=>x.toLowerCase()===skillName.toLowerCase());
      if (!k||!SKILLS_KNOW[k].pre.length) return [];
      const prereqs = [];
      for (const p of SKILLS_KNOW[k].pre) {
        const pInfo = SKILLS_KNOW[Object.keys(SKILLS_KNOW).find(x=>x.toLowerCase()===p.toLowerCase())] || null;
        prereqs.push({ name:p, desc:pInfo?.desc||'', difficulty:pInfo?.diff||'beginner' });
        prereqs.push(...collectPrereqs(p,depth+1,visited));
      }
      return prereqs;
    }
    const allPrereqs = collectPrereqs(match,0,new Set());
    const seen=new Set(); const uniquePrereqs=[];
    for (const p of allPrereqs) { if(!seen.has(p.name.toLowerCase())){seen.add(p.name.toLowerCase());uniquePrereqs.push(p);} }
    const needsPrereqs = uniquePrereqs.length>0;
    const prereqList = needsPrereqs ? uniquePrereqs.map(p=>`- **${p.name}**（${p.difficulty==='advanced'?'高级':p.difficulty==='intermediate'?'中级':'入门'}）：${p.desc}`).join('\n') : '无需特殊前置知识，可直接开始学习。';

    const roadmap = `## 🎯 学习目标：${match}（${info.cat} · ${dl}）

### 📖 技能简介
${info.desc}

### 🔗 前置知识
${prereqList}

### 🪜 第一阶段：基础入门（1-2周）
${info.pre.length>0 ? `先掌握前置技能：**${info.pre.join('、')}**。` : `直接上手 ${match} 的基础概念和核心API。`}
${info.diff==='beginner' ? `- 阅读官方文档 Quickstart\n- 完成 2-3 个官方 Tutorial\n- GitHub 找 Demo 项目跑通`
  : info.diff==='intermediate' ? `- 通读官方文档核心章节\n- 复现官方示例，理解每个组件\n- 阅读 1-2 篇架构解析博客`
  : `- 先精通前置技能链\n- 阅读 ${match} 论文或技术白皮书\n- 阅读核心模块源码`}

### 🪜 第二阶段：核心实战（2-4周）
- 做一个中等复杂度的实战项目
- 查阅官方文档 + GitHub Issues + Stack Overflow
- 关注 ${match} 的 Best Practices

### 🪜 第三阶段：深入优化（2-4周）
- 阅读 ${match} 核心源码（关键模块）
- 学习性能调优和常见问题排查
- 写一篇技术博客总结学习心得

### 📚 推荐资源
- **官方文档**：${match} 官方文档（首选）
- **实战课程**：B站/YouTube/Coursera 搜索 "${match} tutorial"
- **社区**：GitHub Discussions、Reddit、知乎

### ⚠️ 学习提示
- 按阶段循序渐进，每阶段做 mini-project 巩固
- 遇到报错先去 GitHub Issues 搜索
- ${needsPrereqs ? `前置技能 ${uniquePrereqs.slice(0,3).map(p=>p.name).join('、')} 如有薄弱，建议先补上` : '可以直接开始，入门门槛低'}`;

    roadmaps.push({ skill:match, roadmap });
  }
  return { roadmaps, notFound, totalGenerated:roadmaps.length };
}

function executeTool(name, args, jobs) {
  switch (name) {
    case 'search_jobs': return execSearchJobs(jobs, args);
    case 'list_companies': return execListCompanies(jobs);
    case 'list_skills': return execListSkills(jobs, args);
    case 'get_job_detail': return execGetJobDetail(jobs, args);
    case 'get_skill_info': return execGetSkillInfo(args);
    case 'generate_study_plan': return execGenerateStudyPlan(jobs, args);
    case 'generate_skill_roadmap': return execGenerateSkillRoadmap(args);
    default: return { error:'未知工具: '+name };
  }
}

// ========== LLM 调用 ==========
async function callLLM(messages, stream=false) {
  const res = await fetch(`${LLM_ENDPOINT}/chat/completions`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${LLM_KEY}` },
    body:JSON.stringify({ model:LLM_MODEL, messages, tools:CHAT_TOOLS, stream, max_tokens:4096 })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM 服务异常 (${res.status}): ${errText}`);
  }
  return res;
}

// ========== 外部链接轻量抓取 ==========
async function scrapeExternalUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 6000);
    const res = await fetch(url, { signal:controller.signal, headers:{ 'User-Agent':'Mozilla/5.0 (compatible; JobSkillMatrix/1.0)' } });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s{2,}/g,'\n').trim().substring(0,3000);
    return text.length>200 ? text : null;
  } catch { return null; }
}

// ========== 对话记忆 ==========
const chatMemory = new Map();
function updateMemory(ip, messages) {
  const recent = messages.slice(-6);
  chatMemory.set(ip, recent);
}
function getMemoryContext(ip) {
  const mem = chatMemory.get(ip);
  if (!mem||mem.length===0) return '';
  const lines = mem.map(m=>`[${m.role==='user'?'用户':'助手'}]: ${(m.content||'').substring(0,300)}`).join('\n');
  return `\n\n[近期对话回顾]\n${lines}\n（请结合上下文理解用户当前问题）`;
}

// ========== 频率限制 ==========
const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  const r = rateMap.get(ip);
  if (!r||now>r.resetTime) { rateMap.set(ip,{count:1,resetTime:now+5*60*1000}); return true; }
  if (r.count>=30) return false;
  r.count++; return true;
}

// ========== 主处理函数 ==========
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'仅支持 POST' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!checkRate(ip)) return res.status(429).json({ error:'请求过于频繁，请 5 分钟后再试' });
  if (!LLM_KEY) return res.status(503).json({ error:'LLM 未配置' });

  // 手动解析 body（兼容 Vercel .mjs 运行时不自动 parse 的情况）
  let body = req.body;
  if (!body || !body.messages) {
    try {
      const raw = await new Promise((resolve) => {
        let chunks = '';
        req.on('data', c => chunks += c);
        req.on('end', () => resolve(chunks));
      });
      body = JSON.parse(raw);
    } catch { return res.status(400).json({ error:'请求体解析失败' }); }
  }
  const { messages } = body || {};
  if (!messages||!messages.length) return res.status(400).json({ error:'缺少对话内容' });

  console.log('[chat] 收到请求, messages:', messages.length, '条');

  // SSE — 必须在校验通过后设置，不可用 flushHeaders（会固化响应头导致后续无法改状态码）
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  const sse = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const jobs = await loadJobs();
    const cleanMsgs = messages.map(m=>({ role:m.role, content:m.content||'' }));
    const memoryCtx = getMemoryContext(ip);
    const sysPrompt = buildSystemPrompt(jobs) + memoryCtx;
    const llmMessages = [{ role:'system', content:sysPrompt }, ...cleanMsgs];

    // 检查外部链接
    const lastUser = [...messages].reverse().find(m=>m.role==='user');
    if (lastUser) {
      const urlMatch = (lastUser.content||'').match(/(https?:\/\/[^\s]*(?:jobs|zhaopin|talent|career)[^\s]*)/i);
      if (urlMatch) {
        const jobUrl = urlMatch[1];
        const urlLower = jobUrl.toLowerCase();
        const internalDomains = ['talent.baidu.com','jobs.bytedance.com','alibaba.com','tencent.com','meituan.com'];
        const isInternal = internalDomains.some(d=>urlLower.includes(d)) && (jobs.results||[]).some(j=>j.url===jobUrl);
        if (!isInternal) {
          sse({ type:'tool_progress', message:'识别到外部链接，正在尝试访问...' });
          const scraped = await scrapeExternalUrl(jobUrl);
          if (scraped) {
            sse({ type:'tool_progress', message:'成功获取外部页面内容，正在分析...' });
            llmMessages.push({ role:'user', content:`[用户粘贴的外部链接] ${jobUrl}\n\n页面内容：\n${scraped}\n\n请根据以上内容分析该岗位需要的技能，并制定学习路线。同时告知用户这是外部链接。` });
          } else {
            sse({ content:'抱歉，无法访问该外部链接（网站可能需要登录或有反爬保护）。请把岗位的 JD 文字内容复制粘贴给我，我来帮你分析制定学习路线。', done:true });
            return res.end();
          }
        }
      }
    }

    // 工具调用循环
    let maxLoops = 5;
    let finalContent = '';
    while (maxLoops-- > 0) {
      const llmRes = await callLLM(llmMessages, false);
      const data = await llmRes.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) break;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        llmMessages.push(msg);
        const streamRes = await callLLM(llmMessages, true);
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream:true });
          const lines = buf.split('\n');
          buf = lines.pop()||'';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const d = line.slice(6);
            if (d === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }
            try { const c = JSON.parse(d).choices?.[0]?.delta?.content; if (c) { sse({ content:c }); finalContent+=c; } } catch {}
          }
        }
        updateMemory(ip, [...messages, { role:'assistant', content:finalContent }]);
        return res.end();
      }

      llmMessages.push(msg);
      for (const tc of msg.tool_calls) {
        const fnName = tc.function.name;
        const fnArgs = JSON.parse(tc.function.arguments||'{}');
        sse({ type:'tool_start', tool:fnName, args:fnArgs });
        const result = executeTool(fnName, fnArgs, jobs);
        sse({ type:'tool_result', tool:fnName });

        // 直接推送 job list（防LLM偷懒跳过列表）
        if (fnName==='search_jobs' && result.jobs && result.jobs.length>0) {
          const skillLabel = (fnArgs.skill || fnArgs.title || fnArgs.company || '');
          const label = skillLabel ? `与 "${skillLabel}" 相关的` : '匹配的';
          const lines = result.jobs.map((j,i) =>
            `**${i+1}. ${j.title}** | ${j.company} | ${j.location||'未知'}\n技能：${[...(j.skills||[]),...(j.descSkills||[])].slice(0,8).join('、')}`
          );
          const totalNote = result.total_matches > result.showing
            ? `（共 ${result.total_matches} 个，显示前 ${result.showing} 个）` : `共 ${result.showing} 个`;
          const formatted = `\n\n找到 ${label}岗位：\n\n${lines.join('\n\n')}\n\n${totalNote}。想看哪个岗位的完整 JD 和学习路线？告诉我序号或岗位名即可。\n\n`;
          sse({ content:formatted });
          finalContent+=formatted;
          llmMessages.push({ role:'tool', tool_call_id:tc.id,
            content:JSON.stringify({...result, jobs:'[已格式化展示]', instruction:'岗位列表已展示。请简短收尾引导用户选岗位。'}) });
        } else if (fnName==='search_jobs' && (!result.jobs||result.jobs.length===0)) {
          const skillLabel = (fnArgs.skill||fnArgs.title||fnArgs.company||'该条件');
          const msg = `\n\n抱歉，没有找到与 "${skillLabel}" 相关的岗位。\n\n建议：试试换关键词、用 list_companies 看覆盖了哪些公司，或用 list_skills 看有哪些技能标签。\n\n`;
          sse({ content:msg });
          finalContent+=msg;
          llmMessages.push({ role:'tool', tool_call_id:tc.id,
            content:JSON.stringify({...result, instruction:'空结果已告知。引导用户换关键词。'}) });
        } else if (fnName==='generate_study_plan' && result.studyPlan) {
          sse({ content:'\n\n'+result.studyPlan+'\n\n' });
          finalContent+='\n\n'+result.studyPlan+'\n\n';
          llmMessages.push({ role:'tool', tool_call_id:tc.id, content:JSON.stringify({...result, studyPlan:'[已直接展示]'}) });
        } else if (fnName==='generate_skill_roadmap' && result.roadmaps) {
          const text = result.roadmaps.map(r=>r.roadmap).join('\n\n---\n\n');
          sse({ content:'\n\n'+text+'\n\n' });
          finalContent+='\n\n'+text+'\n\n';
          llmMessages.push({ role:'tool', tool_call_id:tc.id, content:JSON.stringify({...result, roadmaps:'[已直接展示]'}) });
        } else {
          llmMessages.push({ role:'tool', tool_call_id:tc.id, content:JSON.stringify(result) });
        }
      }
    }

    sse({ content:'抱歉，处理请求时遇到了问题，请换个方式问试试。', done:true });
    res.end();
  } catch (e) {
    console.error('[LLM] 错误:', e.message);
    sse({ type:'error', message:'AI 服务异常: '+e.message, done:true });
    res.end();
  }
}
