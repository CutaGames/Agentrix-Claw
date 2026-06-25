import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * 连接器 OAuth 令牌(加密存储)— connector_oauth_tokens。
 *
 * access_token_enc / refresh_token_enc 为 AES-256-GCM 密文(见 TokenCipher);
 * (user_id, connector_id) 唯一 → 每用户每连接器一行,重复授权幂等更新。
 * 列名遵循 SnakeNamingStrategy。
 */
export class CreateConnectorOAuthTokens_1800900000000 implements MigrationInterface {
  name = 'CreateConnectorOAuthTokens_1800900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('connector_oauth_tokens'))) {
      await queryRunner.createTable(
        new Table({
          name: 'connector_oauth_tokens',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'user_id', type: 'uuid', isNullable: false },
            { name: 'connector_id', type: 'varchar', length: '64', isNullable: false },
            { name: 'access_token_enc', type: 'text', isNullable: false },
            { name: 'refresh_token_enc', type: 'text', isNullable: true },
            { name: 'expires_at', type: 'timestamptz', isNullable: true },
            { name: 'scope', type: 'text', isNullable: true },
            { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
            { name: 'updated_at', type: 'timestamptz', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "uq_connector_oauth_tokens_user_connector" ON "connector_oauth_tokens" ("user_id","connector_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_connector_oauth_tokens_user" ON "connector_oauth_tokens" ("user_id")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_connector_oauth_tokens_user_connector"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_connector_oauth_tokens_user"`);
    await queryRunner.dropTable('connector_oauth_tokens', true);
  }
}
