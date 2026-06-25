import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUCPFieldsToSkills1773000000000 implements MigrationInterface {
  name = 'AddUCPFieldsToSkills1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add UCP compatibility fields
    await queryRunner.addColumn(
      'skills',
      new TableColumn({
        name: 'ucpEnabled',
        type: 'boolean',
        default: true,
      }),
    );

    await queryRunner.addColumn(
      'skills',
      new TableColumn({
        name: 'ucpCheckoutEndpoint',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    );

    // Add X402 compatibility fields
    await queryRunner.addColumn(
      'skills',
      new TableColumn({
        name: 'x402Enabled',
        type: 'boolean',
        default: false,
      }),
    );

    await queryRunner.addColumn(
      'skills',
      new TableColumn({
        name: 'x402ServiceEndpoint',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('skills', 'x402ServiceEndpoint');
    await queryRunner.dropColumn('skills', 'x402Enabled');
    await queryRunner.dropColumn('skills', 'ucpCheckoutEndpoint');
    await queryRunner.dropColumn('skills', 'ucpEnabled');
  }
}
