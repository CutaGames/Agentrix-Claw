# deploy/

Deployment configuration for the Agentrix production server.

## `ecosystem.config.js`

PM2 ecosystem file that pins service ports and working directories so
port assignment does not drift between deploys.

### Initial migration (2026-05-10)

First time applying this file on the production server:

```bash
ssh -i ~/Desktop/hq.pem ubuntu@47.130.176.148
cd /home/ubuntu/Agentrix
git pull origin feature/pet-phase6-p0-p1   # or whatever branch is deployed

# Stop the drifted-env processes (new config will recreate them cleanly).
# openclaw-gateway is a long-lived process and is safe to leave alone.
pm2 delete agentrix-backend agentrix-frontend

pm2 startOrReload deploy/ecosystem.config.js --only agentrix-backend,agentrix-frontend

# Persist so `pm2 resurrect` on reboot picks up the clean config.
pm2 save
```

### Routine deploy

```bash
cd /home/ubuntu/Agentrix/backend
git pull && npm install --omit=dev && npm run build && npm run migration:run
pm2 reload agentrix-backend

cd /home/ubuntu/Agentrix/frontend
git pull && npm install --legacy-peer-deps && npm run build
pm2 reload agentrix-frontend
```

No need to re-apply `ecosystem.config.js` on routine deploys; `reload`
keeps the last-registered config.  Only re-apply when this file
changes.

### Port invariants

| Service | Port | Reason |
|---|---:|---|
| `agentrix-backend` | 3000 | Nginx `proxy_pass` for `/api/**` |
| `agentrix-frontend` | 3001 | Nginx `proxy_pass` for unmatched `/**` |
| `openclaw-gateway` | 18789 | LAN gateway for cloud OpenClaw instances |

If the ports ever drift (e.g. both services answer on 3000), nginx
happy-paths to whichever process started first and `/api/**` requests
get 404'd by Next.js instead of being proxied to NestJS.  That was the
regression this file was created to prevent.
