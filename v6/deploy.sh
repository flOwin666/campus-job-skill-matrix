#!/bin/bash
# 三端部署：开发者(Vercel) + 生产(GitHub Pages) + Obsidian(本地笔记)
# 用法: bash deploy.sh "提交信息"
set -e

MSG="${1:-deploy: $(date '+%Y-%m-%d %H:%M')}"
DATA_DIR="../_github-data"
OBSIDIAN_DIR="/d/obsidian工作流/手写项目"

echo "=== 1/6 构建前端 ==="
npm run build

echo "=== 2/6 复制到 GitHub Pages 仓库 ==="
cp dist/index.html "$DATA_DIR/"
rm -rf "$DATA_DIR/assets/"
mkdir "$DATA_DIR/assets"
cp dist/assets/* "$DATA_DIR/assets/"

echo "=== 3/6 提交源码 → 开发者端 (触发 Vercel) ==="
git add -A
git commit -m "$MSG" || echo "  (无源码变更，跳过)"
git push

echo "=== 4/6 推送静态文件 → 生产端 (GitHub Pages) ==="
cd "$DATA_DIR"
git add -A
git commit -m "$MSG" || echo "  (无静态文件变更，跳过)"
git push
cd - > /dev/null

echo "=== 5/6 Obsidian 笔记库 ==="
if [ -d "$OBSIDIAN_DIR" ]; then
  echo "  Obsidian 笔记已在本地同步更新（部署前手动更新对应 .md 文件）"
  echo "  路径: $OBSIDIAN_DIR"
else
  echo "  ⚠ Obsidian 目录未找到: $OBSIDIAN_DIR"
fi

echo "=== 6/6 三端部署完成 ==="
echo "开发者端 (Vercel): 源码推送后自动构建"
echo "生产端 (GitHub Pages): 1-2分钟后生效"
echo "Obsidian端: 本地笔记已就绪"
