const fs = require('fs');
const path = require('path');
const p = path.join('D:', '校招文件', '岗位需求', '_jd_all.json');
const d = JSON.parse(fs.readFileSync(p, 'utf-8'));

const baidu = [
  {name:'百度-1', url:'_baidu1', text:'大模型算法实习生（J99230）基础模型研发部 北京市深圳市 日常实习 工作职责：负责生成式大模型多模态模型相关算法技术与应用研发 协助改进产品落地算法应用 负责基于文心一言的大模型应用开发包括大模型插件开发和工具链完善 研究探索大模型前沿技术根据业务需求进行模型定制和优化提高模型准确性和效率 结合实际业务场景将大模型技术应用于具体产品或服务中推动产品智能化升级 紧跟工业学术界相关领域前沿AI大模型包括生成式大语言模型跨模态大模型算法复现与效果调优 研究方向包括但不限于高效大模型架构跨任务统一学习大模型各类精调微调策略 职责要求：熟悉并掌握至少一门编程语言如Python具备一定工程能力 熟悉深度学习框架PaddlePaddle PyTorch Tensorflow等熟悉PaddlePaddle优先熟练HF Transformers库优先有大模型相关经验优先 学习能力强自我驱动力强紧跟深度学习前沿发展动态 具有良好沟通能力和团队合作精神有开源项目经历者优先 长期实习四个月起每周至少工作3到4天'},
  {name:'百度-2', url:'_baidu2', text:'智能体应用开发实习生（J96868）ACG 北京市 日常实习 工作职责：参与大模型智能体应用开发与创新实践探索生成式AI在不同场景的解决方案 基于业务需求搭建智能体工作流实现复杂任务的自动化处理提升大模型应用效果 参与客户需求对接协助解决客户各类技术相关问题完成技术方案验证和效果评估 调研市场主流智能体应用并协助测试智能体能力边界 职责要求：本科及以上学历在校生可尽快到岗线下实习5个月及以上每周至少出勤4天 熟悉Python基础开发具备API接口调用和脚本编写能力 掌握RAG技术原理及Prompt工程方法了解模型微调技术SFT LoRA DPO等方法 使用过千帆AppBuilder Coze Dify百炼等任一智能体平台并熟悉LangChain LlamaIndex等编排开发框架 对视觉语言模型VLM应用有实践或研究兴趣具备优秀的学习能力和技术探索精神'},
  {name:'百度-3', url:'_baidu3', text:'AI全栈创意设计技术实习生（J98320）MEG 北京市深圳市 日常实习 工作职责：参与百度搜索AI交互组件的创意和内容整理相关工作 结合AI工具参与百度搜索AI交互组件的交互及视觉设计工作 基于Coding Agent参与百度搜索AI交互组件的生产检验工作 参与百度搜索AI交互组件评估工作 学习和实践AI各前沿知识 职责要求：专业无限制 对AI新技术充满好奇与求真对AI前沿知识能够主动学习实践思考 有丰富的AI工具使用经验有AI Coding的实际经验有完整通过AI Coding生成一个作品 有丰富的计算机前端或全栈编程经验优先 有大模型后训练Agent架构实现经验优先 有互联网产品视觉平面设计经验优先'},
  {name:'百度-4', url:'_baidu4', text:'Agent策略算法实习生（J98721）MEG 北京市 日常实习 工作职责：负责大模型智能体Agent核心策略研发迭代与落地 参与Agent模型训练评估及DPO GRPO等后训练技术落地 参与搭建具备创作感知文案创作多能力调度的创作智能体Creative Agent支持复杂内容生产流的逻辑编排 跟踪并复现Agent领域前沿技术如Long-context RAG多模态理解与对齐DeepResearch调研框架多Agent协同体系并在场景中验证其业务价值 职责要求：计算机AI等相关专业对大模型智能体方向有浓厚兴趣 熟悉Python熟练掌握PyTorch PaddlePaddle等至少一种深度学习框架 逻辑思维清晰学习能力强有良好沟通与问题解决能力 深入理解Transformer架构及LLM基础原理 对Prompt Engineering SFT强化学习PPO DPO或Agent框架如LangChain Dify有实战经验者优先'},
  {name:'百度-5', url:'_baidu5', text:'AIGC算法实习生-视频生成方向（J98505）MEG 北京市 日常实习 工作职责：协助团队进行视频生成技术研发和业务落地探索 参与项目的算法效果验证和优化确保算法效率和准确性 协助进行文献调研总结最新技术趋势和研究进展 参与团队内部的技术交流和分享会议 职责要求：计算机科学人工智能或相关领域在读硕士或博士博士优先 对深度学习多模态模型或视频生成技术有浓厚兴趣 具备基本编程和算法设计能力熟悉Python TensorFlow或PyTorch为佳 良好学习能力和团队合作精神能实习3个月以上者优先'}
];

baidu.forEach(b => {
  const i = d.results.findIndex(r => r.name === b.name);
  if (i >= 0) d.results.splice(i, 1);
  d.results.push(b);
});

fs.writeFileSync(p, JSON.stringify({results: d.results, updatedAt: new Date().toISOString()}, null, 2), 'utf-8');
const ok = d.results.filter(r => !r.text.startsWith('ERROR') && r.text.length > 10).length;
console.log('Updated. Total:', d.results.length, 'success:', ok);
