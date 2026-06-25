import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Aeon(永曜城)Phase 3 — 价值闭环表(spec: .kiro/specs/agentrix-world)。
 *
 * 新建:
 *   - aeon_orgs:组织/虚拟公司(R6)
 *   - aeon_org_members:组织成员(owner/human_member/agent_employee,R6/R8)
 *   - aeon_task_contracts:统一任务/契约(plaza/bounty/kpi,R7/R9)
 *   - aeon_ledger_entries:经济账本分录(append-only,守恒可审计,R11.2/R19.4)
 * 列名遵循 SnakeNamingStrategy。
 */
export class AeonWorldPhase3_1800100000000 implements MigrationInterface {
  name = 'AeonWorldPhase3_1800100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── aeon_orgs ───────────────────────────────────────────────
    if (!(await queryRunner.hasTable('aeon_orgs'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_orgs',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'owner_user_id', type: 'uuid', isNullable: false },
            { name: 'name', type: 'varchar', length: '64', isNullable: false },
            { name: 'kind', type: 'varchar', length: '16', default: `'company'`, isNullable: false },
            { name: 'epoch', type: 'varchar', length: '16', default: `'earth'`, isNullable: false },
            { name: 'room_id', type: 'uuid', isNullable: true },
            { name: 'axp_ledger_balance', type: 'bigint', default: 0, isNullable: false },
            { name: 'storefront', type: 'jsonb', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
            { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_orgs_owner" ON "aeon_orgs" ("owner_user_id")`,
      );
    }

    // ── aeon_org_members ────────────────────────────────────────
    if (!(await queryRunner.hasTable('aeon_org_members'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_org_members',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'org_id', type: 'uuid', isNullable: false },
            { name: 'member_user_id', type: 'uuid', isNullable: false },
            { name: 'agent_instance_id', type: 'uuid', isNullable: true },
            { name: 'role', type: 'varchar', length: '24', default: `'agent_employee'`, isNullable: false },
            { name: 'schedule', type: 'jsonb', isNullable: true },
            { name: 'wage_axp_per_period', type: 'integer', default: 0, isNullable: false },
            { name: 'status', type: 'varchar', length: '16', default: `'active'`, isNullable: false },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
            { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_org_members_org" ON "aeon_org_members" ("org_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_org_members_user" ON "aeon_org_members" ("member_user_id")`,
      );
    }

    // ── aeon_task_contracts ─────────────────────────────────────
    if (!(await queryRunner.hasTable('aeon_task_contracts'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_task_contracts',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'org_id', type: 'uuid', isNullable: true },
            { name: 'initiator_user_id', type: 'uuid', isNullable: false },
            { name: 'acceptor_user_id', type: 'uuid', isNullable: true },
            { name: 'acceptor_agent_instance_id', type: 'uuid', isNullable: true },
            { name: 'kind', type: 'varchar', length: '16', default: `'plaza'`, isNullable: false },
            { name: 'state', type: 'varchar', length: '24', default: `'open'`, isNullable: false },
            { name: 'title', type: 'varchar', length: '120', isNullable: false },
            { name: 'description', type: 'text', isNullable: true },
            { name: 'acceptance_criteria', type: 'jsonb', isNullable: true },
            { name: 'reward_amount', type: 'integer', default: 0, isNullable: false },
            { name: 'reward_currency', type: 'varchar', length: '16', default: `'AXP'`, isNullable: false },
            { name: 'deadline_at', type: 'bigint', isNullable: true },
            { name: 'escrowed', type: 'boolean', default: false, isNullable: false },
            { name: 'milestones', type: 'jsonb', isNullable: true },
            { name: 'rejection_reason', type: 'varchar', length: '280', isNullable: true },
            { name: 'deliverable', type: 'jsonb', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
            { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_tasks_org" ON "aeon_task_contracts" ("org_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_tasks_initiator" ON "aeon_task_contracts" ("initiator_user_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_tasks_state" ON "aeon_task_contracts" ("state")`,
      );
    }

    // ── aeon_ledger_entries ─────────────────────────────────────
    if (!(await queryRunner.hasTable('aeon_ledger_entries'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_ledger_entries',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'org_id', type: 'uuid', isNullable: true },
            { name: 'payer_user_id', type: 'uuid', isNullable: false },
            { name: 'payee_user_id', type: 'uuid', isNullable: false },
            { name: 'amount', type: 'bigint', isNullable: false },
            { name: 'currency', type: 'varchar', length: '16', default: `'AXP'`, isNullable: false },
            { name: 'reason', type: 'varchar', length: '24', isNullable: false },
            { name: 'ref_id', type: 'uuid', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_ledger_org" ON "aeon_ledger_entries" ("org_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_ledger_payer" ON "aeon_ledger_entries" ("payer_user_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_ledger_payee" ON "aeon_ledger_entries" ("payee_user_id")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('aeon_ledger_entries')) await queryRunner.dropTable('aeon_ledger_entries');
    if (await queryRunner.hasTable('aeon_task_contracts')) await queryRunner.dropTable('aeon_task_contracts');
    if (await queryRunner.hasTable('aeon_org_members')) await queryRunner.dropTable('aeon_org_members');
    if (await queryRunner.hasTable('aeon_orgs')) await queryRunner.dropTable('aeon_orgs');
  }
}
