// Translations. English text is the key: t('Save') looks the text up in the active language and
// falls back to English, so a missing translation never breaks the screen.
// Translation files (src/locales/<code>.ts) are arrays in the same order as src/locales/keys.ts;
// only the active language is downloaded.
import { Fragment, createElement, type ReactNode } from 'react';
import { KEYS } from './locales/keys';

export interface LangInfo { code: string; name: string; english: string; rtl?: boolean }
export const LANGS: LangInfo[] = [
  { code: 'en', name: 'English', english: 'English' },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'ms', name: 'Bahasa Melayu', english: 'Malay' },
  { code: 'tl', name: 'Tagalog', english: 'Tagalog (Filipino)' },
  { code: 'th', name: 'ไทย', english: 'Thai' },
  { code: 'vi', name: 'Tiếng Việt', english: 'Vietnamese' },
  { code: 'ja', name: '日本語', english: 'Japanese' },
  { code: 'ko', name: '한국어', english: 'Korean' },
  { code: 'zh-Hans', name: '简体中文', english: 'Chinese (Simplified)' },
  { code: 'zh-Hant', name: '繁體中文', english: 'Chinese (Traditional)' },
  { code: 'ar', name: 'العربية', english: 'Arabic', rtl: true },
  { code: 'tr', name: 'Türkçe', english: 'Turkish' },
  { code: 'ru', name: 'Русский', english: 'Russian' },
  { code: 'fr', name: 'Français', english: 'French' },
  { code: 'de', name: 'Deutsch', english: 'German' },
  { code: 'es', name: 'Español', english: 'Spanish' },
  { code: 'pt', name: 'Português', english: 'Portuguese' },
  { code: 'nb', name: 'Norsk', english: 'Norwegian' },
  { code: 'da', name: 'Dansk', english: 'Danish' },
  { code: 'sv', name: 'Svenska', english: 'Swedish' },
  { code: 'fi', name: 'Suomi', english: 'Finnish' },
  { code: 'sw', name: 'Kiswahili', english: 'Swahili' },
];

/** Picks the closest supported language from the device's preferred languages. */
export function detectLanguage(prefs: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): string {
  for (const raw of prefs) {
    const l = raw.toLowerCase();
    if (l.startsWith('zh')) return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
    if (/^(nb|nn|no)\b/.test(l)) return 'nb';
    if (/^(fil|tl)\b/.test(l)) return 'tl';
    if (/^(id|in)\b/.test(l)) return 'id';
    const base = l.split('-')[0];
    const hit = LANGS.find((x) => x.code === base);
    if (hit) return hit.code;
  }
  return 'en';
}

type Plural = Partial<Record<Intl.LDMLPluralRule, string>>;
type Entry = string | Plural | null;
let dict = new Map<string, Entry>();
let current = 'en';
let plural = new Intl.PluralRules('en');

export const getLang = () => current;
/** The locale used for dates and weekday names. */
export const getLocale = () => (current === 'tl' ? 'fil' : current);
export const isRtl = () => !!LANGS.find((x) => x.code === current)?.rtl;

const loaders = import.meta.glob<{ default: Entry[] }>(['./locales/*.ts', '!./locales/keys.ts'], { eager: false });

/** Loads a language's strings (English needs none) and applies its direction to the page. */
export async function setLanguage(code: string) {
  const info = LANGS.find((x) => x.code === code) ?? LANGS[0];
  const next = new Map<string, Entry>();
  if (info.code !== 'en') {
    const load = loaders[`./locales/${info.code}.ts`];
    if (load) {
      try {
        const rows = (await load()).default;
        KEYS.forEach((k, i) => { const v = rows[i]; if (v != null && v !== '') next.set(k, v); });
      } catch (e) { console.warn('language load failed', e); }
    }
  }
  dict = next; current = info.code;
  try { plural = new Intl.PluralRules(getLocale()); } catch { plural = new Intl.PluralRules('en'); }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = getLocale();
    document.documentElement.dir = info.rtl ? 'rtl' : 'ltr';
  }
}

const fill = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`) + '') : s);

/** Translate text. Placeholders like {name} are filled from `vars`. */
export function t(en: string, vars?: Record<string, string | number>): string {
  const v = dict.get(en);
  const s = typeof v === 'string' ? v : v ? v.other ?? en : en;
  return fill(s, vars);
}

/** Translate text with a count: `one` is the English singular, `other` the plural (and the key). {n} is the count. */
export function tp(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  const v = dict.get(other);
  const all = { ...vars, n: vars?.n ?? n };
  if (typeof v === 'string') return fill(v, all);
  if (v) return fill(v[plural.select(n)] ?? v.other ?? other, all);
  return fill(n === 1 ? one : other, all);
}

/** Translate text that contains formatted parts, e.g. tr('{name} is over budget', { name: <b>Food</b> }). */
export function tr(en: string, vars: Record<string, ReactNode>): ReactNode {
  const v = dict.get(en);
  const s = typeof v === 'string' ? v : v ? v.other ?? en : en;
  const parts = s.split(/\{(\w+)\}/);
  return createElement(Fragment, null, ...parts.map((p, i) => (i % 2 ? createElement(Fragment, { key: i }, vars[p] ?? `{${p}}`) : p)));
}

// ── Built-in names (categories, sub-categories, accounts) are stored in English and shown translated,
// so devices in different languages keep the same data. Names the user typed are shown as typed.
export const DEFAULT_CATEGORY_NAMES: Record<string, string> = {
  cat_groceries: 'Groceries', cat_dining: 'Dining out', cat_housing: 'Housing', cat_transport: 'Transport', cat_utilities: 'Utilities',
  cat_health: 'Health', cat_fun: 'Entertainment', cat_shopping: 'Shopping', cat_subs: 'Subscriptions', cat_travel: 'Travel', cat_other: 'Other',
  cat_salary: 'Salary', cat_side: 'Side income', cat_gift: 'Gifts & refunds',
};
export const DEFAULT_SUBS = new Set(['Vegetables', 'Fruit', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Pantry', 'Snacks', 'Drinks', 'Household',
  'Restaurants', 'Coffee', 'Fast food', 'Delivery', 'Bars', 'Rent', 'Mortgage', 'Repairs', 'Furniture', 'Fuel', 'Public transit', 'Taxi & ride share',
  'Parking', 'Maintenance', 'Electricity', 'Water', 'Gas', 'Internet', 'Phone', 'Pharmacy', 'Doctor', 'Dental', 'Fitness', 'Movies', 'Games', 'Events',
  'Hobbies', 'Clothing', 'Electronics', 'Home', 'Gifts', 'Streaming', 'Music', 'Software', 'Memberships', 'Flights', 'Lodging', 'Activities']);
const DEFAULT_ACCOUNT_NAMES: Record<string, string> = { acc_main: 'Main account', acc_owed: 'Owed to me' };

export const catLabel = (c?: { id: string; name: string }) => (!c ? '' : DEFAULT_CATEGORY_NAMES[c.id] === c.name ? t(c.name) : c.name);
export const subLabel = (s: string) => (DEFAULT_SUBS.has(s) ? t(s) : s);
export const accLabel = (a?: { id: string; name: string }) => (!a ? '' : DEFAULT_ACCOUNT_NAMES[a.id] === a.name ? t(a.name) : a.name);
