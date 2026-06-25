#!/bin/bash
cd /mnt/d/wsl/Ubuntu-24.04/Code/Agentrix/Agentrix-website/mobile-app

echo "=== Files changed since HEAD ==="
git diff --name-only HEAD

echo ""
echo "=== realtime.service.ts fix check ==="
grep -n "return ac;" src/services/realtime.service.ts
echo "Function count in realtime.service.ts:"
grep -c "^export function\|^export async function" src/services/realtime.service.ts

echo ""
echo "=== SkillCard price check ==="
grep -n "undefined\|null" src/components/market/SkillCard.tsx | grep -i price | head -5

echo ""
echo "=== Navigation types check - SocialStackParamList ==="
grep -A5 "SocialStackParamList" src/navigation/types.ts

echo ""
echo "=== SocialStackNavigator imports check ==="
grep "import\|ChatList\|DirectMessage\|GroupChat" src/navigation/SocialStackNavigator.tsx | head -10
