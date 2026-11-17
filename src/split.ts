// Bill calculator and splitter. All money is in hundredths (cents/sen), like the rest of the app.

export interface BillItem { name: string; unit: number; qty: number; who: string[] } // who empty = shared by everyone
export interface BillCharges { service: number; tax: number; taxOnService: boolean; discount: number } // percents, discount in hundredths
export interface PersonShare {
  key: string; lines: { name: string; amount: number; sharedBy: number }[];
  subtotal: number; discount: number; service: number; tax: number; total: number;
}
export interface BillResult { subtotal: number; discount: number; service: number; tax: number; total: number; people: PersonShare[] }

/** Split `total` into whole parts in proportion to `weights`, so the parts always add up exactly (largest remainder). */
export function alloc(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  const s = sum > 0 ? sum : w.length;
  const raw = w.map((x) => (total * x) / s);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out;
}

/** Service is charged on the subtotal after discount; tax on that too, plus service when `taxOnService`. */
export function computeBill(items: BillItem[], people: string[], ch: BillCharges): BillResult {
  const per = new Map(people.map((k) => [k, { lines: [] as PersonShare['lines'], sub: 0 }]));
  for (const it of items) {
    const line = Math.round(it.unit * (it.qty || 0));
    if (!line) continue;
    const named = it.who.filter((w) => per.has(w));
    const ws = named.length ? named : people;
    alloc(line, ws.map(() => 1)).forEach((amount, i) => {
      const p = per.get(ws[i])!;
      p.sub += amount;
      p.lines.push({ name: it.name || 'Item', amount, sharedBy: ws.length });
    });
  }
  const subs = people.map((k) => per.get(k)!.sub);
  const subtotal = subs.reduce((a, b) => a + b, 0);
  const discount = Math.min(Math.max(0, Math.round(ch.discount)), subtotal);
  const base = subtotal - discount;
  const service = Math.round((base * (ch.service || 0)) / 100);
  const tax = Math.round(((base + (ch.taxOnService ? service : 0)) * (ch.tax || 0)) / 100);
  const total = base + service + tax;
  const dA = alloc(discount, subs), sA = alloc(service, subs), tA = alloc(tax, subs);
  return {
    subtotal, discount, service, tax, total,
    people: people.map((key, i) => ({ key, lines: per.get(key)!.lines, subtotal: subs[i], discount: dA[i], service: sA[i], tax: tA[i], total: subs[i] - dA[i] + sA[i] + tA[i] })),
  };
}

/** Turn service/tax amounts printed on a receipt into percentages, and work out whether tax was charged on service. */
export function ratesFromAmounts(subtotal: number, service: number, tax: number, printed: { service?: number; tax?: number } = {}) {
  const round = (x: number) => Math.round(x * 10) / 10;
  const svc = printed.service ?? (subtotal ? round((service / subtotal) * 100) : 0);
  if (printed.tax !== undefined) {
    const withSvc = Math.abs(Math.round(((subtotal + service) * printed.tax) / 100) - tax);
    const without = Math.abs(Math.round((subtotal * printed.tax) / 100) - tax);
    return { service: svc, tax: printed.tax, taxOnService: !tax || withSvc <= without };
  }
  if (!tax || !subtotal) return { service: svc, tax: 0, taxOnService: true };
  // Pick whichever reading gives the "rounder" rate (receipts use 10%, 11%, 5%, not 9.52%).
  const a = (tax / (subtotal + service)) * 100, b = (tax / subtotal) * 100;
  const off = (x: number) => Math.abs(x - Math.round(x * 2) / 2);
  return off(a) <= off(b) || !service ? { service: svc, tax: round(a), taxOnService: true } : { service: svc, tax: round(b), taxOnService: false };
}
