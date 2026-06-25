import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint G-3 / US-G3-1: Track desktop download intent so we can attribute
 * installs back to UTM source / referrer / country.
 *
 * Schema: agentrix_desktop (created in 1791000000000)
 *
 * @see .kiro/specs/desktop-ga-internal-beta/design.md §2
 */
export class AddDesktopDownloadEvents1791000000001 implements MigrationInterface {
  name = 'AddDesktopDownloadEvents1791000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agentrix_desktop.download_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        utm_source VARCHAR(64),
        utm_campaign VARCHAR(64),
        utm_medium VARCHAR(64),
        invite_code VARCHAR(32),
        referrer TEXT,
        user_agent_hash VARCHAR(64),
        ip_country VARCHAR(8),
        platform VARCHAR(32),
        occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dl_time
        ON agentrix_desktop.download_events (occurred_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dl_source
        ON agentrix_desktop.download_events (utm_source, occurred_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dl_invite
        ON agentrix_desktop.download_events (invite_code)
        WHERE invite_code IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS agentrix_desktop.download_events`);
  }
}
