import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * V4 §3.2 — Marketplace moderation + paid skins.
 *
 *   pet_skins.visibility         varchar(16) default 'private'   (public|private|unlisted)
 *   pet_skins.moderation_status  varchar(16) default 'pending'   (pending|approved|rejected)
 *   pet_skins.price_cents        integer     default 0
 *
 * Backfills: existing platform skins (owner_user_id IS NULL) → public + approved.
 *           existing user skins → unlisted + approved (preserve current marketplace
 *           behaviour from the V4 first-pass which made all generated skins visible).
 */
export class PetSkinModerationV4Phase11783480000000 implements MigrationInterface {
  name = 'PetSkinModerationV4Phase11783480000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "pet_skins" ADD COLUMN IF NOT EXISTS "visibility" varchar(16) NOT NULL DEFAULT 'private'`,
    );
    await q.query(
      `ALTER TABLE "pet_skins" ADD COLUMN IF NOT EXISTS "moderation_status" varchar(16) NOT NULL DEFAULT 'pending'`,
    );
    await q.query(
      `ALTER TABLE "pet_skins" ADD COLUMN IF NOT EXISTS "price_cents" integer NOT NULL DEFAULT 0`,
    );

    // Backfill platform skins → publicly visible & approved.
    await q.query(
      `UPDATE "pet_skins" SET "visibility" = 'public', "moderation_status" = 'approved' WHERE "owner_user_id" IS NULL`,
    );
    // Backfill existing user-owned skins → preserve V4 first-pass visibility.
    // visibility=unlisted (so they don't auto-appear in the public feed retroactively),
    // moderation_status=approved (so the owner-side UI keeps showing them).
    await q.query(
      `UPDATE "pet_skins" SET "moderation_status" = 'approved' WHERE "owner_user_id" IS NOT NULL AND "moderation_status" = 'pending'`,
    );

    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_skins_market_filter" ON "pet_skins" ("visibility", "moderation_status", "retired")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_pet_skins_market_filter"`);
    await q.query(`ALTER TABLE "pet_skins" DROP COLUMN IF EXISTS "price_cents"`);
    await q.query(`ALTER TABLE "pet_skins" DROP COLUMN IF EXISTS "moderation_status"`);
    await q.query(`ALTER TABLE "pet_skins" DROP COLUMN IF EXISTS "visibility"`);
  }
}
