#!/bin/bash
# 前端构建部署脚本
# 用法: bash deploy.sh "提交信息"
# 示例: bash deploy.sh "fix: 修复管理员入口显示"

set -e

MSG="${1:-deploy: frontend update}"
DATA_DIR="D:/岗位信息爬取网页项目/_github-data"

echo "=== 1/4 构建 ==="
npm run build

echo "=== 2/4 复制到数据仓库 ==="
cp -r dist/* "$DATA_DIR/"

# 清理旧构建产物（保留当前引用的两个文件）
CURRENT_JS=$(grep -oP 'assets/index-[^.]+\.js' dist/index.html)
CURRENT_CSS=$(grep -oP 'assets/index-[^.]+\.css' dist/index.html)
for f in "$DATA_DIR/assets"/*.js "$DATA_DIR/assets"/*.css; do
  name=$(basename "$f")
  if [ "$name" != "$CURRENT_JS" ] && [ "$name" != "$CURRENT_CSS" ]; then
    rm -f "$f"
    echo "  清理旧文件: $name"
  fi
done

echo "=== 3/4 提交 ==="
cd "$DATA_DIR"
git add -A
git commit -m "$MSG"

echo "=== 4/4 推送 ==="
git push

echo "=== 完成 ==="
