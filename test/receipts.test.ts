// Run: npx tsx test/receipts.test.ts
import { parseReceipt } from '../src/receipt';
import { CASES } from './receipts';
let fail = 0;
for (const c of CASES) {
  const r = parseReceipt(c.text, []);
  const got = r.items.map((i) => [i.name, i.qty ?? 1, i.unit ?? i.amount]);
  const problems: string[] = [];
  const same = c.expect.looseNames
    ? got.length === c.expect.items.length && c.expect.items.every(([n, q, u], i) => String(got[i][0]).toLowerCase().includes(n.toLowerCase().split(' ').pop()!) && got[i][1] === q && got[i][2] === u)
    : JSON.stringify(got) === JSON.stringify(c.expect.items);
  if (c.expect.subtotal !== undefined && r.subtotal !== c.expect.subtotal) problems.push(`subtotal got ${r.subtotal} want ${c.expect.subtotal}`);
  if (!same) problems.push(`items\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(c.expect.items)}`);
  if (r.total !== c.expect.total) problems.push(`total got ${r.total} want ${c.expect.total}`);
  for (const k of ['discount', 'service', 'tax', 'servicePct', 'taxPct'] as const)
    if (c.expect[k] !== undefined && (r.charges as Record<string, unknown> | undefined)?.[k] !== c.expect[k]) problems.push(`${k} got ${(r.charges as Record<string, unknown> | undefined)?.[k]} want ${c.expect[k]}`);
  console.log(problems.length ? `FAIL ${c.name}\n  ${problems.join('\n  ')}` : `PASS ${c.name}`);
  if (problems.length) fail++;
}
process.exitCode = fail ? 1 : 0;
// OCR misreads seen in real scans
{
  const r = parseReceipt('A\nNasi 25.000\npiskon Member -5.000\nTotal 20.000', []);
  console.log(r.charges?.discount === 500000 ? 'PASS' : 'FAIL', 'minus amount counts as a discount even when the word is misread', r.charges?.discount);
}
{
  const r = parseReceipt('X\nBY Bakso Kuah\n1x @35.000   35.000\nES TEH MANIS   2 x 5.000   10.000\nWHOLE MILK 2L   12.000\nCincau Sedjuk 3\n1x @27.000   27.000\nTotal 84.000', []);
  const names = r.items.map((i) => i.name).join(' | ');
  console.log(names === 'Bakso Kuah | Es Teh Manis | Whole Milk 2l | Cincau Sedjuk' ? 'PASS' : 'FAIL', 'speck clean-up keeps real names and sizes:', names);
}
