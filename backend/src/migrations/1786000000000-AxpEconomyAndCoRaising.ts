import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 Sprint B/C backend prerequisite.
 *
 * Creates 6 tables:
 *   - user_axp_ledger        — AXP earn/spend/expire trail (§4)
 *   - user_axp_balances      — Running balance snapshot (§4)
 *   - user_subscriptions     — Subscription tier + Stripe state (§3)
 *   - pet_coraising_invites  — Co-Raising (共养) invites (§6.1)
 *   - pet_coraising_feeds    — Co-Raising feed events (§6.1)
 *   - pet_greeting_cards     — Greeting Card records (§6.2)
 *
 * All writes idempotent (IF NOT EXISTS). Down drops in reverse order.
 */
export class AxpEconomyAndCoRaising1786000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── user_axp_ledger ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_axp_ledger" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "direction" varchar(16) NOT NULL,
        "amount" bigint NOT NULL,
        "source" varchar(48) NOT NULL,
        "ref_id" varchar(96),
        "note" varchar(200),
        "expires_at" timestamptz,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_axp_ledger_user_created" ON "user_axp_ledger" ("user_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_axp_ledger_user_source" ON "user_axp_ledger" ("user_id", "source")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_axp_ledger_expires" ON "user_axp_ledger" ("expires_at")`);

    // ── user_axp_balances ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_axp_balances" (
        "user_id" uuid PRIMARY KEY,
        "balance" bigint NOT NULL DEFAULT 0,
        "lifetime_earned" bigint NOT NULL DEFAULT 0,
        "lifetime_spent" bigint NOT NULL DEFAULT 0,
        "lifetime_expired" bigint NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // ── user_subscriptions ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_subscriptions" (
        "user_id" uuid PRIMARY KEY,
        "tier" varchar(16) NOT NULL DEFAULT 'free',
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "currency" varchar(8) NOT NULL DEFAULT 'USD',
        "price_cents" int NOT NULL DEFAULT 0,
        "billing_cycle" varchar(16) NOT NULL DEFAULT 'monthly',
        "stripe_customer_id" varchar(128),
        "stripe_subscription_id" varchar(128),
        "stripe_price_id" varchar(128),
        "current_period_start" timestamptz,
        "current_period_end" timestamptz,
        "cancelled_at" timestamptz,
        "cancel_at_period_end" boolean NOT NULL DEFAULT false,
        "axp_applied_current" int NOT NULL DEFAULT 0,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_tier" ON "user_subscriptions" ("tier")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_stripe_sub" ON "user_subscriptions" ("stripe_subscription_id")`);

    // ── pet_coraising_invites ──────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_coraising_invites" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "inviter_id" uuid NOT NULL,
        "agent_account_id" uuid NOT NULL,
        "token" varchar(32) NOT NULL,
        "split_bps" int NOT NULL DEFAULT 500,
        "max_feeders" int NOT NULL DEFAULT 0,
        "feeders_count" int NOT NULL DEFAULT 0,
        "total_feeds" int NOT NULL DEFAULT 0,
        "expires_at" timestamptz,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pet_coraising_invites_token" ON "pet_coraising_invites" ("token")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pet_coraising_invites_inviter" ON "pet_coraising_invites" ("inviter_id", "created_at")`);

    // ── pet_coraising_feeds ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_coraising_feeds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "invite_id" uuid NOT NULL,
        "feeder_id" uuid,
        "kind" varchar(16) NOT NULL DEFAULT 'feed',
        "energy" int NOT NULL DEFAULT 2,
        "axp_awarded" int NOT NULL DEFAULT 5,
        "feed_date" date NOT NULL,
        "client_hash" varchar(64),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pet_coraising_feeds_invite_created" ON "pet_coraising_feeds" ("invite_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pet_coraising_feeds_feeder_created" ON "pet_coraising_feeds" ("feeder_id", "created_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pet_coraising_feeds_unique_daily" ON "pet_coraising_feeds" ("invite_id", "feeder_id", "feed_date") WHERE "feeder_id" IS NOT NULL`);

    // ── pet_greeting_cards ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_greeting_cards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sender_id" uuid NOT NULL,
        "sender_pet_id" uuid NOT NULL,
        "receiver_id" uuid,
        "receiver_hint" varchar(64),
        "token" varchar(32) NOT NULL,
        "template" varchar(32) NOT NULL,
        "message" varchar(500),
        "axp_cost" int NOT NULL DEFAULT 0,
        "axp_reward" int NOT NULL DEFAULT 20,
        "status" varchar(16) NOT NULL DEFAULT 'sent',
        "opened_at" timestamptz,
        "redeemed_at" timestamptz,
        "reply_card_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pet_greeting_cards_token" ON "pet_greeting_cards" ("token")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pet_greeting_cards_sender_created" ON "pet_greeting_cards" ("sender_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pet_greeting_cards_receiver_created" ON "pet_greeting_cards" ("receiver_id", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_greeting_cards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_coraising_feeds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_coraising_invites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_axp_balances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_axp_ledger"`);
  }
}
