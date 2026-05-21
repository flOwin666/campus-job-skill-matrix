# 校招岗位技能矩阵 WebApp

技术栈：Vue 3 + Vite

## 本地开发

```bash
cd D:\岗位信息爬取网页项目\v6
npm run dev
```

网页地址：http://localhost:5173/

## 项目结构

```
src/
├── main.js          # Vue 入口
├── App.vue          # 主组件（顶栏 + 视图切换）
├── style.css        # 全局样式
├── jobsData.json    # 41个岗位数据
└── components/
    ├── MatrixView.vue  # 技能矩阵视图
    ├── ListView.vue    # 列表视图
    └── JobModal.vue    # 岗位详情弹窗
```

## 数据更新

1. 修改 `src/jobsData.json`
2. 浏览器自动热更新
