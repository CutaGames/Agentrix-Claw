import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace Ecosystem — P1-3 AXP Independent Transaction Flow
 *
 * Adds `price_axp` column to `pet_skins`. This is a parallel pricing track
 * to `price_cents`: skins may be priced in USD (price_cents > 0) OR AXP
 * (price_axp > 0), and the frontend routes them through two independent
 * flows:
 *   - USD:  /pay/checkout (Stripe + crypto SmartCheckout + orders)
 *   - AXP:  /v1/pet/skins/marketplace/:id/install-with-axp → PetSkinService.installWithAxp()
 *           which internally calls AxpService.spend() (no Order row, no Stripe).
 *
 * Column is NULLABLE (NULL = not AXP-purchasable). This is semantically
 * distinct from `price_cents` (0 = free, >0 = paid), because an AXP-priced
 * skin that is missing its AXP price should simply not appear in the AXP
 * flow at all, rather than be treated as "free for 0 AXP".
 *
 * Seeded VRM 3D premium skins (6 clans, 3000–5000 AXP each) are backfilled
 * in the same migration from `manifest.axp_price` populated by the earlier
 * VRM seed SQL.
 *
 * Requirements: Task 13.3 P1-3 (2026-05-12)
 */
export class AddPriceAxpToPetSkins1790000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add the column — nullable INTEGER, NULL means "not AXP-purchasable".
    await queryRunner.query(
      `ALTER TABLE "pet_skins" ADD COLUMN IF NOT EXISTS "price_axp" integer NULL`,
    );

    // 2. Backfill from manifest.axp_price for the pre-seeded VRM skins.
    //    These rows were seeded by backend/src/seeds/seed-vrm-skins.sql with
    //    the AXP price stored in manifest.axp_price (int). Sync it into the
    //    dedicated column so the marketplace DTO can surface it cleanly.
    await queryRunner.query(`
      UPDATE "pet_skins"
         SET "price_axp" = ("manifest"->>'axp_price')::int
       WHERE "manifest" ? 'axp_price'
         AND ("manifest"->>'axp_price') ~ '^[0-9]+$'
    `);

    // 3. Helpful partial index for "AXP-priced only" queries.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pet_skins_price_axp" ON "pet_skins" ("price_axp") WHERE "price_axp" IS NOT NULL AND "price_axp" > 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_skins_price_axp"`);
    await queryRunner.query(`ALTER TABLE "pet_skins" DROP COLUMN IF EXISTS "price_axp"`);
  }
}
