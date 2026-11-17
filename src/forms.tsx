import { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { OPS, evalExpr, parseAmount, type Model } from './calc';
import { put, remove, today, txId, uid, type Account, type Category, type Goal, type PayKind, type PayMethod, type Recurring, type Tx, type TxType } from './store';
import { merchantSub, scanReceipt, type Receipt } from './receipt';
import { BillSplit, type BillInit } from './bill';
import { Field, Icon, Modal, Seg } from './ui';

const MOBILE = Capacitor.isNativePlatform() || /Android|iPhone|iPad/i.test(navigator.userAgent);

const amt = (c?: number) => (c ? (c / 100).toFixed(2) : '');

export type Dialog =
  | { k: 'tx'; tx?: Tx; preset?: Partial<Tx> }
  | { k: 'budget'; cat: string }
  | { k: 'goal'; goal?: Goal }
  | { k: 'fund'; goal: Goal }
  | { k: 'account'; acc?: Account }
  | { k: 'recurring'; rec?: Recurring }
  | { k: 'category'; cat?: Category }
  | { k: 'method'; method?: PayMethod; kind?: 'card' | 'qr' }
  | { k: 'settle'; who: string; amount: number };

export function Dialogs({ d, m, close }: { d: Dialog; m: Model; close: () => void }) {
  switch (d.k) {
    case 'tx': return <TxForm m={m} tx={d.tx} preset={d.preset} close={close} />;
    case 'budget': return <BudgetForm m={m} cat={d.cat} close={close} />;
    case 'goal': return <GoalForm goal={d.goal} close={close} />;
    case 'fund': return <FundForm m={m} goal={d.goal} close={close} />;
    case 'account': return <AccountForm m={m} acc={d.acc} close={close} />;
    case 'recurring': return <RecurringForm m={m} rec={d.rec} close={close} />;
    case 'category': return <CategoryForm cat={d.cat} close={close} />;
    case 'settle': return <SettleForm m={m} who={d.who} owed={d.amount} close={close} />;
    case 'method': return <MethodForm m={m} method={d.method} kind={d.kind} close={close} />;
  }
}

function Actions({ onDelete, close, label = 'Save', disabled }: { onDelete?: () => void; close: () => void; label?: string; disabled?: boolean }) {
  return (
    <>
      {onDelete && <button type="button" className="btn danger ghost" onClick={() => { onDelete(); close(); }}>Delete</button>}
      <span className="grow" />
      <button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="submit" form="dlg" className="btn primary" disabled={disabled}>{label}</button>
    </>
  );
}

interface ItemRow { name: string; amt: string; sub: string }

function TxForm({ m, tx, preset, close }: { m: Model; tx?: Tx; preset?: Partial<Tx>; close: () => void }) {
  const init = tx ?? preset ?? {};
  const [type, setType] = useState<TxType>(init.type ?? 'expense');
  const [amount, setAmount] = useState(amt(init.amount));
  const [date, setDate] = useState(init.date ?? today());
  const [acc, setAcc] = useState(init.acc ?? m.accounts[0]?.id ?? '');
  const [toAcc, setToAcc] = useState(init.toAcc ?? m.accounts.find((a) => a.id !== acc)?.id ?? '');
  const [cat, setCat] = useState(init.cat ?? '');
  const [sub, setSub] = useState(init.sub ?? '');
  const [newSub, setNewSub] = useState<string | null>(null);
  const [note, setNote] = useState(init.note ?? '');
  // New expenses start with however the last expense was paid.
  const lastPaid = tx ? undefined : m.txs.find((x) => x.type === 'expense' && x.pm);
  const [pm, setPm] = useState<PayKind | undefined>(init.pm ?? lastPaid?.pm);
  const [pmid, setPmid] = useState<string | undefined>(init.pmid ?? lastPaid?.pmid);
  const [newMethod, setNewMethod] = useState<{ name: string; last4: string } | null>(null);
  const [scan, setScan] = useState<{ busy?: boolean; progress?: number; error?: string; done?: string; text?: string }>({});
  const [items, setItems] = useState<ItemRow[]>([]);
  const [split, setSplit] = useState(false);
  const [pad, setPad] = useState(MOBILE);
  const [lastScan, setLastScan] = useState<Receipt | null>(null);
  const [bill, setBill] = useState<BillInit | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const cats = m.categories.filter((c) => c.kind === type);
  const sel = cats.some((c) => c.id === cat) ? cat : cats[0]?.id;
  const selCat = cats.find((c) => c.id === sel);
  const subs = selCat?.subs ?? [];
  const useSplit = split && type === 'expense' && items.length > 0;
  const cents = useSplit ? items.reduce((a, i) => a + parseAmount(i.amt), 0) : parseAmount(amount);
  const ok = cents > 0 && acc && (type === 'transfer' ? toAcc && toAcc !== acc : true) && !scan.busy;

  const onFile = async (file?: File) => {
    if (!file) return;
    setScan({ busy: true, progress: 0 });
    try {
      const r = await scanReceipt(file, m.categories, (p) => setScan({ busy: true, progress: p }));
      if (!r.total && !r.items.length) { setScan({ text: r.text, error: r.text.trim() ? 'Text was found, but no prices could be picked out of it. Check the text below, then type the details in, or try a flatter, closer photo.' : 'No text could be read. Try a sharper, well-lit photo taken straight on, with the receipt filling the frame.' }); return; }
      setType('expense');
      setAmount((r.total / 100).toFixed(2));
      setDate(r.date);
      if (r.merchant) setNote(r.merchant);
      if (r.pay) {
        // Match to a saved card (by last 4 digits, then network) or QR app (by name).
        const pool = m.methods.filter((x) => x.kind === r.pay!.kind);
        const hit = r.pay.kind === 'card'
          ? pool.find((x) => r.pay!.last4 && x.last4 === r.pay!.last4) ?? pool.find((x) => r.pay!.name && x.network?.toLowerCase().replace(/\s/g, '') === r.pay!.name!.toLowerCase())
          : pool.find((x) => r.pay!.name && x.name.toLowerCase().replace(/\s/g, '').includes(r.pay!.name!.toLowerCase().replace(/\s/g, '')));
        setPm(r.pay.kind); setPmid(hit?.id);
        if (hit?.acc && m.acc(hit.acc)) setAcc(hit.acc);
      }
      if (r.cat) { setCat(r.cat); setSub(merchantSub(r.merchant, m.cat(r.cat)) ?? ''); }
      const rows = r.items.map((i) => ({ name: i.name, amt: (i.amount / 100).toFixed(2), sub: i.sub ?? '' }));
      const sum = r.items.reduce((a, i) => a + i.amount, 0);
      const gap = r.total - sum;
      // Keep itemized entries equal to what was actually paid: carry tax and fees as their own line.
      const taxLine = rows.length > 0 && gap > 1 && gap <= sum * 0.35;
      if (taxLine) rows.push({ name: 'Tax or unread lines', amt: (gap / 100).toFixed(2), sub: '' });
      setItems(rows);
      setSplit(false);
      setLastScan(r);
      setScan({ text: r.text, done: `Read ${r.merchant ? `“${r.merchant}”` : 'the receipt'}: total ${m.fmt(r.total)}${r.items.length ? `, ${r.items.length} item${r.items.length === 1 ? '' : 's'}` : ''}.${taxLine ? ` Items add up to ${m.fmt(sum)}, so the other ${m.fmt(gap)} is listed as “Tax or unread lines”.` : r.items.length && Math.abs(gap) > 1 ? ` Items add up to ${m.fmt(sum)} — a line may have been missed or misread.` : ''} Please check before saving.` });
    } catch (e) {
      console.error('receipt scan', e);
      setScan({ error: `The receipt couldn’t be read (${e instanceof Error ? e.message : String(e)}). You can still type the details in.` });
    }
  };
  const addSub = () => {
    const name = (newSub ?? '').trim().slice(0, 30);
    if (name && selCat && !subs.some((x) => x.toLowerCase() === name.toLowerCase())) put('categories', { ...selCat, subs: [...subs, name] });
    if (name) setSub(subs.find((x) => x.toLowerCase() === name.toLowerCase()) ?? name);
    setNewSub(null);
  };
  const setItem = (i: number, p: Partial<ItemRow>) => setItems(items.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const pay = type === 'expense' && pm ? { pm, pmid: pm === 'cash' ? undefined : m.methods.some((x) => x.id === pmid && x.kind === pm) ? pmid : undefined } : { pm: undefined, pmid: undefined };
    const base = { date, type, acc, rid: tx?.rid, who: type === 'transfer' ? tx?.who : undefined, ...pay };
    if (useSplit) {
      const where = note.trim();
      put('tx', ...items.filter((i) => parseAmount(i.amt) > 0).map((i) => ({
        ...base, id: txId(date), amount: parseAmount(i.amt), cat: sel, sub: subs.includes(i.sub) ? i.sub : undefined,
        note: [i.name.trim(), where].filter(Boolean).join(' · ').slice(0, 120),
      })));
    } else {
      put('tx', {
        ...base, id: tx?.id ?? txId(date), amount: cents, note: note.trim(),
        cat: type === 'transfer' ? undefined : sel, sub: type !== 'transfer' && subs.includes(sub) ? sub : undefined,
        toAcc: type === 'transfer' ? toAcc : undefined,
      });
    }
    close();
  };

  const openBill = () => setBill({
    place: note.trim(), date,
    items: lastScan ? lastScan.items.map((i) => ({ name: i.name, amount: i.amount })) : [],
    charges: lastScan?.charges, receiptTotal: lastScan?.total || undefined,
  });
  if (bill) return <BillSplit m={m} init={bill} ctx={{ acc, cat: sel, sub: subs.includes(sub) ? sub : undefined, pm, pmid: pm === 'cash' ? undefined : pmid }} onBack={() => setBill(null)} onSaved={close} />;

  return (
    <Modal title={tx ? 'Edit transaction' : 'New transaction'} onClose={close} footer={<Actions close={close} disabled={!ok} label={useSplit ? `Save ${items.length} items` : 'Save'} onDelete={tx ? () => remove('tx', tx.id) : undefined} />}>
      <form id="dlg" onSubmit={save} className="form">
        <Seg value={type} onChange={setType} options={[['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']]} />
        {!tx && type === 'expense' && (
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
                {MOBILE && <button type="button" className="btn small" onClick={() => camRef.current?.click()}><Icon name="camera" size={15} />Scan receipt</button>}
                <button type="button" className="btn small" onClick={() => fileRef.current?.click()}><Icon name="image" size={15} />{MOBILE ? 'From photos' : 'Scan receipt image'}</button>
                <button type="button" className="btn small" onClick={openBill}><Icon name="split" size={15} />Bill &amp; split</button>
                {!scan.done && !scan.error && <small className="hint">Scan fills in the amount, date and items for you, read on this device only. Bill &amp; split adds service and tax and divides a bill between friends.</small>}
              </div>
            )}
            {scan.done && <p className="scan-note ok"><Icon name="check" size={14} /><span>{scan.done} {lastScan && lastScan.items.length > 0 && <button type="button" className="link" onClick={openBill}>Split this bill</button>}</span></p>}
            {scan.error && <p className="scan-note bad"><Icon name="warn" size={14} />{scan.error}</p>}
            {scan.text !== undefined && !scan.busy && (
              <details className="scan-text">
                <summary>Show the text read from the photo</summary>
                <pre>{scan.text.trim() || '(nothing)'}</pre>
              </details>
            )}
          </div>
        )}
        <div className="amount-in">
          <span>{type === 'expense' ? '−' : type === 'income' ? '+' : '⇄'}</span>
          <input autoFocus={!MOBILE} inputMode={pad && MOBILE ? 'none' : 'decimal'} placeholder="0.00" value={useSplit ? (cents / 100).toFixed(2) : amount}
            readOnly={useSplit || (pad && MOBILE)} aria-label="Amount"
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,+\-−*/×÷() ]/g, ''))}
            onKeyDown={(e) => { if (e.key === '=') { e.preventDefault(); const v = evalExpr(amount.replace(/[+\-−*/×÷\s]+$/, '')); if (v !== null) setAmount(fmtCalc(v)); } }} />
          {!useSplit && <button type="button" className={`icon-btn calc-toggle${pad ? ' on' : ''}`} onClick={() => setPad(!pad)} aria-pressed={pad} aria-label={pad ? 'Hide calculator' : 'Show calculator'} title="Calculator"><Icon name="calc" /></button>}
        </div>
        {!useSplit && OPS.test(amount.replace(/^[-−]/, '')) && <p className="calc-result">= {(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
        {!useSplit && pad && <Keypad value={amount} onChange={setAmount} />}
        {type !== 'transfer' && (
          <div className="chips" role="radiogroup" aria-label="Category">
            {cats.map((c) => (
              <button type="button" key={c.id} role="radio" aria-checked={sel === c.id} className={sel === c.id ? 'chip on' : 'chip'} onClick={() => { setCat(c.id); setSub(''); }}>
                <span>{c.icon}</span>{c.name}
              </button>
            ))}
          </div>
        )}
        {type !== 'transfer' && selCat && !useSplit && (
          <div className="subs">
            <span className="subs-label">{selCat.name} › sub-category</span>
            <div className="chips small" role="radiogroup" aria-label="Sub-category">
              {subs.map((x) => <button type="button" key={x} role="radio" aria-checked={sub === x} className={sub === x ? 'chip on' : 'chip'} onClick={() => setSub(sub === x ? '' : x)}>{x}</button>)}
              {newSub === null ? (
                <button type="button" className="chip add" onClick={() => setNewSub('')}><Icon name="plus" size={13} />New</button>
              ) : (
                <span className="chip-in">
                  <input autoFocus value={newSub} maxLength={30} placeholder="Name" aria-label="New sub-category" onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } if (e.key === 'Escape') { e.stopPropagation(); setNewSub(null); } }} />
                  <button type="button" className="btn small" onClick={addSub}>Add</button>
                </span>
              )}
            </div>
          </div>
        )}
        {type === 'expense' && (
          <div className="subs pay">
            <span className="subs-label">Paid with</span>
            <div className="chips small" role="radiogroup" aria-label="Paid with">
              {([['cash', 'Cash', 'cash'], ['card', 'Card', 'card'], ['qr', 'QR', 'qr']] as const).map(([k, label, icon]) => (
                <button type="button" key={k} role="radio" aria-checked={pm === k} className={pm === k ? 'chip on' : 'chip'} onClick={() => { setPm(pm === k ? undefined : k); setNewMethod(null); }}>
                  <Icon name={icon} size={15} />{label}
                </button>
              ))}
            </div>
            {(pm === 'card' || pm === 'qr') && (
              <div className="chips small" role="radiogroup" aria-label={pm === 'card' ? 'Which card' : 'Which bank or app'}>
                {m.methods.filter((x) => x.kind === pm).map((x) => (
                  <button type="button" key={x.id} role="radio" aria-checked={pmid === x.id} className={pmid === x.id ? 'chip on' : 'chip'}
                    onClick={() => { setPmid(pmid === x.id ? undefined : x.id); if (x.acc && m.acc(x.acc) && pmid !== x.id) setAcc(x.acc); }}>{m.methodName(x)}</button>
                ))}
                {newMethod === null ? (
                  <button type="button" className="chip add" onClick={() => setNewMethod({ name: '', last4: '' })}><Icon name="plus" size={13} />{pm === 'card' ? 'New card' : 'New bank / app'}</button>
                ) : (
                  <span className="chip-in">
                    <input autoFocus list={pm === 'qr' ? 'qr-apps' : 'card-names'} value={newMethod.name} maxLength={30} aria-label={pm === 'card' ? 'Card name' : 'Bank or app name'}
                      placeholder={pm === 'card' ? 'e.g. BCA Debit' : 'e.g. GoPay'} onChange={(e) => setNewMethod({ ...newMethod, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget.parentElement?.querySelector('.btn') as HTMLButtonElement)?.click(); } if (e.key === 'Escape') { e.stopPropagation(); setNewMethod(null); } }} />
                    {pm === 'card' && <input className="last4" inputMode="numeric" value={newMethod.last4} maxLength={4} placeholder="Last 4" aria-label="Last 4 digits (optional)" onChange={(e) => setNewMethod({ ...newMethod, last4: e.target.value.replace(/\D/g, '') })} />}
                    <button type="button" className="btn small" onClick={() => {
                      const name = newMethod.name.trim();
                      if (!name) return setNewMethod(null);
                      const rec: Omit<PayMethod, 'u'> = { id: 'pm_' + uid(), type: 'method', kind: pm, name, last4: pm === 'card' && newMethod.last4.length === 4 ? newMethod.last4 : undefined, acc };
                      put('settings', rec); setPmid(rec.id); setNewMethod(null);
                    }}>Add</button>
                  </span>
                )}
              </div>
            )}
            <datalist id="qr-apps">{QR_APPS.map((x) => <option key={x} value={x} />)}</datalist>
            <datalist id="card-names">{CARD_NETWORKS.map((x) => <option key={x} value={x} />)}</datalist>
          </div>
        )}
        {type === 'expense' && items.length > 0 && (
          <div className="items">
            <label className="check"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />Save each item separately <small>({items.length} found — lets you track sub-categories)</small></label>
            {split && (
              <>
                {items.map((it, i) => (
                  <div key={i} className="item-row">
                    <input value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} aria-label={`Item ${i + 1} name`} />
                    {subs.length > 0 && <select value={subs.includes(it.sub) ? it.sub : ''} onChange={(e) => setItem(i, { sub: e.target.value })} aria-label={`Item ${i + 1} sub-category`}><option value="">No sub-category</option>{subs.map((x) => <option key={x}>{x}</option>)}</select>}
                    <input className="item-amt" inputMode="decimal" value={it.amt} onChange={(e) => setItem(i, { amt: e.target.value })} aria-label={`Item ${i + 1} amount`} />
                    <button type="button" className="icon-btn" onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label={`Remove item ${i + 1}`}><Icon name="x" size={16} /></button>
                  </div>
                ))}
                <button type="button" className="link" onClick={() => setItems([...items, { name: '', amt: '', sub: '' }])}>Add an item</button>
              </>
            )}
          </div>
        )}
        <div className="row2">
          <Field label={type === 'transfer' ? 'From' : 'Account'}>
            <select value={acc} onChange={(e) => setAcc(e.target.value)}>{m.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
          {type === 'transfer' ? (
            <Field label="To">
              <select value={toAcc} onChange={(e) => setToAcc(e.target.value)}>{m.accounts.filter((a) => a.id !== acc).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Field>
          ) : (
            <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          )}
        </div>
        {type === 'transfer' && <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>}
        <Field label={useSplit ? 'Store' : 'Note'}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === 'transfer' ? 'Optional' : 'Where or what for?'} maxLength={120} /></Field>
        {type === 'transfer' && m.accounts.length < 2 && <p className="hint">Add a second account to record transfers.</p>}
      </form>
    </Modal>
  );
}

const fmtCalc = (v: number) => String(Math.round(Math.abs(v) * 100) / 100);

/** On-screen calculator: tap prices and operators, the total is used when you save. */
function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (k: string) => {
    const v = value;
    if (k === 'C') return onChange('');
    if (k === '⌫') return onChange(v.slice(0, -1));
    if (k === '=') { const r = evalExpr(v.replace(/[+\-−×÷*/]+$/, '')); if (r !== null) onChange(fmtCalc(r)); return; }
    if ('+−×÷'.includes(k)) {
      if (!v) return;
      return onChange(/[+\-−×÷*/]$/.test(v) ? v.slice(0, -1) + k : v + k);
    }
    const current = v.split(/[+\-−×÷*/]/).pop() ?? '';
    if (k === '.') { if (current.includes('.') || current.includes(',')) return; return onChange(v + (current ? '.' : '0.')); }
    if (/[.,]\d{2}$/.test(current)) return; // two decimal places is enough for money
    onChange(current === '0' ? v.slice(0, -1) + k : v + k);
  };
  const keys: [string, string][] = [['C', 'fn'], ['÷', 'op'], ['×', 'op'], ['⌫', 'fn'], ['7', ''], ['8', ''], ['9', ''], ['−', 'op'], ['4', ''], ['5', ''], ['6', ''], ['+', 'op'], ['1', ''], ['2', ''], ['3', ''], ['=', 'eq'], ['0', 'zero'], ['.', '']];
  const label: Record<string, string> = { C: 'Clear', '⌫': 'Delete', '÷': 'Divide', '×': 'Multiply', '−': 'Minus', '+': 'Plus', '=': 'Equals', '.': 'Decimal point' };
  return (
    <div className="keypad" role="group" aria-label="Calculator">
      {keys.map(([k, c]) => (
        <button type="button" key={k} className={c} onClick={() => press(k)} aria-label={label[k] ?? k}>{k === '⌫' ? <Icon name="back" size={22} /> : k}</button>
      ))}
    </div>
  );
}

export const QR_APPS = ['QRIS', 'GoPay', 'OVO', 'DANA', 'ShopeePay', 'LinkAja', 'BCA mobile', 'Livin\u2019 by Mandiri', 'BRImo', 'BNI Mobile', 'Jenius', 'PayNow', 'PromptPay', 'DuitNow', 'GCash', 'Maya', 'Alipay', 'WeChat Pay', 'Paytm', 'PhonePe', 'Google Pay', 'PayPal', 'Venmo', 'Cash App'];
export const CARD_NETWORKS = ['Visa', 'Mastercard', 'American Express', 'JCB', 'UnionPay', 'GPN', 'Discover', 'Other'];

function MethodForm({ m, method, kind: k0, close }: { m: Model; method?: PayMethod; kind?: 'card' | 'qr'; close: () => void }) {
  const [kind, setKind] = useState<'card' | 'qr'>(method?.kind ?? k0 ?? 'card');
  const [name, setName] = useState(method?.name ?? '');
  const [last4, setLast4] = useState(method?.last4 ?? '');
  const [network, setNetwork] = useState(method?.network ?? '');
  const [acc, setAcc] = useState(method?.acc ?? '');
  const used = method ? m.txs.filter((t) => t.pmid === method.id).length : 0;
  const ok = name.trim().length > 0 && (last4 === '' || /^\d{4}$/.test(last4));
  return (
    <Modal title={method ? `Edit ${method.kind === 'card' ? 'card' : 'QR bank / app'}` : 'New payment method'} onClose={close}
      footer={<Actions close={close} disabled={!ok} onDelete={method ? () => remove('settings', method.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!ok) return;
        put('settings', { id: method?.id ?? 'pm_' + uid(), type: 'method', kind, name: name.trim(), last4: kind === 'card' && last4 ? last4 : undefined, network: kind === 'card' && network ? network : undefined, acc: acc || undefined }); close(); }}>
        {!method && <Seg value={kind} onChange={setKind} options={[['card', 'Card'], ['qr', 'QR bank / app']]} />}
        <Field label={kind === 'card' ? 'Card name' : 'Bank or app'}>
          <input autoFocus list={kind === 'qr' ? 'qr-apps-2' : undefined} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={kind === 'card' ? 'e.g. BCA Debit, Travel card' : 'e.g. GoPay, BCA mobile'} />
          <datalist id="qr-apps-2">{QR_APPS.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        {kind === 'card' && (
          <div className="row2">
            <Field label="Last 4 digits" hint="Optional. Helps match scanned receipts."><input inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} placeholder="4821" /></Field>
            <Field label="Network"><select value={network} onChange={(e) => setNetwork(e.target.value)}><option value="">—</option>{CARD_NETWORKS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          </div>
        )}
        <Field label="Pays from account" hint="Optional. Picking this method fills in the account for you.">
          <select value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">No default</option>{m.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
        {used > 0 && <p className="hint">Used by {used} transaction{used === 1 ? '' : 's'}. Deleting it keeps them, marked as {kind === 'card' ? 'Card' : 'QR'} without a name.</p>}
      </form>
    </Modal>
  );
}

function SettleForm({ m, who, owed, close }: { m: Model; who: string; owed: number; close: () => void }) {
  const accounts = m.accounts.filter((a) => a.type !== 'owed');
  const [v, setV] = useState((owed / 100).toFixed(2));
  const [acc, setAcc] = useState(accounts[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const c = parseAmount(v);
  const ok = c > 0 && !!acc;
  return (
    <Modal title={`${who} paid you back`} onClose={close} footer={<Actions close={close} label="Record payment" disabled={!ok} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!ok) return;
        put('tx', { id: txId(date), date, type: 'transfer', amount: c, acc: 'acc_owed', toAcc: acc, who, note: `${who} paid back` }); close(); }}>
        <Field label="Amount received" hint={`${who} owes you ${m.fmt(owed)}. Enter less for a partial payment.`}>
          <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} />
        </Field>
        <div className="row2">
          <Field label="Into account"><select value={acc} onChange={(e) => setAcc(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
      </form>
    </Modal>
  );
}

function BudgetForm({ m, cat, close }: { m: Model; cat: string; close: () => void }) {
  const cur = m.data.budgets[cat];
  const [v, setV] = useState(amt(cur && !cur.del ? cur.limit : 0));
  const c = m.cat(cat);
  return (
    <Modal title={`${c?.icon ?? ''} ${c?.name ?? 'Budget'} budget`} onClose={close} footer={<Actions close={close} onDelete={cur && !cur.del ? () => remove('budgets', cat) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); const l = parseAmount(v); if (l > 0) put('budgets', { id: cat, limit: l }); else remove('budgets', cat); close(); }}>
        <Field label="Monthly limit" hint="Applies to every month. Leave empty to stop tracking this category.">
          <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0.00" />
        </Field>
      </form>
    </Modal>
  );
}

function GoalForm({ goal, close }: { goal?: Goal; close: () => void }) {
  const [name, setName] = useState(goal?.name ?? '');
  const [icon, setIcon] = useState(goal?.icon ?? '🎯');
  const [target, setTarget] = useState(amt(goal?.target));
  const [saved, setSaved] = useState(amt(goal?.saved));
  const [due, setDue] = useState(goal?.due ?? '');
  const ok = name.trim() && parseAmount(target) > 0;
  return (
    <Modal title={goal ? 'Edit goal' : 'New savings goal'} onClose={close} footer={<Actions close={close} disabled={!ok} onDelete={goal ? () => remove('goals', goal.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!ok) return; put('goals', { id: goal?.id ?? uid(), name: name.trim(), icon, target: parseAmount(target), saved: parseAmount(saved), due: due || undefined }); close(); }}>
        <div className="row-icon">
          <Field label="Icon"><input value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 4))} className="icon-in" /></Field>
          <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" /></Field>
        </div>
        <div className="row2">
          <Field label="Target"><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" /></Field>
          <Field label="Saved so far"><input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0.00" /></Field>
        </div>
        <Field label="Target date (optional)"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

function FundForm({ m, goal, close }: { m: Model; goal: Goal; close: () => void }) {
  const [v, setV] = useState('');
  const [dir, setDir] = useState<'add' | 'take'>('add');
  const c = parseAmount(v);
  return (
    <Modal title={`${goal.icon} ${goal.name}`} onClose={close} footer={<Actions close={close} label={dir === 'add' ? 'Add' : 'Withdraw'} disabled={!c} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!c) return; put('goals', { ...goal, saved: Math.max(0, goal.saved + (dir === 'add' ? c : -c)) }); close(); }}>
        <Seg value={dir} onChange={setDir} options={[['add', 'Add money'], ['take', 'Withdraw']]} />
        <Field label="Amount" hint={`${m.fmt(goal.saved)} saved of ${m.fmt(goal.target)}`}>
          <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0.00" />
        </Field>
      </form>
    </Modal>
  );
}

function AccountForm({ m, acc, close }: { m: Model; acc?: Account; close: () => void }) {
  const [name, setName] = useState(acc?.name ?? '');
  const [type, setType] = useState<Account['type']>(acc?.type ?? 'bank');
  const [opening, setOpening] = useState(acc ? (acc.opening / 100).toFixed(2) : '');
  const neg = opening.trim().startsWith('-');
  const canDelete = acc && m.accounts.length > 1;
  return (
    <Modal title={acc ? 'Edit account' : 'New account'} onClose={close} footer={<Actions close={close} disabled={!name.trim()} onDelete={canDelete ? () => remove('accounts', acc.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; put('accounts', { id: acc?.id ?? uid(), name: name.trim(), type, opening: parseAmount(opening) * (neg ? -1 : 1) }); close(); }}>
        <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Checking" /></Field>
        <div className="row2">
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as Account['type'])}>
              <option value="bank">Bank account</option><option value="savings">Savings</option><option value="card">Credit card</option><option value="cash">Cash</option><option value="owed">Money friends owe me</option>
            </select>
          </Field>
          <Field label="Starting balance" hint="Use a minus sign for money owed."><input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" /></Field>
        </div>
      </form>
    </Modal>
  );
}

function RecurringForm({ m, rec, close }: { m: Model; rec?: Recurring; close: () => void }) {
  const [name, setName] = useState(rec?.name ?? '');
  const [type, setType] = useState<Recurring['type']>(rec?.type ?? 'expense');
  const [amount, setAmount] = useState(amt(rec?.amount));
  const [freq, setFreq] = useState<Recurring['freq']>(rec?.freq ?? 'monthly');
  const [next, setNext] = useState(rec?.next ?? today());
  const [acc, setAcc] = useState(rec?.acc ?? m.accounts[0]?.id ?? '');
  const cats = m.categories.filter((c) => c.kind === type);
  const [cat, setCat] = useState(rec?.cat ?? '');
  const ok = name.trim() && parseAmount(amount) > 0 && acc;
  return (
    <Modal title={rec ? 'Edit recurring item' : 'New recurring item'} onClose={close} footer={<Actions close={close} disabled={!ok} onDelete={rec ? () => remove('recurring', rec.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!ok) return; put('recurring', { id: rec?.id ?? uid(), name: name.trim(), type, amount: parseAmount(amount), freq, next, acc, cat: cats.some((c) => c.id === cat) ? cat : cats[0]?.id ?? '' }); close(); }}>
        <Seg value={type} onChange={setType} options={[['expense', 'Bill / expense'], ['income', 'Income']]} />
        <div className="row2">
          <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent" /></Field>
          <Field label="Amount"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
        </div>
        <div className="row2">
          <Field label="Repeats">
            <select value={freq} onChange={(e) => setFreq(e.target.value as Recurring['freq'])}><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select>
          </Field>
          <Field label="Next date"><input type="date" value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
        </div>
        <div className="row2">
          <Field label="Category"><select value={cats.some((c) => c.id === cat) ? cat : cats[0]?.id} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></Field>
          <Field label="Account"><select value={acc} onChange={(e) => setAcc(e.target.value)}>{m.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        </div>
        <p className="hint">The transaction is added automatically on each due date, on whichever device opens first.</p>
      </form>
    </Modal>
  );
}

function CategoryForm({ cat, close }: { cat?: Category; close: () => void }) {
  const [name, setName] = useState(cat?.name ?? '');
  const [icon, setIcon] = useState(cat?.icon ?? '🏷️');
  const [kind, setKind] = useState<Category['kind']>(cat?.kind ?? 'expense');
  const [subs, setSubs] = useState((cat?.subs ?? []).join(', '));
  const subList = [...new Set(subs.split(',').map((x) => x.trim().slice(0, 30)).filter(Boolean))];
  return (
    <Modal title={cat ? 'Edit category' : 'New category'} onClose={close} footer={<Actions close={close} disabled={!name.trim()} onDelete={cat && cat.id !== 'cat_other' ? () => remove('categories', cat.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; put('categories', { id: cat?.id ?? 'cat_' + uid(), name: name.trim(), icon, kind, subs: subList }); close(); }}>
        {!cat && <Seg value={kind} onChange={setKind} options={[['expense', 'Expense'], ['income', 'Income']]} />}
        <div className="row-icon">
          <Field label="Icon"><input value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 4))} className="icon-in" /></Field>
          <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
        <Field label="Sub-categories" hint="Separate with commas, e.g. Vegetables, Meat & fish, Dairy. Removing one here doesn’t change transactions already saved with it.">
          <textarea rows={3} className="plain" value={subs} onChange={(e) => setSubs(e.target.value)} placeholder="Optional" />
        </Field>
      </form>
    </Modal>
  );
}
