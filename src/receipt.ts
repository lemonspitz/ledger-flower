// Receipt scanning: the photo is read on this device (Tesseract OCR compiled to
// WebAssembly, bundled with the app) and never uploaded anywhere. The text is
// then parsed into a merchant, date, total and line items.
import { today, ymd, type Category } from './store';

export interface ReceiptItem { name: string; amount: number; sub?: string }
export interface Receipt { merchant: string; date: string; total: number; items: ReceiptItem[]; cat?: string; text: string }

const AMOUNT = /(-?)\s?(\d{1,3}(?:[.,' ]\d{3})+|\d+)[.,](\d{2})(?!\d)/g;
const TOTAL = /\b(grand\s*total|total|amount\s*due|balance\s*due|to\s*pay|totale|gesamt|summe|importe|montant)\b/i;
const NOT_TOTAL = /sub\s*-?\s*total|total\s*(tax|vat|savings?|items?|discount|qty)|tax\s*total|points/i;
const SKIP_ITEM = /sub\s*-?\s*total|\btotal\b|\btax\b|\bvat\b|\bgst\b|\bcash\b|\bchange\b|\bcard\b|visa|master\s?card|amex|debit|credit|balance|tender|payment|\btip\b|gratuity|discount|coupon|savings|rounding|loyalty|points/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function amounts(line: string) {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) out.push((m[1] ? -1 : 1) * (Number(m[2].replace(/[.,' ]/g, '')) * 100 + Number(m[3])));
  return out;
}

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
  [/tomato|lettuce|onion|carrot|potato|spinach|cucumber|pepper|broccoli|cabbage|garlic|mushroom|celery|zucchini|salad|kale|veg/i, 'Vegetables'],
  [/apple|banana|orange|grape|berry|berries|lemon|lime|mango|melon|pear|peach|avocado|fruit|pineapple|kiwi/i, 'Fruit'],
  [/chicken|beef|pork|lamb|turkey|bacon|sausage|ham\b|steak|mince|salmon|tuna|fish|shrimp|prawn|meat|fillet/i, 'Meat & fish'],
  [/milk|cheese|yogh?urt|butter|cream|egg|cheddar|mozzarella/i, 'Dairy & eggs'],
  [/bread|bagel|baguette|croissant|muffin|roll\b|bun\b|tortilla|pastry|cake|donut/i, 'Bakery'],
  [/rice|pasta|flour|sugar|\boil\b|cereal|beans|lentil|sauce|spice|salt\b|noodle|oats|soup|canned|honey|jam\b/i, 'Pantry'],
  [/chips|crisps|chocolate|cookie|biscuit|candy|sweets|popcorn|snack|nuts\b|ice ?cream/i, 'Snacks'],
  [/water|juice|soda|cola|coke|coffee|tea\b|beer|wine|drink|lemonade|sparkling|energy/i, 'Drinks'],
  [/soap|detergent|tissue|toilet|paper towel|shampoo|toothpaste|cleaner|sponge|foil|trash|bin bag|laundry|bleach/i, 'Household'],
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

  let total = 0, totalIdx = lines.length;
  const totals = lines.map((l, i) => ({ l, i })).filter(({ l }) => TOTAL.test(l) && !NOT_TOTAL.test(l) && amounts(l).length);
  const grand = totals.find(({ l }) => /grand\s*total|amount\s*due|balance\s*due|to\s*pay/i.test(l)) ?? totals[totals.length - 1];
  if (grand) { total = Math.max(...amounts(grand.l)); totalIdx = Math.min(...totals.map((t) => t.i)); }

  const items: ReceiptItem[] = [];
  const first = lines.findIndex((l) => /sub\s*-?\s*total/i.test(l));
  const end = first >= 0 ? Math.min(first, totalIdx) : totalIdx;
  for (const l of lines.slice(0, end)) {
    const m = l.match(/^(.*?)[\s.:$€£¥₹*x@-]*(-?\d+[.,]\d{2})\s*[A-Za-z*]{0,2}\s*$/);
    if (!m || SKIP_ITEM.test(m[1])) continue;
    const name = tidy(m[1].replace(/^\d+\s*[xX@]\s*/, '').replace(/^\d{4,}\s+/, '').replace(/\s\d+\s*[xX@]\s*\d+[.,]\d{2}$/, ''));
    const amount = amounts(m[2])[0];
    if ((name.match(/[A-Za-zÀ-ÿ]/g) ?? []).length < 2 || !(amount > 0)) continue;
    items.push({ name: name.slice(0, 60), amount });
  }
  const sum = items.reduce((a, i) => a + i.amount, 0);
  if (!total) total = sum || Math.max(0, ...lines.filter((l) => !/cash|change|tender/i.test(l)).flatMap(amounts));

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
    const first = parseReceipt((await worker.recognize(canvas)).data.text, cats);
    if (first.total || first.items.length) return first;
    // Photos with background or uneven columns sometimes read better in column mode.
    await worker.setParameters({ tessedit_pageseg_mode: '4' as never });
    return parseReceipt((await worker.recognize(canvas)).data.text, cats);
  } finally {
    await worker.terminate();
  }
}
