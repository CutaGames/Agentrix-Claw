import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserFieldsAndNotification1763025405599 implements MigrationInterface {
    name = 'AddUserFieldsAndNotification1763025405599'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('payment', 'system', 'security', 'promotion')`);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "type" "public"."notifications_type_enum" NOT NULL DEFAULT 'system', "title" character varying NOT NULL, "message" text NOT NULL, "read" boolean NOT NULL DEFAULT false, "actionUrl" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "users" ADD "avatarUrl" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "nickname" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "bio" text`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_692a909ee0fa9383e7859f9b406" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_692a909ee0fa9383e7859f9b406"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "bio"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "nickname"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatarUrl"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
    }

}
