import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentTaskQueue1784300000000 implements MigrationInterface {
  name = 'CreateAgentTaskQueue1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(64) NOT NULL,
        agent_id VARCHAR(64),
        instance_id VARCHAR(64),
        title VARCHAR(200) NOT NULL,
        prompt TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'queued',
        progress INT NOT NULL DEFAULT -1,
        tier VARCHAR(16),
        cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        result_summary TEXT,
        error_message TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_id ON agent_tasks(user_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_id_created_at ON agent_tasks(user_id, created_at);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_created_at ON agent_tasks(status, created_at);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agent_task_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL,
        kind VARCHAR(32) NOT NULL,
        message TEXT NOT NULL,
        payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_agent_task_logs_task_id_created_at ON agent_task_logs(task_id, created_at);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS agent_task_logs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS agent_tasks;`);
  }
}
