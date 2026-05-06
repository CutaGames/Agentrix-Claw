#!/bin/bash
# Deploy frontend to the current production host.
# Backend: port 3000, Frontend: port 3001, Nginx: port 80

set -e
chmod 600 /tmp/hq.pem 2>/dev/null || true

DEPLOY_HOST="${DEPLOY_HOST:-47.130.176.148}"
TARGET_REF="${TARGET_REF:-main}"

ssh -o StrictHostKeyChecking=no -i /tmp/hq.pem "ubuntu@${DEPLOY_HOST}" \
    "DEPLOY_HOST=${DEPLOY_HOST} TARGET_REF=${TARGET_REF} bash -s" <<'REMOTE'
set -e
DEPLOY_HOST="${DEPLOY_HOST:?missing DEPLOY_HOST}"
TARGET_REF="${TARGET_REF:-main}"
PAT="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"

echo "=== [1/6] Pull latest code ==="
cd /home/ubuntu/Agentrix
git -c http.proxy= -c https.proxy= fetch "https://${PAT}@github.com/CutaGames/Agentrix.git" "${TARGET_REF}" 2>&1 | tail -3
git reset --hard FETCH_HEAD
git log --oneline -1

echo ""
echo "=== [2/6] Write frontend .env.production ==="
cat > /home/ubuntu/Agentrix/frontend/.env.production <<ENV
NEXT_PUBLIC_API_URL=https://api.agentrix.top/api
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://agentrix.top
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=74f7cb91ceafbb635021feebbf0d77a3
NEXT_PUBLIC_CHAIN_ID=97
NEXT_PUBLIC_ERC8004_CONTRACT_ADDRESS=0xCF3cC47b5CC4299b33d748C431f0C40C2fdFb6B4
NEXT_PUBLIC_AUDIT_PROOF_CONTRACT_ADDRESS=0xBE398F15aE8c4FbdC727b95E087B8251147Fd99A
NEXT_PUBLIC_ARN_TREASURY_ADDRESS=0x6c1a26eB7adc25822f91e3389A33528508a81F0c
NEXT_PUBLIC_ARN_FEE_SPLITTER_ADDRESS=0x1f5D9bB59Fdb91c9f82291F7b896dE07d31888a5
NEXT_PUBLIC_TRANSAK_API_KEY=7f03deb8-ee24-49b3-a919-31e7d9244030
NEXT_PUBLIC_TRANSAK_ENVIRONMENT=STAGING
ENV
echo "✅ .env.production written"

echo ""
echo "=== [3/6] Install frontend deps ==="
cd /home/ubuntu/Agentrix/frontend
npm install --legacy-peer-deps 2>&1 | tail -5

echo ""
echo "=== [4/6] Build Next.js ==="
npm run build 2>&1 | tail -15
echo "✅ Build done"

echo ""
echo "=== [5/6] PM2 start/restart frontend ==="
# Stop existing frontend if running
pm2 delete agentrix-frontend 2>/dev/null || true

# Start frontend on port 3001
pm2 start "npx next start -H 0.0.0.0 -p 3001" \
  --name agentrix-frontend \
  --cwd /home/ubuntu/Agentrix/frontend \
  --interpreter none \
  -- 2>&1 | tail -5

pm2 save
sleep 4
pm2 list

echo ""
echo "=== [6/6] Update Nginx (add frontend proxy) ==="
sudo tee /etc/nginx/sites-available/agentrix > /dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _ agentrix.top www.agentrix.top api.agentrix.top 47.130.176.148;

    gzip on;
    gzip_types application/json text/plain application/javascript text/css text/html;
    gzip_min_length 256;

    # API routes → backend :3000
    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        client_max_body_size 50M;

        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-Requested-With, Accept, Origin, X-API-Key" always;
        if ($request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin *;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS";
            add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-Requested-With, Accept, Origin, X-API-Key";
            add_header Access-Control-Max-Age 86400;
            add_header Content-Length 0;
            return 204;
        }
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }

    # Health shortcut
    location = /health {
        proxy_pass http://127.0.0.1:3000/api/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket for backend
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }

    # Next.js frontend → :3001
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }

    location ~ /\.(git|env|htaccess|htpasswd) {
        deny all;
        return 404;
    }
}
NGINX

sudo nginx -t && sudo systemctl reload nginx
echo "✅ Nginx reloaded"

echo ""
echo "=== Verify ==="
sleep 2
curl -s -o /dev/null -w "Port 3001 Next.js: HTTP %{http_code}\n" http://localhost:3001/
curl -s -o /dev/null -w "Port 80  Nginx→FE: HTTP %{http_code}\n" http://localhost:80/
curl -s -o /dev/null -w "Port 80  /api:     HTTP %{http_code}\n" http://localhost:80/api/health
echo ""
echo "=== 🎉 SINGAPORE FRONTEND DEPLOYED ==="
echo "Open in browser: http://${DEPLOY_HOST}"
REMOTE
