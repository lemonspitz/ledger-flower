// Bill calculator & splitter: type each menu item with its base price, the app adds service and tax,
// and (optionally) splits the bill between friends. Opened from "New transaction", pre-filled after a scan.
import { useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { parseAmount, type Model } from './calc';
import { computeBill, ratesFromAmounts, type BillItem } from './split';
import { put, txId, type PayKind, type Tx } from './store';
import { Field, Icon, Modal, Seg } from './ui';

export const OWED_ACC = 'acc_owed';
const ME = 'me';

export interface BillInit {
  place: string; date: string;
  items: { name: string; amount: number }[];
  charges?: { service: number; tax: number; servicePct?: number; taxPct?: number };
  receiptTotal?: number;
}
export interface BillCtx { acc: string; cat?: string; sub?: string; pm?: PayKind; pmid?: string }

interface Row extends Omit<BillItem, 'unit'> { id: number; price: string }
let seq = 0;
const newRow = (name = '', price = '', who: string[] = [], qty = 1): Row => ({ id: ++seq, name, price, qty, who });
const money = (minor: number) => (minor % 100 ? (minor / 100).toFixed(2) : String(minor / 100));
/** A scanned "2 ES TEH 40.000" line becomes 2 × 20.000. */
function rowFromScan(name: string, amount: number): Row {
  const m = name.match(/^(\d{1,2})\s*[xX×]?\s+(.{2,})$/);
  const q = m ? Number(m[1]) : 1;
  return q > 1 && amount % q === 0 ? newRow(m![2], money(amount / q), [], q) : newRow(name, money(amount));
}
const pctText = (n: number) => (n ? String(Math.round(n * 100) / 100) : '');

export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (Capacitor.isNativePlatform()) { await Share.share({ title, text, dialogTitle: title }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title, text }); return 'shared'; }
  } catch (e) { if ((e as Error)?.name === 'AbortError') return 'shared'; }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}

export function BillSplit({ m, init, ctx, onBack, onSaved }: { m: Model; init: BillInit; ctx: BillCtx; onBack: () => void; onSaved: () => void }) {
  const firstRates = useMemo(() => {
    const c = init.charges;
    if (!c) return { service: 0, tax: 0, taxOnService: true };
    const sub = init.items.reduce((a, i) => a + i.amount, 0);
    return ratesFromAmounts(sub, c.service, c.tax, { service: c.servicePct, tax: c.taxPct });
  }, [init]);
  const [place, setPlace] = useState(init.place);
  const [people, setPeople] = useState<string[]>([ME]);
  const [rows, setRows] = useState<Row[]>(() => (init.items.length ? init.items.map((i) => rowFromScan(i.name, i.amount)) : [newRow()]));
  const [service, setService] = useState(pctText(firstRates.service));
  const [tax, setTax] = useState(pctText(firstRates.tax));
  const [taxOnService, setTaxOnService] = useState(firstRates.taxOnService);
  const [discount, setDiscount] = useState('');
  const [paidAll, setPaidAll] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const pastFriends = useMemo(() => [...new Set(m.txs.map((t) => t.who).filter((w): w is string => !!w))].slice(0, 30), [m.txs]);
  const label = (k: string) => (k === ME ? 'Me' : k);
  const res = computeBill(rows.map((r) => ({ name: r.name.trim(), unit: parseAmount(r.price), qty: r.qty, who: r.who })), people,
    { service: Number(service.replace(',', '.')) || 0, tax: Number(tax.replace(',', '.')) || 0, taxOnService, discount: parseAmount(discount) });
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
  const diff = init.receiptTotal ? res.total - init.receiptTotal : 0;

  const summary = () => {
    const f = m.fmt;
    const head = [`${place || 'Bill'} — ${new Date(init.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
      `Subtotal ${f(res.subtotal)}${res.discount ? ` · Discount −${f(res.discount)}` : ''}${res.service ? ` · Service ${service}% ${f(res.service)}` : ''}${res.tax ? ` · Tax ${tax}% ${f(res.tax)}` : ''}`,
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
    if (mine.total > 0) recs.push({ id: txId(init.date), date: init.date, type: 'expense', amount: mine.total, acc: ctx.acc, cat: ctx.cat, sub: ctx.sub, pm: ctx.pm, pmid: ctx.pmid, note: friends.length ? `${where} (my share)` : where });
    if (paidAll) {
      const owedAcc = m.data.accounts[OWED_ACC];
      if (!owedAcc || owedAcc.del) put('accounts', { id: OWED_ACC, name: 'Owed to me', type: 'owed', opening: 0 });
      for (const p of res.people) if (p.key !== ME && p.total > 0)
        recs.push({ id: txId(init.date), date: init.date, type: 'transfer', amount: p.total, acc: ctx.acc, toAcc: OWED_ACC, who: p.key, note: `${p.key} · ${where}` });
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
          <Field label="Service %"><input inputMode="decimal" value={service} onChange={(e) => setService(e.target.value)} placeholder="0" /></Field>
          <Field label="Tax %"><input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" /></Field>
        </div>
        <div className="row2 charges">
          <Field label="Discount"><input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></Field>
          <label className="check tight"><input type="checkbox" checked={taxOnService} onChange={(e) => setTaxOnService(e.target.checked)} />Tax is charged on service too</label>
        </div>

        <div className="bill-total">
          <div><span>Subtotal</span><b>{m.fmt(res.subtotal)}</b></div>
          {res.discount > 0 && <div><span>Discount</span><b>−{m.fmt(res.discount)}</b></div>}
          <div><span>Service{service ? ` ${service}%` : ''}</span><b>{m.fmt(res.service)}</b></div>
          <div><span>Tax{tax ? ` ${tax}%` : ''}</span><b>{m.fmt(res.tax)}</b></div>
          <div className="grand"><span>Total</span><b>{m.fmt(res.total)}</b></div>
          {init.receiptTotal !== undefined && Math.abs(diff) > 1 && (
            <p className="status warn"><Icon name="warn" size={13} />Receipt says {m.fmt(init.receiptTotal)} — {diff > 0 ? `${m.fmt(diff)} more` : `${m.fmt(-diff)} less`} here. Check prices, service and tax.</p>
          )}
          {init.receiptTotal !== undefined && Math.abs(diff) <= 1 && res.total > 0 && <p className="status good"><Icon name="check" size={13} />Matches the receipt total.</p>}
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
