// Receipt scanning: the photo is read on this device (Tesseract OCR compiled to
// WebAssembly, bundled with the app) and never uploaded anywhere. The text is
// then parsed into a merchant, date, total and line items.
import { today, ymd, type Category } from './store';

export interface ReceiptItem { name: string; amount: number; sub?: string }
export interface Receipt { merchant: string; date: string; total: number; items: ReceiptItem[]; cat?: string; text: string }

// Prices come in many shapes: 3.49 · $3.49 · 1,60 € · 1.234,56 · Rp 17.500 · ¥1,239 · 98.000
const CUR = String.raw`(?:[$€£¥₹₩₱฿₫]|rp\.?|idr|rm|usd|eur|sgd|php|thb|vnd|jpy|krw|inr)`;
const NUMBER = String.raw`\d{1,3}(?:[.,'’]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const LINE_PRICE = new RegExp(String.raw`^(.*?)[\s:.*@=-]*(?:(${CUR})\s?)?(-|−)?\s?(${NUMBER})\s*(?:${CUR}|[A-Za-z*#]{1,3})?\s*$`, 'i');
const TOTAL = /\b(grand\s*total|total|amount\s*due|balance\s*due|to\s*pay|jumlah|tagihan|totale|totaal|gesamt|summe|betrag|importe|montant)\b|合計|合计/i;
const NOT_TOTAL = /sub\s*-?\s*total|total\s*(tax|vat|savings?|items?|discount|qty|disc|hemat|item)|tax\s*total|points/i;
const PAID = /\b(cash|change|tender|tunai|kembali(an)?|bar|r[uü]ckgeld|efectivo|cambio|esp[eè]ces|rendu|contanti|resto|kontant|card|visa|master\s?card|amex|debit|kartu|qris|ovo|gopay|dana)\b/i;
const SKIP_ITEM = /sub\s*-?\s*total|\btotal\b|\btax\b|\bvat\b|\bgst\b|\bppn\b|\bpajak\b|\bmwst\b|\biva\b|\btva\b|\bchange\b|balance|tender|payment|\btip\b|gratuity|discount|diskon|coupon|savings|hemat|rounding|pembulatan|loyalty|points/i;

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
  for (let i = 0; i < end; i++) {
    const p = priceAt(i);
    if (!p || p.value < 0 || SKIP_ITEM.test(p.label) || PAID.test(p.label)) continue;
    const name = tidy(p.label.replace(/^\d+\s*[xX@]\s*/, '').replace(/^\d{4,}\s+/, '').replace(/\s\d+\s*[xX@]\s*[\d.,]+$/, ''));
    if (!hasWords(name)) continue;
    items.push({ name: name.slice(0, 60), amount: p.value });
  }
  const sum = items.reduce((a, i) => a + i.amount, 0);

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
  return { merchant, date: findDate(text) ?? today(), total, items, cat, text };
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
