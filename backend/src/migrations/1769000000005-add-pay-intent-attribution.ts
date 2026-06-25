import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayIntentAttribution1769000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if attribution column exists
    const table = await queryRunner.getTable('pay_intents');
    const attributionColumn = table?.findColumnByName('attribution');

    if (!attributionColumn) {
      await queryRunner.query(`
        ALTER TABLE "pay_intents" 
        ADD COLUMN "attribution" jsonb
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pay_intents" DROP COLUMN IF EXISTS "attribution"
    `);
  }
}
