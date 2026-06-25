import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImageUrlsToSkills1765600100000 implements MigrationInterface {
  name = 'AddImageUrlsToSkills1765600100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if imageUrl column exists
    const imageUrlExists = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'skills' AND column_name = 'imageUrl'
    `);
    
    if (imageUrlExists.length === 0) {
      await queryRunner.query(`ALTER TABLE "skills" ADD "imageUrl" varchar(500)`);
    }

    // Check if thumbnailUrl column exists
    const thumbnailUrlExists = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'skills' AND column_name = 'thumbnailUrl'
    `);
    
    if (thumbnailUrlExists.length === 0) {
      await queryRunner.query(`ALTER TABLE "skills" ADD "thumbnailUrl" varchar(500)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN IF EXISTS "imageUrl"`);
    await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN IF EXISTS "thumbnailUrl"`);
  }
}
