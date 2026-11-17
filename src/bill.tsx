// Bill calculator & splitter: type each menu item with its base price, the app adds service and tax,
// and (optionally) splits the bill between friends. Opened from "New transaction", pre-filled after a scan.
import { useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { fmtInput, parseAmount, type Model } from './calc';
import { scanReceipt, type Receipt } from './receipt';
import { computeBill, ratesOf, type BillItem } from './split';
import { put, txId, type PayKind, type Tx } from './store';
import { Field, Icon, Modal, Seg } from './ui';

export const OWED_ACC = 'acc_owed';
const ME = 'me';

export interface BillInit { place: string; date: string; items: { name: string; amount: number }[] }
export interface BillCtx { acc: string; cat?: string; sub?: string; pm?: PayKind; pmid?: string }

interface Row extends Omit<BillItem, 'unit'> { id: number; price: string }
let seq = 0;
const newRow = (name = '', price = '', who: string[] = [], qty = 1): Row => ({ id: ++seq, name, price, qty, who });
const money = fmtInput;
const pctText = (n: number) => (n ? String(Math.round(n * 1000) / 1000) : '');

export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (Capacitor.isNativePlatform()) { await Share.share({ title, text, dialogTitle: title }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title, text }); return 'shared'; }
  } catch (e) { if ((e as Error)?.name === 'AbortError') return 'shared'; }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}

const MOBILE = Capacitor.isNativePlatform() || /Android|iPhone|iPad/i.test(navigator.userAgent);

export function BillSplit({ m, init, ctx, onBack, onSaved, onScanned }: { m: Model; init: BillInit; ctx: BillCtx; onBack: () => void; onSaved: () => void; onScanned?: (r: Receipt) => void }) {
  const [place, setPlace] = useState(init.place);
  const [people, setPeople] = useState<string[]>([ME]);
  const [rows, setRows] = useState<Row[]>(() => (init.items.length ? init.items.map((i) => newRow(i.name, money(i.amount))) : [newRow()]));
  // Service and tax are entered either as printed amounts (Rp) — the app works out the rate — or as rates (%).
  const [service, setService] = useState('');
  const [tax, setTax] = useState('');
  const [svcMode, setSvcMode] = useState<'amt' | 'pct'>('amt');
  const [taxMode, setTaxMode] = useState<'amt' | 'pct'>('amt');
  const [taxOnService, setTaxOnService] = useState(true);
  const [printedTax, setPrintedTax] = useState<number | undefined>();
  const [date, setDate] = useState(init.date);
  const [receiptTotal, setReceiptTotal] = useState<number | undefined>();
  const [scan, setScan] = useState<{ busy?: boolean; progress?: number; error?: string; done?: string; text?: string }>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [discount, setDiscount] = useState('');
  const [paidAll, setPaidAll] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const pastFriends = useMemo(() => [...new Set(m.txs.map((t) => t.who).filter((w): w is string => !!w))].slice(0, 30), [m.txs]);
  const label = (k: string) => (k === ME ? 'Me' : k);
  const pctNum = (v: string) => Number(v.replace(',', '.')) || 0;
  const res = computeBill(rows.map((r) => ({ name: r.name.trim(), unit: parseAmount(r.price), qty: r.qty, who: r.who })), people, {
    service: svcMode === 'pct' ? pctNum(service) : 0, tax: taxMode === 'pct' ? pctNum(tax) : 0, taxOnService, discount: parseAmount(discount),
    serviceAmt: svcMode === 'amt' ? parseAmount(service) : undefined, taxAmt: taxMode === 'amt' ? parseAmount(tax) : undefined,
  });
  // The rates the amounts work out to, against this bill's subtotal.
  const base = res.subtotal - res.discount;
  const guessed = ratesOf(base, res.service, res.tax, printedTax);
  // Show the rate the person typed in % mode; in amount mode, the rate worked out from the amount.
  const rates = { service: svcMode === 'pct' ? pctNum(service) : guessed.service, tax: taxMode === 'pct' ? pctNum(tax) : guessed.tax, taxOnService: taxMode === 'pct' ? taxOnService : guessed.taxOnService };
  const shown = (x: number) => (Math.round(x * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const switchMode = (which: 'svc' | 'tax') => {
    if (which === 'svc') {
      if (svcMode === 'amt') { setService(res.service ? pctText(rates.service) : ''); setSvcMode('pct'); }
      else { setService(res.service ? money(res.service) : ''); setSvcMode('amt'); }
    } else if (taxMode === 'amt') { setTax(res.tax ? pctText(rates.tax) : ''); setTaxOnService(rates.taxOnService); setTaxMode('pct'); }
    else { setTax(res.tax ? money(res.tax) : ''); setTaxMode('amt'); }
  };
  const friends = people.filter((p) => p !== ME);
  const setRow = (id: number, p: Partial<Row>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const toggleWho = (r: Row, k: string) => {
    // Empty means "shared by everyone"; tapping a person narrows it, tapping everyone again widens it back.
    const cur = r.who.length ? r.who : [];
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    setRow(r.id, { who: next.length === people.length ? [] : next });
  };
  const addPerson = (raw: string) => {
    const name = raw.trim().slice(0, 24);
    if (!name || name.toLowerCase() === 'me' || people.some((p) => p.toLowerCase() === name.toLowerCase())) { setAdding(null); return; }
    setPeople([...people, name]); setAdding(''); // keep the box open to add the next friend
  };
  const removePerson = (k: string) => { setPeople(people.filter((p) => p !== k)); setRows(rows.map((r) => ({ ...r, who: r.who.filter((w) => w !== k) }))); };
  const diff = receiptTotal ? res.total - receiptTotal : 0;

  // Scan a receipt: menu items with quantity and price each, plus service, tax and discount, go straight into the bill.
  const onFile = async (file?: File) => {
    if (!file) return;
    setScan({ busy: true, progress: 0 });
    try {
      const r = await scanReceipt(file, m.categories, (p) => setScan({ busy: true, progress: p }));
      if (!r.items.length) {
        setScan({ text: r.text, error: r.text.trim() ? 'No menu items could be picked out. Check the text below, try a flatter, closer photo, or type the items in.' : 'No text could be read. Try a sharper, well-lit photo with the receipt filling the frame.' });
        return;
      }
      const c = r.charges ?? { service: 0, tax: 0, discount: 0 };
      const sub = r.items.reduce((a, i) => a + i.amount, 0);
      setRows(r.items.map((i) => newRow(i.name, money(i.unit ?? i.amount), [], i.qty ?? 1)));
      // Use the amounts exactly as printed, so the bill matches the receipt to the last rupiah; the rates are shown next to them.
      setService(c.service ? money(c.service) : ''); setTax(c.tax ? money(c.tax) : ''); setSvcMode('amt'); setTaxMode('amt');
      setPrintedTax(c.taxPct);
      setTaxOnService(ratesOf(sub - c.discount, c.service, c.tax, c.taxPct).taxOnService);
      setDiscount(c.discount ? money(c.discount) : '');
      if (r.merchant) setPlace(r.merchant);
      setDate(r.date);
      setReceiptTotal(r.totalPrinted ? r.total : undefined); // only check against a total that was actually printed and read
      onScanned?.(r);
      const n = r.items.reduce((a, i) => a + (i.qty ?? 1), 0);
      setScan({ text: r.text, done: `Read ${r.items.length} menu line${r.items.length === 1 ? '' : 's'} (${n} item${n === 1 ? '' : 's'})${c.service || c.tax ? ', service and tax' : ''}${c.discount ? ' and a discount' : ''}. Check them below${friends.length ? '' : ', then add friends to split'}.` });
    } catch (e) {
      console.error('receipt scan', e);
      setScan({ error: `The receipt couldn’t be read (${e instanceof Error ? e.message : String(e)}). You can still type the items in.` });
    }
  };

  const summary = () => {
    const f = m.fmt;
    const head = [`${place || 'Bill'} — ${new Date(date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
      `Subtotal ${f(res.subtotal)}${res.discount ? ` · Discount −${f(res.discount)}` : ''}${res.service ? ` · Service ${shown(rates.service)}% ${f(res.service)}` : ''}${res.tax ? ` · Tax ${shown(rates.tax)}% ${f(res.tax)}` : ''}`,
      `Total ${f(res.total)}`, ''];
    const body = res.people.filter((p) => p.total > 0).map((p) => [`${label(p.key)}: ${f(p.total)}`,
      ...p.lines.map((l) => `  • ${l.name}${l.sharedBy > 1 ? ` (1/${l.sharedBy})` : ''} ${f(l.amount)}`),
      ...(p.service || p.tax || p.discount ? [`  + service & tax ${f(p.service + p.tax - p.discount)}`] : [])].join('\n'));
    return [...head, ...body, ...(paidAll && friends.length ? ['', 'I paid the bill — please send your share. Thanks!'] : [])].join('\n');
  };
  const doShare = async () => { const r = await shareText(`${place || 'Bill'} split`, summary()); setNote(r === 'copied' ? 'Breakdown copied — paste it into your chat.' : r === 'failed' ? 'Couldn’t share from here. Use “Save” and share later.' : ''); };

  const save = () => {
    if (!res.total) { setError('Add at least one item with a price.'); return; }
    if (!ctx.acc) { setError('Pick an account in the transaction form first.'); return; }
    const mine = res.people.find((p) => p.key === ME)!;
    const where = place.trim() || 'Bill';
    const recs: Omit<Tx, 'u'>[] = [];
    if (mine.total > 0) recs.push({ id: txId(date), date, type: 'expense', amount: mine.total, acc: ctx.acc, cat: ctx.cat, sub: ctx.sub, pm: ctx.pm, pmid: ctx.pmid, note: friends.length ? `${where} (my share)` : where });
    if (paidAll) {
      const owedAcc = m.data.accounts[OWED_ACC];
      if (!owedAcc || owedAcc.del) put('accounts', { id: OWED_ACC, name: 'Owed to me', type: 'owed', opening: 0 });
      for (const p of res.people) if (p.key !== ME && p.total > 0)
        recs.push({ id: txId(date), date, type: 'transfer', amount: p.total, acc: ctx.acc, toAcc: OWED_ACC, who: p.key, note: `${p.key} · ${where}` });
    }
    if (!recs.length) { setError('Nothing to save: your share is zero and nobody owes you.'); return; }
    put('tx', ...recs);
    onSaved();
  };

  return (
    <Modal title="Bill & split" onClose={onBack} wide
      footer={<>
        <button type="button" className="btn ghost" onClick={onBack}>Back</button>
        <span className="grow" />
        {friends.length > 0 && <button type="button" className="btn" onClick={() => void doShare()}><Icon name="share" size={16} />Share</button>}
        <button type="button" className="btn primary" onClick={save}>Save</button>
      </>}>
      <div className="form bill">
        <div className="scan">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          {scan.busy ? (
            <div className="scan-busy" role="status">
              <span>Reading receipt… {Math.round((scan.progress ?? 0) * 100)}%</span>
              <div className="meter"><i style={{ width: `${Math.max(4, (scan.progress ?? 0) * 100)}%` }} /></div>
            </div>
          ) : (
            <div className="btn-row tight">
              {MOBILE && <button type="button" className="btn small primary" onClick={() => camRef.current?.click()}><Icon name="camera" size={15} />Scan receipt</button>}
              <button type="button" className={`btn small${MOBILE ? '' : ' primary'}`} onClick={() => fileRef.current?.click()}><Icon name="image" size={15} />{MOBILE ? 'From photos' : 'Scan receipt image'}</button>
              {!scan.done && !scan.error && <small className="hint">Reads the menu items, quantities, prices, service and tax. Read on this device only.</small>}
            </div>
          )}
          {scan.done && <p className="scan-note ok"><Icon name="check" size={14} />{scan.done}</p>}
          {scan.error && <p className="scan-note bad"><Icon name="warn" size={14} />{scan.error}</p>}
          {scan.text !== undefined && !scan.busy && (
            <details className="scan-text"><summary>Show the text read from the photo</summary><pre>{scan.text.trim() || '(nothing)'}</pre></details>
          )}
        </div>
        <Field label="Place"><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Café Lumen" maxLength={60} /></Field>

        <div className="field">
          <span>People</span>
          <div className="chips small">
            {people.map((k) => (
              <span key={k} className={`chip person${k === ME ? ' me' : ''}`}>
                <i className="avatar">{label(k).slice(0, 1).toUpperCase()}</i>{label(k)}
                {k !== ME && <button type="button" className="chip-x" onClick={() => removePerson(k)} aria-label={`Remove ${k}`}><Icon name="x" size={12} /></button>}
              </span>
            ))}
            {adding === null ? (
              <button type="button" className="chip add" onClick={() => setAdding('')}><Icon name="plus" size={13} />Add friend</button>
            ) : (
              <span className="chip-in">
                <input autoFocus list="friends" value={adding} maxLength={24} placeholder="Name" aria-label="Friend's name"
                  onChange={(e) => setAdding(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(adding); } if (e.key === 'Escape') { e.stopPropagation(); setAdding(null); } }} />
                <button type="button" className="btn small" onClick={() => addPerson(adding)}>Add</button>
              </span>
            )}
            <datalist id="friends">{pastFriends.filter((f) => !people.includes(f)).map((f) => <option key={f} value={f} />)}</datalist>
          </div>
          {friends.length > 0 && <small>Tap names under an item to choose who had it. No names picked means everyone shares it.</small>}
        </div>

        <div className="field">
          <span>Items · base prices before service and tax</span>
          <div className="bill-items">
            {rows.map((r, i) => {
              const line = parseAmount(r.price) * r.qty;
              return (
                <div key={r.id} className="bill-item">
                  <div className="bill-line">
                    <input className="bi-name" value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} placeholder={`Item ${i + 1}`} aria-label={`Item ${i + 1} name`} />
                    <div className="qty" role="group" aria-label={`Item ${i + 1} quantity`}>
                      <button type="button" onClick={() => setRow(r.id, { qty: Math.max(1, r.qty - 1) })} aria-label="Less">−</button>
                      <b>{r.qty}</b>
                      <button type="button" onClick={() => setRow(r.id, { qty: Math.min(99, r.qty + 1) })} aria-label="More">+</button>
                    </div>
                    <input className="bi-price" inputMode="decimal" value={r.price} onChange={(e) => setRow(r.id, { price: e.target.value })} placeholder="0" aria-label={`Item ${i + 1} price each`} />
                    <button type="button" className="icon-btn" onClick={() => setRows(rows.length > 1 ? rows.filter((x) => x.id !== r.id) : [newRow()])} aria-label={`Remove item ${i + 1}`}><Icon name="x" size={16} /></button>
                  </div>
                  {friends.length > 0 && (
                    <div className="bill-who">
                      {people.map((k) => (
                        <button type="button" key={k} className={`who${r.who.includes(k) ? ' on' : ''}`} onClick={() => toggleWho(r, k)} aria-pressed={r.who.includes(k)}>{label(k)}</button>
                      ))}
                      <small className="muted">{r.who.length === 0 ? 'shared by all' : r.who.length > 1 ? `split ${r.who.length} ways` : ''}{r.qty > 1 && line ? ` · ${m.fmt(line)}` : ''}</small>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="link" onClick={() => setRows([...rows, newRow()])}>+ Add item</button>
        </div>

        <div className="row2 charges">
          <ChargeField label="Service" mode={svcMode} value={service} onChange={setService} onSwitch={() => switchMode('svc')} currency={m.fmt(0).replace(/[\d\s.,]/g, '') || '$'}
            note={res.service ? (svcMode === 'amt' ? `= ${shown(rates.service)}% of ${m.fmt(base)}` : `= ${m.fmt(res.service)}`) : undefined} />
          <ChargeField label="Tax" mode={taxMode} value={tax} onChange={setTax} onSwitch={() => switchMode('tax')} currency={m.fmt(0).replace(/[\d\s.,]/g, '') || '$'}
            note={res.tax ? (taxMode === 'amt' ? `= ${shown(rates.tax)}% of ${rates.taxOnService && res.service ? 'subtotal + service' : 'subtotal'}` : `= ${m.fmt(res.tax)}`) : undefined} />
        </div>
        <div className="row2 charges">
          <Field label="Discount"><input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></Field>
          {taxMode === 'pct' && <label className="check tight"><input type="checkbox" checked={taxOnService} onChange={(e) => setTaxOnService(e.target.checked)} />Tax is charged on service too</label>}
        </div>

        <div className="bill-total">
          <div><span>Subtotal</span><b>{m.fmt(res.subtotal)}</b></div>
          {res.discount > 0 && <div><span>Discount</span><b>−{m.fmt(res.discount)}</b></div>}
          <div><span>Service{res.service ? ` ${shown(rates.service)}%` : ''}</span><b>{m.fmt(res.service)}</b></div>
          <div><span>Tax{res.tax ? ` ${shown(rates.tax)}%` : ''}</span><b>{m.fmt(res.tax)}</b></div>
          <div className="grand"><span>Total</span><b>{m.fmt(res.total)}</b></div>
          {receiptTotal !== undefined && Math.abs(diff) > 1 && (
            <p className="status warn"><Icon name="warn" size={13} />Receipt says {m.fmt(receiptTotal)} — {diff > 0 ? `${m.fmt(diff)} more` : `${m.fmt(-diff)} less`} here. Check prices, service and tax.</p>
          )}
          {receiptTotal !== undefined && Math.abs(diff) <= 1 && res.total > 0 && <p className="status good"><Icon name="check" size={13} />Matches the receipt total.</p>}
        </div>

        {friends.length > 0 && (
          <>
            <div className="field">
              <span>Each person pays</span>
              <div className="shares">
                {res.people.map((p) => (
                  <div key={p.key} className={`share${p.key === ME ? ' me' : ''}`}>
                    <div className="share-head"><i className="avatar">{label(p.key).slice(0, 1).toUpperCase()}</i><b>{label(p.key)}</b><strong>{m.fmt(p.total)}</strong></div>
                    <small>{p.lines.length ? p.lines.map((l) => `${l.name}${l.sharedBy > 1 ? ` (1/${l.sharedBy})` : ''}`).join(', ') : 'Nothing yet'}{p.service + p.tax ? ` · +${m.fmt(p.service + p.tax - p.discount)} service & tax` : ''}</small>
                  </div>
                ))}
              </div>
            </div>
            <Field label="Who paid the bill?">
              <Seg value={paidAll ? 'me' : 'each'} onChange={(v) => setPaidAll(v === 'me')} options={[['me', 'I paid for everyone'], ['each', 'Each paid their own']]} />
            </Field>
            <p className="hint">
              {paidAll
                ? `Saves your share (${m.fmt(res.people[0].total)}) as spending, and ${friends.filter((f) => res.people.find((p) => p.key === f)!.total > 0).length} friend share(s) as money owed to you — see Accounts → Owed to me.`
                : `Saves only your share (${m.fmt(res.people[0].total)}) as spending.`}
            </p>
          </>
        )}
        {note && <p className="scan-note ok"><Icon name="check" size={14} />{note}</p>}
        {error && <p className="scan-note bad"><Icon name="warn" size={14} />{error}</p>}
      </div>
    </Modal>
  );
}

/** A service or tax box that takes either the printed amount or a rate, with a switch between them. */
function ChargeField({ label, mode, value, onChange, onSwitch, note, currency }: { label: string; mode: 'amt' | 'pct'; value: string; onChange: (v: string) => void; onSwitch: () => void; note?: string; currency: string }) {
  return (
    <div className="field charge">
      <span>{label}</span>
      <div className="charge-in">
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" aria-label={`${label} ${mode === 'amt' ? 'amount' : 'percent'}`} />
        <div className="unit-switch" role="group" aria-label={`${label} entered as`}>
          <button type="button" className={mode === 'amt' ? 'on' : ''} aria-pressed={mode === 'amt'} onClick={() => mode !== 'amt' && onSwitch()}>{currency}</button>
          <button type="button" className={mode === 'pct' ? 'on' : ''} aria-pressed={mode === 'pct'} onClick={() => mode !== 'pct' && onSwitch()}>%</button>
        </div>
      </div>
      {note && <small>{note}</small>}
    </div>
  );
}
