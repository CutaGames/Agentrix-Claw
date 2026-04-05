#!/bin/bash

# Agentrix Backend 构建脚本
# 确保 dist 目录正确生成

set -e  # 遇到错误立即退出

BUILD_TSCONFIG="tsconfig.build.json"
if [ ! -f "$BUILD_TSCONFIG" ]; then
    BUILD_TSCONFIG="tsconfig.json"
fi

echo "🔨 开始构建 Agentrix Backend..."
echo ""

# 进入脚本所在目录
cd "$(dirname "$0")"

# 清理旧的 dist 目录
echo "🧹 清理旧的构建文件..."
rm -rf dist
rm -f tsconfig.tsbuildinfo

# 检查必要文件
if [ ! -f "package.json" ]; then
    echo "❌ 错误: package.json 不存在"
    exit 1
fi

if [ ! -f "tsconfig.json" ]; then
    echo "❌ 错误: tsconfig.json 不存在"
    exit 1
fi

if [ ! -f "src/main.ts" ]; then
    echo "❌ 错误: src/main.ts 不存在"
    exit 1
fi

# 尝试使用 nest build
echo "📦 尝试使用 nest build..."
if npm run build:nest 2>&1; then
    echo "✅ nest build 成功"
else
    echo "⚠️  nest build 失败，尝试使用 tsc 直接编译..."
    
    # 使用 tsc 直接编译 (--incremental false 避免 TS 5.9 跳过 emit 的 bug)
    echo "📦 使用 TypeScript 编译器直接编译 ($BUILD_TSCONFIG)..."
    npx tsc -p "$BUILD_TSCONFIG" --incremental false
    
    if [ $? -ne 0 ]; then
        echo "❌ TypeScript 编译失败"
        exit 1
    fi
fi

# 验证构建结果
echo ""
echo "🔍 验证构建结果..."

if [ ! -f "dist/main.js" ]; then
    echo "❌ 错误: dist/main.js 不存在！"
    echo ""
    echo "📋 dist 目录内容:"
    ls -la dist/ || echo "dist 目录不存在"
    echo ""
    echo "🔍 检查可能的编译错误..."
    npx tsc -p "$BUILD_TSCONFIG" --noEmit 2>&1 | head -50
    exit 1
fi

# 检查文件大小
FILE_SIZE=$(stat -f%z dist/main.js 2>/dev/null || stat -c%s dist/main.js 2>/dev/null || echo "0")
if [ "$FILE_SIZE" -eq 0 ]; then
    echo "❌ 错误: dist/main.js 文件大小为 0"
    exit 1
fi

echo "✅ 构建成功！"
echo "   - dist/main.js 存在 ($(du -h dist/main.js | cut -f1))"
echo "   - 文件大小: ${FILE_SIZE} 字节"
echo ""
echo "📋 dist 目录主要文件:"
ls -lh dist/*.js 2>/dev/null | head -10 || echo "没有找到 .js 文件"

echo ""
echo "🎉 构建完成！"

