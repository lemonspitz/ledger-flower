// Receipt scanning: the photo is read on this device (Tesseract OCR compiled to
// WebAssembly, bundled with the app) and never uploaded anywhere. The text is
// then parsed into a merchant, date, total and line items.
import { today, ymd, type Category } from './store';

export interface ReceiptItem { name: string; amount: number; qty?: number; unit?: number; sub?: string }
export interface Receipt { merchant: string; date: string; total: number; totalPrinted?: boolean; subtotal?: number; items: ReceiptItem[]; cat?: string; text: string; pay?: PaidWith; charges?: { service: number; tax: number; discount: number; servicePct?: number; taxPct?: number } }
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

/** OCR confuses l/1 and o/0 inside words: "Komp1it" → Komplit, "Ko0pi" → Koopi. Sizes (2L, 500ml) and 7UP are left alone. */
export function fixLetters(s: string) {
  const vowel = (c: string) => /[aeiouAEIOU]/.test(c);
  // (No lookbehind: older iPhones' WebKit can't parse it.)
  return s
    .replace(/([A-Za-z])1(?=[A-Za-z])/g, (_, a: string, i: number, str: string) => a + (vowel(str[i + 2]) || vowel(a) ? 'l' : 'i'))
    .replace(/([A-Za-z])0(?=[A-Za-z])/g, (_, a: string, i: number, str: string) => a + (a === a.toUpperCase() && str[i + 2] === str[i + 2].toUpperCase() ? 'O' : 'o'))
    .replace(/([a-z])5(?=[a-z])/g, '$1s');
}

const tidy = (s: string) => {
  const t = fixLetters(s).replace(/\s+/g, ' ').replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9%)]+$/g, '').trim();
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
  [/restaurant|resto\b|rumah makan|warung|kedai|pizza|burger|grill|kitchen|bistro|diner|sushi|taco|noodle|bakmi|bakso|sate\b|ramen|\bbar\b|pub\b|eatery|steakhouse|bbq|kopi\b/i, 'cat_dining', 'Restaurants'],
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
  String.raw`\btable\s*(no|#|:|\d)`, String.raw`\b(meja|pax|guests?|tamu|covers?|info|purpose|customer|pelanggan)\b`, String.raw`\btime\s*in\b`, String.raw`^\W*\d+\s+items?\b`,
  String.raw`\b(cashier|kasir|server|waiter|waitress|pelayan|operator|staff)\b`,
  String.raw`\b(telp?|phone|hp|wa|whatsapp|fax|npwp|nib|wifi|password|email)\b`,
  String.raw`\b(poin|points?|kode|code|queue|antrian|ref|trx|transaksi|terminal|tid|mid|approval|appr|auth|batch|trace)\b`,
  String.raw`\b(date|tanggal|tgl|time|jam|waktu)\s*[:\d]`, String.raw`\b(dine\s*in|take\s*away|takeaway|delivery|pickup|www|instagram|ig)\b`,
  String.raw`\b(thank|terima\s*kasih|welcome|selamat)\b`, String.raw`\b(qty|price|harga|total\s*items?|jumlah\s*item)\b`, String.raw`#\w*\d`,
].join('|'), 'i');
const DISCOUNT = /\b(disc(ount)?|diskon|promo|voucher|potongan|hemat|savings?|coupon|kupon)\b/i;
const SEP = /^[xX×@=]$/;
const JUNK = /^[^A-Za-z0-9]+$/; // "~~", "|", "=", "[." — specks from the table or paper edge
/** Short garbage the OCR adds at line ends from the background ("FE", "Ae", "My,", "[."). */
const TAIL_JUNK = /^(?:[^A-Za-z0-9]+|[A-Za-z]{1,3}[^A-Za-z0-9]*|[^A-Za-z0-9]*[A-Za-z]{1,3})$/;
const CUR_TOK = new RegExp(String.raw`^(?:${CUR})$`, 'i');
const NUM_TOK = new RegExp(String.raw`^\(?([@©])?(?:(${CUR})\.?)?(-|−)?(?:(${CUR})\.?)?(${NUMBER})(${CUR})?\)?[.,;:]?$`, 'i');

interface Tok { value: number; raw: string; money: boolean; qty?: number; neg: boolean; each: boolean }
/** The numbers at the end of a line (right to left: total, price each, quantity) and the words before them. */
function tail(line: string, decimalMode: boolean) {
  const words = line.trim().split(/\s+/);
  const digitBefore = (k: number) => words.slice(0, k).some((w) => /\d/.test(w));
  while (words.length > 1 && TAIL_JUNK.test(words[words.length - 1]) && !/\d/.test(words[words.length - 1]) && digitBefore(words.length - 1)) words.pop();
  const nums: Tok[] = [];
  while (words.length && nums.length < 4) {
    const w = words[words.length - 1];
    if (SEP.test(w)) { if (nums[0]) nums[0].each = true; words.pop(); continue; } // "2 x 20.000": the price after x is per item
    if (JUNK.test(w) && nums.length) { words.pop(); continue; }
    if (CUR_TOK.test(w) && nums.length) { words.pop(); continue; } // "Rp 17.500" split in two
    const q = w.match(/^(?:(\d{1,2})([xX×@%»])|[xX×@](\d{1,2}))$/); // 2x · 1@ · 1% (OCR for 1x) · x2
    if (q) {
      if (q[2] === '@' && nums[0]) nums[0].each = true;
      nums.unshift({ value: 0, raw: w, money: false, qty: Number(q[1] ?? q[3]), neg: false, each: false });
      words.pop(); continue;
    }
    const m = w.match(NUM_TOK);
    if (!m) break;
    const raw = m[5];
    const grouped = /^\d{1,3}(?:[.,'’]\d{3})+/.test(raw), decimals = /[.,]\d{2}$/.test(raw) && !/[.,]\d{3}$/.test(raw);
    const plain = /^\d+$/.test(raw);
    const cur = !!(m[2] || m[4] || m[6]);
    const money = decimalMode ? decimals : grouped || cur || (plain && !raw.startsWith('0') && raw.length >= 3 && raw.length <= 7);
    const qty = plain && !raw.startsWith('0') && Number(raw) >= 1 && Number(raw) <= 99 ? Number(raw) : undefined;
    if (!money && qty === undefined) break;
    nums.unshift({ value: toMinor(raw), raw, money, qty: money ? undefined : qty, neg: !!m[3] || /^\(.*\)$/.test(w), each: !!m[1] });
    words.pop();
  }
  return { label: words.join(' '), nums };
}

/** "@27.000" is often read as "627.000", "€27.000" or "827.000": the same number without its first digit. */
const repaired = (t: Tok) => (/^[68]\d{1,2}[.,']\d{3}$/.test(t.raw) ? toMinor(t.raw.slice(1)) : undefined);

interface Line { label: string; qty: number; unit: number; total: number; neg: boolean; alts: number[]; hasTotal: boolean }
/** Quantity, price each and line total from "2 x 20.000 40.000", "1x @35.000", "2 @ 18.500 37.000", "2 Cheeseburger 12.50 25.00", "2x Nasi Goreng 50.000"… */
function readLine(line: string, decimalMode: boolean): Line | null {
  const { label, nums } = tail(line, decimalMode);
  const money = nums.filter((n) => n.money);
  if (!money.length) return null;
  let qty = nums.find((n) => n.qty !== undefined)?.qty;
  let name = label.replace(/[\s:.=-]+$/, '');
  const lead = name.match(/^(\d{1,2})\s*[xX×]?\s+(?=\D)|^(\d{1,2})[xX×](?=\D)/);
  if (lead && !qty) { qty = Number(lead[1] ?? lead[2]); name = name.slice(lead[0].length); }
  const trail = name.match(/\s+[xX×](\d{1,2})$|\s+(\d{1,2})[xX×]$/);
  if (trail && !qty) { qty = Number(trail[1] ?? trail[2]); name = name.slice(0, -trail[0].length); }
  const last = money[money.length - 1];
  const totalTok = money.length >= 2 || !last.each ? last : undefined;
  const unitTok = money.length >= 2 ? money[money.length - 2] : last.each ? last : undefined;
  // Price each and line total decide the quantity when the printed one is missing or misread ("1@" read as "10").
  if (unitTok && totalTok) { const q = totalTok.value / unitTok.value; if (Number.isInteger(q) && q >= 1 && q <= 99 && (!qty || qty * unitTok.value !== totalTok.value)) qty = q; }
  qty = qty || 1;
  const alts: number[] = [];
  if (totalTok) alts.push(totalTok.value);
  if (unitTok) { alts.push(unitTok.value * qty); const r = repaired(unitTok); if (r) alts.push(r * qty); }
  // The total column is the most reliable reading; other readings stay as alternatives for the subtotal check.
  const total = totalTok ? totalTok.value : alts[0];
  return { label: name, qty, unit: Math.round(total / qty), total, neg: money.some((n) => n.neg), alts: [...new Set(alts)], hasTotal: !!totalTok };
}

/** Strip OCR specks around a dish name: "| Cincau Sedjuk =", "Bakmi Ayam Oven Komplit gE", "i Putih". */
function cleanName(raw: string) {
  const t = raw.replace(/^[+\-•*]\s*/, '').replace(/^\d{4,}\s+/, '').split(/\s+/).filter(Boolean);
  const real = (k: number) => t.filter((w, i) => i !== k && /[A-Za-zÀ-ÿ]{3,}/.test(w)).length > 0;
  // "BY Bakso Kuah": two capitals glued in front of a normally written name are a speck; "ES TEH MANIS" is left alone.
  while (t.length > 2 && /^[A-Z]{2}$/.test(t[0]) && /^[A-Z][a-z]/.test(t[1])) t.shift();
  while (t.length > 1 && (JUNK.test(t[0]) || (/^[A-Za-z0-9]$/.test(t[0]) || /^[^A-Za-z0-9]*[A-Za-z0-9]{0,2}[^A-Za-z0-9]+$/.test(t[0])) && real(0))) t.shift();
  const speck = (w: string) => /^[A-Za-z]{1,2}[^A-Za-z0-9]*$/.test(w) || /^\d$/.test(w) || (/^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9]{2}$/.test(w) && !/^\d[lLgGkKmMxX]$/.test(w)); // keeps sizes like 2L
  while (t.length > 1 && (JUNK.test(t[t.length - 1]) || speck(t[t.length - 1]) && real(t.length - 1))) t.pop();
  return tidy(t.join(' '));
}

/** When the items don't add up to the printed subtotal, try other readings of one or two lines that make them match. */
function reconcile(items: (ReceiptItem & { alts: number[] })[], subtotal: number) {
  const sum = () => items.reduce((a, i) => a + i.amount, 0);
  if (!subtotal || sum() === subtotal) return;
  const choices = items.map((it, i) => it.alts.filter((v) => v !== it.amount).map((v) => [i, v] as const)).flat();
  const apply = (fix: (readonly [number, number])[]) => fix.forEach(([i, v]) => { items[i].amount = v; items[i].unit = Math.round(v / (items[i].qty || 1)); });
  const base = sum();
  for (const c of choices) if (base - items[c[0]].amount + c[1] === subtotal) return apply([c]);
  for (let a = 0; a < choices.length; a++) for (let b = a + 1; b < choices.length; b++) {
    const [x, y] = [choices[a], choices[b]];
    if (x[0] !== y[0] && base - items[x[0]].amount - items[y[0]].amount + x[1] + y[1] === subtotal) return apply([x, y]);
  }
}

/**
 * The shop's name: the best-written line near the top. Logos come out of OCR as garbage ("Sed} uk Yb"),
 * so lines are scored by how much of them is real words, and the printed name line usually wins.
 */
function findMerchant(lines: string[]) {
  let best = '', bestScore = 0;
  for (const raw of lines.slice(0, 8)) {
    if (NOISE.test(raw) || /receipt|invoice|welcome|thank|www\.|^\W*(jl|jalan|street|st|road|rd|no)\b\.?/i.test(raw) || /\d{3,}/.test(raw)) continue;
    const line = cleanName(raw);
    const words = line.split(/\s+/).filter(Boolean);
    const good = words.filter((w) => /^[A-Za-zÀ-ÿ'’.]{2,}$/.test(w) || w === '&' || w === '-');
    const bad = words.length - good.length;
    const letters = good.join('').replace(/[^A-Za-zÀ-ÿ]/g, '').length;
    const score = letters - 6 * bad;
    if (good.filter((w) => w.length >= 3).length >= 1 && letters >= 4 && score > bestScore) { best = line; bestScore = score; }
  }
  return best.slice(0, 60);
}

export function parseReceipt(text: string, cats: Category[]): Receipt {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // Merchant: first line near the top that is mostly letters.
  const merchant = findMerchant(lines);

  // Receipts either print cents everywhere (3.49) or not at all (Rp 17.500, ¥598). Work out which,
  // so stray whole numbers (quantities, sizes, register numbers) aren't taken for prices.
  const prices = lines.map(linePrice);
  const decimalMode = prices.filter((p) => p?.decimals).length >= 2;
  const usable = (p: Price | null): p is Price => !!p && p.value !== 0 && (decimalMode ? p.decimals : p.value >= 100 || p.currency);
  const priceAt = (i: number) => (usable(prices[i]) ? prices[i] : null);
  const hasWords = (s: string) => (s.match(/[A-Za-zÀ-ÿ]/g) ?? []).length >= 2;
  /** A dish name has at least one real word, not just OCR specks like "{x eo". */
  const hasName = (s: string) => /[A-Za-zÀ-ÿ]{3,}/.test(s);

  let totalIdx = lines.length;
  const totalLines = lines.map((l, i) => i).filter((i) => TOTAL.test(lines[i]) && !NOT_TOTAL.test(lines[i]));
  if (totalLines.length) totalIdx = totalLines[0];
  const subIdx = lines.findIndex((l) => /sub\s*-?\s*total/i.test(l));
  const end = subIdx >= 0 ? Math.min(subIdx, totalIdx) : totalIdx;

  const isOther = (l: string) => NOISE.test(l) || TOTAL.test(l) || SERVICE.test(l) || TAX.test(l) || PAID.test(l) || SKIP_ITEM.test(l) || DISCOUNT.test(l);
  // Menu lines start after the header block (date, table, cashier…), when there is one.
  let begin = 0;
  for (let i = 0; i < end; i++) if (NOISE.test(lines[i]) && i < end * 0.7) begin = i + 1;
  const items: (ReceiptItem & { alts: number[] })[] = [];
  let pending: string | null = null, lastAt = -2;
  for (let i = begin; i < end; i++) {
    const l = lines[i];
    if (isOther(l)) { pending = null; continue; }
    const r = readLine(l, decimalMode);
    if (r && !hasName(r.label)) {
      // A numbers-only line belongs to the dish named just above it.
      if (pending) { items.push({ name: pending, amount: r.total, qty: r.qty, unit: r.unit, alts: r.alts }); pending = null; lastAt = i; }
      else if (lastAt === i - 1 && items.length) {
        const it = items[items.length - 1];
        it.qty = r.qty;
        it.alts = [...new Set([...it.alts, ...r.alts])];
        if (r.hasTotal && !(it.alts.length > 1 && it.alts.includes(it.amount) && r.alts.includes(it.amount))) it.amount = r.alts.includes(it.amount) ? it.amount : r.total;
        it.unit = Math.round(it.amount / (it.qty || 1));
      }
      continue;
    }
    if (r && r.total > 0 && !r.neg) { const name = cleanName(r.label); if (hasName(name)) { items.push({ name, amount: r.total, qty: r.qty, unit: r.unit, alts: r.alts }); lastAt = i; pending = null; continue; } }
    if (!r && hasName(l)) { const name = cleanName(l); pending = hasName(name) ? name : null; }
  }
  const subLine = subIdx >= 0 ? (priceAt(subIdx)?.value ?? readLine(lines[subIdx], decimalMode)?.total ?? 0) : 0;
  reconcile(items, subLine);
  for (const it of items) it.name = it.name.slice(0, 60);
  const sum = items.reduce((a, i) => a + i.amount, 0);
  const subtotal = subLine || sum;

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
    const pct = l.match(/(?:^|[^\d.,])(\d{1,2}(?:[.,]\d{1,3})?)\s?%/)?.[1];
    if (svc) { if (p && p.value > 0) charges.service += p.value; if (pct) charges.servicePct = Number(pct.replace(',', '.')); }
    else { if (p && p.value > 0) charges.tax += p.value; if (pct) charges.taxPct = Number(pct.replace(',', '.')); }
  }
  // An amount on its own line after the service charge, whose label the OCR lost, is the tax.
  if (subIdx >= 0 && charges.service && !charges.tax) {
    for (let i = subIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (TOTAL.test(l) || PAID.test(l) || SERVICE.test(l) || DISCOUNT.test(l)) continue;
      const v = priceAt(i)?.value ?? readLine(l, decimalMode)?.total ?? 0;
      if (v > 0 && !hasWords(l.replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2).join(' ')) && v < subtotal * 0.3) { charges.tax = v; break; }
    }
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
  // No readable grand total (or one smaller than the subtotal): work it out from the parts.
  const expected = subtotal - charges.discount + charges.service + charges.tax;
  const totalPrinted = !!total && total >= subtotal;
  if (!totalPrinted && subtotal) total = expected;
  if (!total) total = sum || Math.max(0, ...prices.filter((p, i): p is Price => usable(p) && !PAID.test(lines[i])).map((p) => p.value));

  // Category: by merchant name first, then by what most items look like.
  const has = (id: string) => cats.find((c) => c.id === id && c.kind === 'expense');
  let cat = CAT_WORDS.find(([re, id]) => re.test(merchant) && has(id))?.[1];
  // A service charge, table number, guest count or "dine in" means a restaurant bill, whatever the dishes are called.
  if (!cat && has('cat_dining') && (charges.service > 0 || /\b(table|meja|pax|guests?|dine\s*in|take\s*away|server|waiter|pelayan)\b/i.test(text))) cat = 'cat_dining';
  if (!cat) {
    const votes = new Map<string, number>();
    for (const c of cats.filter((x) => x.kind === 'expense')) { const n = items.filter((i) => guessSub(i.name, c)).length; if (n) votes.set(c.id, n); }
    cat = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  const c = cats.find((x) => x.id === cat);
  for (const i of items) i.sub = guessSub(i.name, c);
  return { merchant, date: findDate(text) ?? today(), total, totalPrinted, subtotal: subLine || undefined, items: items.map(({ alts: _, ...i }) => i), cat, text, pay: detectPayment(text), charges };
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

/** Shrink big photos; returns the untouched copy (for cleaning) and a higher-contrast one. */
async function prepare(file: Blob): Promise<{ raw: HTMLCanvasElement; contrast: HTMLCanvasElement }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const make = (filter: string) => {
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.filter = filter; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  };
  const out = { raw: make('none'), contrast: make('grayscale(1) contrast(1.35)') };
  bmp.close();
  return out;
}

/**
 * A cleaner copy for reading text: crop to the receipt paper (the largest bright area, so the table, hands and
 * patterned cloth around it are dropped), then black-and-white with a local threshold so shadows and curl don't
 * swallow the text.
 */
function cleanForOcr(src: HTMLCanvasElement): HTMLCanvasElement {
  const W = src.width, H = src.height;
  const px = src.getContext('2d')!.getImageData(0, 0, W, H).data;
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];

  // 1. Find the paper on a small copy: Otsu brightness split, then the largest bright connected area.
  const sw = 150, sh = Math.max(1, Math.round((H * sw) / W)), small = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) small[y * sw + x] = gray[Math.min(H - 1, Math.floor(((y + 0.5) * H) / sh)) * W + Math.min(W - 1, Math.floor(((x + 0.5) * W) / sw))];
  const hist = new Array(256).fill(0); for (const v of small) hist[v | 0]++;
  let best = -1, t = 128, w0 = 0, s0 = 0; const total = small.length, sAll = hist.reduce((a, c, i) => a + c * i, 0);
  for (let i = 0; i < 256; i++) { w0 += hist[i]; s0 += hist[i] * i; const w1 = total - w0; if (!w0 || !w1) continue; const v = w0 * w1 * (s0 / w0 - (sAll - s0) / w1) ** 2; if (v > best) { best = v; t = i; } }
  const seen = new Uint8Array(sw * sh); let box = { x0: 0, y0: 0, x1: sw, y1: sh }, bestN = 0;
  for (let k = 0; k < sw * sh; k++) {
    if (seen[k] || small[k] <= t) continue;
    const stack = [k]; seen[k] = 1; let n = 0, x0 = sw, y0 = sh, x1 = 0, y1 = 0;
    while (stack.length) {
      const c = stack.pop()!, cx = c % sw, cy = (c / sw) | 0; n++;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx + 1); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy + 1);
      for (const nb of [cx > 0 ? c - 1 : -1, cx < sw - 1 ? c + 1 : -1, cy > 0 ? c - sw : -1, cy < sh - 1 ? c + sw : -1])
        if (nb >= 0 && !seen[nb] && small[nb] > t) { seen[nb] = 1; stack.push(nb); }
    }
    if (n > bestN) { bestN = n; box = { x0, y0, x1, y1 }; }
  }
  // Only crop when the bright area is a sensible receipt-sized part of the photo.
  const useCrop = bestN > total * 0.08;
  const cx0 = useCrop ? Math.max(0, Math.floor((box.x0 * W) / sw) - 8) : 0, cy0 = useCrop ? Math.max(0, Math.floor((box.y0 * H) / sh) - 8) : 0;
  const cx1 = useCrop ? Math.min(W, Math.ceil((box.x1 * W) / sw) + 8) : W, cy1 = useCrop ? Math.min(H, Math.ceil((box.y1 * H) / sh) + 8) : H;
  // 2. Enlarge small receipts: the text reader needs letters around 30 px tall, and thresholding thins small text.
  const f = Math.min(3, Math.max(1, 1300 / (cx1 - cx0)));
  const w = Math.round((cx1 - cx0) * f), h = Math.round((cy1 - cy0) * f);
  const up = document.createElement('canvas'); up.width = w; up.height = h;
  const uctx = up.getContext('2d')!; uctx.imageSmoothingQuality = 'high';
  uctx.drawImage(src, cx0, cy0, cx1 - cx0, cy1 - cy0, 0, 0, w, h);
  const upx = uctx.getImageData(0, 0, w, h).data, ug = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) ug[i] = 0.299 * upx[i * 4] + 0.587 * upx[i * 4 + 1] + 0.114 * upx[i * 4 + 2];

  // 3. Local-mean threshold (41 px window) using an integral image.
  const ii = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += ug[y * w + x]; ii[(y + 1) * (w + 1) + x + 1] = ii[y * (w + 1) + x + 1] + row; } }
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const octx = out.getContext('2d')!, img = octx.createImageData(w, h), r = 20, C = 12;
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const sum = ii[yb * (w + 1) + xb] - ii[ya * (w + 1) + xb] - ii[yb * (w + 1) + xa] + ii[ya * (w + 1) + xa];
      const v = ug[y * w + x] < sum / ((yb - ya) * (xb - xa)) - C ? 0 : 255, o = (y * w + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export type ScanStage = 'reading' | 'checking';
/**
 * Reads a receipt photo. Progress is one bar that only moves forward: the first reading fills it to 70%, and each
 * extra pass (only when a reading doesn't add up) fills 70% of what is left, so it never jumps back to 0.
 */
export async function scanReceipt(file: Blob, cats: Category[], onProgress: (p: number, stage: ScanStage) => void): Promise<Receipt> {
  let passNo = 0, shown = 0;
  const report = (p: number) => {
    const from = 1 - 0.3 ** passNo, to = 1 - 0.3 ** (passNo + 1);
    shown = Math.max(shown, from + (to - from) * Math.min(1, Math.max(0, p)));
    onProgress(shown, passNo ? 'checking' : 'reading');
  };
  const [{ createWorker }, canvas] = await Promise.all([import('tesseract.js'), prepare(file)]);
  const base = new URL('./ocr/', document.baseURI).href;
  // If the engine or language files fail to load, tesseract.js waits forever; give up with a clear error instead.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('the text reader didn’t start')), 45000); });
  const starting = createWorker('eng', 1, {
    workerPath: base + 'worker.min.js', corePath: base, langPath: base, workerBlobURL: false, gzip: false,
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') report(m.progress); },
    errorHandler: (e: unknown) => console.error('ocr worker', e),
  });
  const worker = await Promise.race([starting, timeout]).finally(() => clearTimeout(timer));
  try {
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' as never });
    const read = async (img: HTMLCanvasElement) => { const { data } = await worker.recognize(img); report(1); passNo++; return { text: data.text, confidence: data.confidence }; };
    // Find which way up the photo is: a sideways or upside-down receipt reads as low-confidence gibberish.
    const plain = canvas.contrast;
    let plainPage = plain;
    let page = cleanForOcr(canvas.raw);
    let pass = await read(page);
    // How well a reading holds together: items that add up to the printed subtotal, and a total that fits.
    const score = (r: Receipt) => {
      const sum = r.items.reduce((a, it) => a + it.amount, 0);
      return r.items.length + (r.subtotal && sum === r.subtotal ? 20 : 0) + (r.total && r.charges && Math.abs(r.total - ((r.subtotal || sum) - r.charges.discount + r.charges.service + r.charges.tax)) <= 1 ? 5 : 0);
    };
    const good = (r: Receipt) => {
      const sum = r.items.reduce((a, it) => a + it.amount, 0), c = r.charges;
      if (!sum) return false;
      if (r.subtotal) return sum === r.subtotal;
      return !!c && Math.abs(r.total - (sum - c.discount + c.service + c.tax)) <= 1 && /total/i.test(r.text);
    };
    let best = parseReceipt(pass.text, cats);
    if (good(best)) return best;
    // Only when the first reading doesn't hold together: maybe the photo is sideways or upside down.
    if (pass.confidence < 60 || !best.items.length) {
      const upright = page;
      for (const deg of [90, 270, 180] as const) {
        const turned = rotate(upright, deg);
        const r = await read(turned);
        if (r.confidence > pass.confidence + 10) { page = turned; pass = r; plainPage = rotate(plain, deg); }
        if (pass.confidence >= 70) break;
      }
      const r = parseReceipt(pass.text, cats);
      if (score(r) > score(best)) best = r;
      if (good(best)) return best;
    }
    const tries: [HTMLCanvasElement, string][] = [[page, '4'], [plainPage, '6']];
    for (const [img, psm] of tries) {
      await worker.setParameters({ tessedit_pageseg_mode: psm as never });
      const r = parseReceipt((await read(img)).text, cats);
      if (score(r) > score(best)) best = r;
      if (good(best)) break;
    }
    return best;
  } finally {
    await worker.terminate();
  }
}
