import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * aeon_plots.poi(真实商家入驻 POI 绑定)。
 * jsonb { name, category, externalPoiId, merchantUserId, verified, storeUrl, address }。
 */
export class AeonPlotPoi_1800800000000 implements MigrationInterface {
  name = 'AeonPlotPoi_1800800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.hasColumn('aeon_plots', 'poi');
    if (!has) {
      await queryRunner.query(`ALTER TABLE "aeon_plots" ADD COLUMN "poi" jsonb`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.hasColumn('aeon_plots', 'poi');
    if (has) {
      await queryRunner.query(`ALTER TABLE "aeon_plots" DROP COLUMN "poi"`);
    }
  }
}
