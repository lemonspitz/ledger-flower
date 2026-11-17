// Local-first data store. Every record carries `u` (last-update clock) and
// deletes are tombstones, so two devices can always merge by "newest wins".
import { useSyncExternalStore } from 'react';

export type Coll = 'accounts' | 'categories' | 'tx' | 'budgets' | 'goals' | 'recurring' | 'settings';
export const COLLS: Coll[] = ['accounts', 'categories', 'tx', 'budgets', 'goals', 'recurring', 'settings'];

export interface Base { id: string; u: number; del?: 1 }
export interface Account extends Base { name: string; type: 'cash' | 'bank' | 'card' | 'savings' | 'owed'; opening: number }
export interface Category extends Base { name: string; kind: 'expense' | 'income'; icon: string; subs?: string[] }
export type TxType = 'expense' | 'income' | 'transfer';
export interface Tx extends Base { date: string; amount: number; type: TxType; acc: string; toAcc?: string; cat?: string; sub?: string; note: string; rid?: string; pm?: PayKind; pmid?: string; who?: string } // who: the friend a lent/repaid transfer is for
export interface Budget extends Base { limit: number } // id === category id
export interface Goal extends Base { name: string; target: number; saved: number; due?: string; icon: string }
export interface Recurring extends Base { name: string; amount: number; type: 'expense' | 'income'; acc: string; cat: string; freq: 'weekly' | 'monthly' | 'yearly'; next: string }
export type NumFmt = 'auto' | 'en' | 'id' | 'fr' | 'ch' | 'in';
export interface Settings extends Base { currency: string; numFmt?: NumFmt; decimals?: 'auto' | 'show' | 'hide' }
export type PayKind = 'cash' | 'card' | 'qr';
/** A saved card or QR bank/app. Kept in the settings collection (ids start with "pm_") so devices on
 *  older versions, which only read the "settings" record there, keep these intact when syncing. */
export interface PayMethod extends Base { type: 'method'; kind: 'card' | 'qr'; name: string; last4?: string; network?: string; acc?: string }

export interface Data {
  accounts: Record<string, Account>; categories: Record<string, Category>; tx: Record<string, Tx>;
  budgets: Record<string, Budget>; goals: Record<string, Goal>; recurring: Record<string, Recurring>;
  settings: Record<string, Settings | PayMethod>;
}
export type Wire = Base & { c: Coll } & Record<string, unknown>;

const KEY = 'll.data.v1';
const DEFAULT_CATS: [string, string, 'expense' | 'income', string, string[]?][] = [
  ['cat_groceries', 'Groceries', 'expense', '🛒', ['Vegetables', 'Fruit', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Pantry', 'Snacks', 'Drinks', 'Household']],
  ['cat_dining', 'Dining out', 'expense', '🍽️', ['Restaurants', 'Coffee', 'Fast food', 'Delivery', 'Bars']],
  ['cat_housing', 'Housing', 'expense', '🏠', ['Rent', 'Mortgage', 'Repairs', 'Furniture']],
  ['cat_transport', 'Transport', 'expense', '🚌', ['Fuel', 'Public transit', 'Taxi & ride share', 'Parking', 'Maintenance']],
  ['cat_utilities', 'Utilities', 'expense', '💡', ['Electricity', 'Water', 'Gas', 'Internet', 'Phone']],
  ['cat_health', 'Health', 'expense', '💊', ['Pharmacy', 'Doctor', 'Dental', 'Fitness']],
  ['cat_fun', 'Entertainment', 'expense', '🎬', ['Movies', 'Games', 'Events', 'Hobbies']],
  ['cat_shopping', 'Shopping', 'expense', '🛍️', ['Clothing', 'Electronics', 'Home', 'Gifts']],
  ['cat_subs', 'Subscriptions', 'expense', '🔁', ['Streaming', 'Music', 'Software', 'Memberships']],
  ['cat_travel', 'Travel', 'expense', '✈️', ['Flights', 'Lodging', 'Activities']],
  ['cat_other', 'Other', 'expense', '📦'],
  ['cat_salary', 'Salary', 'income', '💼'], ['cat_side', 'Side income', 'income', '🧰'],
  ['cat_gift', 'Gifts & refunds', 'income', '🎁'],
];

function fresh(): Data {
  const d: Data = { accounts: {}, categories: {}, tx: {}, budgets: {}, goals: {}, recurring: {}, settings: {} };
  // Fixed ids + u:0 so the defaults on two devices merge instead of duplicating.
  for (const [id, name, kind, icon, subs] of DEFAULT_CATS) d.categories[id] = { id, u: 0, name, kind, icon, subs };
  d.accounts.acc_main = { id: 'acc_main', u: 0, name: 'Main account', type: 'bank', opening: 0 };
  d.settings.settings = { id: 'settings', u: 0, currency: 'USD' };
  return d;
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d: Data = { ...fresh(), ...JSON.parse(raw) };
      // Data saved before sub-categories existed: give untouched default categories their starter list.
      for (const [id, , , , subs] of DEFAULT_CATS) { const c = d.categories[id]; if (c && !c.del && !c.subs && subs) c.subs = subs; }
      return d;
    }
  } catch { /* corrupt or unavailable storage: start clean */ }
  return fresh();
}

let data: Data = load();
let clock = 0;
for (const c of COLLS) for (const r of Object.values(data[c])) if (r.u > clock) clock = r.u;

const subs = new Set<() => void>();
const dirtySubs = new Set<(buckets: string[]) => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.error('save failed', e); }
  }, 150);
}
function emit() { persist(); subs.forEach((f) => f()); }
export function flushSave() { clearTimeout(saveTimer); try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ } }

export const tick = () => (clock = Math.max(Date.now(), clock + 1));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const txId = (date: string, suffix = uid()) => `${date.slice(0, 7)}_${suffix}`;
export const bucketOf = (c: Coll, id: string) => (c === 'tx' ? 'tx:' + id.slice(0, 7) : 'meta');

export const getData = () => data;
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const onDirty = (f: (b: string[]) => void) => { dirtySubs.add(f); return () => { dirtySubs.delete(f); }; };
export const useData = () => useSyncExternalStore(subscribe, getData);

/** Create or update records locally. */
type Draft<T> = T extends unknown ? Omit<T, 'u'> & { u?: number } : never;
export function put<C extends Coll>(c: C, ...recs: Draft<Data[C][string]>[]) {
  const coll = { ...data[c] } as Record<string, Base>;
  const buckets = new Set<string>();
  for (const r of recs) { coll[r.id] = { ...r, u: tick() } as Base; buckets.add(bucketOf(c, r.id)); }
  data = { ...data, [c]: coll };
  emit();
  dirtySubs.forEach((f) => f([...buckets]));
}
export function remove(c: Coll, ...ids: string[]) {
  put(c, ...(ids.map((id) => ({ id, del: 1 })) as never[]));
}

/** Merge records from another device. Returns true when anything changed. */
export function mergeRemote(recs: Wire[]) {
  let next: Data | null = null;
  for (const w of recs) {
    const { c, ...rec } = w;
    if (!COLLS.includes(c) || typeof rec.id !== 'string' || typeof rec.u !== 'number') continue;
    const cur = (next ?? data)[c][rec.id];
    if (cur && cur.u >= rec.u) continue;
    // A device on an older version may send a default category without its sub-category list.
    if (c === 'categories' && rec.u === 0 && !rec.subs) { const d = DEFAULT_CATS.find((x) => x[0] === rec.id); if (d?.[4]) rec.subs = d[4]; }
    next ??= { ...data };
    if (next[c] === data[c]) (next as Record<Coll, unknown>)[c] = { ...data[c] };
    (next[c] as Record<string, Base>)[rec.id] = rec as Base;
    if (rec.u > clock) clock = rec.u;
  }
  if (!next) return false;
  data = next;
  emit();
  return true;
}

export function bucketRecords(bucket: string): Wire[] {
  const out: Wire[] = [];
  if (bucket === 'meta') {
    for (const c of COLLS) if (c !== 'tx') for (const r of Object.values(data[c])) out.push({ ...r, c });
  } else {
    const p = bucket.slice(3);
    for (const r of Object.values(data.tx)) if (r.id.startsWith(p)) out.push({ ...r, c: 'tx' });
  }
  return out;
}
export function allBuckets(): string[] {
  const s = new Set(['meta']);
  for (const id in data.tx) s.add('tx:' + id.slice(0, 7));
  return [...s];
}

export function replaceAll(d: Partial<Data> | null) {
  // Used by "erase" and "restore backup": re-stamp everything so it wins on other devices too.
  const old = data;
  const base = fresh();
  const next = d ? { ...base, ...d } : base;
  const stamp = tick();
  for (const c of COLLS) {
    const coll: Record<string, Base> = {};
    for (const r of Object.values(next[c] as Record<string, Base>)) coll[r.id] = { ...r, u: stamp };
    for (const id in old[c]) if (!coll[id]) coll[id] = { id, u: stamp, del: 1 };
    (next as Record<Coll, unknown>)[c] = coll;
  }
  data = next as Data;
  emit();
  dirtySubs.forEach((f) => f(allBuckets()));
}

// ---------- helpers used by views ----------
export const live = <T extends Base>(m: Record<string, T>) => Object.values(m).filter((r) => !r.del);
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => ymd(new Date());

function advance(date: string, freq: Recurring['freq']) {
  const [y, m, d] = date.split('-').map(Number);
  if (freq === 'weekly') return ymd(new Date(y, m - 1, d + 7));
  const ny = freq === 'yearly' ? y + 1 : m === 12 ? y + 1 : y;
  const nm = freq === 'yearly' ? m : m === 12 ? 1 : m + 1;
  const last = new Date(ny, nm, 0).getDate();
  return ymd(new Date(ny, nm - 1, Math.min(d, last)));
}

/** Post any recurring items that have come due. Ids are deterministic, so two
 *  devices posting the same bill produce one transaction, not two. */
export function runRecurring() {
  const t = today();
  const txs: Omit<Tx, 'u'>[] = [];
  const recs: Omit<Recurring, 'u'>[] = [];
  for (const r of live(data.recurring)) {
    let next = r.next, n = 0;
    while (next <= t && n++ < 120) {
      txs.push({ id: txId(next, `r_${r.id}_${next}`), date: next, amount: r.amount, type: r.type, acc: r.acc, cat: r.cat, note: r.name, rid: r.id });
      next = advance(next, r.freq);
    }
    if (next !== r.next) recs.push({ ...r, next });
  }
  const newTx = txs.filter((x) => !data.tx[x.id]);
  if (newTx.length) put('tx', ...newTx);
  if (recs.length) put('recurring', ...recs);
}
