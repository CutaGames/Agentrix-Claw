/**
 * Soul Core L1 Applet v1.1 protocol layer (T12/14/15/16/17).
 * Canonical protocol logic shared by the JavaCard applet, deterministic simulator, host SDK and
 * backend. Evidence level: `simulator` / `protocol_only` — does NOT prove on-card/hardware behaviour.
 */
export * from './canonical';
export * from './profiles';
export * from './lifecycle';
export * from './proposal-digest';
export * from './attestation';
