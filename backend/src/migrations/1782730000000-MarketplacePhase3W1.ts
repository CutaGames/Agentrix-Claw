import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 W1 — Marketplace MVP.
 * Adds PetSkin remix royalty fields + 3 marketplace tables.
 */
export class MarketplacePhase3W11782730000000 implements MigrationInterface {
  name = 'MarketplacePhase3W11782730000000';

  public async up(q: QueryRunner): Promise<void> {
    // 1. PetSkin: parentSkinId / royaltyRateBps / originalCreatorUserId
    await q.query(
      `ALTER TABLE "pet_skins" ADD COLUMN IF NOT EXISTS "parent_skin_id" uuid`,
    );
    await q.query(
      `ALTER TABLE "pet_skins" ADD COLUMN IF NOT EXISTS "royalty_rate_bps" integer NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE "pet_skins" ADD COLUMN IF NOT EXISTS "original_creator_user_id" uuid`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_skins_parent" ON "pet_skins" ("parent_skin_id")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_skins_creator" ON "pet_skins" ("original_creator_user_id")`,
    );

    // 2. marketplace_pet_listings
    await q.query(`
      CREATE TABLE IF NOT EXISTS "marketplace_pet_listings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "pet_skin_id" uuid NOT NULL,
        "seller_user_id" uuid NOT NULL,
        "mode" varchar(16) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'draft',
        "price_usd" numeric(12,2),
        "starting_bid_usd" numeric(12,2),
        "min_bid_increment_usd" numeric(8,2) NOT NULL DEFAULT 1.00,
        "reserve_price_usd" numeric(12,2),
        "auction_ends_at" timestamptz,
        "rental_price_per_day_usd" numeric(8,2),
        "rental_duration_days" integer,
        "royalty_rate_bps" integer NOT NULL DEFAULT 0,
        "description" text,
        "active_until" timestamptz,
        "buyer_user_id" uuid,
        "final_price_usd" numeric(12,2),
        "sold_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_marketplace_pet_listings" PRIMARY KEY ("id")
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_mpl_skin" ON "marketplace_pet_listings" ("pet_skin_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_mpl_seller_status" ON "marketplace_pet_listings" ("seller_user_id", "status")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_mpl_status_mode" ON "marketplace_pet_listings" ("status", "mode")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_mpl_active_until" ON "marketplace_pet_listings" ("active_until")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_mpl_auction_ends" ON "marketplace_pet_listings" ("auction_ends_at") WHERE "mode" = 'auction'`);

    // 3. pet_auction_bids
    await q.query(`
      CREATE TABLE IF NOT EXISTS "pet_auction_bids" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "bidder_user_id" uuid NOT NULL,
        "amount_usd" numeric(12,2) NOT NULL,
        "is_leading" boolean NOT NULL DEFAULT false,
        "refunded_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pet_auction_bids" PRIMARY KEY ("id")
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_pab_listing_amount" ON "pet_auction_bids" ("listing_id", "amount_usd")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_pab_bidder" ON "pet_auction_bids" ("bidder_user_id")`);

    // 4. pet_rental_leases
    await q.query(`
      CREATE TABLE IF NOT EXISTS "pet_rental_leases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "pet_skin_id" uuid NOT NULL,
        "renter_user_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "duration_days" integer NOT NULL,
        "total_paid_usd" numeric(12,2) NOT NULL,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "returned_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pet_rental_leases" PRIMARY KEY ("id")
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_prl_listing" ON "pet_rental_leases" ("listing_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_prl_renter_status" ON "pet_rental_leases" ("renter_user_id", "status")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_prl_ends_at_status" ON "pet_rental_leases" ("ends_at", "status")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "pet_rental_leases"`);
    await q.query(`DROP TABLE IF EXISTS "pet_auction_bids"`);
    await q.query(`DROP TABLE IF EXISTS "marketplace_pet_listings"`);
    await q.query(`ALTER TABLE "pet_skins" DROP COLUMN IF EXISTS "original_creator_user_id"`);
    await q.query(`ALTER TABLE "pet_skins" DROP COLUMN IF EXISTS "royalty_rate_bps"`);
    await q.query(`ALTER TABLE "pet_skins" DROP COLUMN IF EXISTS "parent_skin_id"`);
  }
}
