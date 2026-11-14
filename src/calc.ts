import { useMemo } from 'react';
import { live, today, useData, ymd, type Data, type Tx } from './store';

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
  const currency = data.settings.settings?.currency || 'USD';
  const nf = new Intl.NumberFormat(undefined, { style: 'currency', currency });
  const nf0 = new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 });
  const nfc = new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
  return {
    data, txs, accounts, categories, balances, months, netWorth, currency,
    month: (m: string) => months.get(m) ?? emptyMonth(),
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

export const parseAmount = (s: string) => {
  const n = Number(s.replace(/[^\d.,-]/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, ''));
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

export function toCsv(m: Model) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [['Date', 'Type', 'Amount', 'Category', 'Account', 'To account', 'Note']];
  for (const t of m.txs) rows.push([t.date, t.type, (t.amount / 100).toFixed(2), m.cat(t.cat)?.name ?? '', m.acc(t.acc)?.name ?? '', m.acc(t.toAcc)?.name ?? '', t.note]);
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
