/**
 * The condition card for dating on the phone (twinFind.ts `card`, `setCard`; `shared/types/twin-find-card.ts`), as plain
 * functions: the form a person edits, the card it stands for (checked by the decoder the server uses), and the words.
 * No React Native import.
 *
 * A part left empty never rules anyone out, and a card with nothing on it works like no card at all, so saving an empty
 * form clears the card instead of storing an empty one.
 */
import type { TwinFindDecodeResultV0, TwinFindReasonCodeV0 } from '../../shared/types/twin-find';
import {
  TWIN_FIND_CARD_BLANK_V0,
  TWIN_FIND_CARD_CHOICE_ITEMS_V0,
  TWIN_FIND_CARD_CITY_ACCEPT_LABELS_V0,
  TWIN_FIND_CARD_ITEM_LABELS_V0,
  TWIN_FIND_CARD_LIMITS_V0,
  TWIN_FIND_CARD_NOTICE_V0,
  TWIN_FIND_CARD_OPTIONS_V0,
  TWIN_FIND_CARD_OPTION_LABELS_V0,
  decodeTwinFindCardV0,
  type TwinFindCardChoiceItemV0,
  type TwinFindCardChoiceV0,
  type TwinFindCardItemV0,
  type TwinFindCardOptionV0,
  type TwinFindCardV0,
} from '../../shared/types/twin-find-card';
import { TwinFindError } from './twinFind';
import { twinFindFailureWords, type TwinFindWords } from './twinFindView';

/** One part as the form holds it: nothing chosen under "I am fine with" means any. */
export interface TwinFindCardChoiceForm<K extends TwinFindCardChoiceItemV0> {
  self: TwinFindCardOptionV0<K> | null;
  accept: TwinFindCardOptionV0<K>[];
}

export interface TwinFindCardForm {
  /** What the person typed as their own city; blank means they do not say. */
  city: string;
  sameCity: boolean;
  choices: { [K in TwinFindCardChoiceItemV0]: TwinFindCardChoiceForm<K> };
}

const choiceForm = <T extends string>(choice: TwinFindCardChoiceV0<T>): { self: T | null; accept: T[] } => ({
  self: choice.self,
  accept: [...(choice.accept ?? [])],
});
const choiceCard = <T extends string>(choice: { self: T | null; accept: readonly T[] }): TwinFindCardChoiceV0<T> => ({
  self: choice.self,
  accept: choice.accept.length > 0 ? [...choice.accept] : null,
});

/** The form for the card the person has, or an empty one. */
export function twinFindCardFormOf(card: TwinFindCardV0 | null): TwinFindCardForm {
  const from = card ?? TWIN_FIND_CARD_BLANK_V0;
  return {
    city: from.city.self ?? '',
    sameCity: from.city.accept === 'same',
    choices: {
      age: choiceForm(from.age),
      kids: choiceForm(from.kids),
      smoking: choiceForm(from.smoking),
      diet: choiceForm(from.diet),
      schedule: choiceForm(from.schedule),
    },
  };
}

export function twinFindCardFormBlank(form: TwinFindCardForm): boolean {
  return (
    form.city.trim() === '' &&
    !form.sameCity &&
    TWIN_FIND_CARD_CHOICE_ITEMS_V0.every((item) => form.choices[item].self === null && form.choices[item].accept.length === 0)
  );
}

/** The card the form stands for, refused exactly where the server would refuse it. `null` for an empty form: save it to clear. */
export function twinFindCardFromForm(form: TwinFindCardForm): TwinFindDecodeResultV0<TwinFindCardV0 | null> {
  if (twinFindCardFormBlank(form)) return { ok: true, value: null };
  const city = form.city.trim();
  return decodeTwinFindCardV0({
    city: { self: city === '' ? null : city, accept: form.sameCity ? 'same' : 'any' },
    age: choiceCard(form.choices.age),
    kids: choiceCard(form.choices.kids),
    smoking: choiceCard(form.choices.smoking),
    diet: choiceCard(form.choices.diet),
    schedule: choiceCard(form.choices.schedule),
  });
}

export function twinFindCardOptions<K extends TwinFindCardChoiceItemV0>(item: K): readonly TwinFindCardOptionV0<K>[] {
  return TWIN_FIND_CARD_OPTIONS_V0[item] as readonly TwinFindCardOptionV0<K>[];
}

/** "I am": tapping the option already chosen clears it. */
export function twinFindCardWithSelf<K extends TwinFindCardChoiceItemV0>(form: TwinFindCardForm, item: K, option: TwinFindCardOptionV0<K>): TwinFindCardForm {
  const current: TwinFindCardChoiceForm<K> = form.choices[item];
  const next: TwinFindCardChoiceForm<K> = { self: current.self === option ? null : option, accept: current.accept };
  return { ...form, choices: { ...form.choices, [item]: next } };
}

/** "I am fine with": adds or removes one option, kept in the options' own order. */
export function twinFindCardWithAccept<K extends TwinFindCardChoiceItemV0>(form: TwinFindCardForm, item: K, option: TwinFindCardOptionV0<K>): TwinFindCardForm {
  const current: TwinFindCardChoiceForm<K> = form.choices[item];
  const chosen = current.accept.includes(option) ? current.accept.filter((each) => each !== option) : [...current.accept, option];
  const next: TwinFindCardChoiceForm<K> = { self: current.self, accept: twinFindCardOptions(item).filter((each) => chosen.includes(each)) };
  return { ...form, choices: { ...form.choices, [item]: next } };
}

// ── Words ────────────────────────────────────────────────────────────────────────────

export const TWIN_FIND_CARD_TITLE_WORDS: TwinFindWords = { en: 'Dating: my condition card', zh: '找对象：我的条件卡' };
export const TWIN_FIND_CARD_NOTICE_WORDS: TwinFindWords = TWIN_FIND_CARD_NOTICE_V0;
export const TWIN_FIND_CARD_SELF_WORDS: TwinFindWords = { en: 'I am', zh: '我是' };
export const TWIN_FIND_CARD_ACCEPT_WORDS: TwinFindWords = { en: 'I am fine with (choose none for any)', zh: '我能接受（一个都不选就是都行）' };
export const TWIN_FIND_CARD_CITY_PLACEHOLDER_WORDS: TwinFindWords = { en: 'Your city, e.g. Shanghai', zh: '你所在的城市，比如：上海' };
export const TWIN_FIND_CARD_SAME_CITY_WORDS: TwinFindWords = TWIN_FIND_CARD_CITY_ACCEPT_LABELS_V0.same;
export const TWIN_FIND_CARD_SAVE_WORDS: TwinFindWords = { en: 'Save card', zh: '保存条件卡' };
export const TWIN_FIND_CARD_CLEAR_WORDS: TwinFindWords = { en: 'Clear card', zh: '清空条件卡' };
export const TWIN_FIND_CARD_SAVED_WORDS: TwinFindWords = { en: 'Saved.', zh: '已保存。' };
export const TWIN_FIND_CARD_CLEARED_WORDS: TwinFindWords = {
  en: 'Cleared. Without a card you are asked as usual when a friend picks you.',
  zh: '已清空。没有卡时，朋友选中你就照常来问你。',
};

export function twinFindCardItemWords(item: TwinFindCardItemV0): TwinFindWords {
  return TWIN_FIND_CARD_ITEM_LABELS_V0[item];
}

export function twinFindCardOptionWords<K extends TwinFindCardChoiceItemV0>(item: K, option: TwinFindCardOptionV0<K>): TwinFindWords {
  return (TWIN_FIND_CARD_OPTION_LABELS_V0[item] as Readonly<Record<TwinFindCardOptionV0<K>, TwinFindWords>>)[option];
}

/** What a refused card reads like. Only the city can be typed, so only the city gets its own sentences. */
export function twinFindCardProblemWords(reasonCode: TwinFindReasonCodeV0 | null, field: string | null): TwinFindWords {
  if (field === 'card.city.self') {
    if (reasonCode === 'missing_field') return { en: 'To ask for the same city, fill in your own city first.', zh: '选了「只要同城」，先填你所在的城市。' };
    if (reasonCode === 'too_long') {
      return { en: `The city can be up to ${TWIN_FIND_CARD_LIMITS_V0.cityMax} characters.`, zh: `城市最多 ${TWIN_FIND_CARD_LIMITS_V0.cityMax} 个字。` };
    }
    if (reasonCode === 'text_violation') return { en: 'The city cannot contain phone numbers, addresses or links.', zh: '城市里不能写电话、地址或链接。' };
    return { en: 'Check the city.', zh: '城市填得不对，请改一下。' };
  }
  return { en: 'Something on the card is not right. Check it and try again.', zh: '条件卡里有不对的地方，请检查后再试。' };
}

/** Saving while the server has the card switched off answers 404: say that it is not open, not that something is gone. */
export function twinFindCardFailureWords(error: unknown): TwinFindWords {
  if (error instanceof TwinFindError && error.failure === 'not_found') return { en: 'This is not open yet.', zh: '这一项还没开放。' };
  if (error instanceof TwinFindError && error.failure === 'invalid') return twinFindCardProblemWords(error.reasonCode, error.field);
  return twinFindFailureWords(error);
}
