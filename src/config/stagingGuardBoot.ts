/**
 * Imported first by App.tsx (I-046): in a preview build with the staging switch, the network guard
 * wraps XMLHttpRequest / WebSocket before any library captures them at import time. No-op in any
 * other build. `src/config/env.ts` calls it too; installing twice does nothing.
 */
import { ensureStagingNetworkGuard } from './stagingMode';

ensureStagingNetworkGuard();
