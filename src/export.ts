// Exports: a tidy CSV (one row per transaction) and a styled Excel workbook with an overview
// dashboard and native Excel charts. The data sheets stay tidy (one fact per cell, no merged
// cells, no subtotal rows) so filters, pivots and formulas keep working; colour and charts sit
// on top of that, never inside it.
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { curMonth, monthsBack, type Model } from './calc';
import type { Flower } from './flowers';
import type { Tx } from './store';

// ─────────────────────────── shared helpers ───────────────────────────
const NO_CENTS = new Set(['IDR', 'HUF', 'CLP', 'COP', 'PYG', 'UGX', 'TZS', 'MMK', 'LAK', 'KHR', 'IRR', 'JPY', 'KRW', 'VND', 'ISK']);
const digitsOf = (currency: string) => {
  if (NO_CENTS.has(currency)) return 0;
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
};
const symbolOf = (currency: string) => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(1).find((p) => p.type === 'currency')?.value ?? currency; } catch { return currency; }
};
const signed = (t: Tx) => (t.type === 'income' ? t.amount : -t.amount);
const oldestFirst = (m: Model) => [...m.txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.u - b.u));
const methodOf = (m: Model, t: Tx) => {
  if (t.type !== 'expense' || !t.pmid) return '';
  const p = m.method(t.pmid);
  return p ? p.name + (p.last4 ? ' ' + p.last4 : '') : '';
};

// ─────────────────────────── tidy CSV ───────────────────────────
/** One row per transaction, oldest first. Signed amounts (spending negative), ISO dates, plain numbers. */
export function toTidyCsv(m: Model) {
  const d = digitsOf(m.currency);
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows: unknown[][] = [['date', 'type', 'amount', 'currency', 'category', 'subcategory', 'account', 'to_account', 'payment', 'payment_method', 'note', 'id']];
  for (const t of oldestFirst(m)) rows.push([
    t.date, t.type, (signed(t) / 100).toFixed(d), m.currency, m.cat(t.cat)?.name ?? '', t.sub ?? '', m.acc(t.acc)?.name ?? '', m.acc(t.toAcc)?.name ?? '',
    t.type === 'expense' ? t.pm ?? '' : '', methodOf(m, t), t.note, t.id,
  ]);
  // Byte-order mark so Excel opens UTF-8 (é, ••, Rp) correctly with a double-click.
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

// ─────────────────────────── colours ───────────────────────────
const hex = (c: string) => c.replace('#', '').toUpperCase();
function mixHex(a: string, b: string, t: number) {
  const pa = hex(a).match(/../g)!.map((x) => parseInt(x, 16)), pb = hex(b).match(/../g)!.map((x) => parseInt(x, 16));
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
interface Palette { accent: string; ink: string; tint: string; band: string; line: string; text: string; muted: string; income: string; spending: string; transfer: string; s1: string; s2: string }
function palette(f: Flower): Palette {
  return {
    accent: hex(f.accent[0]), ink: hex(f.accent[1]),
    tint: mixHex(f.accent[0], '#FFFFFF', 0.9), band: mixHex(f.accent[0], '#FFFFFF', 0.955), line: mixHex(f.accent[0], '#FFFFFF', 0.8),
    text: '1F2421', muted: '6B726C', income: '067647', spending: 'B42318', transfer: '6B726C',
    // Income and spending keep the same meaning in every theme: an aqua-green and orange pair that stays distinct for colour-blind readers.
    s1: '1BAF7A', s2: 'EB6834',
  };
}

// ─────────────────────────── native Excel charts ───────────────────────────
// exceljs writes no charts, so they are added to the finished file as DrawingML parts.
interface Series { name: string; nameRef: string; ref: string; values: number[]; color: string }
interface ChartSpec {
  kind: 'col' | 'bar' | 'line'; title: string; catRef: string; cats: (string | number)[]; catFmt?: string; series: Series[];
  numFmt: string; from: [number, number]; to: [number, number]; labels?: boolean; legend?: boolean; text: string; muted: string; grid: string;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (sz: number, color: string, b = false) => `<a:defRPr sz="${sz}" b="${b ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr>`;
const txPr = (sz: number, color: string) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${run(sz, color)}</a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
function chartXml(c: ChartSpec) {
  const strCache = (v: (string | number)[]) => `<c:ptCount val="${v.length}"/>${v.map((x, i) => `<c:pt idx="${i}"><c:v>${esc(String(x))}</c:v></c:pt>`).join('')}`;
  const cat = typeof c.cats[0] === 'number'
    ? `<c:cat><c:numRef><c:f>${c.catRef}</c:f><c:numCache><c:formatCode>${esc(c.catFmt ?? 'General')}</c:formatCode>${strCache(c.cats)}</c:numCache></c:numRef></c:cat>`
    : `<c:cat><c:strRef><c:f>${c.catRef}</c:f><c:strCache>${strCache(c.cats)}</c:strCache></c:strRef></c:cat>`;
  const ser = c.series.map((s, i) => {
    const fill = c.kind === 'line'
      ? `<c:spPr><a:ln w="31750" cap="rnd"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>`
      : `<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>`;
    const lbl = c.labels ? `<c:dLbls><c:numFmt formatCode="${esc(c.numFmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, c.text)}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>` : '';
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${s.nameRef}</c:f><c:strCache>${strCache([s.name])}</c:strCache></c:strRef></c:tx>${fill}${lbl}${cat}<c:val><c:numRef><c:f>${s.ref}</c:f><c:numCache><c:formatCode>General</c:formatCode>${strCache(s.values)}</c:numCache></c:numRef></c:val>${c.kind === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
  }).join('');
  const axLine = `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${c.grid}"/></a:solidFill></a:ln></c:spPr>`;
  const plot = c.kind === 'line'
    ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/><c:axId val="501"/><c:axId val="502"/></c:lineChart>`
    : `<c:barChart><c:barDir val="${c.kind}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:gapWidth val="${c.kind === 'bar' ? 45 : 70}"/><c:overlap val="${c.series.length > 1 ? -8 : 0}"/><c:axId val="501"/><c:axId val="502"/></c:barChart>`;
  const catAx = `<c:catAx><c:axId val="501"/><c:scaling><c:orientation val="${c.kind === 'bar' ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${c.kind === 'bar' ? 'l' : 'b'}"/><c:numFmt formatCode="${esc(c.catFmt ?? 'General')}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${axLine}${txPr(900, c.muted)}<c:crossAx val="502"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const valAx = `<c:valAx><c:axId val="502"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${c.kind === 'bar' ? 1 : 0}"/><c:axPos val="${c.kind === 'bar' ? 'b' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="${c.grid}"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${esc(c.numFmt)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, c.muted)}<c:crossAx val="501"/><c:crosses val="${c.kind === 'bar' ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
  const title = `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${run(1200, c.text, true)}</a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="${c.text}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${esc(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`;
  const legend = c.legend ? `<c:legend><c:legendPos val="t"/><c:overlay val="0"/>${txPr(900, c.muted)}</c:legend>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}${catAx}${valAx}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${c.grid}"/></a:solidFill></a:ln></c:spPr>${txPr(900, c.muted)}</c:chartSpace>`;
}
function addCharts(xlsx: Uint8Array, sheetIndex: number, charts: ChartSpec[]) {
  const files = unzipSync(xlsx);
  const n = sheetIndex + 1;
  const anchor = (c: ChartSpec, i: number) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${c.from[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.from[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c.to[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.to[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${esc(c.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
  charts.forEach((c, i) => { files[`xl/charts/chart${i + 1}.xml`] = strToU8(chartXml(c)); });
  files['xl/drawings/drawing1.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${charts.map(anchor).join('')}</xdr:wsDr>`);
  files['xl/drawings/_rels/drawing1.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${charts.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`).join('')}</Relationships>`);
  // Link the drawing from the sheet.
  const relPath = `xl/worksheets/_rels/sheet${n}.xml.rels`;
  const rel = `<Relationship Id="rIdLfDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>`;
  files[relPath] = strToU8(files[relPath]
    ? strFromU8(files[relPath]).replace('</Relationships>', rel + '</Relationships>')
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`);
  let sheet = strFromU8(files[`xl/worksheets/sheet${n}.xml`]);
  if (!/xmlns:r=/.test(sheet)) sheet = sheet.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  const at = ['<legacyDrawing', '<legacyDrawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'].map((t) => sheet.indexOf(t)).filter((i) => i >= 0);
  const pos = Math.min(...at);
  files[`xl/worksheets/sheet${n}.xml`] = strToU8(sheet.slice(0, pos) + '<drawing r:id="rIdLfDrawing"/>' + sheet.slice(pos));
  let types = strFromU8(files['[Content_Types].xml']);
  types = types.replace('</Types>', charts.map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')
    + '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  files['[Content_Types].xml'] = strToU8(types);
  return zipSync(files, { level: 6 });
}

// ─────────────────────────── the workbook ───────────────────────────
type ExcelJSLib = typeof import('exceljs');
const excelDate = (iso: string) => new Date(iso + 'T00:00:00Z');

/** Builds the .xlsx file. `ExcelJS` is passed in so the app can load it only when exporting. */
export async function buildWorkbook(ExcelJS: ExcelJSLib, m: Model, flower: Flower, opts: { author?: string; now?: Date } = {}): Promise<Uint8Array> {
  const P = palette(flower);
  const d = digitsOf(m.currency), sym = symbolOf(m.currency);
  const dec = d ? '.' + '0'.repeat(d) : '';
  const symTxt = /^[A-Z]{2,}$|^Rp$/.test(sym) ? `"${sym} "` : `"${sym}"`;
  const MONEY = `${symTxt}#,##0${dec};-${symTxt}#,##0${dec};${symTxt}0${dec}`;
  const MONEY_SHORT = `${symTxt}#,##0`;
  const PCT = '0%';
  const v = (minor: number) => +(minor / 100).toFixed(d);
  const now = opts.now ?? new Date();

  const wb = new ExcelJS.Workbook();
  wb.creator = opts.author ?? 'Ledger Flower'; wb.title = 'Ledger Flower report'; wb.created = now;
  const font = (extra: Record<string, unknown> = {}) => ({ name: 'Calibri', size: 11, color: { argb: 'FF' + P.text }, ...extra });
  const fill = (rgb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + rgb } });

  // ── period: the last 12 months ──
  const months = monthsBack(12, curMonth());
  const monthRows = months.map((mo) => ({ mo, ...m.month(mo) }));
  const later = (mo: string) => [...m.months].filter(([k]) => k > mo).reduce((a, [, s]) => a + s.inc - s.exp, 0);
  const endBalance = (mo: string) => m.netWorth - later(mo);
  const inc = monthRows.reduce((a, r) => a + r.inc, 0), exp = monthRows.reduce((a, r) => a + r.exp, 0);
  const catTotals = new Map<string, number>();
  for (const r of monthRows) for (const [c, a] of r.cats) catTotals.set(c, (catTotals.get(c) ?? 0) + a);
  const cats = [...catTotals].map(([id, a]) => ({ name: m.cat(id)?.name ?? 'Other', icon: m.cat(id)?.icon ?? '', amount: a, budget: m.data.budgets[id] && !m.data.budgets[id].del ? m.data.budgets[id].limit : 0 })).sort((a, b) => b.amount - a.amount);
  const fmtMonth = (mo: string) => new Date(mo + '-01T00:00:00Z').toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

  // ── a tidy data sheet: styled header, banded rows, frozen header, filters ──
  interface Col { header: string; key: string; width: number; fmt?: string; align?: 'left' | 'right' | 'center' }
  function dataSheet(name: string, cols: Col[], rows: Record<string, unknown>[], style?: (row: import('exceljs').Row, r: Record<string, unknown>) => void) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }], properties: { tabColor: { argb: 'FF' + P.line } } });
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
    // A real Excel table: filter buttons, structured references and easy pivots. Cell styles below draw the look.
    ws.addTable({
      name: name.replace(/\W/g, ''), ref: 'A1', headerRow: true, totalsRow: false,
      style: { theme: 'TableStyleLight1', showRowStripes: false, showColumnStripes: false, showFirstColumn: false, showLastColumn: false },
      columns: cols.map((c) => ({ name: c.header, filterButton: true })),
      rows: rows.length ? rows.map((r) => cols.map((c) => r[c.key] ?? null)) : [cols.map(() => null)],
    });
    const h = ws.getRow(1);
    h.height = 26;
    h.eachCell((cell, i) => {
      cell.font = font({ bold: true, size: 10.5, color: { argb: 'FFFFFFFF' } });
      cell.fill = fill(P.accent);
      cell.alignment = { vertical: 'middle', horizontal: cols[i - 1].fmt && cols[i - 1].fmt !== 'd mmm yyyy' && cols[i - 1].fmt !== 'mmm yyyy' ? 'right' : 'left', indent: cols[i - 1].fmt ? 0 : 1 };
    });
    rows.forEach((r, k) => {
      const row = ws.getRow(k + 2);
      row.height = 20;
      cols.forEach((c, ci) => {
        const cell = row.getCell(ci + 1);
        cell.font = font();
        if (c.fmt) cell.numFmt = c.fmt;
        cell.alignment = { vertical: 'middle', horizontal: c.align ?? (c.fmt && c.fmt !== 'd mmm yyyy' && c.fmt !== 'mmm yyyy' ? 'right' : 'left'), indent: c.fmt ? 0 : 1 };
        if (k % 2) cell.fill = fill(P.band);
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF' + P.line } } };
      });
      style?.(row, r);
    });
    return ws;
  }
  const colorAmount = (cell: import('exceljs').Cell, n: number, transfer = false) => { cell.font = font({ color: { argb: 'FF' + (transfer ? P.transfer : n < 0 ? P.spending : P.income) } }); };

  // ── 1. Overview (dashboard) ──
  const ov = wb.addWorksheet('Overview', { views: [{ showGridLines: false, zoomScale: 100 }], properties: { tabColor: { argb: 'FF' + P.accent } } });
  ov.columns = [{ width: 3 }, ...Array.from({ length: 12 }, () => ({ width: 10.5 })), { width: 3 }];
  ov.getRow(1).height = 10;
  for (let c = 1; c <= 14; c++) ov.getCell(2, c).fill = fill(P.accent);
  for (let c = 1; c <= 14; c++) ov.getCell(3, c).fill = fill(P.accent);
  ov.getRow(2).height = 34; ov.getRow(3).height = 22;
  ov.getCell('B2').value = 'Ledger Flower';
  ov.getCell('B2').font = font({ size: 20, bold: true, color: { argb: 'FFFFFFFF' } });
  ov.getCell('B2').alignment = { vertical: 'bottom' };
  ov.getCell('B3').value = `Report for ${fmtMonth(months[0])} – ${fmtMonth(months[11])}  ·  ${m.currency}  ·  exported ${now.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}  ·  ${flower.name} theme`;
  ov.getCell('B3').font = font({ size: 10.5, color: { argb: 'FF' + P.tint } });
  ov.getCell('B3').alignment = { vertical: 'top' };
  ov.getRow(4).height = 14;

  const tiles: [string, number | string, string, string?][] = [
    ['Total balance', v(m.netWorth), `across ${m.accounts.filter((a) => a.type !== 'owed').length} accounts`],
    ['Income', v(inc), 'last 12 months', P.income],
    ['Spending', v(exp), 'last 12 months', P.spending],
    ['Saved', v(inc - exp), inc ? `${Math.round(((inc - exp) / inc) * 100)}% of income` : '—', inc - exp >= 0 ? P.income : P.spending],
  ];
  tiles.forEach(([label, value, sub, color], i) => {
    const c0 = 2 + i * 3;
    for (let r = 5; r <= 7; r++) for (let c = c0; c < c0 + 3; c++) {
      const cell = ov.getCell(r, c); cell.fill = fill(P.tint);
      cell.border = { top: r === 5 ? { style: 'medium', color: { argb: 'FF' + (color ?? P.accent) } } : undefined };
    }
    const l = ov.getCell(5, c0); l.value = label; l.font = font({ size: 10, color: { argb: 'FF' + P.muted } }); l.alignment = { indent: 1, vertical: 'bottom' };
    ov.mergeCells(6, c0, 6, c0 + 2); // the overview is a report page, so a merge here is fine; data sheets have none
    const val = ov.getCell(6, c0); val.value = value; val.numFmt = MONEY_SHORT; val.font = font({ size: 18, bold: true, color: { argb: 'FF' + (color ?? P.text) } }); val.alignment = { indent: 1, vertical: 'middle', horizontal: 'left' };
    const s = ov.getCell(7, c0); s.value = sub; s.font = font({ size: 9.5, color: { argb: 'FF' + P.muted } }); s.alignment = { indent: 1, vertical: 'top' };
  });
  ov.getRow(5).height = 22; ov.getRow(6).height = 30; ov.getRow(7).height = 20;
  ov.getCell('B49').value = 'Charts update when you change the Monthly and Categories sheets. Every sheet after this one is a plain table: filter, sort or pivot it freely.';
  ov.getCell('B49').font = font({ size: 9.5, italic: true, color: { argb: 'FF' + P.muted } });

  // ── 2. Transactions ──
  const txs = oldestFirst(m);
  dataSheet('Transactions', [
    { header: 'date', key: 'date', width: 13, fmt: 'd mmm yyyy' }, { header: 'type', key: 'type', width: 11 },
    { header: 'amount', key: 'amount', width: 15, fmt: MONEY }, { header: 'currency', key: 'currency', width: 12 },
    { header: 'category', key: 'category', width: 17 }, { header: 'subcategory', key: 'sub', width: 15 },
    { header: 'account', key: 'account', width: 16 }, { header: 'to_account', key: 'to', width: 15 },
    { header: 'payment', key: 'pay', width: 12.5 }, { header: 'payment_method', key: 'method', width: 22 },
    { header: 'note', key: 'note', width: 28 },
  ], txs.map((t) => ({
    date: excelDate(t.date), type: t.type, amount: v(signed(t)), currency: m.currency, category: m.cat(t.cat)?.name ?? null, sub: t.sub ?? null,
    account: m.acc(t.acc)?.name ?? null, to: m.acc(t.toAcc)?.name ?? null, pay: t.type === 'expense' ? t.pm ?? null : null, method: methodOf(m, t) || null, note: t.note || null,
  })), (row, r) => {
    colorAmount(row.getCell(3), r.amount as number, r.type === 'transfer');
    row.getCell(2).font = font({ color: { argb: 'FF' + (r.type === 'income' ? P.income : r.type === 'expense' ? P.spending : P.transfer) } });
  });

  // ── 3. Monthly ──
  const monthly = monthRows.map((r) => ({ month: excelDate(r.mo + '-01'), income: v(r.inc), spending: v(r.exp), net: v(r.inc - r.exp), rate: r.inc ? (r.inc - r.exp) / r.inc : null, balance: v(endBalance(r.mo)) }));
  dataSheet('Monthly', [
    { header: 'month', key: 'month', width: 12, fmt: 'mmm yyyy' }, { header: 'income', key: 'income', width: 15, fmt: MONEY },
    { header: 'spending', key: 'spending', width: 15, fmt: MONEY }, { header: 'net', key: 'net', width: 15, fmt: MONEY },
    { header: 'savings_rate', key: 'rate', width: 13, fmt: PCT }, { header: 'end_balance', key: 'balance', width: 16, fmt: MONEY },
  ], monthly, (row, r) => {
    colorAmount(row.getCell(4), r.net as number);
    row.getCell(2).font = font({ color: { argb: 'FF' + P.income } });
    row.getCell(3).font = font({ color: { argb: 'FF' + P.spending } });
  });

  // ── 4. Categories ──
  dataSheet('Categories', [
    { header: 'category', key: 'name', width: 20 }, { header: 'spending', key: 'amount', width: 15, fmt: MONEY },
    { header: 'share', key: 'share', width: 16, fmt: PCT }, { header: 'monthly_average', key: 'avg', width: 17, fmt: MONEY },
    { header: 'monthly_budget', key: 'budget', width: 16, fmt: MONEY },
  ], cats.map((c) => ({ name: c.name, amount: v(c.amount), share: exp ? c.amount / exp : 0, avg: v(Math.round(c.amount / 12)), budget: c.budget ? v(c.budget) : null })), (row, r) => {
    // A data bar in the share column, drawn with conditional formatting below.
    if (r.budget != null && (r.avg as number) > (r.budget as number)) row.getCell(4).font = font({ color: { argb: 'FF' + P.spending }, bold: true });
  });
  const catWs = wb.getWorksheet('Categories')!;
  catWs.addConditionalFormatting({ ref: `C2:C${cats.length + 1}`, rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF' + P.accent }, gradient: false } as never] });

  // ── 5. Accounts ──
  dataSheet('Accounts', [
    { header: 'account', key: 'name', width: 20 }, { header: 'type', key: 'type', width: 12 },
    { header: 'opening_balance', key: 'opening', width: 17, fmt: MONEY }, { header: 'balance', key: 'balance', width: 16, fmt: MONEY },
  ], m.accounts.map((a) => ({ name: a.name, type: a.type, opening: v(a.opening), balance: v(m.balances.get(a.id) ?? 0) })), (row, r) => colorAmount(row.getCell(4), r.balance as number));

  const buf = new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);

  // ── charts on the Overview ──
  const n = monthly.length, kc = Math.min(cats.length, 10);
  const monthSerials = monthly.map((r) => Math.round(r.month.getTime() / 86400000) + 25569);
  const base = { text: P.text, muted: P.muted, grid: 'E3E5E1', catFmt: 'mmm yy' };
  const short = `${symTxt}#,##0`;
  return addCharts(buf, 0, [
    { ...base, kind: 'col', title: 'Income and spending by month', legend: true, numFmt: short, from: [1, 8], to: [13, 26], catRef: `Monthly!$A$2:$A$${n + 1}`, cats: monthSerials,
      series: [
        { name: 'income', nameRef: 'Monthly!$B$1', ref: `Monthly!$B$2:$B$${n + 1}`, values: monthly.map((r) => r.income), color: P.s1 },
        { name: 'spending', nameRef: 'Monthly!$C$1', ref: `Monthly!$C$2:$C$${n + 1}`, values: monthly.map((r) => r.spending), color: P.s2 },
      ] },
    { ...base, kind: 'bar', title: 'Where the money went (12 months)', labels: true, numFmt: short, from: [1, 27], to: [7, 47], catRef: `Categories!$A$2:$A$${kc + 1}`, catFmt: 'General', cats: cats.slice(0, kc).map((c) => c.name),
      series: [{ name: 'spending', nameRef: 'Categories!$B$1', ref: `Categories!$B$2:$B$${kc + 1}`, values: cats.slice(0, kc).map((c) => v(c.amount)), color: P.accent }] },
    { ...base, kind: 'line', title: 'Total balance at month end', numFmt: short, from: [7, 27], to: [13, 47], catRef: `Monthly!$A$2:$A$${n + 1}`, cats: monthSerials,
      series: [{ name: 'end_balance', nameRef: 'Monthly!$F$1', ref: `Monthly!$F$2:$F$${n + 1}`, values: monthly.map((r) => r.balance), color: P.ink }] },
  ]);
}

export const xlsxName = (now = new Date()) => `ledger-flower-${now.toISOString().slice(0, 10)}.xlsx`;
export const csvName = (now = new Date()) => `ledger-flower-transactions-${now.toISOString().slice(0, 10)}.csv`;
