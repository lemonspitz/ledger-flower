// Import from other apps and spreadsheets: each file below is laid out the way that app or bank exports.
import ExcelJS from 'exceljs';
import { build, convert, detect, readFile, emptyMemory, parseAmount, parseCsv, parseDate, remember, suggestAccounts, suggestCategories, type Sheet } from '../src/importer';
import type { Data } from '../src/store';

let fails = 0, n = 0;
const ok = (cond: unknown, msg: string) => { n++; if (!cond) { fails++; console.log('FAIL ' + msg); } };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n    got  ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`);

function appData(): Data {
  const cat = (id: string, name: string, kind: 'expense' | 'income', subs?: string[]) => ({ id, u: 0, name, kind, icon: '•', subs });
  const cats = [cat('cat_groceries', 'Groceries', 'expense', ['Vegetables', 'Fruit', 'Snacks', 'Drinks']), cat('cat_dining', 'Dining out', 'expense', ['Restaurants', 'Coffee', 'Delivery']),
    cat('cat_transport', 'Transport', 'expense', ['Fuel', 'Taxi & ride share', 'Parking']), cat('cat_housing', 'Housing', 'expense', ['Rent']), cat('cat_utilities', 'Utilities', 'expense', ['Electricity', 'Internet']),
    cat('cat_shopping', 'Shopping', 'expense', ['Clothing']), cat('cat_other', 'Other', 'expense'), cat('cat_salary', 'Salary', 'income'), cat('cat_side', 'Side income', 'income'), cat('cat_gift', 'Gifts & refunds', 'income')];
  return {
    accounts: { acc_main: { id: 'acc_main', u: 0, name: 'Main account', type: 'bank', opening: 0 } },
    categories: Object.fromEntries(cats.map((c) => [c.id, c])), tx: {}, budgets: {}, goals: {}, recurring: {}, settings: {},
  };
}
let seq = 0;
const uid = () => 'id' + ++seq;
function run(name: string, text: string, data = appData(), memory = emptyMemory()) {
  const sheet: Sheet = { name, rows: parseCsv(text) };
  const plan = detect(sheet, memory);
  const conv = convert(sheet, plan);
  const cats = suggestCategories(conv.rows, data, memory), accs = suggestAccounts(conv.rows, data, memory);
  const built = build(conv.rows, plan, cats, accs, data, uid);
  return { sheet, plan, conv, cats, accs, built, memory: remember(memory, sheet, plan, cats, accs, built) };
}
const brief = (b: ReturnType<typeof run>['built']) => b.tx.map((t) => [t.date, t.type, t.amount, t.cat ?? '', t.sub ?? '', t.note]);

// ── values ──
eq(['1.234,56', 'Rp 1.234.567', '(12.50)', '-1 234,56 €', '12.00-', '50,000.00 DB', '50,000.00 CR', '¥1,200', '−7,5'].map((v, i) => parseAmount(v, [0, 1, 3, 8].includes(i) ? ',' : '.')),
  [123456, 123456700, -1250, -123456, -1200, -5000000, 5000000, 120000, -750], 'amounts in many formats');
eq(['2024-03-05', '05/03/2024', '5.3.24', '20240305', '5 March 2024', 'Mar 5, 2024', '05-Mar-2024', '2024年3月5日', '2024년 3월 5일', '5 Mei 2024', '5. März 2024'].map((v) => parseDate(v, 'dmy')),
  [...Array(9).fill('2024-03-05'), '2024-05-05', '2024-03-05'], 'dates in many formats');
eq([parseDate('03/05/2024', 'mdy'), parseDate(45356, 'dmy')], ['2024-03-05', '2024-03-05'], 'month-first dates and Excel day numbers');

// ── Ledger Flower's own CSV export ──
{
  const r = run('lf.csv', '﻿date,type,amount,currency,category,subcategory,account,to_account,payment,payment_method,note,id\r\n2024-03-05,expense,-25000,IDR,Dining out,Coffee,Main account,,cash,,Kopi Kenangan,2024-03_ab\r\n2024-03-06,income,5000000,IDR,Salary,,Main account,,,,March pay,2024-03_cd\r\n2024-03-07,transfer,-200000,IDR,,,Main account,Savings,,,To savings,2024-03_ef\r\n');
  eq(r.plan.source, 'Ledger Flower', 'own export recognised');
  eq(brief(r.built), [['2024-03-05', 'expense', 2500000, 'cat_dining', 'Coffee', 'Kopi Kenangan'], ['2024-03-06', 'income', 500000000, 'cat_salary', '', 'March pay'], ['2024-03-07', 'transfer', 20000000, '', '', 'To savings']], 'own export round trip');
  eq(r.built.accounts.map((a) => [a.name, a.type]), [['Savings', 'savings']], 'new account for the transfer target');
  // Importing the same file again adds nothing.
  const data = appData();
  for (const t of r.built.tx) data.tx[t.id] = t;
  for (const a of r.built.accounts) data.accounts[a.id] = a;
  const again = run('lf.csv', r.sheet.rows.map((x) => x.join(',')).join('\n'), data, r.memory);
  eq([again.built.tx.length, again.built.duplicates, again.built.accounts.length], [0, 3, 0], 'second import of the same file is skipped as duplicates');
}

// ── Money Manager (Realbyte): "Exp."/"Income", transfers as two lines ──
{
  const r = run('mm.csv', `Period,Accounts,Category,Subcategory,Note,IDR,Income/Expense,Description,Amount,Currency,Accounts
05/03/2024,Cash,Food,Lunch,Nasi padang,35000,Exp.,,35000,IDR,35000
06/03/2024,BCA,Salary,,March,8000000,Income,,8000000,IDR,8000000
07/03/2024,BCA,Transportation,Taxi,Grab,52000,Exp.,,52000,IDR,52000
08/03/2024,BCA,,,ATM,500000,Transfer-Out,,500000,IDR,500000
08/03/2024,Cash,,,ATM,500000,Transfer-In,,500000,IDR,500000`);
  eq(r.plan.source, 'Money Manager', 'Money Manager recognised');
  eq(r.plan.roles.slice(0, 9), ['date', 'account', 'category', 'subcategory', 'note', 'ignore', 'type', 'note', 'amount'], 'Money Manager columns');
  eq(brief(r.built).map((x) => x.slice(0, 5)), [['2024-03-05', 'expense', 3500000, 'cat_dining', 'Lunch'], ['2024-03-06', 'income', 800000000, 'cat_salary', ''], ['2024-03-07', 'expense', 5200000, 'cat_transport', 'Taxi'], ['2024-03-08', 'transfer', 50000000, '', '']], 'Money Manager rows, two-line transfer joined');
  eq(r.built.accounts.map((a) => [a.name, a.type]).sort(), [['BCA', 'bank'], ['Cash', 'cash']], 'Money Manager accounts');
  const tr = r.built.tx[3], acc = (id?: string) => r.built.accounts.find((a) => a.id === id)?.name;
  eq([acc(tr.acc), acc(tr.toAcc)], ['BCA', 'Cash'], 'transfer goes from BCA to Cash');
}

// ── Wallet by BudgetBakers: semicolons, minus for spending, "Expenses"/"Income" ──
{
  const r = run('wallet.csv', `account;category;currency;amount;ref_currency_amount;type;payment_type;payment_type_local;note;date;gps_latitude;gps_longitude;transfer;payee;labels
Cash;Groceries;EUR;-23.40;-23.40;Expenses;CASH;Cash;Weekly shop;2024-03-05 18:22:10;;;false;Lidl;
Cash;Restaurant, fast-food;EUR;-9.90;-9.90;Expenses;CASH;Cash;;2024-03-06 12:01:00;;;false;Burger place;
Bank;Wage, invoices;EUR;2100.00;2100.00;Income;TRANSFER;Bank transfer;;2024-03-01 09:00:00;;;false;Employer;`);
  eq(r.plan.source, 'Wallet by BudgetBakers', 'Wallet recognised');
  eq(brief(r.built).map((x) => x.slice(0, 4)), [['2024-03-05', 'expense', 2340, 'cat_groceries'], ['2024-03-06', 'expense', 990, r.built.tx[1].cat], ['2024-03-01', 'income', 210000, r.built.tx[2].cat]], 'Wallet rows');
  eq(r.built.tx[0].note, 'Lidl · Weekly shop', 'payee and note joined');
  eq(r.cats.map((c) => [c.name, c.how]), [['Groceries', 'same name'], ['Restaurant, fast-food', 'new'], ['Wage, invoices', 'new']], 'Wallet categories matched or new');
}

// ── YNAB: Outflow / Inflow columns, "$" amounts, month-first dates, category group + category ──
{
  const r = run('ynab.csv', `"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"
"Checking","","03/05/2024","Corner Cafe","Food: Coffee","Food","Coffee","","$4.50","$0.00","Cleared"
"Checking","","03/14/2024","Landlord","Bills: Rent","Bills","Rent","March","$1,200.00","$0.00","Cleared"
"Checking","","03/15/2024","ACME Inc","Inflow: Ready to Assign","Inflow","Ready to Assign","","$0.00","$3,000.00","Cleared"`);
  eq(r.plan.source, 'YNAB', 'YNAB recognised');
  eq(r.plan.order, 'mdy', 'month-first dates found from 03/14');
  eq(brief(r.built).map((x) => x.slice(0, 5)), [['2024-03-05', 'expense', 450, 'cat_dining', 'Coffee'], ['2024-03-14', 'expense', 120000, 'cat_housing', 'Rent'], ['2024-03-15', 'income', 300000, r.built.tx[2].cat, r.built.tx[2].sub ?? '']], 'YNAB rows');
}

// ── German bank statement: lines above the table, semicolons, 1.234,56, "Betrag (EUR)" ──
{
  const r = run('bank-de.csv', `Kontoauszug;;;;
Konto;DE12 3456 7890;;;
Zeitraum;01.03.2024 - 31.03.2024;;;

Buchungstag;Valuta;Auftraggeber/Empfänger;Verwendungszweck;Betrag (EUR)
05.03.2024;05.03.2024;REWE Markt;Einkauf;-54,23
06.03.2024;06.03.2024;Stadtwerke;Strom März;-1.234,56
28.03.2024;28.03.2024;Arbeitgeber GmbH;Gehalt;3.450,00
;;;Endsaldo;2.161,21`);
  eq(r.plan.header, 3, 'header found below the account details (blank lines dropped)');
  eq(r.plan.decimal, ',', 'decimal comma');
  eq(brief(r.built).map((x) => x.slice(0, 3).concat(x[5])), [['2024-03-05', 'expense', 5423, 'REWE Markt · Einkauf'], ['2024-03-06', 'expense', 123456, 'Stadtwerke · Strom März'], ['2024-03-28', 'income', 345000, 'Arbeitgeber GmbH · Gehalt']], 'German bank rows');
  eq(r.conv.skipped.length, 1, 'closing balance line skipped');
}

// ── Indonesian bank (BCA-style): DB/CR after the amount ──
{
  const r = run('bca.csv', `Tanggal,Keterangan,Cabang,Jumlah,Saldo
05/03,TRSF E-BANKING DB 0503/FTSCY/WS95051 GOJEK,0000,"52,000.00 DB","1,948,000.00"
06/03/2024,KR OTOMATIS GAJI,0000,"8,000,000.00 CR","9,948,000.00"
07/03/2024,TARIKAN ATM,0000,"500,000.00 DB","9,448,000.00"`);
  eq(r.plan.roles, ['date', 'note', 'ignore', 'amount', 'ignore'], 'BCA columns (Saldo left out)');
  eq(brief(r.built).map((x) => x.slice(0, 3)), [['2024-03-06', 'income', 800000000], ['2024-03-07', 'expense', 50000000]], 'BCA rows (a date without a year is skipped)');
  eq(r.conv.skipped.map((s) => s.why), ['date'], 'BCA row without a year reported');
}

// ── A hand-made spending sheet: no header, all amounts positive ──
{
  const r = run('sheet.csv', `05/03/2024,Kopi susu,Coffee,25000
06/03/2024,Bensin,Transport,150000
07/03/2024,Listrik,Utilities,450000`);
  eq(r.plan.header, -1, 'no header');
  eq(r.plan.roles, ['date', 'note', 'category', 'amount'], 'columns worked out from their contents');
  eq(brief(r.built).map((x) => x.slice(0, 5)), [['2024-03-05', 'expense', 2500000, 'cat_dining', 'Coffee'], ['2024-03-06', 'expense', 15000000, 'cat_transport', ''], ['2024-03-07', 'expense', 45000000, 'cat_utilities', '']], 'spending sheet rows');
}

// ── Japanese household-budget export: 日付 / 内容 / 金額(円) / 大分類 / 中分類 ──
{
  const r = run('jp.csv', `計算対象,日付,内容,金額（円）,保有金融機関,大分類,中分類,メモ
1,2024/03/05,セブンイレブン,-648,現金,食費,食料品,
1,2024/03/06,東京電力,-8240,三井住友銀行,水道・光熱費,電気代,
1,2024/03/25,給与,312000,三井住友銀行,収入,給与,`);
  eq(r.plan.roles.slice(1), ['date', 'note', 'amount', 'account', 'category', 'subcategory', 'note'], 'Japanese columns');
  eq(brief(r.built).map((x) => x.slice(0, 3)), [['2024-03-05', 'expense', 64800], ['2024-03-06', 'expense', 824000], ['2024-03-25', 'income', 31200000]], 'Japanese rows');
}

// ── Bluecoins: numbered headers, Parent Category + Category, transfers in two lines ──
{
  const r = run('bluecoins.csv', `(1)Type,(2)Date,(3)Item or Payee,(4)Amount,(5)Parent Category,(6)Category,(7)Account Type,(8)Account,(9)Notes,(10) Label,(11) Status,(12) Split
Expense,2024-03-05 08:10,Starbucks,-5.25,Food,Coffee,Bank,Visa,,,,
Income,2024-03-01 09:00,Salary,2500.00,Income,Salary,Bank,Checking,,,,
Transfer,2024-03-02 10:00,,-300.00,(Transfer),(Transfer),Bank,Checking,,,,
Transfer,2024-03-02 10:00,,300.00,(Transfer),(Transfer),Bank,Savings,,,,`);
  eq(r.plan.roles, ['type', 'date', 'payee', 'amount', 'category', 'subcategory', 'ignore', 'account', 'note', 'ignore', 'ignore', 'ignore'], 'Bluecoins columns');
  eq(brief(r.built).map((x) => x.slice(0, 5)), [['2024-03-05', 'expense', 525, 'cat_dining', 'Coffee'], ['2024-03-01', 'income', 250000, r.built.tx[1].cat, r.built.tx[1].sub ?? ''], ['2024-03-02', 'transfer', 30000, '', '']], 'Bluecoins rows');
}

// ── Toshl: separate expense and income amount columns ──
{
  const r = run('toshl.csv', `"Date","Account","Category","Tags","Expense amount","Income amount","Currency","In main currency","Main currency","Description"
"3/5/24","Wallet","Food & Drinks","lunch","12.30","0","USD","12.30","USD","Sandwich"
"3/6/24","Bank","Salary","","0","1800","USD","1800","USD",""`);
  eq(brief(r.built).map((x) => x.slice(0, 4)), [['2024-03-05', 'expense', 1230, 'cat_dining'], ['2024-03-06', 'income', 180000, 'cat_salary']], 'Toshl rows');
}

// ── Learning: what was confirmed is used next time ──
{
  const first = run('wallet.csv', `account;category;currency;amount;type;note;date
Cash;Restaurant, fast-food;EUR;-9.90;Expenses;;2024-03-06 12:01:00`);
  first.cats[0].target = 'cat_dining\u0000Restaurants';
  const memory = remember(emptyMemory(), first.sheet, first.plan, first.cats, first.accs, first.built);
  const next = run('wallet2.csv', `account;category;currency;amount;type;note;date
Cash;Restaurant, fast-food;EUR;-15.00;Expenses;;2024-04-02 19:30:00`, appData(), memory);
  eq([next.cats[0].how, next.built.tx[0].cat, next.built.tx[0].sub], ['remembered', 'cat_dining', 'Restaurants'], 'category choice remembered');
  // Rows without a category get one from notes like the person's earlier transactions.
  const data = appData();
  ['Kopi Kenangan', 'Kopi Kenangan latte', 'Janji Jiwa kopi', 'Grab ride', 'Grab ride home'].forEach((note, i) => {
    data.tx['t' + i] = { id: 't' + i, u: 0, date: '2024-01-0' + (i + 1), amount: 1000, type: 'expense', acc: 'acc_main', note, cat: i < 3 ? 'cat_dining' : 'cat_transport', sub: i < 3 ? 'Coffee' : undefined };
  });
  const r = run('plain.csv', `Date,Description,Amount
2024-03-05,KOPI KENANGAN MALL,-28000
2024-03-06,GRAB* RIDE 123,-41000
2024-03-07,Something else,-5000`, data);
  eq(r.built.tx.map((t) => [t.cat, t.sub ?? '']), [['cat_dining', 'Coffee'], ['cat_transport', ''], ['cat_other', '']], 'categories learned from earlier notes');
  eq(r.built.guessed, 2, 'two rows categorised from notes');
}

// ── A real .xlsx file: date cells, number cells, a title row and a totals row ──
await (async () => {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('March');
  ws.addRow(['My budget 2024']);
  ws.addRow(['Date', 'Item', 'Category', 'Amount']);
  ws.addRow([new Date(Date.UTC(2024, 2, 5)), 'Coffee beans', 'Groceries', -12.5]);
  ws.addRow([new Date(Date.UTC(2024, 2, 9)), 'Refund', 'Gifts & refunds', 30]);
  ws.addRow([null, 'Total', null, 17.5]);
  const buf = await wb.xlsx.writeBuffer();
  const [sheet] = await readFile(new File([buf], 'budget.xlsx'));
  const plan = detect(sheet), conv = convert(sheet, plan);
  eq([sheet.name, plan.header, plan.roles], ['March', 1, ['date', 'note', 'category', 'amount']], 'xlsx sheet and columns');
  eq(conv.rows.map((r) => [r.date, r.type, r.amount, r.category]), [['2024-03-05', 'expense', 1250, 'Groceries'], ['2024-03-09', 'income', 3000, 'Gifts & refunds']], 'xlsx rows (totals row left out)');
})();

console.log(`${n - fails}/${n} import checks passed`);
if (fails) process.exit(1);
