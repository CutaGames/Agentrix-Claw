/**
 * Greeting card templates — per docs §6.2.
 *
 * Templates are code-defined (not DB-backed) so the UI layer can ship
 * assets bundled. New templates added in code reviews; hot-loaded
 * variants can still live in the DB later.
 */

export interface GreetingTemplate {
  key: string;
  label_zh: string;
  label_en: string;
  category: 'holiday' | 'milestone' | 'casual' | 'emotion';
  premium: boolean;
  /** AXP cost if premium; 0 if free. */
  axp_cost: number;
  /** Canonical asset bundle key — client resolves to image/animation. */
  asset_key: string;
}

export const GREETING_TEMPLATES: GreetingTemplate[] = [
  // Free
  { key: 'cheer',        label_zh: '加油', label_en: 'Cheer up!',         category: 'emotion',   premium: false, axp_cost: 0,    asset_key: 'card.cheer.v1' },
  { key: 'birthday',     label_zh: '生日快乐', label_en: 'Happy birthday', category: 'milestone', premium: false, axp_cost: 0,    asset_key: 'card.birthday.v1' },
  { key: 'thx',          label_zh: '谢谢', label_en: 'Thank you',         category: 'casual',    premium: false, axp_cost: 0,    asset_key: 'card.thx.v1' },
  { key: 'miss',         label_zh: '想你', label_en: 'Thinking of you',   category: 'emotion',   premium: false, axp_cost: 0,    asset_key: 'card.miss.v1' },
  // Premium (consumes AXP)
  { key: 'spring_fest',  label_zh: '新春大吉', label_en: 'Happy Lunar NY', category: 'holiday',   premium: true,  axp_cost: 500,  asset_key: 'card.spring_fest.v1' },
  { key: 'christmas',    label_zh: '圣诞快乐', label_en: 'Merry Christmas', category: 'holiday',  premium: true,  axp_cost: 500,  asset_key: 'card.christmas.v1' },
  { key: 'valentine',    label_zh: '情人节快乐', label_en: 'Happy Valentine', category: 'holiday', premium: true, axp_cost: 800,  asset_key: 'card.valentine.v1' },
  { key: 'dev_day',      label_zh: '程序员节', label_en: 'Coders Day',     category: 'milestone', premium: true,  axp_cost: 300,  asset_key: 'card.dev_day.v1' },
  { key: 'proud',        label_zh: '我为你骄傲', label_en: 'So proud of you', category: 'emotion', premium: true,  axp_cost: 400,  asset_key: 'card.proud.v1' },
  { key: 'limited',      label_zh: '限定皮肤卡', label_en: 'Limited skin',  category: 'holiday',   premium: true,  axp_cost: 2000, asset_key: 'card.limited.v1' },
];

export function findTemplate(key: string): GreetingTemplate | undefined {
  return GREETING_TEMPLATES.find((t) => t.key === key);
}
