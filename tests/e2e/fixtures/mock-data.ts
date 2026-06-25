/**
 * Shared mock data for E2E tests across all platforms.
 * Provides consistent test fixtures for API mocking.
 */

// ─── User & Auth ────────────────────────────────────────────────────────────

export const TEST_USER = {
  id: 'e2e-user-001',
  email: 'e2e-test@agentrix.top',
  nickname: 'E2E Tester',
  avatar: 'https://api.agentrix.top/static/default-avatar.png',
  plan: 'pro' as const,
  roles: ['user'],
  token: 'e2e-mock-jwt-token-2026',
};

export const TEST_TOKEN = 'e2e-mock-jwt-token-2026';

// ─── Pet State ──────────────────────────────────────────────────────────────

export const MOCK_PET_STATE = {
  pet_id: 'e2e-pet-001',
  user_id: TEST_USER.id,
  emotion: 'happy',
  emotion_intensity: 2,
  emotion_since: Date.now(),
  emotion_decay_at: Date.now() + 60_000,
  intimacy_level: 4,
  intimacy_xp: 180,
  recent_memory_snippets: ['你好！我是你的宠物'],
  unlocked_soul_template_ids: ['claw', 'tinker', 'sentry'],
  primary_agent_id: 'e2e-agent-001',
  engine_switching: false,
  soul_template_id: 'claw',
  active_skin_id: 'skin-default-001',
  updated_at: Date.now(),
};

// ─── Souls ──────────────────────────────────────────────────────────────────

export const MOCK_SOULS = [
  { id: 'claw', clan: 'A_office', display_name: '爪爪', display_name_en: 'Claw', tagline: '默认主宠', archetype: 'ENFP', default_idle_emotion: 'calm', tier: 'free', age_rating: 'all', required_plan: 'free' },
  { id: 'tinker', clan: 'A_office', display_name: '叮当', display_name_en: 'Tinker', tagline: '工坊搭子', archetype: 'ISTP', default_idle_emotion: 'focused', tier: 'high_arpu', age_rating: 'all', required_plan: 'pro' },
  { id: 'sentry', clan: 'A_office', display_name: '哨兵', display_name_en: 'Sentry', tagline: '守序执行', archetype: 'ISTJ', default_idle_emotion: 'calm', tier: 'high_arpu', age_rating: 'all', required_plan: 'pro' },
  { id: 'owl', clan: 'A_office', display_name: '夜枭', display_name_en: 'Owl', tagline: '深夜研究员', archetype: 'INTJ', default_idle_emotion: 'focused', tier: 'high_arpu', age_rating: '13+', required_plan: 'pro' },
  { id: 'bloom', clan: 'B_nature', display_name: '花灵', display_name_en: 'Bloom', tagline: '自然守护', archetype: 'INFP', default_idle_emotion: 'calm', tier: 'high_arpu', age_rating: 'all', required_plan: 'pro' },
  { id: 'spark', clan: 'C_tech', display_name: '火花', display_name_en: 'Spark', tagline: '科技先锋', archetype: 'ENTP', default_idle_emotion: 'excited', tier: 'high_arpu', age_rating: 'all', required_plan: 'pro' },
];

// ─── Skins ──────────────────────────────────────────────────────────────────

export const MOCK_SKINS = [
  { id: 'skin-001', name: '默认皮肤', name_en: 'Default Skin', preview_url: '/skins/default.png', price_axp: 0, rarity: 'common', soul_clan: 'A_office', is_equipped: true },
  { id: 'skin-002', name: '星空猫', name_en: 'Starry Cat', preview_url: '/skins/starry-cat.png', price_axp: 500, rarity: 'rare', soul_clan: 'A_office', is_equipped: false },
  { id: 'skin-003', name: '机械龙', name_en: 'Mech Dragon', preview_url: '/skins/mech-dragon.png', price_axp: 1200, rarity: 'epic', soul_clan: 'C_tech', is_equipped: false },
  { id: 'skin-004', name: '樱花兔', name_en: 'Sakura Bunny', preview_url: '/skins/sakura-bunny.png', price_axp: 800, rarity: 'rare', soul_clan: 'B_nature', is_equipped: false },
];

// ─── AXP ────────────────────────────────────────────────────────────────────

export const MOCK_AXP_BALANCE = {
  balance: 2450,
  total_earned: 8900,
  total_spent: 6450,
  expiring_soon: 200,
  expiring_date: '2026-06-12',
  tier: 'pro',
  daily_earn_cap: 100,
  today_earned: 40,
};

export const MOCK_AXP_TRANSACTIONS = [
  { id: 'tx-001', type: 'earn', amount: 20, source: 'daily_checkin', created_at: '2026-05-12T08:00:00Z', description: '每日签到' },
  { id: 'tx-002', type: 'earn', amount: 30, source: 'exercise_goal', created_at: '2026-05-12T07:30:00Z', description: '运动目标达成' },
  { id: 'tx-003', type: 'spend', amount: -500, source: 'skin_purchase', created_at: '2026-05-11T15:00:00Z', description: '购买皮肤: 星空猫' },
  { id: 'tx-004', type: 'earn', amount: 50, source: 'chat_milestone', created_at: '2026-05-11T12:00:00Z', description: '对话里程碑 (100轮)' },
];

export const MOCK_AXP_REDEEM_CATALOG = [
  { id: 'redeem-001', name: '订阅折扣券 10%', cost_axp: 500, category: 'subscription', stock: 99, description: '下次订阅续费享 10% 折扣' },
  { id: 'redeem-002', name: 'LLM 配额加购 (50次)', cost_axp: 300, category: 'quota', stock: 999, description: '额外 50 次 LLM 调用' },
  { id: 'redeem-003', name: '技能市场置顶 24h', cost_axp: 200, category: 'boost', stock: 50, description: '你的技能在市场置顶展示 24 小时' },
  { id: 'redeem-004', name: '限定皮肤抽奖券', cost_axp: 100, category: 'lottery', stock: 500, description: '参与限定皮肤抽奖' },
];

// ─── Subscription ───────────────────────────────────────────────────────────

export const MOCK_SUBSCRIPTION_TIERS = [
  { id: 'free', name: 'Free', price_monthly: 0, llm_calls: 30, pet_slots: 1, skin_slots: 3, axp_multiplier: 1 },
  { id: 'lite', name: 'Lite', price_monthly: 4.99, llm_calls: 200, pet_slots: 2, skin_slots: 10, axp_multiplier: 1.5 },
  { id: 'plus', name: 'Plus', price_monthly: 9.99, llm_calls: 500, pet_slots: 3, skin_slots: 30, axp_multiplier: 2 },
  { id: 'pro', name: 'Pro', price_monthly: 19.99, llm_calls: 2000, pet_slots: 5, skin_slots: 100, axp_multiplier: 3 },
  { id: 'elite', name: 'Elite', price_monthly: 49.99, llm_calls: -1, pet_slots: -1, skin_slots: -1, axp_multiplier: 5 },
];

// ─── Marketplace ────────────────────────────────────────────────────────────

export const MOCK_MARKET_SKINS = [
  { id: 'market-skin-001', name: '赛博朋克猫', creator: 'artist_001', price_axp: 1500, sales: 42, rating: 4.8, preview_url: '/market/cyber-cat.png' },
  { id: 'market-skin-002', name: '水墨山水龙', creator: 'artist_002', price_axp: 2000, sales: 28, rating: 4.9, preview_url: '/market/ink-dragon.png' },
  { id: 'market-skin-003', name: '像素复古兔', creator: 'artist_003', price_axp: 800, sales: 156, rating: 4.5, preview_url: '/market/pixel-bunny.png' },
];

export const MOCK_MARKET_SKILLS = [
  { id: 'skill-001', name: '代码审查助手', creator: 'dev_001', price_axp: 200, installs: 1200, rating: 4.7, category: 'development' },
  { id: 'skill-002', name: '日程管理', creator: 'dev_002', price_axp: 0, installs: 5600, rating: 4.3, category: 'productivity' },
  { id: 'skill-003', name: '翻译大师', creator: 'dev_003', price_axp: 100, installs: 3400, rating: 4.6, category: 'language' },
];

// ─── Chat ───────────────────────────────────────────────────────────────────

export const MOCK_CHAT_RESPONSE = {
  id: 'msg-e2e-001',
  role: 'assistant',
  content: '你好！我是你的 AI 宠物助手。有什么我可以帮你的吗？',
  model: 'claude-sonnet-4-20250514',
  tokens_used: 42,
  created_at: Date.now(),
};

// ─── Devices (Toy/Watch) ────────────────────────────────────────────────────

export const MOCK_DEVICES = [
  { id: 'device-001', name: 'AGX-Claw-Mini', type: 'toy', firmware: '1.2.0', battery: 85, last_seen: Date.now() - 60000, status: 'online' },
  { id: 'device-002', name: 'Agentrix Watch', type: 'watch', firmware: '2.0.1', battery: 72, last_seen: Date.now() - 120000, status: 'online' },
];

// ─── Checkin ────────────────────────────────────────────────────────────────

export const MOCK_CHECKIN_STATUS = {
  checked_in_today: false,
  streak: 5,
  reward_axp: 20,
  bonus_axp: 0, // streak bonus at 7 days
  next_bonus_at_streak: 7,
};

export const MOCK_CHECKIN_RESULT = {
  success: true,
  axp_earned: 20,
  new_balance: 2470,
  streak: 6,
  message: '签到成功！连续签到 6 天',
};

// ─── Co-Raising ─────────────────────────────────────────────────────────────

export const MOCK_CORAISING_INVITE = {
  token: 'coraising-e2e-token-001',
  pet_id: 'e2e-pet-001',
  pet_name: '爪爪',
  inviter_name: 'E2E Tester',
  split_ratio: 50,
  expires_at: '2026-05-19T00:00:00Z',
};

// ─── Greeting Card ──────────────────────────────────────────────────────────

export const MOCK_GREETING_TEMPLATES = [
  { id: 'tpl-001', name: '生日快乐', preview_url: '/greeting/birthday.png', cost_axp: 10 },
  { id: 'tpl-002', name: '节日祝福', preview_url: '/greeting/holiday.png', cost_axp: 10 },
  { id: 'tpl-003', name: '感谢有你', preview_url: '/greeting/thanks.png', cost_axp: 15 },
];
