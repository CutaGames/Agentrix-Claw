import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BedrockIntegrationService } from '../../ai-integration/bedrock/bedrock-integration.service';
import {
  SemanticDescription,
  CharacterStats,
  Skill,
  BehaviorTreeNode,
  SkillType,
  STAT_MIN,
  STAT_MAX,
  STAT_SUM_MIN,
  STAT_SUM_MAX,
  MIN_STARTER_SKILLS,
  MAX_STARTER_SKILLS,
} from '../../../../shared/types/world-engine';

// ============================================================
// Public interfaces
// ============================================================

export interface CharacterProfile {
  name: string;
  stats: CharacterStats;
  skills: Skill[];
  personalityTraits: string[];
  backstory: string;
  behaviorTree: BehaviorTreeNode;
}

export interface CharacterGenerationOptions {
  /** If provided, only regenerate this specific attribute */
  regenerateTarget?: 'stats' | 'skills' | 'personality' | 'backstory' | 'name';
  /** Existing profile to preserve unaffected attributes during regeneration */
  existingProfile?: CharacterProfile;
}

// ============================================================
// Constants
// ============================================================

const GENERATION_TIMEOUT_MS = 15_000;

const SHARPNESS_KEYWORDS = ['sharp', 'pointed', 'edge', 'cut', 'blade', 'pierce', 'stab'];

const MATERIAL_DENSITY_MAP: Record<string, number> = {
  metal: 85,
  stone: 75,
  ceramic: 65,
  wood: 55,
  glass: 45,
  plastic: 40,
  rubber: 35,
  fabric: 25,
  paper: 15,
  organic: 30,
  unknown: 40,
};

/** Skill templates keyed by object category keywords */
const SKILL_TEMPLATE_MAP: Record<string, { name: string; type: SkillType; desc: string }[]> = {
  toy: [
    { name: 'Playful Strike', type: 'offensive', desc: 'Launches a playful attack inspired by toy-like movements' },
    { name: 'Toy Shield', type: 'defensive', desc: 'Creates a protective barrier using toy-like resilience' },
    { name: 'Fun Focus', type: 'utility', desc: 'Channels playful energy to boost concentration and awareness' },
    { name: 'Bounce Back', type: 'defensive', desc: 'Rebounds from damage with toy-like elasticity and vigor' },
  ],
  weapon: [
    { name: 'Blade Rush', type: 'offensive', desc: 'Charges forward with weapon-like precision and deadly force' },
    { name: 'Parry Stance', type: 'defensive', desc: 'Assumes a defensive posture to deflect incoming attacks' },
    { name: 'Sharpen Edge', type: 'utility', desc: 'Hones combat readiness to increase next attack damage' },
    { name: 'Piercing Thrust', type: 'offensive', desc: 'Delivers a focused piercing attack to bypass defenses' },
  ],
  vehicle: [
    { name: 'Ram Charge', type: 'offensive', desc: 'Accelerates into the target with vehicular momentum' },
    { name: 'Armor Plating', type: 'defensive', desc: 'Reinforces exterior with vehicle-grade protective plating' },
    { name: 'Turbo Boost', type: 'utility', desc: 'Activates turbo systems to dramatically increase speed' },
    { name: 'Exhaust Cloud', type: 'utility', desc: 'Releases a cloud of exhaust to obscure enemy vision' },
  ],
  animal: [
    { name: 'Feral Swipe', type: 'offensive', desc: 'Attacks with animal-like ferocity using claws or fangs' },
    { name: 'Thick Hide', type: 'defensive', desc: 'Toughens skin to absorb damage like natural animal armor' },
    { name: 'Predator Sense', type: 'utility', desc: 'Heightens senses to detect weaknesses in the opponent' },
    { name: 'Pack Call', type: 'utility', desc: 'Summons the spirit of the pack to boost morale and stats' },
  ],
  food: [
    { name: 'Spice Burn', type: 'offensive', desc: 'Unleashes a burning spice attack that damages over time' },
    { name: 'Nutritious Guard', type: 'defensive', desc: 'Absorbs damage through nutritional fortification' },
    { name: 'Sweet Heal', type: 'utility', desc: 'Restores health through the restorative power of food' },
    { name: 'Flavor Burst', type: 'offensive', desc: 'Explodes with intense flavor energy to stun opponents' },
  ],
  tool: [
    { name: 'Precision Strike', type: 'offensive', desc: 'Delivers a calculated strike with tool-like accuracy' },
    { name: 'Reinforce', type: 'defensive', desc: 'Strengthens defenses using tool-grade durability' },
    { name: 'Calibrate', type: 'utility', desc: 'Fine-tunes abilities to optimize performance in battle' },
    { name: 'Multi-Function', type: 'utility', desc: 'Adapts tool versatility to counter the current situation' },
  ],
  electronics: [
    { name: 'Circuit Shock', type: 'offensive', desc: 'Discharges electrical energy in a shocking burst attack' },
    { name: 'Firewall', type: 'defensive', desc: 'Activates digital defenses to block incoming damage' },
    { name: 'Overclock', type: 'utility', desc: 'Pushes processing power beyond limits for a speed boost' },
    { name: 'Data Drain', type: 'offensive', desc: 'Siphons energy from the opponent through digital channels' },
  ],
};

const DEFAULT_SKILL_TEMPLATES: { name: string; type: SkillType; desc: string }[] = [
  { name: 'Strike', type: 'offensive', desc: 'Delivers a straightforward physical attack to the target' },
  { name: 'Guard', type: 'defensive', desc: 'Raises defenses to reduce incoming damage from attacks' },
  { name: 'Focus', type: 'utility', desc: 'Concentrates energy to enhance the next action performed' },
  { name: 'Surge', type: 'offensive', desc: 'Channels inner power into a sudden burst of offensive energy' },
];

/** Personality trait mapping: objectCategory → base traits */
const PERSONALITY_TRAIT_MAP: Record<string, string[]> = {
  toy: ['playful', 'cheerful', 'curious'],
  weapon: ['fierce', 'disciplined', 'relentless'],
  vehicle: ['adventurous', 'swift', 'determined'],
  animal: ['instinctive', 'loyal', 'wild'],
  food: ['nurturing', 'warm', 'generous'],
  tool: ['methodical', 'reliable', 'precise'],
  electronics: ['analytical', 'adaptive', 'energetic'],
  figurine: ['proud', 'stoic', 'noble'],
  shoe: ['restless', 'grounded', 'enduring'],
  container: ['protective', 'organized', 'patient'],
};

/** Visual style tag → personality trait modifier */
const STYLE_TAG_TRAIT_MAP: Record<string, string> = {
  colorful: 'vibrant',
  dark: 'mysterious',
  shiny: 'confident',
  matte: 'humble',
  rough: 'rugged',
  smooth: 'elegant',
  vintage: 'wise',
  modern: 'innovative',
  cute: 'endearing',
  scary: 'intimidating',
  metallic: 'resilient',
  transparent: 'honest',
  patterned: 'complex',
  plain: 'straightforward',
  large: 'imposing',
  small: 'nimble',
};

/** Adjective based on top stat for character name generation */
const STAT_ADJECTIVE_MAP: Record<string, string> = {
  hp: 'Mighty',
  atk: 'Fierce',
  def: 'Iron',
  spd: 'Swift',
  int: 'Sage',
};

/** Backstory templates keyed by hash bucket (0-9) for deterministic fallback */
const BACKSTORY_TEMPLATES: string[] = [
  'Born from the forgotten corners of a cluttered workshop, {name} emerged when moonlight first touched its surface. With traits of {traits}, this {category} warrior roams the digital realm seeking worthy opponents. Its journey began in silence but now echoes through every battle arena it enters, leaving a trail of defeated foes and earned respect.',
  'Legend speaks of {name}, a {category} champion forged in the fires of imagination. Possessing {traits} nature, it was awakened by the scanning light and given purpose. Now it fights not just for victory but for the honor of all objects that dream of becoming something greater than their original form.',
  'In the space between reality and digital dreams, {name} found its calling. This {category} entity carries the weight of {traits} personality, channeling ancient energies through modern form. Every battle teaches it something new, every victory strengthens its resolve to protect those who brought it to life.',
  'They say {name} was the first of its kind to cross the boundary between worlds. A {category} being with {traits} disposition, it adapted quickly to the rules of combat. Its origin story is whispered among other world assets as a tale of transformation and unexpected heroism.',
  'From humble beginnings as a simple {category}, {name} rose to become a formidable warrior. Its {traits} character was shaped by countless encounters in the digital arena. Now it stands ready to face any challenge, drawing strength from the real-world essence that gave it form.',
  'The chronicles record {name} as a {category} of remarkable {traits} nature. Scanned into existence during a moment of creative inspiration, it carries the memory of its physical form as both shield and sword. In battle, it fights with the determination of something that knows what it means to be truly seen.',
  'When the scanning light first illuminated {name}, a {category} of {traits} spirit, the digital world trembled with anticipation. Here was a warrior unlike any other, carrying the authentic weight of reality into a realm of pure imagination and endless possibility.',
  'Deep within the code that shapes this world, {name} exists as proof that even a {category} can become legendary. With {traits} at its core, it navigates battles and social encounters with equal grace, always remembering the hand that first held it in the real world.',
  '{name} emerged from the scanner with purpose already burning in its digital heart. This {category} warrior, defined by {traits} qualities, wastes no time in establishing dominance. Every skill it wields connects back to its physical origins, making each attack feel grounded and authentic.',
  'The story of {name} begins where reality ends and imagination takes over. As a {category} with deeply {traits} instincts, it found the transition to warrior surprisingly natural. Now it seeks to prove that the most unexpected objects can become the most powerful champions.',
];

// ============================================================
// Service Implementation
// ============================================================

@Injectable()
export class CharacterGeneratorService {
  private readonly logger = new Logger(CharacterGeneratorService.name);
  private readonly bedrockModelDefault = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

  constructor(
    private readonly configService: ConfigService,
    private readonly bedrock: BedrockIntegrationService,
  ) {
    this.logger.log('CharacterGenerator ready — Bedrock Haiku 4.5 backstory + template fallback');
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Generate a complete character profile from a semantic description.
   * Enforces a 15-second timeout on the entire pipeline.
   *
   * @throws BadRequestException if semantic description is missing required fields
   */
  async generateCharacter(
    semanticDescription: SemanticDescription,
    options?: CharacterGenerationOptions,
  ): Promise<CharacterProfile> {
    // Validate input
    this.validateSemanticDescription(semanticDescription);

    // Wrap in timeout
    const result = await this.withTimeout(
      this.generateCharacterInternal(semanticDescription, options),
      GENERATION_TIMEOUT_MS,
    );

    return result;
  }

  // ============================================================
  // Internal Generation Pipeline
  // ============================================================

  private async generateCharacterInternal(
    desc: SemanticDescription,
    options?: CharacterGenerationOptions,
  ): Promise<CharacterProfile> {
    const existing = options?.existingProfile;
    const target = options?.regenerateTarget;

    // If regenerating a specific attribute, preserve others
    const stats = (!target || target === 'stats')
      ? this.computeStats(desc)
      : existing!.stats;

    const skills = (!target || target === 'skills')
      ? this.generateSkills(desc)
      : existing!.skills;

    const personalityTraits = (!target || target === 'personality')
      ? this.generatePersonalityTraits(desc)
      : existing!.personalityTraits;

    const name = (!target || target === 'name')
      ? this.generateName(desc, stats)
      : existing!.name;

    const backstory = (!target || target === 'backstory')
      ? await this.generateBackstory(name, desc.objectCategory, personalityTraits)
      : existing!.backstory;

    const behaviorTree = this.generateBehaviorTree(skills);

    return { name, stats, skills, personalityTraits, backstory, behaviorTree };
  }

  // ============================================================
  // §1 Deterministic Stat Mapping (R3.2, Property 2)
  // ============================================================

  /**
   * Compute character stats deterministically from semantic description.
   * CRITICAL: No Math.random() — identical input always produces identical output.
   */
  computeStats(desc: SemanticDescription): CharacterStats {
    const { estimatedSize, functionalAffordances, materialType, visualStyleTags } = desc;

    // rawHp: derived from volume
    const volume = estimatedSize.length * estimatedSize.width * estimatedSize.height;
    const rawHp = this.clamp(Math.round(Math.log(volume + 1) * 15 + 20), STAT_MIN, STAT_MAX);

    // rawAtk: count sharpness keywords in functionalAffordances
    const sharpnessCount = functionalAffordances.filter((aff) =>
      SHARPNESS_KEYWORDS.some((kw) => aff.toLowerCase().includes(kw)),
    ).length;
    const rawAtk = sharpnessCount >= 2 ? 75 : sharpnessCount === 1 ? 55 : 35;

    // rawDef: material density map
    const materialKey = materialType.toLowerCase();
    const rawDef = MATERIAL_DENSITY_MAP[materialKey] ?? MATERIAL_DENSITY_MAP['unknown'];

    // rawSpd: aerodynamics ratio
    const denominator = estimatedSize.length + estimatedSize.width + 0.01;
    const rawSpd = this.clamp(
      Math.round((estimatedSize.height / denominator) * 80 + 10),
      STAT_MIN,
      STAT_MAX,
    );

    // rawInt: complexity from affordances + style tags count
    const rawInt = this.clamp(
      (functionalAffordances.length + visualStyleTags.length) * 7 + 15,
      STAT_MIN,
      STAT_MAX,
    );

    // Normalize to ensure sum is within [150, 350]
    return this.normalizeStats({ hp: rawHp, atk: rawAtk, def: rawDef, spd: rawSpd, int: rawInt });
  }

  /**
   * Normalize stats so their sum falls within [STAT_SUM_MIN, STAT_SUM_MAX].
   * Each individual stat is clamped to [STAT_MIN, STAT_MAX] after scaling.
   */
  private normalizeStats(raw: CharacterStats): CharacterStats {
    const sum = raw.hp + raw.atk + raw.def + raw.spd + raw.int;

    let scale = 1;
    if (sum < STAT_SUM_MIN) {
      scale = STAT_SUM_MIN / sum;
    } else if (sum > STAT_SUM_MAX) {
      scale = STAT_SUM_MAX / sum;
    }

    const normalized: CharacterStats = {
      hp: this.clamp(Math.round(raw.hp * scale), STAT_MIN, STAT_MAX),
      atk: this.clamp(Math.round(raw.atk * scale), STAT_MIN, STAT_MAX),
      def: this.clamp(Math.round(raw.def * scale), STAT_MIN, STAT_MAX),
      spd: this.clamp(Math.round(raw.spd * scale), STAT_MIN, STAT_MAX),
      int: this.clamp(Math.round(raw.int * scale), STAT_MIN, STAT_MAX),
    };

    return normalized;
  }

  // ============================================================
  // §2 Starter Skill Generation (R3.1, R3.3)
  // ============================================================

  /**
   * Generate 2-4 starter skills deterministically.
   * Skill count = min(4, max(2, floor(functionalAffordances.length / 2) + 1))
   */
  generateSkills(desc: SemanticDescription): Skill[] {
    const skillCount = Math.min(
      MAX_STARTER_SKILLS,
      Math.max(MIN_STARTER_SKILLS, Math.floor(desc.functionalAffordances.length / 2) + 1),
    );

    // Find matching skill templates by category keywords
    const templates = this.findSkillTemplates(desc.objectCategory);
    const skills: Skill[] = [];

    for (let i = 0; i < skillCount; i++) {
      const template = templates[i % templates.length];
      skills.push({
        name: template.name.substring(0, 25),
        type: template.type,
        effectDescription: template.desc,
        damageBase: template.type === 'offensive' ? 20 + i * 5 : undefined,
        cooldownTurns: template.type === 'utility' ? 2 : template.type === 'defensive' ? 1 : 0,
      });
    }

    return skills;
  }

  /**
   * Find skill templates matching the object category.
   * Falls back to DEFAULT_SKILL_TEMPLATES if no match found.
   */
  private findSkillTemplates(objectCategory: string): { name: string; type: SkillType; desc: string }[] {
    const categoryLower = objectCategory.toLowerCase();

    // Check each template map key for a match in the category string
    for (const [key, templates] of Object.entries(SKILL_TEMPLATE_MAP)) {
      if (categoryLower.includes(key)) {
        return templates;
      }
    }

    return DEFAULT_SKILL_TEMPLATES;
  }

  // ============================================================
  // §3 Personality Traits (3-5 traits, deterministic)
  // ============================================================

  /**
   * Generate 3-5 personality traits deterministically from objectCategory + visualStyleTags.
   */
  generatePersonalityTraits(desc: SemanticDescription): string[] {
    const categoryLower = desc.objectCategory.toLowerCase();
    const traits: string[] = [];

    // Base traits from category
    let baseTraits: string[] = [];
    for (const [key, categoryTraits] of Object.entries(PERSONALITY_TRAIT_MAP)) {
      if (categoryLower.includes(key)) {
        baseTraits = categoryTraits;
        break;
      }
    }
    if (baseTraits.length === 0) {
      baseTraits = ['determined', 'adaptable', 'resilient'];
    }
    traits.push(...baseTraits);

    // Add traits from first 3 visual style tags
    const styleTags = desc.visualStyleTags.slice(0, 3);
    for (const tag of styleTags) {
      const tagLower = tag.toLowerCase();
      for (const [keyword, trait] of Object.entries(STYLE_TAG_TRAIT_MAP)) {
        if (tagLower.includes(keyword) && !traits.includes(trait)) {
          traits.push(trait);
          break;
        }
      }
    }

    // Ensure 3-5 traits
    while (traits.length < 3) {
      const fallbacks = ['steadfast', 'resourceful', 'bold'];
      for (const fb of fallbacks) {
        if (!traits.includes(fb) && traits.length < 3) {
          traits.push(fb);
        }
      }
    }

    return traits.slice(0, 5);
  }

  // ============================================================
  // §4 Backstory Generation (50-150 words)
  // ============================================================

  /**
   * Generate backstory: try LLM first, fall back to deterministic template.
   */
  private async generateBackstory(
    name: string,
    objectCategory: string,
    traits: string[],
  ): Promise<string> {
    // Try Bedrock generation
    try {
      const backstory = await this.generateBackstoryWithLLM(name, objectCategory, traits);
      if (backstory && backstory.split(/\s+/).length >= 50) {
        return backstory;
      }
    } catch (error: any) {
      this.logger.warn(`Bedrock backstory generation failed: ${error.message}`);
    }

    // Template fallback: pick template by hash of objectCategory
    return this.generateBackstoryFromTemplate(name, objectCategory, traits);
  }

  private async generateBackstoryWithLLM(
    name: string,
    objectCategory: string,
    traits: string[],
  ): Promise<string> {
    const prompt = `Write a short backstory (50-150 words) for a game character named "${name}". This character was created from a real-world ${objectCategory}. Their personality traits are: ${traits.join(', ')}. The backstory should be engaging, reference the character's origin as a ${objectCategory}, and hint at their combat abilities. Write ONLY the backstory text, no quotes or formatting.`;

    const response = await this.bedrock.chatWithFunctions(
      [{ role: 'user', content: prompt }],
      {
        model: this.bedrockModelDefault,
        maxTokens: 300,
      },
    );

    const content = (response.text || '').trim();
    if (!content) throw new Error('Empty Bedrock response');

    // Trim to 150 words max
    const words = content.split(/\s+/);
    if (words.length > 150) {
      return words.slice(0, 150).join(' ') + '.';
    }
    return content;
  }

  /**
   * Deterministic template fallback for backstory.
   * Template selected by hash of objectCategory.
   */
  private generateBackstoryFromTemplate(
    name: string,
    objectCategory: string,
    traits: string[],
  ): string {
    const hash = this.simpleHash(objectCategory);
    const templateIndex = hash % BACKSTORY_TEMPLATES.length;
    const template = BACKSTORY_TEMPLATES[templateIndex];

    return template
      .replace(/\{name\}/g, name)
      .replace(/\{category\}/g, objectCategory)
      .replace(/\{traits\}/g, traits.slice(0, 3).join(', '));
  }

  // ============================================================
  // §5 Behavior Tree (R3.4)
  // ============================================================

  /**
   * Generate a BehaviorTreeNode with idle/combat/social branches.
   * Deterministic based on skill types present.
   */
  generateBehaviorTree(skills: Skill[]): BehaviorTreeNode {
    const hasOffensive = skills.some((s) => s.type === 'offensive');
    const hasDefensive = skills.some((s) => s.type === 'defensive');
    const hasUtility = skills.some((s) => s.type === 'utility');

    // Root selector with three context branches
    const root: BehaviorTreeNode = {
      type: 'selector',
      context: 'idle',
      children: [
        this.buildIdleBranch(hasUtility),
        this.buildCombatBranch(hasOffensive, hasDefensive, skills),
        this.buildSocialBranch(hasUtility),
      ],
    };

    return root;
  }

  private buildIdleBranch(hasUtility: boolean): BehaviorTreeNode {
    const children: BehaviorTreeNode[] = [
      { type: 'action', context: 'idle', actionId: 'wander' },
      { type: 'action', context: 'idle', actionId: 'rest' },
    ];
    if (hasUtility) {
      children.push({ type: 'action', context: 'idle', actionId: 'practice_skill' });
    }
    return {
      type: 'sequence',
      context: 'idle',
      children: [
        { type: 'condition', context: 'idle', conditionExpr: 'no_threats_nearby' },
        { type: 'selector', context: 'idle', children },
      ],
    };
  }

  private buildCombatBranch(
    hasOffensive: boolean,
    hasDefensive: boolean,
    skills: Skill[],
  ): BehaviorTreeNode {
    const actions: BehaviorTreeNode[] = [];

    if (hasOffensive) {
      const offSkill = skills.find((s) => s.type === 'offensive');
      actions.push({
        type: 'action',
        context: 'combat',
        actionId: `use_skill_${offSkill?.name.toLowerCase().replace(/\s+/g, '_') || 'attack'}`,
      });
    }
    if (hasDefensive) {
      actions.push({
        type: 'sequence',
        context: 'combat',
        children: [
          { type: 'condition', context: 'combat', conditionExpr: 'hp_below_30_percent' },
          { type: 'action', context: 'combat', actionId: 'defend' },
        ],
      });
    }
    // Always have a basic attack fallback
    actions.push({ type: 'action', context: 'combat', actionId: 'basic_attack' });

    return {
      type: 'sequence',
      context: 'combat',
      children: [
        { type: 'condition', context: 'combat', conditionExpr: 'in_combat' },
        { type: 'selector', context: 'combat', children: actions },
      ],
    };
  }

  private buildSocialBranch(hasUtility: boolean): BehaviorTreeNode {
    const actions: BehaviorTreeNode[] = [
      { type: 'action', context: 'social', actionId: 'greet' },
      { type: 'action', context: 'social', actionId: 'emote' },
    ];
    if (hasUtility) {
      actions.push({ type: 'action', context: 'social', actionId: 'share_buff' });
    }
    return {
      type: 'sequence',
      context: 'social',
      children: [
        { type: 'condition', context: 'social', conditionExpr: 'friendly_nearby' },
        { type: 'selector', context: 'social', children: actions },
      ],
    };
  }

  // ============================================================
  // §6 Character Name (1-30 chars, deterministic)
  // ============================================================

  /**
   * Generate character name from objectCategory + deterministic adjective based on top stat.
   */
  generateName(desc: SemanticDescription, stats: CharacterStats): string {
    // Find top stat
    const statEntries: [string, number][] = [
      ['hp', stats.hp],
      ['atk', stats.atk],
      ['def', stats.def],
      ['spd', stats.spd],
      ['int', stats.int],
    ];
    statEntries.sort((a, b) => b[1] - a[1]);
    const topStat = statEntries[0][0];
    const adjective = STAT_ADJECTIVE_MAP[topStat] || 'Brave';

    // Capitalize first letter of category
    const category = desc.objectCategory.trim();
    const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

    // Combine: "Adjective Category" — clamp to 30 chars
    const fullName = `${adjective} ${capitalizedCategory}`;
    return fullName.substring(0, 30);
  }

  // ============================================================
  // §7 Validation (R3.7)
  // ============================================================

  /**
   * Validate that SemanticDescription has required fields.
   * @throws BadRequestException with specific missing fields
   */
  private validateSemanticDescription(desc: SemanticDescription): void {
    const missingFields: string[] = [];

    if (!desc.objectCategory || typeof desc.objectCategory !== 'string' || desc.objectCategory.trim() === '') {
      missingFields.push('objectCategory');
    }
    if (!desc.materialType || typeof desc.materialType !== 'string' || desc.materialType.trim() === '') {
      missingFields.push('materialType');
    }
    if (
      !desc.estimatedSize ||
      typeof desc.estimatedSize !== 'object' ||
      typeof desc.estimatedSize.length !== 'number' ||
      typeof desc.estimatedSize.width !== 'number' ||
      typeof desc.estimatedSize.height !== 'number' ||
      desc.estimatedSize.length <= 0 ||
      desc.estimatedSize.width <= 0 ||
      desc.estimatedSize.height <= 0
    ) {
      missingFields.push('estimatedSize');
    }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Incomplete semantic description: missing or invalid fields: ${missingFields.join(', ')}`,
      );
    }
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /** Clamp a value between min and max */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /** Simple deterministic hash function (djb2) — returns a non-negative integer */
  private simpleHash(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
    }
    return hash;
  }

  /** Wrap a promise with a timeout */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Character generation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
