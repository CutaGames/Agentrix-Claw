import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-Agent Collaboration v1 Wave 3 — schema part 2 (pet bridge).
 *
 * Spec: `multi-agent-collaboration-2026-06`
 * See: design.md §2.2 新增 6, §11.1, tasks.md W3.1
 *
 * Adds:
 *   - living_pets.bound_agent_account_id (varchar 64, nullable, FK)
 *     — when set, the pet acts as a member in the user's AgentTeam,
 *       running sub-tasks delegated to it. Soft-delete-friendly: NULL
 *       means the LivingPet is companion-only.
 *   - pet_team_members.bound_agent_account_id (varchar 64, nullable, FK)
 *     — same semantics on the team member row, denormalized for fast
 *       selectMember lookups (avoids a join through living_pets).
 *
 * All additive + nullable. Existing rows unaffected.
 */
export class MultiAgentSchemaPart21797000001000 implements MigrationInterface {
  name = 'MultiAgentSchemaPart21797000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. living_pets.bound_agent_account_id
    await queryRunner.query(`
      ALTER TABLE living_pets
      ADD COLUMN IF NOT EXISTS bound_agent_account_id varchar(64) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_living_pets_bound_agent
      ON living_pets (bound_agent_account_id)
    `);

    // No FK to agent_accounts — `agent_accounts.id` is uuid but our
    // column is varchar(64) for mixed-id codepath compat. Application
    // layer (agent-team.service.bindLivingPets / unbindLivingPet)
    // enforces existence + soft-delete semantics.

    // 2. pet_team_members.bound_agent_account_id (denormalized for selectMember)
    await queryRunner.query(`
      ALTER TABLE pet_team_members
      ADD COLUMN IF NOT EXISTS bound_agent_account_id varchar(64) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pet_team_members_bound_agent
      ON pet_team_members (bound_agent_account_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pet_team_members_bound_agent`);
    await queryRunner.query(`
      ALTER TABLE pet_team_members DROP COLUMN IF EXISTS bound_agent_account_id
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_living_pets_bound_agent`);
    await queryRunner.query(`
      ALTER TABLE living_pets DROP COLUMN IF EXISTS bound_agent_account_id
    `);
  }
}
