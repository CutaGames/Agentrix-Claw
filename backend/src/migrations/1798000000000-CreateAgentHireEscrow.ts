import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-Agent v2 W7 — Create agent_hire_escrow table.
 *
 * Lightweight escrow for marketplace-hire sub-tasks. See
 * `agent-hire-escrow.entity.ts` for lifecycle rules.
 */
export class CreateAgentHireEscrow1798000000000 implements MigrationInterface {
  name = 'CreateAgentHireEscrow1798000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agent_hire_escrow (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL,
        hirer_user_id VARCHAR(64) NOT NULL,
        seller_user_id VARCHAR(64) NOT NULL,
        agent_id VARCHAR(64),
        agreed_usd DOUBLE PRECISION NOT NULL,
        released_usd DOUBLE PRECISION,
        status VARCHAR(16) NOT NULL DEFAULT 'reserved',
        dispute_reason TEXT,
        dispute_window_ends_at TIMESTAMPTZ,
        released_at TIMESTAMPTZ,
        refunded_at TIMESTAMPTZ,
        disputed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_hire_escrow_task ON agent_hire_escrow(task_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_hire_escrow_hirer ON agent_hire_escrow(hirer_user_id, created_at DESC);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_hire_escrow_seller ON agent_hire_escrow(seller_user_id, created_at DESC);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_hire_escrow_status ON agent_hire_escrow(status, created_at DESC);`);

    // Best-effort FK to agent_tasks (CASCADE so deleting a task drops its escrow).
    // Wrapped in DO block in case agent_tasks table is missing (early dev).
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE agent_hire_escrow
        ADD CONSTRAINT fk_hire_escrow_task
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS agent_hire_escrow CASCADE;`);
  }
}
