"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IBATTLE_MAX_ROUNDS = exports.IBATTLE_DEFEND_REFLECT = exports.IBATTLE_DEFEND_REDUCTION = exports.IBATTLE_CHARGE_DMG_BONUS = exports.IBATTLE_CHARGE_MAX = exports.IBATTLE_CHARGE_GAIN = exports.IBATTLE_ATTACK_COST = exports.IBATTLE_ENERGY_REGEN = exports.IBATTLE_ENERGY_MAX = exports.IBATTLE_ENERGY_START = exports.WORLD_WORK_AXP_BASE_MAX = exports.WORLD_WORK_AXP_BASE_MIN = exports.WORLD_MAX_CATCHUP_TICKS = exports.WORLD_TICK_BUCKET_MS = exports.ABILITY_TIER_BONUS = exports.ABILITY_BONUS_CAPS = exports.ABILITY_MULTIPLIER_MAX = exports.ABILITY_MULTIPLIER_MIN = exports.DUNGEON_CODE_VALIDITY_DAYS = exports.CRIT_SPD_DIVISOR = exports.CRIT_BASE_CHANCE = exports.BATTLE_CHALLENGE_EXPIRY_HOURS = exports.BATTLE_MAX_ROUNDS = exports.STAT_SUM_MAX = exports.STAT_SUM_MIN = exports.STAT_MAX = exports.STAT_MIN = exports.MIN_STARTER_SKILLS = exports.MAX_STARTER_SKILLS = exports.MAX_GROWTH_SKILL_SLOTS = exports.XP_SKILL_SLOT_THRESHOLDS = void 0;
exports.XP_SKILL_SLOT_THRESHOLDS = [100, 500, 1500, 5000];
exports.MAX_GROWTH_SKILL_SLOTS = 4;
exports.MAX_STARTER_SKILLS = 4;
exports.MIN_STARTER_SKILLS = 2;
exports.STAT_MIN = 1;
exports.STAT_MAX = 100;
exports.STAT_SUM_MIN = 150;
exports.STAT_SUM_MAX = 350;
exports.BATTLE_MAX_ROUNDS = 20;
exports.BATTLE_CHALLENGE_EXPIRY_HOURS = 72;
exports.CRIT_BASE_CHANCE = 0.10;
exports.CRIT_SPD_DIVISOR = 1000;
exports.DUNGEON_CODE_VALIDITY_DAYS = 30;
exports.ABILITY_MULTIPLIER_MIN = 1.0;
exports.ABILITY_MULTIPLIER_MAX = 2.2;
exports.ABILITY_BONUS_CAPS = {
    tasks: 0.5,
    quality: 0.15,
    tier: 0.4,
    intimacy: 0.2,
};
exports.ABILITY_TIER_BONUS = {
    bronze: 0.0,
    silver: 0.1,
    gold: 0.2,
    platinum: 0.3,
    diamond: 0.4,
};
exports.WORLD_TICK_BUCKET_MS = 30 * 60 * 1000;
exports.WORLD_MAX_CATCHUP_TICKS = 8;
exports.WORLD_WORK_AXP_BASE_MIN = 5;
exports.WORLD_WORK_AXP_BASE_MAX = 40;
exports.IBATTLE_ENERGY_START = 1;
exports.IBATTLE_ENERGY_MAX = 3;
exports.IBATTLE_ENERGY_REGEN = 1;
exports.IBATTLE_ATTACK_COST = 1;
exports.IBATTLE_CHARGE_GAIN = 1;
exports.IBATTLE_CHARGE_MAX = 3;
exports.IBATTLE_CHARGE_DMG_BONUS = 0.6;
exports.IBATTLE_DEFEND_REDUCTION = 0.5;
exports.IBATTLE_DEFEND_REFLECT = 0.25;
exports.IBATTLE_MAX_ROUNDS = 20;
//# sourceMappingURL=world-engine.js.map