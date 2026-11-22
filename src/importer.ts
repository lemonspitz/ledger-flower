// Import transactions from other money apps and from any spreadsheet (CSV, TSV, Excel .xlsx/.xls, OpenDocument,
// Numbers). Nothing is fixed to one layout: the header row is found, each column's meaning is worked out from its
// name (in many languages) and from what is in it, dates and amounts are read in whatever format the file uses,
// and imported category and account names are matched to the app's own. What the person confirms is remembered,
// so the next file from the same app imports without questions. Runs entirely on the device.
import { live, txId, type Account, type Category, type Data, type Tx, type TxType } from './store';

export type Cell = string | number | boolean | Date | null;
export interface Sheet { name: string; rows: Cell[][] }

// ───────────────────────── reading files ─────────────────────────

/** CSV/TSV/semicolon/pipe text into rows, with quoted fields ("a, b"), doubled quotes and a byte-order mark. */
export function parseCsv(text: string): Cell[][] {
  text = text.replace(/^﻿/, '');
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  // The delimiter is the one that splits the first lines into the same, largest number of fields.
  let delim = ',', best = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.split('\n').filter((l) => l.trim()).map((l) => splitLine(l, d).length);
    if (!counts.length) continue;
    const common = mode(counts), consistent = counts.filter((c) => c === common).length / counts.length;
    const score = common > 1 ? common * consistent : 0;
    if (score > best) { best = score; delim = d; }
  }
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== '')).map((r) => r.map((x) => x.trim()));
}
function splitLine(l: string, d: string) {
  const out: string[] = []; let f = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"') { if (l[i + 1] === '"') { f += c; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') q = true; else if (c === d) { out.push(f); f = ''; } else f += c;
  }
  out.push(f);
  return out;
}
const mode = (xs: number[]) => { const m = new Map<number, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]; };

/** Every sheet of a spreadsheet file, or the one table of a text file. */
export async function readFile(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase();
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const zip = head[0] === 0x50 && head[1] === 0x4b, ole = head[0] === 0xd0 && head[1] === 0xcf;
  if (!zip && !ole && !/\.(xlsx|xlsm|xls|ods|numbers|xlsb)$/.test(name)) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf); // older Excel CSVs
    return [{ name: file.name, rows: parseCsv(text) }];
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dense: true });
  return wb.SheetNames.map((n) => ({
    name: n,
    rows: (XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }) as Cell[][])
      .map((r) => r.map((c) => (typeof c === 'string' ? c.trim() : c))),
  })).filter((s) => s.rows.length);
}

// ───────────────────────── understanding columns ─────────────────────────

export type Role = 'date' | 'time' | 'amount' | 'outflow' | 'inflow' | 'type' | 'category' | 'subcategory' | 'account' | 'toAccount' | 'note' | 'payee' | 'currency' | 'ignore';
export const ROLES: Role[] = ['date', 'amount', 'outflow', 'inflow', 'type', 'category', 'subcategory', 'account', 'toAccount', 'note', 'payee', 'time', 'currency', 'ignore'];

/** Header words per meaning, in the app's languages and as other money apps and banks write them. */
const HEADERS: Record<Exclude<Role, 'ignore'>, string[]> = {
  date: ['date', 'transaction date', 'posted date', 'posting date', 'booking date', 'value date', 'trans date', 'period', 'day', 'datum', 'buchungstag', 'buchungsdatum', 'valuta', 'fecha', 'data', 'tanggal', 'tgl', 'tarikh', 'petsa', 'ngay', 'ngay giao dich', 'date de', 'date operation', 'tarih', 'islem tarihi', 'дата', 'дата операции', 'pvm', 'paivamaara', 'dato', 'bokforingsdag', 'transaktionsdatum', 'tarehe', '日付', '日期', '交易日期', '年月日', '날짜', '거래일', '거래일자', 'วันที่', 'تاريخ', 'التاريخ'],
  time: ['time', 'waktu', 'jam', 'zeit', 'uhrzeit', 'heure', 'hora', 'ora', 'tid', 'aika', 'saat', 'время', 'thoi gian', 'gio', '時間', '时间', '時刻', '시간', 'เวลา', 'الوقت', 'saa'],
  amount: ['amount', 'amt', 'value', 'sum', 'total', 'transaction amount', 'jumlah', 'nominal', 'nilai', 'betrag', 'umsatz', 'montant', 'importe', 'monto', 'valor', 'importo', 'bedrag', 'belop', 'belopp', 'beloeb', 'belob', 'summa', 'maara', 'сумма', 'tutar', 'miktar', 'so tien', 'halaga', 'kiasi', 'kiasi cha pesa', '金額', '金额', '金额(元)', '금액', '거래금액', 'จำนวนเงิน', 'จำนวน', 'المبلغ', 'مبلغ'],
  outflow: ['outflow', 'debit', 'debits', 'withdrawal', 'withdrawals', 'paid out', 'money out', 'out', 'spent', 'spending', 'expense', 'expenses', 'expense amount', 'ausgabe', 'ausgaben', 'soll', 'lastschrift', 'debit amount', 'debito', 'débit', 'depense', 'dépense', 'cargo', 'cargos', 'gasto', 'gastos', 'saida', 'saída', 'despesa', 'pengeluaran', 'keluar', 'debet', 'mutasi debet', 'uttak', 'utgift', 'udgift', 'uttag', 'utbetalning', 'meno', 'menot', 'расход', 'списание', 'gider', 'borc', 'borç', 'chi', 'chi tieu', 'gastos', 'matumizi', '支出', '出金', '引出', '출금', '지출', 'รายจ่าย', 'ถอน', 'مدين', 'مصروف', 'سحب'],
  inflow: ['inflow', 'credit', 'credits', 'deposit', 'deposits', 'paid in', 'money in', 'in', 'received', 'income', 'income amount', 'revenue', 'einnahme', 'einnahmen', 'haben', 'gutschrift', 'credit amount', 'credito', 'crédit', 'recette', 'ingreso', 'ingresos', 'abono', 'abonos', 'entrada', 'receita', 'pemasukan', 'masuk', 'kredit', 'mutasi kredit', 'innskudd', 'inntekt', 'indtaegt', 'indtægt', 'insattning', 'insättning', 'inkomst', 'tulo', 'tulot', 'приход', 'зачисление', 'доход', 'gelir', 'alacak', 'thu', 'thu nhap', 'mapato', '收入', '入金', '預入', '입금', '수입', 'รายรับ', 'ฝาก', 'دائن', 'دخل', 'إيداع'],
  type: ['type', 'transaction type', 'income/expense', 'income or expense', 'kind', 'direction', 'debit/credit', 'dr/cr', 'cr/dr', 'in/out', 'jenis', 'tipe', 'jenis transaksi', 'typ', 'art', 'buchungsart', 'tipo', 'type d operation', 'sens', 'soort', 'laji', 'тип', 'вид', 'tur', 'tür', 'islem turu', 'loai', 'loai giao dich', 'aina', 'uri', '类型', '類型', '收支', '種類', '区分', '入出金', '유형', '구분', '수입/지출', 'ประเภท', 'النوع'],
  category: ['category', 'categories', 'category name', 'parent category', 'main category', 'category group', 'envelope', 'kategori', 'kategorie', 'categorie', 'catégorie', 'categoria', 'categoría', 'luokka', 'kategoria', 'категория', 'danh muc', 'kategori utama', 'aina ya matumizi', 'klasse', '分类', '類別', '分類', '项目', 'カテゴリ', 'カテゴリー', '費目', '大分類', '카테고리', '분류', '항목', 'หมวดหมู่', 'หมวด', 'الفئة', 'التصنيف'],
  subcategory: ['subcategory', 'sub category', 'sub-category', 'subcategories', 'child category', 'unterkategorie', 'sous-categorie', 'sous-catégorie', 'subcategoria', 'subcategoría', 'sub kategori', 'subkategori', 'underkategori', 'alaluokka', 'подкатегория', 'alt kategori', 'danh muc con', '子分类', '子類別', '小分類', '中分類', '서브카테고리', '소분류', 'หมวดหมู่ย่อย', 'الفئة الفرعية'],
  account: ['account', 'accounts', 'account name', 'wallet', 'from account', 'source account', 'card', 'konto', 'compte', 'cuenta', 'conta', 'rekening', 'akun', 'dompet', 'akaun', 'tili', 'счет', 'счёт', 'кошелек', 'hesap', 'cuzdan', 'tai khoan', 'vi', 'akaunti', 'pochi', '账户', '帳戶', '账户名称', '口座', '保有金融機関', '金融機関', '財布', '계좌', '계정', '자산', 'บัญชี', 'กระเป๋าเงิน', 'الحساب', 'المحفظة'],
  toAccount: ['to account', 'transfer to', 'target account', 'destination account', 'destination', 'to wallet', 'gegenkonto', 'zielkonto', 'compte destination', 'cuenta destino', 'conta destino', 'rekening tujuan', 'ke rekening', 'til konto', 'till konto', 'на счет', '转入账户', '轉入帳戶', '入金先', '입금계좌', 'ไปยังบัญชี'],
  note: ['note', 'notes', 'memo', 'description', 'desc', 'details', 'detail', 'remark', 'remarks', 'comment', 'comments', 'narrative', 'reference', 'particulars', 'transaction details', 'keterangan', 'catatan', 'deskripsi', 'uraian', 'beschreibung', 'verwendungszweck', 'buchungstext', 'notiz', 'libelle', 'libellé', 'descriptif', 'descripcion', 'descripción', 'concepto', 'nota', 'notas', 'descricao', 'descrição', 'historico', 'histórico', 'omschrijving', 'beskrivelse', 'beskrivning', 'tekst', 'text', 'kuvaus', 'selite', 'viesti', 'описание', 'комментарий', 'назначение', 'aciklama', 'açıklama', 'not', 'ghi chu', 'mo ta', 'noi dung', 'tala', 'maelezo', 'maoni', '备注', '備註', '摘要', '说明', '說明', 'メモ', '内容', '備考', '摘要欄', '메모', '내용', '적요', '비고', 'หมายเหตุ', 'รายละเอียด', 'คำอธิบาย', 'الوصف', 'ملاحظات', 'البيان'],
  payee: ['payee', 'merchant', 'name', 'item or payee', 'counterparty', 'recipient', 'beneficiary', 'vendor', 'store', 'shop', 'place', 'payer', 'empfanger', 'empfänger', 'auftraggeber', 'beguenstigter', 'begünstigter', 'beneficiaire', 'bénéficiaire', 'tiers', 'beneficiario', 'comercio', 'favorecido', 'estabelecimento', 'penerima', 'toko', 'mottaker', 'modtager', 'mottagare', 'saaja', 'получатель', 'контрагент', 'alici', 'alıcı', 'nguoi nhan', 'mpokeaji', '商户', '商家', '对方', '對方', '店名', '支払先', '取引先', '거래처', '가맹점', '사용처', 'ร้านค้า', 'ผู้รับ', 'المستفيد', 'التاجر'],
  currency: ['currency', 'curr', 'ccy', 'cur', 'mata uang', 'waehrung', 'währung', 'devise', 'moneda', 'moeda', 'divisa', 'valuta', 'valuutta', 'валюта', 'para birimi', 'tien te', 'sarafu', '币种', '貨幣', '幣別', '通貨', '통화', 'สกุลเงิน', 'العملة'],
};

/** Lower case, no accents, no "(1)" numbering or units in brackets: "(4)Amount", "Amount (IDR)", "Montant €" → "amount". */
export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase()
  .replace(/^\(?\d+\)\s*/, '').replace(/\s*[([（【][^)\]）】]*[)\]）】]\s*$/, '').replace(/[€$£¥₹₩₱฿₫₺₽]/g, '').replace(/[_.:#*]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Columns that are not part of a transaction: running balance, status, ids, tags, the account's type… */
const IGNORE = ['balance', 'running balance', 'saldo', 'solde', 'saldo akhir', 'kontostand', 'остаток', 'bakiye', 'so du', '残高', '余额', '餘額', '잔액', 'ยอดคงเหลือ', 'الرصيد',
  'account type', 'status', 'cleared', 'flag', 'id', 'no', 'nr', 'number', 'ref', 'reference number', 'labels', 'label', 'tags', 'tag', 'author', 'gps', 'payment type', 'payment_type_local',
  'ref_currency_amount', 'converted amount', '計算対象', '振替', 'id', 'uuid', 'in main currency', 'main currency', 'exchange rate', 'rate', 'kurs', 'split', 'check number', 'cheque', 'receipt', 'photo', 'image'];
const HEADER_INDEX = new Map<string, Role>();
for (const w of IGNORE) HEADER_INDEX.set(norm(w), 'ignore');
for (const [role, words] of Object.entries(HEADERS) as [Role, string[]][]) for (const w of words) { const k = norm(w); if (!HEADER_INDEX.has(k)) HEADER_INDEX.set(k, role); }

/** What a header cell names: an exact header word, else one contained in it ("Transaction Date (posted)"). */
export function headerRole(cell: unknown): Role | null {
  const k = norm(cell);
  if (!k || k.length > 40) return null;
  const exact = HEADER_INDEX.get(k);
  if (exact) return exact;
  // Longest header word inside the cell, as a whole word: "converted amount" → amount, "category name" → category.
  let hit: Role | null = null, len = 0;
  for (const [w, r] of HEADER_INDEX) if (w.length > len && w.length >= 3 && new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(k)) { hit = r; len = w.length; }
  return hit;
}

// ───────────────────────── values ─────────────────────────

export type DateOrder = 'ymd' | 'dmy' | 'mdy';
const MONTHS = new Map<string, number>();
(() => {
  const en = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  en.forEach((m, i) => MONTHS.set(m, i + 1));
  ['sept', 'mei', 'agu', 'agt', 'ags', 'okt', 'des', 'mär', 'mrz', 'dez', 'janv', 'fevr', 'févr', 'avr', 'mai', 'juin', 'juil', 'aout', 'août', 'ene', 'abr', 'ago', 'dic', 'fev', 'set', 'out', 'gen', 'giu', 'lug', 'ott', 'mrt', 'maj', 'okt'].forEach((m) => {
    const map: Record<string, number> = { sept: 9, mei: 5, agu: 8, agt: 8, ags: 8, okt: 10, des: 12, 'mär': 3, mrz: 3, dez: 12, janv: 1, fevr: 2, 'févr': 2, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, 'août': 8, ene: 1, abr: 4, ago: 8, dic: 12, fev: 2, set: 9, out: 10, gen: 1, giu: 6, lug: 7, ott: 10, mrt: 3, maj: 5 };
    MONTHS.set(m, map[m]);
  });
  // Full and short month names in the app's languages, from the device's own calendar data.
  for (const loc of ['en', 'id', 'ms', 'fil', 'vi', 'tr', 'ru', 'fr', 'de', 'es', 'pt', 'nb', 'da', 'sv', 'fi', 'sw', 'it', 'nl']) {
    for (let i = 0; i < 12; i++) for (const style of ['long', 'short'] as const) {
      try { MONTHS.set(new Date(2020, i, 15).toLocaleDateString(loc, { month: style }).toLowerCase().replace(/\.$/, ''), i + 1); } catch { /* locale data missing */ }
    }
  }
})();

const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1970 && y <= 2100
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
};
const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The three numbers of a written date, in the order printed, or a date with a month name. */
function dateParts(s: string): { a: number; b: number; c: number; named?: boolean } | null {
  s = s.trim();
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/); // 20240305
  if (m) return { a: +m[1], b: +m[2], c: +m[3] };
  m = s.match(/^(\d{1,4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,4})\s*日?/); // 2024-03-05 · 05/03/2024 · 5.3.24 · 2024年3月5日
  if (m) return { a: +m[1], b: +m[2], c: +m[3] };
  m = s.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (m) return { a: +m[1], b: +m[2], c: +m[3] };
  const lower = s.toLowerCase();
  m = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s.\-/]*([\p{L}]{3,12})\.?[\s.,\-/]*(\d{2,4})/u); // 5 March 2024 · 05-Mar-24
  if (m && MONTHS.has(m[2])) return { a: +m[3], b: MONTHS.get(m[2])!, c: +m[1], named: true };
  m = lower.match(/^(?:[\p{L}]+,?\s+)?([\p{L}]{3,12})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/u); // March 5, 2024 · Tue, Mar 5 2024
  if (m && MONTHS.has(m[1])) return { a: +m[3], b: MONTHS.get(m[1])!, c: +m[2], named: true };
  return null;
}

/** Which order the dates in a column are written in: decided by values over 12, else the device's locale. */
export function guessDateOrder(values: Cell[], localeHint = typeof navigator !== 'undefined' ? navigator.language : 'en-GB'): DateOrder {
  let ymd = 0, dmy = 0, mdy = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const p = dateParts(v);
    if (!p || p.named) continue;
    if (p.a > 31) { ymd++; continue; }
    if (p.a > 12) dmy++;
    else if (p.b > 12) mdy++;
  }
  if (ymd >= dmy && ymd >= mdy && ymd) return 'ymd';
  if (dmy || mdy) return dmy >= mdy ? 'dmy' : 'mdy';
  // Every day is 12 or less: statements cover a short period, so the order that keeps the dates close together wins.
  const span = (o: DateOrder) => { const ds = values.map((v) => parseDate(v, o)).filter(Boolean).map((d) => Date.parse(d!)); return ds.length ? Math.max(...ds) - Math.min(...ds) : Infinity; };
  const a = span('dmy'), b = span('mdy');
  if (a !== b && Number.isFinite(a) && Number.isFinite(b)) return a < b ? 'dmy' : 'mdy';
  return /^en-(us|ph)|^fil/i.test(localeHint) ? 'mdy' : 'dmy';
}

/** A cell as a date (yyyy-mm-dd), or null. Excel's day numbers and real dates are read as well as text. */
export function parseDate(v: Cell, order: DateOrder): string | null {
  if (v instanceof Date) {
    if (isNaN(+v)) return null;
    // Spreadsheet dates arrive as local or UTC midnight depending on the file: use whichever is midnight.
    if (v.getHours() === 0 && v.getMinutes() === 0) return ymdLocal(v);
    if (v.getUTCHours() === 0 && v.getUTCMinutes() === 0) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
    return ymdLocal(v);
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400e3); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); } // Excel day number
    if (v > 1e9 && v < 5e12) { const d = new Date(v < 1e11 ? v * 1000 : v); return ymdLocal(d); } // Unix time
    if (v > 19700101 && v < 21001231) return parseDate(String(v), order);
    return null;
  }
  if (typeof v !== 'string' || !v.trim()) return null;
  const p = dateParts(v);
  if (!p) { const t = Date.parse(v); return /\d{4}/.test(v) && !isNaN(t) ? ymdLocal(new Date(t)) : null; }
  if (p.named || p.a > 31) return iso(p.a, p.b, p.c);
  if (p.c > 31 || order !== 'ymd') return order === 'mdy' ? iso(p.c, p.a, p.b) ?? iso(p.c, p.b, p.a) : iso(p.c, p.b, p.a) ?? iso(p.c, p.a, p.b);
  return iso(p.a, p.b, p.c);
}

export type Decimal = '.' | ',';
/** Whether amounts in a column use a decimal point or a decimal comma. */
export function guessDecimal(values: Cell[]): Decimal {
  let dot = 0, comma = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const s = v.replace(/[^\d.,]/g, '');
    if (/,\d{1,2}$/.test(s) || /\.\d{3},/.test(s) || /^\d{1,3}(\.\d{3})+$/.test(s) && !/,/.test(s) && s.split('.').length > 2) comma++;
    else if (/\.\d{1,2}$/.test(s) || /,\d{3}\./.test(s)) dot++;
  }
  // "17.500" alone (thousands with a dot, as in Indonesia and Europe) counts toward the comma style.
  if (!dot && !comma) for (const v of values) if (typeof v === 'string' && /^\D*\d{1,3}(\.\d{3})+\D*$/.test(v.trim())) comma++;
  return comma > dot ? ',' : '.';
}

/** A cell as a signed amount in hundredths: "Rp 1.234.567", "(12.50)", "-1 234,56 €", "12.00-", "CR 50.00". */
export function parseAmount(v: Cell, dec: Decimal): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s || !/\d/.test(s)) return null;
  let neg = /^\(.*\)$/.test(s) || /^[-−–]/.test(s) || /[-−–]\s*$/.test(s) || /^[^\d]*[-−–]\s*\d/.test(s) || /\b(dr|db|debit)\b\.?\s*$/i.test(s);
  if (/\b(cr|kr)\b\.?\s*$/i.test(s)) neg = false;
  s = s.replace(/[^\d.,'’\s]/g, '').replace(/['’\s]/g, '');
  if (!s) return null;
  if (dec === ',') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if ((s.match(/\./g) ?? []).length > 1) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (neg ? -1 : 1);
}

/** Words for "expense", "income" and "transfer" in type columns (Money Manager, Wallet, Spendee, Bluecoins, banks…). */
const TYPE_WORDS: [TxType, RegExp][] = [
  ['transfer', /^(transfer|trf|tfr|transfer[- ]?(in|out)|transfers?|pindah|pindah dana|mutasi antar|uberweisung intern|umbuchung|virement interne|transferencia|transferencia interna|transferência|trasferimento|overforing|overføring|overforsel|överföring|siirto|перевод|virman|chuyen khoan|uhamisho|转账|轉帳|振替|이체|โอน|تحويل)$/i],
  ['income', /^(income|inc|incomes|revenue|credit|cr|c|in|deposit|money in|received|\+|pemasukan|pendapatan|masuk|kredit|einnahme|einnahmen|gutschrift|haben|revenu|recette|credit|ingreso|ingresos|abono|receita|entrada|entrata|inkomst|inntekt|indtaegt|indtægt|tulo|tulot|доход|приход|зачисление|gelir|thu|thu nhap|kita|mapato|收入|入金|收|수입|입금|รายรับ|รับ|دخل|إيداع)$/i],
  ['expense', /^(expense|expenses|exp|spending|debit|dr|d|out|withdrawal|payment|money out|spent|-|pengeluaran|keluar|debet|ausgabe|ausgaben|lastschrift|soll|depense|dépense|debit|gasto|gastos|cargo|despesa|saida|saída|uscita|spesa|utgift|udgift|uttag|meno|menot|расход|списание|gider|chi|chi tieu|gastos|matumizi|支出|出金|支|지출|출금|รายจ่าย|จ่าย|مصروف|سحب)$/i],
];
export function typeWord(v: Cell): TxType | 'transfer-out' | 'transfer-in' | null {
  const k = norm(v).replace(/\.$/, '');
  if (!k) return null;
  if (/^(transfer|trf)[- ]?out$|^transfer from$/.test(k)) return 'transfer-out';
  if (/^(transfer|trf)[- ]?in$|^transfer to$/.test(k)) return 'transfer-in';
  for (const [t, re] of TYPE_WORDS) if (re.test(k)) return t;
  return null;
}

// ───────────────────────── the plan for one sheet ─────────────────────────

export interface Plan {
  header: number; // index of the header row, -1 when the file has none
  roles: Role[];
  order: DateOrder;
  decimal: Decimal;
  /** For a single amount column with no type column: what a positive amount means. */
  positive: 'income' | 'expense';
  /** Account for rows without an account column (an account id, or "new:<name>"). */
  account: string;
  source?: string; // the app the file looks like it came from
}

/** Export formats of popular money apps, told apart by their headers (for the "looks like" note only). */
const SOURCES: [string, string[]][] = [
  ['Ledger Flower', ['date', 'type', 'amount', 'currency', 'category', 'subcategory', 'account', 'to_account']],
  ['Money Manager', ['period', 'accounts', 'category', 'subcategory', 'note', 'income/expense']],
  ['Wallet by BudgetBakers', ['account', 'category', 'currency', 'amount', 'ref_currency_amount', 'type', 'payment_type']],
  ['Spendee', ['date', 'wallet', 'type', 'category name', 'amount', 'currency']],
  ['Monefy', ['date', 'account', 'category', 'amount', 'currency', 'converted amount']],
  ['Money Lover', ['date', 'category', 'amount', 'currency', 'note', 'wallet']],
  ['YNAB', ['account', 'flag', 'date', 'payee', 'category group/category', 'memo', 'outflow', 'inflow']],
  ['Mint', ['date', 'description', 'original description', 'amount', 'transaction type', 'category', 'account name']],
  ['Toshl', ['date', 'account', 'category', 'tags', 'expense amount', 'income amount']],
  ['Bluecoins', ['type', 'date', 'item or payee', 'amount', 'parent category', 'category', 'account type', 'account']],
  ['Goodbudget', ['date', 'envelope', 'account', 'name', 'notes', 'amount', 'status']],
  ['AndroMoney', ['id', 'currency', 'amount', 'category', 'sub-category', 'date', 'expense(transfer out)', 'income(transfer in)']],
];

const numSpan = (v: Cell[]) => { const n = v.filter((x): x is number => typeof x === 'number'); return n.length ? Math.max(...n) - Math.min(...n) : 0; };
const isTexty = (v: Cell) => typeof v === 'string' && /\p{L}/u.test(v) && !/^\s*[-+]?[\d.,\s]+\s*$/.test(v);

/** Finds the header row and the meaning of each column; `memory` brings back what was confirmed for this layout before. */
export function detect(sheet: Sheet, memory?: Memory): Plan {
  const rows = sheet.rows;
  const width = Math.max(0, ...rows.slice(0, 200).map((r) => r.length));
  // Header: among the first rows, the one with the most cells that are known header words.
  let header = -1, bestScore = 1;
  for (let i = 0; i < Math.min(40, rows.length); i++) {
    const roles = rows[i].map(headerRole).filter(Boolean) as Role[];
    const score = new Set(roles).size + (roles.includes('date') ? 1 : 0) + (roles.some((r) => r === 'amount' || r === 'outflow' || r === 'inflow') ? 1 : 0);
    if (score > bestScore) { bestScore = score; header = i; }
  }
  const body = rows.slice(header + 1);
  const sig = header >= 0 ? signature(rows[header]) : '';
  const remembered = sig ? memory?.layouts[sig] : undefined;
  const col = (j: number) => body.slice(0, 300).map((r) => r[j] ?? null).filter((v) => v !== null && v !== '');

  let roles: Role[];
  if (remembered && remembered.roles.length === width) roles = [...remembered.roles];
  else {
    roles = Array.from({ length: width }, (_, j) => (header >= 0 ? headerRole(rows[header][j]) : null) ?? 'ignore');
    // Bluecoins and others: "Parent Category" + "Category" means category + sub-category.
    let cats = roles.map((r, j) => (r === 'category' ? j : -1)).filter((j) => j >= 0);
    // YNAB: "Category Group/Category", "Category Group", "Category": the separate ones are clearer.
    if (cats.length >= 3) { for (const j of cats) if (/\//.test(String(rows[header][j]))) roles[j] = 'ignore'; cats = cats.filter((j) => roles[j] === 'category'); }
    if (cats.length >= 2 && !roles.includes('subcategory')) {
      const parent = cats.find((j) => /parent|main|group|utama|大|haupt/i.test(String(rows[header][j]))) ?? cats[0];
      for (const j of cats) if (j !== parent) { roles[j] = 'subcategory'; break; }
    }
    // Keep the first column for each meaning (a "converted amount" after "amount" is left out), except notes.
    const seen = new Set<Role>();
    roles = roles.map((r) => { if (r === 'ignore' || r === 'note') return r; if (seen.has(r)) return r === 'payee' ? 'note' : 'ignore'; seen.add(r); return r; });
    // Columns without a recognised name: decide from what is in them.
    const stats = Array.from({ length: width }, (_, j) => {
      const v = col(j);
      const order = guessDateOrder(v);
      return {
        n: v.length,
        // Whole numbers count as Excel day numbers only when they span a few years at most (not amounts like 25000).
        date: v.filter((x) => parseDate(x, order) !== null && (typeof x !== 'number' || (Number.isInteger(x) && x > 20000 && x < 80000 && numSpan(v) < 4000))).length / (v.length || 1),
        num: v.filter((x) => parseAmount(x, guessDecimal(v)) !== null && !(typeof x === 'string' && /\p{L}{2,}/u.test(x))).length / (v.length || 1),
        text: v.filter(isTexty).length / (v.length || 1),
        distinct: new Set(v.map(String)).size / (v.length || 1),
        len: v.reduce((a: number, x) => a + String(x).length, 0) / (v.length || 1),
        types: v.filter((x) => typeWord(x)).length / (v.length || 1),
      };
    });
    const named = (j: number) => header >= 0 && headerRole(rows[header][j]) === 'ignore';
    const free = (j: number) => roles[j] === 'ignore' && stats[j].n > 0 && !named(j);
    const pick = (role: Role, score: (j: number) => number, min: number) => {
      if (roles.includes(role)) return;
      let best = -1, bs = min;
      for (let j = 0; j < width; j++) if (free(j) && score(j) > bs) { bs = score(j); best = j; }
      if (best >= 0) roles[best] = role;
    };
    pick('date', (j) => stats[j].date, 0.8);
    if (!roles.some((r) => r === 'amount' || r === 'outflow' || r === 'inflow')) pick('amount', (j) => stats[j].num * (stats[j].distinct > 0.05 ? 1 : 0.5), 0.8);
    pick('type', (j) => (stats[j].distinct < 0.2 ? stats[j].types : 0), 0.8);
    // Category: short text that repeats, or that reads like category names ("Food", "Transport").
    pick('category', (j) => (stats[j].text > 0.8 && stats[j].len < 30 ? Math.max(1 - stats[j].distinct, col(j).filter((x) => CAT_WORDS.some(([re]) => re.test(norm(x)))).length / (col(j).length || 1)) : 0), 0.4);
    pick('note', (j) => (stats[j].text > 0.6 ? stats[j].len * stats[j].distinct : 0), 2);
    // A type column made of + and - or "D"/"K" with an amount column next to it is read the same way.
    for (let j = 0; j < width; j++) if (roles[j] === 'ignore' && header >= 0 && /^(d\/?k|db\/?cr|dr\/?cr|cr\/?dr|\+\/-|s\/h)$/i.test(norm(rows[header][j]))) roles[j] = 'type';
  }

  const dateCol = roles.indexOf('date');
  const amountCols = roles.map((r, j) => (r === 'amount' || r === 'outflow' || r === 'inflow' ? j : -1)).filter((j) => j >= 0);
  const order = remembered?.order ?? (dateCol >= 0 ? guessDateOrder(col(dateCol)) : 'dmy');
  const decimal = remembered?.decimal ?? guessDecimal(amountCols.flatMap(col));
  const amountCol = roles.indexOf('amount');
  const signs = amountCol >= 0 ? col(amountCol).map((v) => parseAmount(v, decimal) ?? 0) : [];
  // Mixed signs: minus is spending. All positive with no type column: a spending list, unless told otherwise.
  const positive = remembered?.positive ?? (signs.some((v) => v < 0) && signs.some((v) => v > 0) ? 'income' : 'expense');
  const keys = header >= 0 ? rows[header].map((c) => norm(c)) : [];
  const source = SOURCES.map(([name, h]) => ({ name, hit: h.filter((x) => keys.includes(norm(x))).length, of: h.length }))
    .filter((x) => x.hit >= Math.min(x.of, Math.max(4, x.of - 2))).sort((a, b) => b.hit / b.of - a.hit / a.of || b.hit - a.hit)[0]?.name;
  return { header, roles, order, decimal, positive, account: remembered?.account ?? '', source };
}

/** The same layout gets the same signature: its header names, in order. */
export const signature = (header: Cell[]) => header.map((c) => norm(c)).join('|');

// ───────────────────────── rows ─────────────────────────

export interface Row {
  line: number; // row number in the file (1-based) for messages
  date: string; type: TxType; amount: number; // amount: positive, in hundredths
  category: string; sub: string; account: string; toAccount: string; note: string; currency: string;
  transferSide?: 'out' | 'in';
}
export interface Converted { rows: Row[]; skipped: { line: number; why: 'date' | 'amount' }[]; currencies: string[] }

/** Applies a plan to the sheet: one entry per transaction, with the lines that could not be read. */
export function convert(sheet: Sheet, plan: Plan): Converted {
  const at = (r: Cell[], role: Role) => { const j = plan.roles.indexOf(role); return j >= 0 ? r[j] ?? null : null; };
  const all = (r: Cell[], role: Role) => plan.roles.map((x, j) => (x === role ? r[j] : null)).filter((v) => v != null && String(v).trim() !== '').map(String);
  const out: Row[] = [], skipped: Converted['skipped'] = [], cur = new Set<string>();
  sheet.rows.forEach((r, i) => {
    if (i <= plan.header) return;
    if (!r.some((v) => v != null && String(v).trim() !== '')) return;
    const date = parseDate(at(r, 'date'), plan.order);
    const amount = parseAmount(at(r, 'amount'), plan.decimal);
    const outflow = parseAmount(at(r, 'outflow'), plan.decimal), inflow = parseAmount(at(r, 'inflow'), plan.decimal);
    // Totals, opening balances and blank separator lines in bank statements have no date: skip them quietly when they also lack an amount.
    if (!date) { if (amount != null || outflow != null || inflow != null) skipped.push({ line: i + 1, why: 'date' }); return; }
    let value: number | null = null, type: TxType | null = null, side: Row['transferSide'];
    const word = typeWord(at(r, 'type'));
    if (outflow || inflow) {
      if (outflow && Math.abs(outflow) > 0) { value = Math.abs(outflow); type = 'expense'; }
      else { value = Math.abs(inflow!); type = 'income'; }
      if (outflow && inflow) { const net = Math.abs(inflow) - Math.abs(outflow); value = Math.abs(net); type = net >= 0 ? 'income' : 'expense'; }
    } else if (amount != null) {
      value = Math.abs(amount);
      type = amount < 0 ? 'expense' : plan.positive;
    }
    if (word === 'transfer-out' || word === 'transfer-in') { type = 'transfer'; side = word === 'transfer-out' ? 'out' : 'in'; }
    else if (word) {
      type = word;
      // "Transfer" with a signed amount: minus is the account it left.
      if (word === 'transfer' && amount != null) side = amount < 0 ? 'out' : 'in';
    }
    if (!value || !type) { skipped.push({ line: i + 1, why: 'amount' }); return; }
    const notes = [...all(r, 'payee'), ...all(r, 'note')];
    const currency = String(at(r, 'currency') ?? '').trim().toUpperCase();
    if (currency) cur.add(currency);
    let category = String(at(r, 'category') ?? '').trim(), sub = String(at(r, 'subcategory') ?? '').trim();
    // YNAB writes "Group: Category"; others "Food > Restaurants" or "Food/Restaurants".
    if (!sub) { const m = category.match(/^(.+?)\s*(?::|>|›|»|\/|\\| - )\s*(.+)$/); if (m && !/^\d/.test(m[2])) { category = m[1]; sub = m[2]; } }
    out.push({
      line: i + 1, date, type, amount: value, category, sub,
      account: String(at(r, 'account') ?? '').trim(), toAccount: String(at(r, 'toAccount') ?? '').trim(),
      note: [...new Set(notes.map((n) => n.trim()).filter(Boolean))].join(' · ').slice(0, 200), currency, transferSide: side,
    });
  });
  return { rows: pairTransfers(out), skipped, currencies: [...cur] };
}

/** Apps that write a transfer as two lines (out of one account, into another) become one transfer. */
function pairTransfers(rows: Row[]): Row[] {
  const used = new Set<number>(), out: Row[] = [];
  rows.forEach((r, i) => {
    if (used.has(i)) return;
    if (r.type !== 'transfer' || r.toAccount) { out.push(r); return; }
    const j = rows.findIndex((x, k) => k !== i && !used.has(k) && x.type === 'transfer' && !x.toAccount && x.date === r.date && x.amount === r.amount && x.transferSide !== r.transferSide && x.account !== r.account);
    if (j >= 0) {
      used.add(j);
      const [from, to] = r.transferSide === 'in' ? [rows[j], r] : [r, rows[j]];
      out.push({ ...from, toAccount: to.account, note: from.note || to.note, transferSide: undefined });
    } else {
      // Half of a transfer whose other side is not in the file: money out of (or into) this account.
      out.push({ ...r, type: r.transferSide === 'in' ? 'income' : 'expense', note: r.note || 'Transfer', transferSide: undefined });
    }
  });
  return out;
}

// ───────────────────────── learning categories ─────────────────────────

/** Common category names in other apps → the app's built-in categories (and sub-categories). */
const CAT_WORDS: [RegExp, string, string?][] = [
  [/^(food|foods|food & drinks?|food and drinks?|meals?|eating out|dining|restaurants?|restaurant|makan|makanan|kuliner|essen|restaurant|repas|comida|comidas|refeicao|ristorante|mat|ruoka|еда|кафе|yemek|an uong|chakula|pagkain|餐饮|飲食|外食|식비|외식|อาหาร|طعام|مطاعم)$/i, 'cat_dining'],
  [/^(coffee|cafe|café|coffee shops?|kopi|kaffee|cafe|kahvi|кофе|kahve|ca phe|咖啡|カフェ|커피|กาแฟ|قهوة)$/i, 'cat_dining', 'Coffee'],
  [/^(fast food|takeaway|take ?out|delivery|food delivery|gofood|grabfood)$/i, 'cat_dining', 'Delivery'],
  [/^(groceries|grocery|supermarket|market|belanja dapur|belanja bulanan|sembako|lebensmittel|courses|alimentation|supermercado|mercado|alimentari|dagligvarer|dagligvaror|ruokaostokset|продукты|market alisverisi|di cho|chakula cha nyumbani|groseri|食品|食料品|食材|日用品|장보기|식료품|ของใช้|بقالة)$/i, 'cat_groceries'],
  [/^(rent|housing|home|house|mortgage|sewa|kos|kost|rumah|miete|wohnen|loyer|logement|alquiler|vivienda|aluguel|moradia|husleie|hyra|asuminen|vuokra|аренда|жилье|kira|ev|nha|thue nha|kodi ya nyumba|住房|房租|家賃|住居|월세|주거|ค่าเช่า|ที่อยู่|إيجار|سكن)$/i, 'cat_housing'],
  [/^(transport|transportation|travel local|car|auto|vehicle|fuel|gas|petrol|bensin|bbm|ojek|ojol|grab|gojek|taxi|uber|parking|parkir|transportasi|verkehr|auto|tanken|transports?|essence|carburant|transporte|gasolina|combustivel|trasporti|transport|drivstoff|bil|liikenne|polttoaine|транспорт|бензин|ulasim|ulaşım|benzin|di chuyen|xang|usafiri|mafuta|交通|加油|交通費|ガソリン|교통|주유|การเดินทาง|น้ำมัน|مواصلات|وقود)$/i, 'cat_transport'],
  [/^(bills|utilities|utility|electricity|water|internet|phone|mobile|tagihan|listrik|pln|pulsa|air|wifi|nebenkosten|strom|factures|electricite|facturas|servicios|luz|contas|agua|bollette|regninger|räkningar|laskut|коммунальные|счета|faturalar|hoa don|dien|nuoc|bili|umeme|水电|账单|公共料金|光熱費|공과금|통신비|ค่าน้ำค่าไฟ|بيل|فواتير)$/i, 'cat_utilities'],
  [/^(health|healthcare|medical|medicine|doctor|pharmacy|kesehatan|obat|dokter|apotek|gesundheit|arzt|apotheke|sante|santé|salud|medico|saude|saúde|salute|helse|hälsa|terveys|здоровье|аптека|saglik|sağlık|suc khoe|thuoc|afya|dawa|医疗|醫療|医療|病院|의료|병원|สุขภาพ|ยา|صحة|دواء)$/i, 'cat_health'],
  [/^(entertainment|fun|leisure|hobbies?|movies?|games?|hiburan|rekreasi|freizeit|unterhaltung|loisirs|divertissement|ocio|entretenimiento|lazer|svago|fritid|underholdning|nöje|vapaa-aika|развлечения|eglence|eğlence|giai tri|burudani|娱乐|娛樂|娯楽|趣味|여가|문화|ความบันเทิง|ترفيه)$/i, 'cat_fun'],
  [/^(shopping|clothes|clothing|fashion|electronics|belanja|pakaian|baju|einkaufen|kleidung|achats|shopping|vetements|compras|ropa|roupas|abbigliamento|klær|kläder|vaatteet|покупки|одежда|alisveris|alışveriş|giyim|mua sam|quan ao|manunuzi|nguo|购物|購物|買い物|衣服|쇼핑|의류|ช้อปปิ้ง|เสื้อผ้า|تسوق|ملابس)$/i, 'cat_shopping'],
  [/^(subscriptions?|streaming|netflix|spotify|software|membership|langganan|abo|abonnements?|suscripciones|assinaturas|abbonamenti|abonnement|tilaukset|подписки|abonelikler|dang ky|usajili|订阅|訂閱|サブスク|구독|สมาชิก|اشتراكات)$/i, 'cat_subs'],
  [/^(travel|holiday|vacation|trip|hotel|flights?|liburan|wisata|perjalanan|reisen|urlaub|voyages?|vacances|viajes?|vacaciones|viagens?|viaggi|reise|resor|matkat|путешествия|seyahat|du lich|safari|旅行|旅遊|여행|ท่องเที่ยว|سفر)$/i, 'cat_travel'],
  [/^(salary|salaries|wage|wages|paycheck|payroll|gaji|upah|gehalt|lohn|salaire|salario|salário|sueldo|stipendio|lønn|lön|palkka|зарплата|maas|maaş|luong|mshahara|sahod|工资|薪水|給料|給与|월급|급여|เงินเดือน|راتب)$/i, 'cat_salary'],
  [/^(side income|freelance|bonus|business|interest|dividends?|investment|bisnis|usaha|bunga|nebeneinkommen|zinsen|revenus annexes|ingresos extra|renda extra|bijinntekt|sivutulot|подработка|ek gelir|thu nhap phu|biashara|副业|副業|부수입|รายได้เสริม|دخل إضافي)$/i, 'cat_side'],
  [/^(gifts?|gift|refunds?|cashback|hadiah|kado|angpao|thr|geschenk|erstattung|cadeaux?|remboursement|regalos?|reembolso|presentes?|regali|gaver|presenter|lahjat|подарки|hediye|qua tang|zawadi|礼物|禮物|プレゼント|선물|ของขวัญ|هدايا)$/i, 'cat_gift'],
  [/^(other|others|misc|miscellaneous|general|uncategori[sz]ed|lainnya|lain-lain|sonstiges|divers|autres|otros|varios|outros|altro|annet|övrigt|muut|прочее|diger|diğer|khac|nyingine|其他|その他|기타|อื่นๆ|أخرى)$/i, 'cat_other'],
];

/** Well-known shops and words in bank descriptions → a built-in category, for rows with no category and no
 *  similar past transactions ("REWE MARKT", "SPBU PERTAMINA", "NETFLIX.COM", "Gehalt"). */
const NOTE_WORDS: [RegExp, 'expense' | 'income', string, string?][] = [
  [/\b(netflix|spotify|youtube premium|disney\+?|apple\.com|icloud|google (one|storage)|hbo|prime video|vidio|chatgpt|openai|adobe|microsoft 365|dropbox)\b/i, 'expense', 'cat_subs'],
  [/\b(rewe|edeka|lidl|aldi|penny|netto|kaufland|carrefour|auchan|leclerc|intermarche|monoprix|mercadona|dia|tesco|sainsbury|asda|waitrose|morrisons|walmart|kroger|safeway|costco|trader joe|whole foods|coles|woolworths|indomaret|alfamart|hypermart|superindo|giant|lotte mart|transmart|ranch market|fairprice|cold storage|tops|big ?c|lotus|7-?eleven|family ?mart|lawson|ica|coop|kiwi|rema|meny|s-market|k-market|prisma|migros|supermarket|supermarkt|supermercado|markt|grocer(y|ies))\b/i, 'expense', 'cat_groceries'],
  [/\b(starbucks|costa|tim hortons|kopi|coffee|cafe|café|kaffee|janji jiwa|fore|excelso)\b/i, 'expense', 'cat_dining', 'Coffee'],
  [/\b(gofood|grabfood|shopeefood|uber ?eats|deliveroo|doordash|lieferando|just ?eat|foodpanda|wolt)\b/i, 'expense', 'cat_dining', 'Delivery'],
  [/\b(mcdonald'?s?|burger king|kfc|subway|pizza|domino'?s|restaurant|restoran|resto|warung|rumah makan|bistro|sushi|ramen|bakso|sate|padang)\b/i, 'expense', 'cat_dining', 'Restaurants'],
  [/\b(shell|bp|esso|aral|total ?energies|chevron|exxon|texaco|pertamina|spbu|petronas|caltex|tankstelle|gas station|petrol|fuel)\b/i, 'expense', 'cat_transport', 'Fuel'],
  [/\b(uber|lyft|grab|gojek|bolt|taxi|blue ?bird|maxim)\b/i, 'expense', 'cat_transport', 'Taxi & ride share'],
  [/\b(parking|parkir|parkhaus|parken)\b/i, 'expense', 'cat_transport', 'Parking'],
  [/\b(db bahn|deutsche bahn|sncf|renfe|trenitalia|krl|mrt|transjakarta|kai|amtrak|metro|tfl)\b/i, 'expense', 'cat_transport', 'Public transit'],
  [/\b(pln|listrik|strom|electric(ity)?|stadtwerke|edf|enel|endesa|eon|vattenfall)\b/i, 'expense', 'cat_utilities', 'Electricity'],
  [/\b(pdam|wasser|water)\b/i, 'expense', 'cat_utilities', 'Water'],
  [/\b(indihome|telkom|biznet|first ?media|internet|telekom|vodafone|o2|orange|movistar|telkomsel|xl ?axiata|indosat|pulsa|verizon|at&t|t-mobile)\b/i, 'expense', 'cat_utilities', 'Internet'],
  [/\b(apotek|apotheke|pharmacy|pharmacie|farmacia|kimia farma|guardian|watsons|boots|cvs|walgreens|hospital|rumah sakit|klinik|clinic|arzt|dokter|doctor)\b/i, 'expense', 'cat_health'],
  [/\b(amazon|tokopedia|shopee|lazada|blibli|bukalapak|zalando|uniqlo|h&m|zara|ikea|decathlon|aliexpress|temu|ebay|otto)\b/i, 'expense', 'cat_shopping'],
  [/\b(miete|rent|sewa|kos|loyer|alquiler|aluguel|husleie|hyra|vuokra)\b/i, 'expense', 'cat_housing', 'Rent'],
  [/\b(gehalt|lohn|gaji|salary|payroll|salaire|salario|salário|nómina|lønn|lön|palkka)\b/i, 'income', 'cat_salary'],
  [/\b(refund|erstattung|rückerstattung|remboursement|reembolso|cashback|pengembalian)\b/i, 'income', 'cat_gift'],
];
export function guessFromWords(note: string, kind: 'expense' | 'income', data: Data): { cat: string; sub?: string } | null {
  const hit = NOTE_WORDS.find(([re, k]) => k === kind && re.test(note));
  const c = hit && data.categories[hit[2]];
  if (!hit || !c || c.del) return null;
  return { cat: c.id, sub: hit[3] && c.subs?.includes(hit[3]) ? hit[3] : undefined };
}

/** Words in a note → category, learned from the person's own transactions (a small naive-Bayes count table). */
export interface Learner { counts: Map<string, Map<string, number>>; totals: Map<string, number>; n: number }
const tokens = (s: string) => norm(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !/^\d+$/.test(w)).slice(0, 12);
export function learnFrom(txs: Pick<Tx, 'note' | 'cat' | 'sub' | 'type'>[]): Learner {
  const L: Learner = { counts: new Map(), totals: new Map(), n: 0 };
  for (const t of txs) if (t.cat && t.note && t.type !== 'transfer') {
    const key = t.cat + (t.sub ? '\u0000' + t.sub : '');
    L.totals.set(key, (L.totals.get(key) ?? 0) + 1); L.n++;
    for (const w of new Set(tokens(t.note))) { const m = L.counts.get(w) ?? new Map(); m.set(key, (m.get(key) ?? 0) + 1); L.counts.set(w, m); }
  }
  return L;
}
/** The likeliest category for a note, when the words in it point clearly to one. */
export function guessFromNote(L: Learner, note: string): { cat: string; sub?: string } | null {
  const ws = tokens(note).filter((w) => L.counts.has(w));
  if (!ws.length || L.n < 3) return null;
  const score = new Map<string, number>();
  for (const w of ws) for (const [k, c] of L.counts.get(w)!) score.set(k, (score.get(k) ?? 0) + Math.log((c + 0.1) / (L.totals.get(k)! + 1)) + 3);
  const [best, s] = [...score].sort((a, b) => b[1] - a[1])[0] ?? [];
  const second = [...score].sort((a, b) => b[1] - a[1])[1]?.[1] ?? -Infinity;
  if (!best || s - second < 0.7) return null;
  const [cat, sub] = best.split('\u0000');
  return { cat, sub };
}

/** Remembered answers: layouts by header signature, and what imported names were matched to. */
export interface Memory {
  layouts: Record<string, { roles: Role[]; order: DateOrder; decimal: Decimal; positive: 'income' | 'expense'; account: string }>;
  cats: Record<string, string>; // "expense|food" → "cat_dining" or "cat_dining\u0000Coffee"
  accs: Record<string, string>; // "bca" → "acc_x"
}
export const emptyMemory = (): Memory => ({ layouts: {}, cats: {}, accs: {} });
const MEM_KEY = 'll.import.v1';
export function loadMemory(): Memory {
  try { const m = JSON.parse(localStorage.getItem(MEM_KEY) ?? 'null'); if (m && m.layouts) return { ...emptyMemory(), ...m }; } catch { /* none yet */ }
  return emptyMemory();
}
export function saveMemory(m: Memory) { try { localStorage.setItem(MEM_KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ } }

/** What an imported category name becomes: an existing category (and sub-category), or a new one. */
export interface CatChoice { key: string; name: string; sub: string; kind: 'expense' | 'income'; count: number; target: string; how: 'remembered' | 'same name' | 'sub-category' | 'similar' | 'notes' | 'new' }
export const catKey = (kind: string, name: string, sub = '') => `${kind}|${norm(name)}|${norm(sub)}`;
const NEW = 'new:';
export const isNew = (target: string) => target.startsWith(NEW);
export const newTarget = (name: string) => NEW + name;

/** Suggests where each imported category goes, most-used first. `label` gives the shown name of a category. */
export function suggestCategories(rows: Row[], data: Data, memory: Memory, label: (c: Category) => string = (c) => c.name): CatChoice[] {
  const cats = live(data.categories);
  const groups = new Map<string, CatChoice>();
  for (const r of rows) {
    if (r.type === 'transfer' || !r.category) continue;
    const kind = r.type === 'income' ? 'income' : 'expense';
    const key = catKey(kind, r.category, r.sub);
    const g = groups.get(key);
    if (g) { g.count++; continue; }
    groups.set(key, { key, name: r.category, sub: r.sub, kind, count: 1, target: '', how: 'new' });
  }
  const sameName = (a: string, b: string) => norm(a) === norm(b);
  for (const g of groups.values()) {
    const mem = memory.cats[g.key] ?? memory.cats[catKey(g.kind, g.name)];
    const ofKind = cats.filter((c) => c.kind === g.kind);
    if (mem && (isNew(mem) || data.categories[mem.split('\u0000')[0]] && !data.categories[mem.split('\u0000')[0]].del)) { g.target = mem; g.how = 'remembered'; continue; }
    // The same name as a category ("Food" = "Food"), shown in English or the app's language.
    const same = ofKind.find((c) => sameName(c.name, g.name) || sameName(label(c), g.name));
    if (same) {
      const sub = g.sub && same.subs?.find((s) => sameName(s, g.sub));
      g.target = same.id + (sub ? '\u0000' + sub : ''); g.how = 'same name'; continue;
    }
    // The name of one of the app's sub-categories ("Coffee" → Dining out › Coffee).
    const owner = ofKind.find((c) => c.subs?.some((s) => sameName(s, g.sub || g.name) || sameName(s, g.name)));
    if (owner) { const s = owner.subs!.find((x) => sameName(x, g.sub || g.name) || sameName(x, g.name))!; g.target = owner.id + '\u0000' + s; g.how = 'sub-category'; continue; }
    // A common word for one of the built-in categories, in many languages.
    const w = CAT_WORDS.find(([re]) => re.test(norm(g.name)));
    const builtin = w && data.categories[w[1]] && !data.categories[w[1]].del && data.categories[w[1]].kind === g.kind ? data.categories[w[1]] : undefined;
    if (builtin && w) {
      const sub = (g.sub && builtin.subs?.find((s) => sameName(s, g.sub))) || (w[2] && builtin.subs?.includes(w[2]) ? w[2] : '');
      g.target = builtin.id + (sub ? '\u0000' + sub : ''); g.how = 'similar'; continue;
    }
    g.target = newTarget(g.name); g.how = 'new';
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export interface AccChoice { key: string; name: string; count: number; target: string; how: 'remembered' | 'same name' | 'new' }
export function suggestAccounts(rows: Row[], data: Data, memory: Memory): AccChoice[] {
  const accs = live(data.accounts);
  const groups = new Map<string, AccChoice>();
  for (const r of rows) for (const name of [r.account, r.toAccount]) {
    if (!name) continue;
    const key = norm(name);
    const g = groups.get(key);
    if (g) g.count++; else groups.set(key, { key, name, count: 1, target: '', how: 'new' });
  }
  for (const g of groups.values()) {
    const mem = memory.accs[g.key];
    if (mem && (isNew(mem) || (data.accounts[mem] && !data.accounts[mem].del))) { g.target = mem; g.how = 'remembered'; continue; }
    const same = accs.find((a) => norm(a.name) === g.key);
    if (same) { g.target = same.id; g.how = 'same name'; continue; }
    g.target = newTarget(g.name);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

const ACCOUNT_KIND: [RegExp, Account['type']][] = [
  [/cash|tunai|kontant|bargeld|espece|efectivo|dinheiro|contanti|kateinen|наличн|nakit|tien mat|taslimu|현금|現金|现金|เงินสด|نقد|wallet|dompet/i, 'cash'],
  [/credit|card|kartu|karte|carte|tarjeta|cartao|kort|kortti|карта|kart|the|kadi|카드|カード|卡|บัตร|بطاقة/i, 'card'],
  [/saving|tabungan|spar|epargne|ahorro|poupanca|risparmi|sparing|säst|saasto|сбереж|birikim|tiet kiem|akiba|저축|貯金|储蓄|ออม|توفير/i, 'savings'],
];
const accountType = (name: string): Account['type'] => ACCOUNT_KIND.find(([re]) => re.test(norm(name)))?.[1] ?? 'bank';

// ───────────────────────── building the import ─────────────────────────

export interface Built { tx: Tx[]; categories: Category[]; accounts: Account[]; duplicates: number; guessed: number; byWords: number; created: Record<string, string> }
const dupKey = (t: Pick<Tx, 'date' | 'amount' | 'type' | 'note'>) => `${t.date}|${t.amount}|${t.type}|${norm(t.note).slice(0, 40)}`;

/**
 * The transactions, new categories and new accounts to add. Rows already in the app (same date, amount, type
 * and note) are left out, so importing the same file twice adds nothing. Rows without a category get one from
 * their note when the person's past transactions point clearly to one.
 */
export function build(rows: Row[], plan: Plan, cats: CatChoice[], accs: AccChoice[], data: Data, uid: () => string): Built {
  const newCats = new Map<string, Category>(), newAccs = new Map<string, Account>(), created: Record<string, string> = {};
  const ICON: Record<string, string> = { expense: '🏷️', income: '💰' };
  const resolveAcc = (target: string) => {
    if (!isNew(target)) return target;
    const name = target.slice(NEW.length) || 'Imported';
    const k = norm(name);
    let a = newAccs.get(k);
    if (!a) { a = { id: 'acc_' + uid(), u: 0, name, type: accountType(name), opening: 0 }; newAccs.set(k, a); }
    created['acc:' + target] = a.id;
    return a.id;
  };
  const resolveCat = (target: string, kind: 'expense' | 'income'): { cat: string; sub?: string } => {
    if (!isNew(target)) { const [cat, sub] = target.split('\u0000'); return { cat, sub: sub || undefined }; }
    const name = target.slice(NEW.length);
    const k = kind + '|' + norm(name);
    let c = newCats.get(k);
    if (!c) { c = { id: 'cat_' + uid(), u: 0, name, kind, icon: ICON[kind] }; newCats.set(k, c); }
    created[`cat:${kind}:${target}`] = c.id;
    return { cat: c.id };
  };
  const catOf = new Map(cats.map((c) => [c.key, c]));
  const accOf = new Map(accs.map((a) => [a.key, a.target]));
  const fallbackAcc = () => resolveAcc(plan.account || live(data.accounts).find((a) => a.type !== 'owed')?.id || newTarget('Imported'));
  // Sub-categories added under existing categories for names like "Food > Snacks".
  const addSubs = new Map<string, Set<string>>();
  const existing = new Map<string, number>();
  for (const t of live(data.tx)) existing.set(dupKey(t), (existing.get(dupKey(t)) ?? 0) + 1);
  const learner = learnFrom(live(data.tx));
  const tx: Tx[] = [];
  let duplicates = 0, guessed = 0, byWords = 0;
  for (const r of rows) {
    const acc = r.account ? resolveAcc(accOf.get(norm(r.account)) ?? newTarget(r.account)) : fallbackAcc();
    const base = { date: r.date, amount: r.amount, type: r.type, note: r.note, acc };
    const k = dupKey(base);
    if (existing.get(k)) { existing.set(k, existing.get(k)! - 1); duplicates++; continue; }
    const t: Tx = { id: txId(r.date, uid()), u: 0, ...base };
    if (r.type === 'transfer') {
      t.toAcc = r.toAccount ? resolveAcc(accOf.get(norm(r.toAccount)) ?? newTarget(r.toAccount)) : undefined;
      if (!t.toAcc || t.toAcc === t.acc) { t.type = 'expense'; } // a transfer to an unknown account is money leaving this one
    }
    if (t.type !== 'transfer') {
      const kind = t.type === 'income' ? 'income' : 'expense';
      const choice = r.category ? catOf.get(catKey(kind, r.category, r.sub)) : undefined;
      if (choice) {
        const { cat, sub } = resolveCat(choice.target, kind);
        t.cat = cat;
        if (sub) t.sub = sub;
        else if (r.sub && choice.sub && !isNew(choice.target)) {
          // Keep the imported sub-category under the chosen category.
          const c = data.categories[cat];
          const s = c?.subs?.find((x) => norm(x) === norm(r.sub)) ?? r.sub;
          t.sub = s;
          if (c && !c.subs?.includes(s)) { const set = addSubs.get(cat) ?? new Set(); set.add(s); addSubs.set(cat, set); }
        }
      } else {
        const learned = guessFromNote(learner, r.note);
        const g = learned && data.categories[learned.cat]?.kind === kind ? learned : guessFromWords(r.note, kind, data);
        if (g) { t.cat = g.cat; if (g.sub) t.sub = g.sub; if (g === learned) guessed++; else byWords++; }
        else t.cat = kind === 'income' ? (data.categories.cat_side && !data.categories.cat_side.del ? 'cat_side' : undefined) : (data.categories.cat_other && !data.categories.cat_other.del ? 'cat_other' : undefined);
      }
    }
    tx.push(t);
  }
  const updated: Category[] = [...addSubs].map(([id, s]) => ({ ...data.categories[id], subs: [...(data.categories[id].subs ?? []), ...s] }));
  return { tx, categories: [...newCats.values(), ...updated], accounts: [...newAccs.values()], duplicates, guessed, byWords, created };
}

/** Saves what the person confirmed, so the next file in this layout (and these names) imports the same way. */
export function remember(memory: Memory, sheet: Sheet, plan: Plan, cats: CatChoice[], accs: AccChoice[], built?: Built): Memory {
  // Names that became new categories or accounts now point at those, so the next import reuses them.
  const cat = (c: CatChoice) => (isNew(c.target) && built?.created[`cat:${c.kind}:${c.target}`]) || c.target;
  const acc = (t: string) => (isNew(t) && built?.created['acc:' + t]) || t;
  const next: Memory = { layouts: { ...memory.layouts }, cats: { ...memory.cats }, accs: { ...memory.accs } };
  if (plan.header >= 0) next.layouts[signature(sheet.rows[plan.header])] = { roles: plan.roles, order: plan.order, decimal: plan.decimal, positive: plan.positive, account: acc(plan.account) };
  for (const c of cats) next.cats[c.key] = cat(c);
  for (const a of accs) next.accs[a.key] = acc(a.target);
  return next;
}
