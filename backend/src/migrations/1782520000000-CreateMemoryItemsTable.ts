import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMemoryItemsTable1782520000000 implements MigrationInterface {
  name = 'CreateMemoryItemsTable1782520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "memory_items" (
        "id" varchar(160) NOT NULL,
        "user_id" uuid NOT NULL,
        "tier" varchar(20) NOT NULL,
        "memory_key" varchar(120),
        "text" text NOT NULL,
        "tags" jsonb NOT NULL,
        "agent_id" varchar(100),
        "ts_ms" bigint NOT NULL,
        "expires_at_ms" bigint,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_memory_items_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_memory_items_user_tier_ts"
      ON "memory_items" ("user_id", "tier", "ts_ms");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_memory_items_user_tier_key"
      ON "memory_items" ("user_id", "tier", "memory_key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "memory_items";');
  }
}
