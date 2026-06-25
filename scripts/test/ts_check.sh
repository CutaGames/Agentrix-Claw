#!/bin/bash
cd /mnt/d/wsl/Ubuntu-24.04/Code/Agentrix/Agentrix-website/mobile-app

echo "=== NPM Scripts ==="
node -e "const p=require('./package.json'); Object.entries(p.scripts||{}).forEach(([k,v])=>console.log(k,':',v))"

echo ""
echo "=== TypeScript Check ==="
npx tsc --noEmit 2>&1 | head -60

echo ""
echo "=== Exit code: $? ==="
