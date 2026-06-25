import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 0 audit follow-up: persist LLM cost records.
 * Replaces the in-memory-only SessionCostRecord so cost survives restarts
 * and can be used for billing / quota audits.
 */
export class CreateAgentCostRecords1782000000000 implements MigrationInterface {
  name = 'CreateAgentCostRecords1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_cost_records" (
        "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"            varchar,
        "session_id"         varchar NOT NULL,
        "agent_id"           varchar,
        "instance_id"        varchar,
        "model"              varchar(128) NOT NULL,
        "provider"           varchar(64),
        "input_tokens"       bigint NOT NULL DEFAULT 0,
        "output_tokens"      bigint NOT NULL DEFAULT 0,
        "cache_read_tokens"  bigint NOT NULL DEFAULT 0,
        "cache_write_tokens" bigint NOT NULL DEFAULT 0,
        "cost_usd"           double precision NOT NULL DEFAULT 0,
        "routing_reason"     varchar(64),
        "created_at"         timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_cost_records_user_created" ON "agent_cost_records" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_cost_records_session_created" ON "agent_cost_records" ("session_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_cost_records_user" ON "agent_cost_records" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_cost_records"`);
  }
}
