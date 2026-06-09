#!/bin/bash
# 一键部署：源码(Vercel) + 静态文件(GitHub Pages) 同步更新
# 用法: bash deploy.sh "提交信息"
set -e

MSG="${1:-deploy: $(date '+%Y-%m-%d %H:%M')}"
DATA_DIR="../_github-data"

echo "=== 1/5 构建前端 ==="
npm run build

echo "=== 2/5 复制到 GitHub Pages 仓库 ==="
cp dist/index.html "$DATA_DIR/"
rm -rf "$DATA_DIR/assets/"
mkdir "$DATA_DIR/assets"
cp dist/assets/* "$DATA_DIR/assets/"

echo "=== 3/5 提交源码 (触发 Vercel) ==="
git add -A
git commit -m "$MSG" || echo "  (无源码变更，跳过)"
git push

echo "=== 4/5 提交静态文件 (GitHub Pages) ==="
cd "$DATA_DIR"
git add -A
git commit -m "$MSG" || echo "  (无静态文件变更，跳过)"
git push

echo "=== 5/5 部署完成 ==="
echo "Vercel: 源码推送后自动构建"
echo "GitHub Pages: 1-2分钟后生效"
