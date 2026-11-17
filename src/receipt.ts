// Receipt scanning: the photo is read on this device (Tesseract OCR compiled to
// WebAssembly, bundled with the app) and never uploaded anywhere. The text is
// then parsed into a merchant, date, total and line items.
import { today, ymd, type Category } from './store';

export interface ReceiptItem { name: string; amount: number; qty?: number; unit?: number; sub?: string }
export interface Receipt { merchant: string; date: string; total: number; items: ReceiptItem[]; cat?: string; text: string; pay?: PaidWith; charges?: { service: number; tax: number; discount: number; servicePct?: number; taxPct?: number } }
export interface PaidWith { kind: 'cash' | 'card' | 'qr'; name?: string; last4?: string }

const QR_BRANDS: [RegExp, string][] = [
  [/\bgo-?pay\b/i, 'GoPay'], [/\bovo\b/i, 'OVO'], [/\bdana\b/i, 'DANA'], [/shopee\s?pay/i, 'ShopeePay'], [/link\s?aja/i, 'LinkAja'],
  [/pay\s?now/i, 'PayNow'], [/prompt\s?pay/i, 'PromptPay'], [/duit\s?now/i, 'DuitNow'], [/\bgcash\b/i, 'GCash'], [/alipay/i, 'Alipay'],
  [/we\s?chat\s?pay/i, 'WeChat Pay'], [/\bpaytm\b/i, 'Paytm'], [/phone\s?pe/i, 'PhonePe'], [/\bq\s?r\s?[i1lt|!]\s?[s5]\b/i, 'QRIS'], [/\bqr\b/i, ''],
];
/** How the receipt says it was paid: a QR app, a card (with its last 4 digits when printed), or cash. */
export function detectPayment(text: string): PaidWith | undefined {
  for (const [re, name] of QR_BRANDS) if (re.test(text)) return { kind: 'qr', name: name || undefined };
  const last4 = text.match(/(?:[*xX•#]{2,}\s?|ending\s+(?:in\s+)?)(\d{4})\b/)?.[1];
  const network = text.match(/\b(visa|master\s?card|amex|american express|jcb|union\s?pay|discover)\b/i)?.[1];
  if (last4 || network || /\b(debit|credit|kartu|card|edc)\b/i.test(text)) return { kind: 'card', last4, name: network?.replace(/\s+/g, '') };
  if (/\b(cash|tunai|efectivo|esp[eè]ces|contanti|bargeld)\b/i.test(text)) return { kind: 'cash' };
  return undefined;
}

// Prices come in many shapes: 3.49 · $3.49 · 1,60 € · 1.234,56 · Rp 17.500 · ¥1,239 · 98.000
const CUR = String.raw`(?:[$€£¥₹₩₱฿₫]|rp\.?|idr|rm|usd|eur|sgd|php|thb|vnd|jpy|krw|inr)`;
const NUMBER = String.raw`\d{1,3}(?:[.,'’]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const LINE_PRICE = new RegExp(String.raw`^(.*?)[\s:.*@=-]*(?:(${CUR})\s?)?(-|−)?\s?(${NUMBER})\s*(?:${CUR}|[A-Za-z*#]{1,3})?\s*$`, 'i');
const TOTAL = /\b(grand\s*total|total|amount\s*due|balance\s*due|to\s*pay|jumlah|tagihan|totale|totaal|gesamt|summe|betrag|importe|montant)\b|合計|合计/i;
const NOT_TOTAL = /\bqty\b|\bprice\b|\bharga\b|sub\s*-?\s*total|total\s*(tax|vat|savings?|items?|discount|qty|disc|hemat|item)|tax\s*total|points/i;
const PAID = /\b(cash|change|tender|tunai|kembali(an)?|bar|r[uü]ckgeld|efectivo|cambio|esp[eè]ces|rendu|contanti|resto|kontant|card|visa|master\s?card|amex|debit|kartu|qris|ovo|gopay|dana)\b/i;
const SERVICE = /\b(service|svc|serv\.?\s?ch(?:ar)?ge?|s\.?\s?charge|layanan|biaya\s+layanan|gratuity|tip|sc)\b/i;
const TAX = /\b(tax|pb\s?1|ppn|pajak|vat|gst|mwst|iva|tva)\b/i;
const SKIP_ITEM = /\bservice\b|\bsvc\b|layanan|sub\s*-?\s*total|\btotal\b|\btax\b|\bvat\b|\bgst\b|\bppn\b|\bpb\s?1\b|\bpajak\b|\bmwst\b|\biva\b|\btva\b|\bchange\b|balance|tender|payment|\btip\b|gratuity|discount|diskon|coupon|savings|hemat|rounding|pembulatan|loyalty|points/i;

/** Value of a printed number in hundredths. "17.500" is seventeen thousand five hundred; "17.50" is seventeen and a half. */
function toMinor(raw: string) {
  const s = raw.replace(/['’]/g, '');
  const m = s.match(/^(.*?)(?:[.,](\d{1,2}))?$/)!;
  const whole = Number((m[1] || '0').replace(/[.,]/g, ''));
  return whole * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
}
interface Price { label: string; value: number; decimals: boolean; currency: boolean }
function linePrice(line: string): Price | null {
  const m = line.match(LINE_PRICE);
  if (!m) return null;
  const raw = m[4];
  if (/^\d+$/.test(raw) && /%\s*$/.test(line)) return null;
  const value = toMinor(raw) * (m[3] ? -1 : 1);
  return { label: m[1], value, decimals: /[.,]\d{1,2}$/.test(raw) && !/[.,]\d{3}$/.test(raw), currency: !!m[2] || new RegExp(CUR + String.raw`\s*$`, 'i').test(line) };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function valid(y: number, m: number, d: number) {
  if (y < 100) y += 2000;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  const s = ymd(dt);
  const lim = new Date(); lim.setDate(lim.getDate() + 1);
  return s <= ymd(lim) && y >= 2000 ? s : null;
}

function findDate(text: string): string | null {
  let m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) { const r = valid(+m[1], +m[2], +m[3]); if (r) return r; }
  m = text.match(/\b(\d{1,2})[\s.-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.,-]*(\d{4}|\d{2})\b/i);
  if (m) { const r = valid(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]); if (r) return r; }
  m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.]*(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{4})\b/i);
  if (m) { const r = valid(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]); if (r) return r; }
  for (const x of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g)) {
    const a = +x[1], b = +x[2], y = +x[3];
    // Day-first or month-first? Decide by the values, then by this device's locale.
    const monthFirst = a > 12 ? false : b > 12 ? true : new Intl.DateTimeFormat().formatToParts(new Date()).find((p) => p.type === 'month' || p.type === 'day')?.type === 'month';
    const r = monthFirst ? valid(y, a, b) ?? valid(y, b, a) : valid(y, b, a) ?? valid(y, a, b);
    if (r) return r;
  }
  return null;
}

const tidy = (s: string) => {
  const t = s.replace(/\s+/g, ' ').replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9%)]+$/g, '').trim();
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s&/-])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase()) : t;
};

// Keyword → sub-category name (matched against the category's own list, so renamed lists still work when names overlap).
const SUB_WORDS: [RegExp, string][] = [
  [/tomato|lettuce|onion|carrot|potato|spinach|cucumber|pepper|broccoli|cabbage|garlic|mushroom|celery|zucchini|salad|kale|veg|sayur|bawang|kentang|wortel|cabai|cabe|tomat|bayam|kangkung/i, 'Vegetables'],
  [/apple|banana|orange|grape|berry|berries|lemon|\blime|mango|melon|pear|peach|avocado|fruit|pineapple|kiwi|buah|pisang|jeruk|apel|mangga|semangka/i, 'Fruit'],
  [/milk|cheese|yogh?urt|butter|cream|\beggs?\b|cheddar|mozzarella|susu|keju|telur|mentega/i, 'Dairy & eggs'],
  [/chicken|beef|pork|lamb|turkey|bacon|sausage|\bham\b|steak|mince|salmon|tuna|fish|shrimp|prawn|meat|fillet|ayam|daging|ikan|udang|sosis|bakso/i, 'Meat & fish'],
  [/bread|bagel|baguette|croissant|muffin|\brolls?\b|\bbuns?\b|tortilla|pastry|cake|donut|roti|br[oö]tchen|kuchen/i, 'Bakery'],
  [/rice|pasta|flour|sugar|\boil\b|cereal|beans|lentil|sauce|spice|\bsalt\b|noodle|oats|soup|canned|honey|\bjam\b|beras|\bmie\b|indomie|tepung|gula|minyak|kecap|saus|garam/i, 'Pantry'],
  [/chips|crisps|chocolate|cookie|biscuit|candy|sweets|popcorn|snack|nuts\b|ice ?cream/i, 'Snacks'],
  [/water|juice|soda|cola|coke|coffee|\btea\b|beer|wine|drink|lemonade|sparkling|energy|\bair\b|\bteh\b|kopi|jus|kaffee/i, 'Drinks'],
  [/soap|detergent|tissue|toilet|paper towel|shampoo|toothpaste|cleaner|sponge|foil|trash|bin bag|laundry|bleach|sabun|deterjen|tisu|sampo|pasta gigi|pembersih/i, 'Household'],
  [/latte|espresso|cappuccino|americano|mocha/i, 'Coffee'],
  [/unleaded|diesel|petrol|gasoline|fuel/i, 'Fuel'],
];
const CAT_WORDS: [RegExp, string, string?][] = [
  [/market|grocer|supermarket|foods?\b|fresh|farm|butcher|bakery|deli\b|mart\b|co-?op/i, 'cat_groceries'],
  [/coffee|caf[eé]|espresso|roasters/i, 'cat_dining', 'Coffee'],
  [/restaurant|pizza|burger|grill|kitchen|bistro|diner|sushi|taco|noodle|bar\b|pub\b|eatery|steakhouse|ramen|bbq/i, 'cat_dining', 'Restaurants'],
  [/pharmacy|drug ?store|chemist|clinic|dental|medical|optic/i, 'cat_health', 'Pharmacy'],
  [/fuel|petrol|gas station|service station|unleaded|diesel/i, 'cat_transport', 'Fuel'],
  [/parking|garage/i, 'cat_transport', 'Parking'],
  [/cinema|theat(er|re)|bowling|arcade|museum/i, 'cat_fun'],
  [/hotel|inn\b|hostel|airline|airways/i, 'cat_travel'],
  [/hardware|clothing|apparel|fashion|electronics|book ?(shop|store)|department/i, 'cat_shopping'],
];

export function guessSub(name: string, cat?: Category) {
  if (!cat?.subs?.length) return undefined;
  const direct = cat.subs.find((s) => name.toLowerCase().includes(s.toLowerCase()));
  if (direct) return direct;
  for (const [re, sub] of SUB_WORDS) if (re.test(name) && cat.subs.includes(sub)) return sub;
  return undefined;
}

// ───────── reading menu lines ─────────
// Lines that carry numbers but are not things you bought: order/table/receipt numbers, cashier, phone,
// dates and times, loyalty points, column headings, greetings.
const NOISE = new RegExp([
  String.raw`\b(order|pesanan)\s*(no|#|:|\d|type)`, String.raw`\b(invoice|inv|receipt|struk|nota|bill\s*no|no\.?\s*(order|struk|nota|bill|trx|transaksi|meja|antrian))\b`,
  String.raw`\btable\s*(no|#|:|\d)`, String.raw`\b(meja|pax|guests?|tamu|covers?)\b`,
  String.raw`\b(cashier|kasir|server|waiter|waitress|pelayan|operator|staff)\b`,
  String.raw`\b(telp?|phone|hp|wa|whatsapp|fax|npwp|nib|wifi|password|email)\b`,
  String.raw`\b(poin|points?|kode|code|queue|antrian|ref|trx|transaksi|terminal|tid|mid|approval|appr|auth|batch|trace)\b`,
  String.raw`\b(date|tanggal|tgl|time|jam|waktu)\s*[:\d]`, String.raw`\b(dine\s*in|take\s*away|takeaway|delivery|pickup|www|instagram|ig)\b`,
  String.raw`\b(thank|terima\s*kasih|welcome|selamat)\b`, String.raw`\b(qty|price|harga|total\s*items?|jumlah\s*item)\b`, String.raw`#\w*\d`,
].join('|'), 'i');
const DISCOUNT = /\b(disc(ount)?|diskon|promo|voucher|potongan|hemat|savings?|coupon|kupon)\b/i;
const SEP = /^[xX×@=]$/;
const CUR_TOK = new RegExp(String.raw`^(?:${CUR})$`, 'i');
const NUM_TOK = new RegExp(String.raw`^\(?(?:(${CUR})\.?)?(-|−)?(?:(${CUR})\.?)?(${NUMBER})(${CUR})?\)?$`, 'i');

interface Tok { value: number; raw: string; money: boolean; qty?: number; neg: boolean; sepBefore: boolean }
/** The numbers at the end of a line (right to left: total, unit price, quantity) and the words before them. */
function tail(line: string, decimalMode: boolean) {
  const words = line.trim().split(/\s+/);
  const nums: Tok[] = [];
  let sep = false;
  // ignore tax flags and currency codes printed after the price ("3.49 F", "10,10 €", "25.000 IDR")
  while (words.length && !nums.length && (/^([A-Za-z]{1,2}|\*+|[€$£¥])$/.test(words[words.length - 1]) || CUR_TOK.test(words[words.length - 1])) && words.length > 1 && /\d/.test(words[words.length - 2])) words.pop();
  while (words.length && nums.length < 3) {
    const w = words[words.length - 1];
    if (SEP.test(w)) { sep = true; words.pop(); continue; }
    const q = w.match(/^(?:(\d{1,2})([xX×@])|[xX×@](\d{1,2}))$/);
    if (q) {
      if (q[2] === '@' && nums[0]) nums[0].sepBefore = true; // "1@ 22.000": price each follows
      nums.unshift({ value: 0, raw: w, money: false, qty: Number(q[1] ?? q[3]), neg: false, sepBefore: false }); words.pop(); continue;
    }
    if (CUR_TOK.test(w) && nums.length) { words.pop(); continue; } // "Rp 17.500" split into two words
    const m = w.match(NUM_TOK);
    if (!m) break;
    const raw = m[4];
    const grouped = /^\d{1,3}(?:[.,'’]\d{3})+/.test(raw), decimals = /[.,]\d{2}$/.test(raw) && !/[.,]\d{3}$/.test(raw);
    const plain = /^\d+$/.test(raw);
    const cur = !!(m[1] || m[3] || m[5]);
    const value = toMinor(raw);
    const money = decimalMode ? decimals : grouped || cur || (plain && !raw.startsWith('0') && raw.length >= 3 && raw.length <= 7);
    const qty = plain && !raw.startsWith('0') && Number(raw) >= 1 && Number(raw) <= 99 ? Number(raw) : undefined;
    if (!money && qty === undefined) break;
    if (nums[0]) nums[0].sepBefore = sep;
    nums.unshift({ value, raw, money, qty: money ? undefined : qty, neg: !!m[2] || /^\(.*\)$/.test(w), sepBefore: false });
    sep = false;
    words.pop();
  }
  if (nums[0] && sep) nums[0].sepBefore = true;
  return { label: words.join(' '), nums };
}

interface Line { label: string; qty: number; unit: number; total: number; neg: boolean }
/** Work out quantity, unit price and line total from "2 x 20.000 40.000", "2 @ 18.500 37.000", "2 Cheeseburger 12.50 25.00", "2x Nasi Goreng 50.000"… */
function readLine(line: string, decimalMode: boolean): Line | null {
  const { label, nums } = tail(line, decimalMode);
  const money = nums.filter((n) => n.money);
  if (!money.length || !nums[nums.length - 1].money) return null;
  let qty = nums.find((n) => n.qty !== undefined)?.qty;
  const last = money[money.length - 1];
  let total = last.value, unit = money.length > 1 ? money[money.length - 2].value : 0;
  // "2 x 12.000" with nothing after it is a price each; "6x 2,40" / "x2 36.000" is the line total.
  if (money.length === 1 && qty && last.sepBefore) { unit = last.value; total = unit * qty; }
  let name = label.replace(/[\s:.=-]+$/, '');
  const lead = name.match(/^(\d{1,2})\s*[xX×]?\s+(?=\D)|^(\d{1,2})[xX×](?=\D)/);
  if (lead && !qty) { qty = Number(lead[1] ?? lead[2]); name = name.slice(lead[0].length); }
  const trail = name.match(/\s+[xX×](\d{1,2})$|\s+(\d{1,2})[xX×]$/);
  if (trail && !qty) { qty = Number(trail[1] ?? trail[2]); name = name.slice(0, -trail[0].length); }
  if (unit && !qty) { const q = total / unit; if (Number.isInteger(q) && q >= 1 && q <= 99) qty = q; else unit = 0; }
  qty = qty || 1;
  if (!unit) unit = total % qty === 0 ? total / qty : 0;
  if (!unit) { unit = total; qty = 1; }
  return { label: name, qty, unit, total, neg: money.some((n) => n.neg) };
}

export function parseReceipt(text: string, cats: Category[]): Receipt {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // Merchant: first line near the top that is mostly letters.
  const merchantLine = lines.slice(0, 6).find((l) => {
    const letters = (l.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
    return letters >= 3 && letters / l.replace(/\s/g, '').length > 0.6 && !/receipt|invoice|welcome|thank|tel[:.]|www\.|^date/i.test(l);
  });
  const merchant = merchantLine ? tidy(merchantLine).slice(0, 60) : '';

  // Receipts either print cents everywhere (3.49) or not at all (Rp 17.500, ¥598). Work out which,
  // so stray whole numbers (quantities, sizes, register numbers) aren't taken for prices.
  const prices = lines.map(linePrice);
  const decimalMode = prices.filter((p) => p?.decimals).length >= 2;
  const usable = (p: Price | null): p is Price => !!p && p.value !== 0 && (decimalMode ? p.decimals : p.value >= 100 || p.currency);
  const priceAt = (i: number) => (usable(prices[i]) ? prices[i] : null);
  const hasWords = (s: string) => (s.match(/[A-Za-zÀ-ÿ]/g) ?? []).length >= 2;

  let totalIdx = lines.length;
  const totalLines = lines.map((l, i) => i).filter((i) => TOTAL.test(lines[i]) && !NOT_TOTAL.test(lines[i]));
  if (totalLines.length) totalIdx = totalLines[0];
  const subIdx = lines.findIndex((l) => /sub\s*-?\s*total/i.test(l));
  const end = subIdx >= 0 ? Math.min(subIdx, totalIdx) : totalIdx;

  const items: ReceiptItem[] = [];
  const isOther = (l: string) => NOISE.test(l) || TOTAL.test(l) || SERVICE.test(l) || TAX.test(l) || PAID.test(l) || SKIP_ITEM.test(l) || DISCOUNT.test(l);
  for (let i = 0; i < end; i++) {
    const l = lines[i];
    if (isOther(l)) continue;
    let r = readLine(l, decimalMode);
    let name = r?.label ?? '';
    // Two-line items: the name on one line, "2 x 20.000   40.000" on the next.
    if (!r && hasWords(l) && i + 1 < end && !isOther(lines[i + 1])) {
      const next = readLine(lines[i + 1], decimalMode);
      if (next && !hasWords(next.label)) { r = next; name = l; i++; }
    }
    if (!r || r.neg || r.total <= 0) continue;
    name = tidy(name.replace(/^[+\-•*]\s*/, '').replace(/^\d{4,}\s+/, ''));
    if (!hasWords(name)) continue;
    items.push({ name: name.slice(0, 60), amount: r.total, qty: r.qty, unit: r.unit });
  }
  const sum = items.reduce((a, i) => a + i.amount, 0);

  // Service charge and tax lines, with the percentage when it is printed ("SERVICE 5%", "PB1 10%").
  const charges = { service: 0, tax: 0, discount: 0, servicePct: undefined as number | undefined, taxPct: undefined as number | undefined };
  for (let i = 0; i < lines.length; i++) {
    // A minus amount is a discount even when OCR mangles the word ("piskon").
    if (TOTAL.test(lines[i]) || PAID.test(lines[i]) || SERVICE.test(lines[i]) || TAX.test(lines[i])) continue;
    const r = readLine(lines[i], decimalMode);
    if (r && (r.neg || DISCOUNT.test(lines[i]))) charges.discount += r.total;
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], p = priceAt(i);
    const svc = SERVICE.test(l), tx = !svc && TAX.test(l) && !/incl|termasuk|inkl/i.test(l);
    if (!svc && !tx) continue;
    const pct = l.match(/(?<![\d.,])(\d{1,2}(?:[.,]\d{1,3})?)\s?%/)?.[1];
    if (svc) { if (p && p.value > 0) charges.service += p.value; if (pct) charges.servicePct = Number(pct.replace(',', '.')); }
    else { if (p && p.value > 0) charges.tax += p.value; if (pct) charges.taxPct = Number(pct.replace(',', '.')); }
  }


  let total = 0;
  const grand = totalLines.find((i) => /grand\s*total|amount\s*due|balance\s*due|to\s*pay/i.test(lines[i])) ?? totalLines[totalLines.length - 1];
  for (const i of grand !== undefined ? [grand, ...totalLines.filter((x) => x !== grand)] : []) {
    const own = priceAt(i);
    if (own && own.value > 0) { total = own.value; break; }
    // A tilted photo can put the amount on a line of its own next to "TOTAL".
    const near = [i - 2, i - 1, i + 1, i + 2].filter((k) => k >= 0 && k < lines.length && !hasWords(priceAt(k)?.label ?? 'xx') && !PAID.test(lines[k]))
      .map((k) => priceAt(k)!).filter((p) => p.value > 0);
    const pick = near.find((p) => p.currency) ?? near.filter((p) => p.value >= sum).sort((a, b) => a.value - b.value)[0];
    if (pick) { total = pick.value; break; }
  }
  if (!total) total = sum || Math.max(0, ...prices.filter((p, i): p is Price => usable(p) && !PAID.test(lines[i])).map((p) => p.value));

  // Category: by merchant name first, then by what most items look like.
  const has = (id: string) => cats.find((c) => c.id === id && c.kind === 'expense');
  let cat = CAT_WORDS.find(([re, id]) => re.test(merchant) && has(id))?.[1];
  if (!cat) {
    const votes = new Map<string, number>();
    for (const c of cats.filter((x) => x.kind === 'expense')) { const n = items.filter((i) => guessSub(i.name, c)).length; if (n) votes.set(c.id, n); }
    cat = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  const c = cats.find((x) => x.id === cat);
  for (const i of items) i.sub = guessSub(i.name, c);
  return { merchant, date: findDate(text) ?? today(), total, items, cat, text, pay: detectPayment(text), charges };
}

/** Sub-category for the receipt as a whole, e.g. "Coffee" for a café. */
export function merchantSub(merchant: string, cat?: Category) {
  const hit = CAT_WORDS.find(([re, id, sub]) => sub && id === cat?.id && re.test(merchant));
  return hit && cat?.subs?.includes(hit[2]!) ? hit[2] : undefined;
}

/** Shrink big phone photos and boost contrast so OCR is faster and more reliable. */
function rotate(src: HTMLCanvasElement, deg: 90 | 180 | 270) {
  const c = document.createElement('canvas');
  [c.width, c.height] = deg === 180 ? [src.width, src.height] : [src.height, src.width];
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'grayscale(1) contrast(1.35)';
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}

export async function scanReceipt(file: Blob, cats: Category[], onProgress: (p: number) => void): Promise<Receipt> {
  const [{ createWorker }, canvas] = await Promise.all([import('tesseract.js'), prepare(file)]);
  const base = new URL('./ocr/', document.baseURI).href;
  // If the engine or language files fail to load, tesseract.js waits forever; give up with a clear error instead.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('the text reader didn’t start')), 45000); });
  const starting = createWorker('eng', 1, {
    workerPath: base + 'worker.min.js', corePath: base, langPath: base, workerBlobURL: false, gzip: false,
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress(m.progress); },
    errorHandler: (e: unknown) => console.error('ocr worker', e),
  });
  const worker = await Promise.race([starting, timeout]).finally(() => clearTimeout(timer));
  try {
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' as never });
    const read = async (img: HTMLCanvasElement) => { const { data } = await worker.recognize(img); return { text: data.text, confidence: data.confidence }; };
    // Find which way up the photo is: a sideways or upside-down receipt reads as low-confidence gibberish.
    let page = canvas;
    let pass = await read(page);
    if (pass.confidence < 60) {
      for (const deg of [90, 270, 180] as const) {
        const turned = rotate(canvas, deg);
        const r = await read(turned);
        if (r.confidence > pass.confidence + 10) { page = turned; pass = r; }
        if (pass.confidence >= 70) break;
      }
    }
    const first = parseReceipt(pass.text, cats);
    if (first.total && first.items.length) return first;
    // Photos with background or uneven columns sometimes read better in column mode; keep whichever found more.
    await worker.setParameters({ tessedit_pageseg_mode: '4' as never });
    const second = parseReceipt((await read(page)).text, cats);
    const score = (r: Receipt) => (r.total ? 3 : 0) + r.items.length;
    const best = score(second) > score(first) ? second : first;
    return best;
  } finally {
    await worker.terminate();
  }
}
