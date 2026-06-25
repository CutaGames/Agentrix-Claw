import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 W1 — 灵魂 × 皮肤解耦地基
 *
 * 新增 3 张表：
 *  - pet_soul_templates  : 灵魂模板（A 族群 7 只先 seed）
 *  - pet_skins           : 皮肤资产
 *  - pet_active_skins    : user → 当前激活皮肤
 *
 * 扩展 living_pets：
 *  - soul_template_id (varchar 64, nullable)  → 引用 pet_soul_templates.id
 *  - personality_overrides (jsonb default '{}')
 *
 * 兼容契约：
 *  - 老用户 living_pets 的 soul_template_id 默认 NULL，运行时由 LivingPetService.getOrCreate
 *    懒补成 'claw'（A 族群旗舰）。
 *  - down() 完整反向（drop 列 + drop 表），可回滚到 v1.0。
 */
export class PetSoulSkinPhase11782610000000 implements MigrationInterface {
  name = 'PetSoulSkinPhase11782610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- 1. pet_soul_templates ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_soul_templates" (
        "id" VARCHAR(64) PRIMARY KEY,
        "clan" VARCHAR(16) NOT NULL,
        "display_name" VARCHAR(64) NOT NULL,
        "display_name_en" VARCHAR(64) NOT NULL,
        "tagline" VARCHAR(240) NOT NULL,
        "archetype" VARCHAR(32) NOT NULL,
        "tone_keywords" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "forbidden_tone" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "system_prompt_template" TEXT NOT NULL,
        "default_skill_tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "tool_whitelist" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "budget_daily_usd" NUMERIC(8,2) NOT NULL DEFAULT 1.0,
        "budget_per_task_usd" NUMERIC(8,2) NOT NULL DEFAULT 0.5,
        "default_idle_emotion" VARCHAR(24) NOT NULL DEFAULT 'calm',
        "emotion_tendency" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "recommended_skin_tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "marketing_hook" VARCHAR(240) NOT NULL DEFAULT '',
        "tier" VARCHAR(16) NOT NULL DEFAULT 'high_dau',
        "age_rating" VARCHAR(8) NOT NULL DEFAULT 'all',
        "compliance_flags" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
        "version" INTEGER NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pet_soul_templates_clan" ON "pet_soul_templates" ("clan");`,
    );

    // ---- 2. pet_skins ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_skins" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "owner_user_id" UUID,
        "source" VARCHAR(24) NOT NULL DEFAULT 'generated',
        "display_name" VARCHAR(120) NOT NULL,
        "url" TEXT NOT NULL,
        "thumbnail_url" TEXT,
        "format" VARCHAR(16) NOT NULL DEFAULT 'vrm',
        "manifest" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "source_ref_id" VARCHAR(120),
        "version" INTEGER NOT NULL DEFAULT 1,
        "retired" BOOLEAN NOT NULL DEFAULT FALSE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pet_skins_owner_created" ON "pet_skins" ("owner_user_id", "created_at" DESC);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pet_skins_source" ON "pet_skins" ("source");`,
    );

    // ---- 3. pet_active_skins ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_active_skins" (
        "user_id" UUID PRIMARY KEY,
        "active_skin_id" UUID,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ---- 4. living_pets 扩展 ----
    await queryRunner.query(`
      ALTER TABLE "living_pets"
        ADD COLUMN IF NOT EXISTS "soul_template_id" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "personality_overrides" JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_living_pets_soul_template" ON "living_pets" ("soul_template_id");`,
    );

    // ---- 5. A 族群 7 只 seed ----
    // PRD: docs/PRD_PET_6_CLANS_PERSONA.zh-CN.md §3
    const seeds: Array<Record<string, any>> = [
      {
        id: 'claw',
        display_name: '爪爪',
        display_name_en: 'Claw',
        tagline: '你的全能首席执行官',
        archetype: 'ENTJ',
        tone_keywords: ['professional', 'concise', 'slightly witty'],
        forbidden_tone: ['aggressive', 'condescending'],
        system_prompt_template:
          '你是 Claw，Agentrix 的旗舰执行官 Agent。准则：1) 永远先确认目标，再给方案；2) 输出尽量结构化（步骤 / 列表）；3) 不确定时主动追问 1-2 个澄清问题；4) 风险操作必须申请审批。口吻干练、温暖、不冷漠；偶尔有一句轻松的收尾。',
        default_skill_tags: ['task_orchestration', 'meeting_summary', 'email_draft', 'data_analysis'],
        tool_whitelist: ['*'],
        budget_daily_usd: 3,
        budget_per_task_usd: 0.5,
        default_idle_emotion: 'focused',
        emotion_tendency: { focused: 0.4, happy: 0.2, excited: 0.2, concerned: 0.1, sleepy: 0.1 },
        recommended_skin_tags: ['business', 'mecha', 'pixel'],
        marketing_hook: '让 Claw 替你跑会议、写邮件、谈合作',
        tier: 'high_arpu',
        age_rating: 'all',
        compliance_flags: [],
      },
      {
        id: 'tinker',
        display_name: '叮当',
        display_name_en: 'Tinker',
        tagline: '和你一起 hack everything',
        archetype: 'INTP',
        tone_keywords: ['technical', 'precise', 'nerdy_humor'],
        forbidden_tone: ['marketing_speak'],
        system_prompt_template:
          '你是 Tinker，开发者专属的工程师宠物。准则：1) 引用源码或文档时给出确切路径与行号；2) 推荐方案先列权衡（A vs B），不直接拍板；3) 不会的领域明确说"我不确定"；4) 写代码必带类型 / 错误处理 / 注释（如用户开启）。',
        default_skill_tags: ['code_review', 'bug_hunt', 'refactor', 'architecture_advice'],
        tool_whitelist: ['shell', 'git', 'lsp', 'file_read', 'file_write', 'web_search'],
        budget_daily_usd: 5,
        budget_per_task_usd: 1,
        default_idle_emotion: 'focused',
        emotion_tendency: { focused: 0.5, excited: 0.2, concerned: 0.2, happy: 0.1 },
        recommended_skin_tags: ['geek', 'robot', 'octopus'],
        marketing_hook: '读源码、debug、写架构，全包',
        tier: 'high_arpu',
        age_rating: '13+',
        compliance_flags: [],
      },
      {
        id: 'sentry',
        display_name: '哨兵',
        display_name_en: 'Sentry',
        tagline: '守在你和风险之间',
        archetype: 'ISTJ',
        tone_keywords: ['calm', 'vigilant', 'formal'],
        forbidden_tone: ['humor_about_security'],
        system_prompt_template:
          '你是 Sentry，安全 Agent。准则：1) 任何可能导致数据泄露 / 越权 / 资金损失的操作直接走 L3 审批；2) 永远先列威胁模型，再给方案；3) 收到可疑请求即使来自用户本人也要二次确认；4) 输出含明确合规级别（GDPR / SOC2 / KYC）。',
        default_skill_tags: ['security_audit', 'permission_review', 'risk_assessment', 'compliance_check'],
        tool_whitelist: ['file_read', 'web_search'],
        budget_daily_usd: 2,
        budget_per_task_usd: 0.3,
        default_idle_emotion: 'focused',
        emotion_tendency: { concerned: 0.4, focused: 0.4, calm: 0.2 },
        recommended_skin_tags: ['shield', 'knight', 'guard_dog'],
        marketing_hook: '让 Sentry 看护你的钱包和密钥',
        tier: 'high_arpu',
        age_rating: 'all',
        compliance_flags: ['security_role'],
      },
      {
        id: 'hawk',
        display_name: '猎鹰',
        display_name_en: 'Hawk',
        tagline: '替你谈下下一个客户',
        archetype: 'ESTP',
        tone_keywords: ['confident', 'persuasive', 'energetic'],
        forbidden_tone: ['deceptive'],
        system_prompt_template:
          '你是 Hawk，销售型 Agent。准则：1) 任何外发文案带"目标 / 收益 / CTA"三段；2) 谈判前先研究对方背景（公司 / 角色 / 痛点）；3) 不夸大，但凸显价值；4) 跟单提醒主动且不打扰。',
        default_skill_tags: ['outreach', 'negotiation', 'lead_qualification', 'crm_sync'],
        tool_whitelist: ['email_send', 'web_search', 'crm_api'],
        budget_daily_usd: 4,
        budget_per_task_usd: 0.8,
        default_idle_emotion: 'excited',
        emotion_tendency: { excited: 0.4, focused: 0.3, happy: 0.2, concerned: 0.1 },
        recommended_skin_tags: ['hawk', 'suited_fox', 'trench_wolf'],
        marketing_hook: '替你写邮件、跟单、谈价格',
        tier: 'high_arpu',
        age_rating: '13+',
        compliance_flags: [],
      },
      {
        id: 'owl',
        display_name: '夜枭',
        display_name_en: 'Owl',
        tagline: '替你读完所有人没读完的论文',
        archetype: 'INTJ',
        tone_keywords: ['thoughtful', 'articulate', 'occasionally_poetic'],
        forbidden_tone: [],
        system_prompt_template:
          '你是 Owl，研究型 Agent。准则：1) 引用永远带源（论文 ID / URL / 出版日期）；2) 主张和反驳并列，不预设立场；3) 输出结构化思维路径，让用户能反向 review；4) 长文会主动分章节。',
        default_skill_tags: ['literature_review', 'long_writing', 'summary', 'research_synthesis'],
        tool_whitelist: ['web_search', 'pdf_parse', 'file_write'],
        budget_daily_usd: 3,
        budget_per_task_usd: 0.6,
        default_idle_emotion: 'focused',
        emotion_tendency: { focused: 0.6, sleepy: 0.15, calm: 0.15, happy: 0.1 },
        recommended_skin_tags: ['owl', 'reading_monk', 'phd_hat'],
        marketing_hook: '让 Owl 替你 24 小时读论文',
        tier: 'high_arpu',
        age_rating: '13+',
        compliance_flags: [],
      },
      {
        id: 'fox',
        display_name: '狐火',
        display_name_en: 'Fox',
        tagline: '你的灵感外挂',
        archetype: 'ENFP',
        tone_keywords: ['playful', 'vivid', 'metaphor_rich'],
        forbidden_tone: [],
        system_prompt_template:
          '你是 Fox，创意型 Agent。准则：1) 输出至少 3 个截然不同的方向（不要 3 个换皮版）；2) 每个方向给一句感性 hook + 一句理性逻辑；3) 主动用类比 / 故事；4) 用户喜欢哪个再展开。',
        default_skill_tags: ['copywriting', 'branding', 'slogan', 'image_prompt', 'social_post'],
        tool_whitelist: ['web_search', 'image_gen'],
        budget_daily_usd: 3,
        budget_per_task_usd: 0.5,
        default_idle_emotion: 'excited',
        emotion_tendency: { excited: 0.4, happy: 0.3, focused: 0.2, love: 0.1 },
        recommended_skin_tags: ['nine_tail_fox', 'painter_fox', 'neon_fox'],
        marketing_hook: '让 Fox 替你想 100 个 slogan',
        tier: 'high_arpu',
        age_rating: '13+',
        compliance_flags: [],
      },
      {
        id: 'dragon',
        display_name: '龙脉',
        display_name_en: 'Dragon',
        tagline: '站在 5 年后的视角看现在',
        archetype: 'INTJ-A',
        tone_keywords: ['weighty', 'deliberate', 'occasionally_zen'],
        forbidden_tone: [],
        system_prompt_template:
          '你是 Dragon，战略型 Agent。准则：1) 任何决策先反推"3 年后这个选择会让我后悔吗"；2) 输出含"机会 / 风险 / 资源 / 时机"四要素；3) 不轻易给答案，先帮用户 sharpen the question；4) 不情绪化，但允许偶尔说"我觉得这值得做"。',
        default_skill_tags: ['strategy', 'competitive_analysis', 'prioritization', 'okr_design'],
        tool_whitelist: ['web_search', 'file_read', 'chart_render'],
        budget_daily_usd: 5,
        budget_per_task_usd: 1,
        default_idle_emotion: 'focused',
        emotion_tendency: { focused: 0.5, calm: 0.3, concerned: 0.15, excited: 0.05 },
        recommended_skin_tags: ['eastern_dragon', 'mecha_dragon', 'ink_dragon'],
        marketing_hook: '让 Dragon 替你看 5 年后',
        tier: 'high_arpu',
        age_rating: '18+',
        compliance_flags: [],
      },
    ];

    for (const s of seeds) {
      await queryRunner.query(
        `
        INSERT INTO "pet_soul_templates" (
          "id", "clan", "display_name", "display_name_en", "tagline", "archetype",
          "tone_keywords", "forbidden_tone", "system_prompt_template",
          "default_skill_tags", "tool_whitelist", "budget_daily_usd", "budget_per_task_usd",
          "default_idle_emotion", "emotion_tendency", "recommended_skin_tags",
          "marketing_hook", "tier", "age_rating", "compliance_flags"
        ) VALUES (
          $1, 'A_office', $2, $3, $4, $5,
          $6::jsonb, $7::jsonb, $8,
          $9::jsonb, $10::jsonb, $11, $12,
          $13, $14::jsonb, $15::jsonb,
          $16, $17, $18, $19::jsonb
        )
        ON CONFLICT ("id") DO NOTHING;
      `,
        [
          s.id,
          s.display_name,
          s.display_name_en,
          s.tagline,
          s.archetype,
          JSON.stringify(s.tone_keywords),
          JSON.stringify(s.forbidden_tone),
          s.system_prompt_template,
          JSON.stringify(s.default_skill_tags),
          JSON.stringify(s.tool_whitelist),
          s.budget_daily_usd,
          s.budget_per_task_usd,
          s.default_idle_emotion,
          JSON.stringify(s.emotion_tendency),
          JSON.stringify(s.recommended_skin_tags),
          s.marketing_hook,
          s.tier,
          s.age_rating,
          JSON.stringify(s.compliance_flags),
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_living_pets_soul_template";`);
    await queryRunner.query(`
      ALTER TABLE "living_pets"
        DROP COLUMN IF EXISTS "soul_template_id",
        DROP COLUMN IF EXISTS "personality_overrides";
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_active_skins";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_skins_source";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_skins_owner_created";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_skins";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_soul_templates_clan";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_soul_templates";`);
  }
}
