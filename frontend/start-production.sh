#!/bin/bash
# Agentrix 生产环境启动脚本

echo "=========================================="
echo "  Agentrix 生产服务器启动"
echo "=========================================="
echo ""

# 检查是否已构建
if [ ! -f ".next/BUILD_ID" ]; then
    echo "📦 检测到未构建，正在构建项目..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ 构建失败，请检查错误信息"
        exit 1
    fi
    echo "✅ 构建完成"
    echo ""
fi

# 检查端口3001是否被占用
PORT_PID=$(lsof -ti:3001 2>/dev/null)
if [ ! -z "$PORT_PID" ]; then
    echo "⚠️  检测到端口3001被占用 (PID: $PORT_PID)，正在释放..."
    kill -9 $PORT_PID 2>/dev/null
    sleep 1
    echo "✅ 端口已释放"
    echo ""
fi

# 启动生产服务器（直接调用 next start，避免递归）
# 端口3000由后端独占，前端使用3001
echo "🚀 启动生产服务器..."
echo "📍 服务器地址: http://localhost:3001"
echo ""
npx next start -H 0.0.0.0 -p 3001
