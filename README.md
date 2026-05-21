# 校招岗位技能矩阵 (Campus Job Skill Matrix)

面向中国互联网大厂校招岗位的技能矩阵可视化工具。支持 **字节跳动、阿里巴巴、腾讯、美团、百度** 五家公司的岗位数据抓取与技能对比。

## 功能

- **多维度技能矩阵**：岗位 × 技能二维矩阵，三色标注（必需/加分/背景）
- **技能筛选与搜索**：四维组合筛选（公司/城市/技能/关键词），搜索高亮置顶
- **实时数据刷新**：管理员一键触发全网爬虫，SSE 实时日志推送
- **爬取失败修复**：自动识别 8 类失败原因，差异化重试策略
- **技能管理**：可视化增删改查技能关键词，localStorage 持久化排序

## 技术栈

- **前端**：Vue 3 + Vite
- **后端**：Express + SSE
- **爬虫**：Playwright（字节/阿里/腾讯/美团）+ HTTP SSR 提取（百度）
- **数据**：JSON 文件 + GitHub 托管

## 快速开始

```bash
cd v6
npm install
node server.js   # 后端（端口 3000）
npm run dev       # 前端（端口 5173）
```

访问 `http://localhost:5173`，管理员密码见 `server.js`。

## 数据仓库

岗位数据托管在 [campus-job-skill-matrix-data](https://github.com/flOwin666/campus-job-skill-matrix-data)。

