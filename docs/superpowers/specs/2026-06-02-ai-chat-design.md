# AI 求职助手 — 功能设计方案

## 概述

在校招岗位技能矩阵网页中集成 DeepSeek 大模型，实现两大功能区：
- **功能1**：网页向导 — AI 回答用户关于网页功能、数据概况、岗位查询的问题
- **功能2**：学习路线 — 根据岗位 JD 自动生成技能学习路线（文字树形）
- **功能3**：智能爬取 — 后续迭代

## 入口

设置面板（齿轮图标）侧边栏新增 "🤖 求职助手" tab，打开即进入聊天界面。

## 功能1：网页向导

- 动态系统提示词注入：网页功能完整介绍 + 实时数据概况（更新时间、公司分布、岗位数）
- 领域边界：只回答求职/岗位/技能相关问题，超出范围礼貌拒绝
- 工具调用：search_jobs、list_skills、list_companies、get_job_detail
- 示例问法："字节有哪些AI岗位？""Python重要吗？""数据什么时候更新的？"

## 功能2：学习路线生成

- 入口A：聊天框粘贴岗位链接 → LLM 尝试抓取 → 成功则分析/失败则请用户贴JD
- 入口B：岗位弹窗（JobModal）右下角 "🧠 分析学习路线" 按钮 → 跳转聊天面板并带上下文
- 输出：Markdown 树形文字学习路线（阶段+技能+资源），后续迭代可视化思维导图

## 数据流

用户输入 → ChatPanel fetch('/api/chat') → server.js → DeepSeek API（带工具定义）→ tool_calls → server 执行工具 → 结果回传 DeepSeek → SSE 流式返回前端

## 技术要点

- server.js：增强 /api/chat 端点，工具调用循环，动态系统提示词，SSE 流式返回
- ChatPanel.vue：新组件，消息列表+输入框+SSE 解析+连接状态
- JobModal.vue：底部加 "分析学习路线" 按钮
- App.vue：导入 ChatPanel，侧边栏加 tab，处理 JobModal 事件

## 涉及文件

- `v6/server.js` — 增强
- `v6/src/components/ChatPanel.vue` — 新建
- `v6/src/components/JobModal.vue` — 微改
- `v6/src/App.vue` — 微改
