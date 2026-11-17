import { useMemo } from 'react';
import { live, today, useData, ymd, type Data, type NumFmt, type PayMethod, type Settings, type Tx } from './store';

export const curMonth = () => today().slice(0, 7);
export function addMonths(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const monthsBack = (n: number, end = curMonth()) => Array.from({ length: n }, (_, i) => addMonths(end, i - n + 1));
export const monthName = (m: string, style: 'short' | 'long' = 'long') =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' });
export const daysIn = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
export const dayLabel = (d: string) => {
  const t = today();
  if (d === t) return 'Today';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d === ymd(y)) return 'Yesterday';
  const [yy, mm, dd] = d.split('-').map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: yy === new Date().getFullYear() ? undefined : 'numeric' });
};

export interface MonthSum { inc: number; exp: number; cats: Map<string, number>; txs: Tx[] }
const emptyMonth = (): MonthSum => ({ inc: 0, exp: 0, cats: new Map(), txs: [] });

export function buildModel(data: Data) {
  const txs = live(data.tx).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.u - a.u));
  const accounts = live(data.accounts).sort((a, b) => a.name.localeCompare(b.name));
  const categories = live(data.categories).sort((a, b) => a.name.localeCompare(b.name));
  const balances = new Map(accounts.map((a) => [a.id, a.opening]));
  const months = new Map<string, MonthSum>();
  const bump = (id: string | undefined, by: number) => { if (id && balances.has(id)) balances.set(id, balances.get(id)! + by); };
  for (const t of txs) {
    const m = t.date.slice(0, 7);
    let s = months.get(m);
    if (!s) months.set(m, (s = emptyMonth()));
    s.txs.push(t);
    if (t.type === 'income') { s.inc += t.amount; bump(t.acc, t.amount); }
    else if (t.type === 'expense') { s.exp += t.amount; bump(t.acc, -t.amount); s.cats.set(t.cat || 'cat_other', (s.cats.get(t.cat || 'cat_other') ?? 0) + t.amount); }
    else { bump(t.acc, -t.amount); bump(t.toAcc, t.amount); }
  }
  const netWorth = [...balances.values()].reduce((a, b) => a + b, 0);
  // Friends' running balances from split bills: lent (to "Owed to me") minus repaid (out of it).
  const owed = new Map<string, number>();
  for (const t of txs) if (t.type === 'transfer' && t.who) {
    const d = t.toAcc === 'acc_owed' ? t.amount : t.acc === 'acc_owed' ? -t.amount : 0;
    if (d) owed.set(t.who, (owed.get(t.who) ?? 0) + d);
  }
  for (const [k, v] of owed) if (v === 0) owed.delete(k);
  const st = data.settings.settings as Settings | undefined;
  const currency = st?.currency || 'USD';
  const numFmt: NumFmt = st?.numFmt && NUM_FORMATS[st.numFmt] ? st.numFmt : 'auto';
  decSep = (1.5).toLocaleString(NUM_FORMATS[numFmt].locale).includes(',') ? ',' : '.';
  const methods = (live(data.settings).filter((r) => (r as PayMethod).type === 'method') as PayMethod[]).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const methodName = (p: PayMethod) => p.name + (p.last4 ? ` ••${p.last4}` : '');
  const nf = moneyFormatter(currency, numFmt, st?.decimals);
  const nf0 = moneyFormatter(currency, numFmt, 'hide');
  const nfc = moneyFormatter(currency, numFmt, 'hide', { notation: 'compact', maximumFractionDigits: 1 });
  return {
    data, txs, accounts, owed, categories, balances, months, netWorth, currency, numFmt, decimals: st?.decimals ?? 'auto',
    month: (m: string) => months.get(m) ?? emptyMonth(),
    methods,
    method: (id?: string) => methods.find((p) => p.id === id),
    methodName,
    /** "Cash", "Card · BCA ••4821", "QR · GoPay", or '' when not recorded. */
    payLabel(t: Pick<Tx, 'pm' | 'pmid'>) {
      if (!t.pm) return '';
      if (t.pm === 'cash') return 'Cash';
      const p = methods.find((x) => x.id === t.pmid);
      return (t.pm === 'card' ? 'Card' : 'QR') + (p ? ` · ${methodName(p)}` : '');
    },
    cat: (id?: string) => (id && data.categories[id] && !data.categories[id].del ? data.categories[id] : undefined),
    acc: (id?: string) => (id && data.accounts[id] && !data.accounts[id].del ? data.accounts[id] : undefined),
    budgets: live(data.budgets).filter((b) => b.limit > 0 && data.categories[b.id] && !data.categories[b.id].del),
    goals: live(data.goals), recurring: live(data.recurring).sort((a, b) => (a.next < b.next ? -1 : 1)),
    /** Total across all accounts at the end of each given month. */
    netWorthAt(ms: string[]) {
      return ms.map((m) => {
        let v = netWorth;
        for (const [k, s] of months) if (k > m) v -= s.inc - s.exp;
        return v;
      });
    },
    fmt: (c: number) => nf.format(c / 100),
    fmt0: (c: number) => nf0.format(Math.round(c / 100)),
    fmtc: (c: number) => (Math.abs(c) >= 1000000 ? nfc.format(c / 100) : nf0.format(Math.round(c / 100))),
  };
}
export type Model = ReturnType<typeof buildModel>;
export function useModel() {
  const data = useData();
  return useMemo(() => buildModel(data), [data]);
}

// ───────── number format ─────────
/** Separator styles, shown in Settings with a live example. */
export const NUM_FORMATS: Record<NumFmt, { locale: string | undefined; label: string }> = {
  auto: { locale: undefined, label: 'Same as this device' },
  en: { locale: 'en-US', label: '1,234.56' }, id: { locale: 'id-ID', label: '1.234,56' }, fr: { locale: 'fr-FR', label: '1 234,56' },
  ch: { locale: 'de-CH', label: "1'234.56" }, in: { locale: 'en-IN', label: '1,23,456.78' },
};
/** Currencies people normally write without cents, even though they officially have them. */
const NO_CENTS = new Set(['IDR', 'HUF', 'CLP', 'COP', 'PYG', 'UGX', 'TZS', 'MMK', 'LAK', 'KHR', 'IRR']);
let decSep = (1.5).toLocaleString().includes(',') ? ',' : '.';
export const decimalSeparator = () => decSep;
export function moneyFormatter(currency: string, numFmt: NumFmt = 'auto', decimals: Settings['decimals'] = 'auto', extra: Intl.NumberFormatOptions = {}) {
  const loc = NUM_FORMATS[numFmt]?.locale;
  const official = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  // Rupiah and similar officially have a smaller unit, so "Always" shows two decimals even though most apps hide them.
  const d = decimals === 'hide' ? 0 : decimals === 'show' ? (NO_CENTS.has(currency) ? 2 : official) : NO_CENTS.has(currency) ? 0 : official;
  return new Intl.NumberFormat(loc, { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d, ...extra });
}
/** An amount for an input box, in the chosen style but without thousands separators: 1000 · 1000,5 · 12.50 */
export const fmtInput = (minor: number) => {
  const s = minor % 100 ? (minor / 100).toFixed(2) : String(minor / 100);
  return decSep === ',' ? s.replace('.', ',') : s;
};

/** Read a typed number using the chosen separators. "1.000" is a thousand when the decimal mark is a comma. */
const num = (raw: string) => {
  const t = raw.replace(/[\s'’\u00a0\u202f]/g, '');
  const [dec, grp] = decSep === ',' ? [',', '.'] : ['.', ','];
  // A lone opposite mark followed by 1–2 digits at the end is still a decimal point (12.50 typed on an ID-style phone).
  if (!t.includes(dec) && new RegExp('\\' + grp + '\\d{1,2}$').test(t) && t.split(grp).length === 2) return Number(t.replace(grp, '.'));
  return Number(t.split(grp).join('').replace(dec, '.'));
};
export const OPS = /[+\-−*/×÷]/;
/** Works out a sum typed as text, e.g. "3.49 + 9.75 × 2". Returns null if it isn't a complete sum. */
export function evalExpr(input: string): number | null {
  input = input.replace(/[\s'’\u00a0\u202f]+/g, '');
  const toks = input.match(/\d[\d.,]*|\.\d+|[+\-−*/×÷()]/g);
  if (!toks || toks.join('') !== input.replace(/[^\d.,+\-−*/×÷()]/g, '')) return null;
  let i = 0;
  const peek = () => toks[i];
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-' || peek() === '−') v = toks[i++] === '+' ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '*' || peek() === '×' || peek() === '/' || peek() === '÷') { const op = toks[i++]; const r = factor(); v = op === '*' || op === '×' ? v * r : v / r; }
    return v;
  };
  const factor = (): number => {
    const t = toks[i++];
    if (t === '-' || t === '−') return -factor();
    if (t === '(') { const v = expr(); if (toks[i++] !== ')') throw 0; return v; }
    if (t === undefined || !/\d/.test(t)) throw 0;
    return num(t);
  };
  try { const v = expr(); return i === toks.length && Number.isFinite(v) ? v : null; } catch { return null; }
}
/** The amount in cents. Accepts plain numbers (12.50, 1,234.56, 12,50) and sums (3.49 + 9.75). */
export const parseAmount = (s: string) => {
  const t = s.replace(/[^\d.,+\-−*/×÷() '’\u00a0\u202f]/g, '').trim().replace(/[+\-−*/×÷\s]+$/, '');
  const n = evalExpr(t) ?? num(t.replace(/[^\d.,-]/g, ''));
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : 0;
};
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Cumulative spend by day of month (index 0 = day 1). */
export function cumulative(s: MonthSum, m: string, upTo?: number) {
  const n = daysIn(m);
  const by = new Array(n).fill(0);
  for (const t of s.txs) if (t.type === 'expense') by[Number(t.date.slice(8, 10)) - 1] += t.amount;
  const out: (number | null)[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += by[i]; out.push(upTo !== undefined && i + 1 > upTo ? null : acc); }
  return out;
}
