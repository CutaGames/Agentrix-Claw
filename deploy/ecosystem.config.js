/**
 * PM2 ecosystem config for the Agentrix production server.
 *
 * Source of truth for port assignment, cwd, and restart policy so the
 * services don't silently drift back to whatever `pm2 save` dumped last.
 *
 * Used by: production server at 47.130.176.148 (Singapore).
 *   cd /home/ubuntu/Agentrix && pm2 startOrReload deploy/ecosystem.config.js
 *
 * History:
 *   2026-05-10 — created after a deploy-time port collision where
 *   frontend and backend both defaulted to 3000 depending on pm2 start
 *   order.  Before this file, port assignment only lived in
 *   `frontend/start-production.sh` (hard-coded `-p 3001`) plus a stale
 *   `PORT=3000` env carried inside `pm2 dump` — a latent foot-gun.
 *
 * Invariants:
 *   - backend  → :3000  (nginx upstream for /api/**)
 *   - frontend → :3001  (nginx upstream for /**, unmatched)
 *   - gateway  → :18789 (openclaw LAN gateway)
 */

module.exports = {
  apps: [
    {
      name: 'agentrix-backend',
      cwd: '/home/ubuntu/Agentrix/backend',
      script: 'dist/main.js',
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
    {
      name: 'agentrix-frontend',
      cwd: '/home/ubuntu/Agentrix/frontend',
      // Invoke the repo-local start script, which pins `next start -p 3001`.
      // The `--` after `start` hands the remaining args to npm so that next
      // CLI receives the port flag instead of npm.
      script: 'npm',
      args: 'run start -- -H 0.0.0.0 -p 3001',
      exec_mode: 'fork',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        // Intentionally NOT setting PORT here.  Do not let a stray
        // `PORT=3000` carried in by another process leak in; the port
        // is pinned via the `-p 3001` CLI flag above (which wins over
        // env.PORT in Next.js).
      },
    },
    {
      name: 'openclaw-gateway',
      cwd: '/home/ubuntu',
      script: '/usr/bin/openclaw',
      args: 'gateway run --force --bind lan --port 18789 --token openclaw-test-token-2026',
      exec_mode: 'fork',
      autorestart: true,
    },
  ],
};
