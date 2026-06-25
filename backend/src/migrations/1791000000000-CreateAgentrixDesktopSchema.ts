import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the `agentrix_desktop` schema and its 3 base tables.
 *
 * Tables:
 *  - releases:        auto-update manifest (used by tauri-plugin-updater)
 *  - crash_records:   crash report aggregation (rust_panic / js_error / unhandled_rejection)
 *  - analytics_events: first-run telemetry (opt-in)
 *
 * @see .kiro/specs/desktop-go-live/design.md §3.1
 * @see .kiro/specs/desktop-go-live/requirements.md US-G2-2 / US-G2-3 / US-G2-4
 */
export class CreateAgentrixDesktopSchema1791000000000 implements MigrationInterface {
  name = 'CreateAgentrixDesktopSchema1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Schema isolation — all three tables live under agentrix_desktop.
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS agentrix_desktop`);

    // gen_random_uuid() comes from pgcrypto (already enabled on prod).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    // ── 1. Releases ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agentrix_desktop.releases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        version VARCHAR(32) NOT NULL,
        channel VARCHAR(16) NOT NULL DEFAULT 'stable',
        target VARCHAR(32) NOT NULL,
        arch VARCHAR(16) NOT NULL,
        url TEXT NOT NULL,
        signature TEXT NOT NULL,
        notes_md TEXT,
        rollout_percent INTEGER NOT NULL DEFAULT 100,
        pub_date TIMESTAMP NOT NULL DEFAULT NOW(),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_releases_version_target
        ON agentrix_desktop.releases (version, channel, target, arch)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_releases_active_lookup
        ON agentrix_desktop.releases (channel, target, arch, is_active, pub_date DESC)
    `);

    // ── 2. Crash records ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agentrix_desktop.crash_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id_hash VARCHAR(64) NOT NULL,
        user_id UUID,
        app_version VARCHAR(32) NOT NULL,
        fingerprint VARCHAR(128) NOT NULL,
        type VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        stack TEXT,
        location VARCHAR(255),
        os_platform VARCHAR(32),
        os_version VARCHAR(64),
        arch VARCHAR(16),
        occurred_at TIMESTAMP NOT NULL,
        reported_at TIMESTAMP NOT NULL DEFAULT NOW(),
        count INTEGER NOT NULL DEFAULT 1
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_crash_fingerprint_window
        ON agentrix_desktop.crash_records (fingerprint, reported_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_crash_version
        ON agentrix_desktop.crash_records (app_version, reported_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_crash_device
        ON agentrix_desktop.crash_records (device_id_hash, reported_at DESC)
    `);

    // ── 3. Analytics events ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agentrix_desktop.analytics_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id_hash VARCHAR(64) NOT NULL,
        user_id UUID,
        session_id VARCHAR(64),
        event_name VARCHAR(64) NOT NULL,
        event_props JSONB,
        app_version VARCHAR(32) NOT NULL,
        os_platform VARCHAR(32),
        occurred_at TIMESTAMP NOT NULL,
        reported_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_event_time
        ON agentrix_desktop.analytics_events (event_name, reported_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_device
        ON agentrix_desktop.analytics_events (device_id_hash, reported_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // CASCADE drops all 3 tables + their indexes.
    await queryRunner.query(`DROP SCHEMA IF EXISTS agentrix_desktop CASCADE`);
  }
}
