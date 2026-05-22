/**
 * GlobalScanScreen — Sprint A shim around the existing ScanScreen.
 *
 * The tab-bar's top-right 📷 icon navigates here regardless of which Tab
 * the user is in. Internally it reuses the existing `ScanScreen` — no
 * rewrite in Sprint A. This screen replaces three legacy mount points
 * (Me · Scan, Agent · Scan, Drawer · Scan) per §7.6 #113.
 */
import React from 'react';
import { ScanScreen } from '../me/ScanScreen';

export function GlobalScanScreen() {
  return <ScanScreen />;
}
