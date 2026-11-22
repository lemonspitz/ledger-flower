// Receipt-reading benchmark on CORD (1,000 real Indonesian receipts with hand-checked answers; CC BY 4.0,
// https://huggingface.co/datasets/naver-clova-ix/cord-v2). The dataset itself is not in this repo.
//   npx tsx bench/cord.ts <cord-dir> [--split train|heldout|all] [--ocr <ocr-results.json>] [--show N]
// Without --ocr it rebuilds each receipt's text from the annotations ("perfect OCR"), which tests the parser alone.
// With --ocr it uses text read from the photos by the app's own scanner (bench/ocr-run.cjs).
import { readFileSync } from 'node:fs';
import { parseReceipt, type Receipt } from '../src/receipt';

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k: string, d = '') => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const split = opt('--split', 'all');
const ocrFile = opt('--ocr');
const show = Number(opt('--show', '0'));

interface Word { quad: Record<string, number>; text: string; row_id: number }
interface Line { words: Word[]; category: string }
interface GT { gt_parse: Record<string, unknown>; valid_line: Line[] }

/** Rebuild receipt text: words grouped into printed rows, columns separated by wide gaps. */
export function gtText(gt: GT) {
  const rows = new Map<number, Word[]>();
  for (const l of gt.valid_line) for (const w of l.words) { const r = rows.get(w.row_id) ?? []; r.push(w); rows.set(w.row_id, r); }
  return [...rows.values()]
    .map((ws) => ws.sort((a, b) => a.quad.x1 - b.quad.x1))
    .sort((a, b) => Math.min(...a.map((w) => w.quad.y1)) - Math.min(...b.map((w) => w.quad.y1)))
    .map((ws) => ws.map((w, i) => (i && w.quad.x1 - ws[i - 1].quad.x2 > 25 ? '   ' : i ? ' ' : '') + w.text).join(''))
    .join('\n');
}

/** "60.000", "60,000", "Rp 18.182,00", "-5.000" → minor units (×100). */
export function money(v: unknown): number | null {
  if (v == null) return null;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const m = s.match(/^(.*?)[.,](\d{1,2})$/);
  const whole = m ? m[1] : s, frac = m ? m[2].padEnd(2, '0') : '00';
  const n = Number(whole.replace(/[.,]/g, '') + frac);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
const arr = <T,>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

interface Truth { items: { name: string; amount: number }[]; extras: number[]; total: number | null; subtotal: number | null; tax: number | null; service: number | null; discount: number | null }
export function truth(gt: GT): Truth {
  const p = gt.gt_parse as Record<string, Record<string, unknown> | Record<string, unknown>[]>;
  const items: Truth['items'] = [], extras: number[] = [];
  for (const m of arr(p.menu as Record<string, unknown>[])) {
    const price = money(m.price ?? m.itemsubtotal);
    if (price) items.push({ name: String(m.nm ?? ''), amount: Math.abs(price) });
    // Toppings and add-ons printed on their own line ("- Cheese 5,454") are annotated inside their dish. Reading one as
    // a line of its own is not counted as wrong (the bill still adds up), nor required.
    for (const s of arr(m.sub as Record<string, unknown>[])) { const v = money(s.price); if (v) extras.push(Math.abs(v)); }
  }
  const sub = (p.sub_total ?? {}) as Record<string, unknown>, tot = (p.total ?? {}) as Record<string, unknown>;
  const first = (v: unknown) => money(Array.isArray(v) ? v[0] : v);
  return { items, extras, total: first(tot.total_price), subtotal: first(sub.subtotal_price), tax: first(sub.tax_price), service: first(sub.service_price), discount: first(sub.discount_price) };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
const nameOk = (a: string, b: string) => { const A = norm(a), B = new Set(norm(b)); return !A.length || A.filter((w) => B.has(w)).length / A.length >= 0.5; };

export function score(r: Receipt, t: Truth) {
  // Items: match by amount (line total) as a multiset.
  const want = t.items.map((x) => x.amount), got = r.items.map((x) => x.amount);
  const pool = [...t.items]; let hit = 0, names = 0;
  const extra = [...t.extras]; let neutral = 0;
  r.items.forEach((x) => {
    // Same price on several lines: pair with the one whose name matches, if any.
    const same = pool.filter((y) => y.amount === x.amount), g = same.find((y) => nameOk(y.name, x.name)) ?? same[0];
    if (g) { pool.splice(pool.indexOf(g), 1); hit++; if (nameOk(g.name, x.name)) names++; return; }
    const e = extra.indexOf(x.amount); if (e >= 0) { extra.splice(e, 1); neutral++; }
  });
  const near = (a: number | undefined, b: number | null) => b == null ? null : a != null && Math.abs(Math.abs(a) - Math.abs(b)) <= 100;
  return {
    itemsWant: want.length, itemsGot: got.length - neutral, itemsHit: hit, namesHit: names,
    itemsPerfect: hit === want.length && got.length - neutral === want.length,
    total: near(r.total, t.total), subtotal: near(r.subtotal, t.subtotal),
    tax: t.tax ? near(r.charges?.tax, t.tax) : null, service: t.service ? near(r.charges?.service, t.service) : null,
  };
}

if (dir && /cord\.ts$/.test(process.argv[1] ?? "")) {
  const index = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')) as { id: string; split: string }[];
  const ocr = ocrFile ? JSON.parse(readFileSync(ocrFile, 'utf8')) as Record<string, string> : null;
  const pick = index.filter((x) => (split === 'all' ? true : split === 'train' ? x.split === 'train' : x.split !== 'train') && (!ocr || x.id in ocr));
  const agg = { n: 0, want: 0, got: 0, hit: 0, names: 0, perfect: 0, total: [0, 0], subtotal: [0, 0], tax: [0, 0], service: [0, 0] };
  const bad: string[] = [];
  for (const x of pick) {
    const gt = JSON.parse(readFileSync(`${dir}/img/${x.id}.json`, 'utf8')) as GT;
    const t = truth(gt);
    if (t.total == null && !t.items.length) continue;
    const text = ocr ? ocr[x.id] : gtText(gt);
    let r: Receipt;
    try { r = parseReceipt(text, []); } catch (e) { bad.push(`${x.id} CRASH ${(e as Error).message}`); continue; }
    const s = score(r, t);
    agg.n++; agg.want += s.itemsWant; agg.got += s.itemsGot; agg.hit += s.itemsHit; agg.names += s.namesHit; if (s.itemsPerfect) agg.perfect++;
    for (const k of ['total', 'subtotal', 'tax', 'service'] as const) if (s[k] !== null) { agg[k][1]++; if (s[k]) agg[k][0]++; }
    if (!s.itemsPerfect || s.total === false) bad.push(`${x.id}  items ${s.itemsHit}/${s.itemsWant} (got ${s.itemsGot})  total ${s.total ? 'ok' : `got ${r.total / 100} want ${(t.total ?? 0) / 100}`}`);
  }
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
  const P = agg.got ? agg.hit / agg.got : 0, R = agg.want ? agg.hit / agg.want : 0;
  console.log(`${ocr ? 'Photos (OCR + parser)' : 'Perfect text (parser only)'} · ${split} · ${agg.n} receipts`);
  console.log(`  receipts with every item right : ${pct(agg.perfect, agg.n)}`);
  console.log(`  items found (recall)           : ${pct(agg.hit, agg.want)}   items correct (precision): ${pct(agg.hit, agg.got)}   F1 ${(2 * P * R / (P + R || 1) * 100).toFixed(1)}%`);
  console.log(`  item names right (of found)    : ${pct(agg.names, agg.hit)}`);
  for (const k of ['total', 'subtotal', 'tax', 'service'] as const) console.log(`  ${k.padEnd(31)}: ${pct(agg[k][0], agg[k][1])}  (${agg[k][1]} receipts)`);
  if (show) console.log('\n' + bad.slice(0, show).join('\n'));
}
