import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 M3 — pet NFT mint intent table.
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md §9.2 M3
 *
 *   - 1 (livingPetId, chain) 同时只允许 1 条非 failed/cancelled intent
 *     → partial unique idx
 *   - status: pending | ready | submitted | minted | failed | cancelled
 *   - intimacy 门槛在 service 层校验（默认 ≥ 5）
 *   - tokenId / contractAddress / txHash 在状态机推进时由 signer worker 填入
 */
export class PetNftIntentsPhase6M31782910000000 implements MigrationInterface {
  name = 'PetNftIntentsPhase6M31782910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_nft_intents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "living_pet_id" uuid NOT NULL,
        "soul_template_id" varchar(64) NOT NULL,
        "intimacy_snapshot" smallint NOT NULL,
        "chain" varchar(16) NOT NULL,
        "contract_address" varchar(96),
        "token_id" varchar(96),
        "tx_hash" varchar(96),
        "recipient_address" varchar(96) NOT NULL,
        "metadata_uri" varchar(256),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pet_nft_intents" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_nft_intents_user" ON "pet_nft_intents" ("user_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_nft_intents_pet" ON "pet_nft_intents" ("living_pet_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_nft_intents_status" ON "pet_nft_intents" ("status");`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pet_nft_intents_pet_chain_open"
       ON "pet_nft_intents" ("living_pet_id", "chain")
       WHERE status NOT IN ('failed','cancelled');`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_pet_nft_intents_pet_chain_open";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_nft_intents_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_nft_intents_pet";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_nft_intents_user";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_nft_intents";`);
  }
}
