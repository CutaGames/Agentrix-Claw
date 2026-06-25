import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateDeviceSession1743897600000 implements MigrationInterface {
  name = 'CreateDeviceSession1743897600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'device_sessions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'session_id', type: 'varchar', length: '100', isNullable: false },
          { name: 'device_id', type: 'varchar', length: '100', isNullable: false },
          { name: 'device_type', type: 'varchar', length: '20', isNullable: false },
          { name: 'is_primary', type: 'boolean', default: false },
          { name: 'capabilities', type: 'jsonb', default: "'{}'" },
          { name: 'socket_id', type: 'varchar', length: '200', isNullable: true },
          { name: 'last_active_at', type: 'timestamptz', default: 'NOW()' },
          { name: 'created_at', type: 'timestamptz', default: 'NOW()' },
          { name: 'updated_at', type: 'timestamptz', default: 'NOW()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('device_sessions', new TableIndex({ columnNames: ['user_id', 'session_id'] }));
    await queryRunner.createIndex('device_sessions', new TableIndex({ columnNames: ['user_id', 'device_id'], isUnique: true }));
    await queryRunner.createIndex('device_sessions', new TableIndex({ columnNames: ['session_id', 'is_primary'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('device_sessions', true);
  }
}
