import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { OPS, decimalSeparator, evalExpr, fmtInput, parseAmount, type Model } from './calc';
import { put, remove, today, txId, uid, type Account, type Category, type Goal, type PayKind, type PayMethod, type Recurring, type Tx, type TxType } from './store';
import { merchantSub, type Receipt } from './receipt';
import { BillSplit, type BillInit } from './bill';
import { Field, Icon, Modal, Seg } from './ui';
import { accLabel, catLabel, subLabel, t, tp } from './i18n';

const MOBILE = Capacitor.isNativePlatform() || /Android|iPhone|iPad/i.test(navigator.userAgent);

const amt = (c?: number) => (c ? fmtInput(c) : '');

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

function Actions({ onDelete, close, label = t('Save'), disabled }: { onDelete?: () => void; close: () => void; label?: string; disabled?: boolean }) {
  return (
    <>
      {onDelete && <button type="button" className="btn danger ghost" onClick={() => { onDelete(); close(); }}>{t('Delete')}</button>}
      <span className="grow" />
      <button type="button" className="btn ghost" onClick={close}>{t('Cancel')}</button>
      <button type="submit" form="dlg" className="btn primary" disabled={disabled}>{label}</button>
    </>
  );
}


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
  const [pad, setPad] = useState(MOBILE);
  const [bill, setBill] = useState<BillInit | null>(null);

  const cats = m.categories.filter((c) => c.kind === type);
  const sel = cats.some((c) => c.id === cat) ? cat : cats[0]?.id;
  const selCat = cats.find((c) => c.id === sel);
  const subs = selCat?.subs ?? [];
  const cents = parseAmount(amount);
  const ok = cents > 0 && acc && (type === 'transfer' ? toAcc && toAcc !== acc : true);

  /** A receipt scanned in Bill & split also sets the date, place, category and payment method used when saving. */
  const applyScan = (r: Receipt) => {
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
  };
  const addSub = () => {
    const name = (newSub ?? '').trim().slice(0, 30);
    if (name && selCat && !subs.some((x) => x.toLowerCase() === name.toLowerCase())) put('categories', { ...selCat, subs: [...subs, name] });
    if (name) setSub(subs.find((x) => x.toLowerCase() === name.toLowerCase()) ?? name);
    setNewSub(null);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const pay = type === 'expense' && pm ? { pm, pmid: pm === 'cash' ? undefined : m.methods.some((x) => x.id === pmid && x.kind === pm) ? pmid : undefined } : { pm: undefined, pmid: undefined };
    const base = { date, type, acc, rid: tx?.rid, who: type === 'transfer' ? tx?.who : undefined, ...pay };
    put('tx', {
      ...base, id: tx?.id ?? txId(date), amount: cents, note: note.trim(),
      cat: type === 'transfer' ? undefined : sel, sub: type !== 'transfer' && subs.includes(sub) ? sub : undefined,
      toAcc: type === 'transfer' ? toAcc : undefined,
    });
    close();
  };

  const openBill = () => setBill({ place: note.trim(), date, items: [] });
  if (bill) return <BillSplit m={m} init={bill} ctx={{ acc, cat: sel, sub: subs.includes(sub) ? sub : undefined, pm, pmid: pm === 'cash' ? undefined : pmid }} onBack={() => setBill(null)} onSaved={close} onScanned={applyScan} />;

  return (
    <Modal title={tx ? t('Edit transaction') : t('New transaction')} onClose={close} footer={<Actions close={close} disabled={!ok} label={t('Save')} onDelete={tx ? () => remove('tx', tx.id) : undefined} />}>
      <form id="dlg" onSubmit={save} className="form">
        <Seg value={type} onChange={setType} options={[['expense', t('Expense')], ['income', t('Income')], ['transfer', t('Transfer')]]} />
        {!tx && type === 'expense' && (
          <button type="button" className="bill-entry" onClick={openBill}>
            <span className="bill-entry-ic"><Icon name="split" size={20} /></span>
            <span><b>{t('Bill & split')}</b><small>{t('Scan a receipt or type the menu — adds service and tax, splits between friends')}</small></span>
            <Icon name="right" size={16} />
          </button>
        )}
        <div className="amount-in">
          <span>{type === 'expense' ? '−' : type === 'income' ? '+' : '⇄'}</span>
          <input autoFocus={!MOBILE} inputMode={pad && MOBILE ? 'none' : 'decimal'} placeholder="0" value={amount}
            readOnly={pad && MOBILE} aria-label={t('Amount')}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,+\-−*/×÷() ]/g, ''))}
            onKeyDown={(e) => { if (e.key === '=') { e.preventDefault(); const v = evalExpr(amount.replace(/[+\-−*/×÷\s]+$/, '')); if (v !== null) setAmount(fmtCalc(v)); } }} />
          {<button type="button" className={`icon-btn calc-toggle${pad ? ' on' : ''}`} onClick={() => setPad(!pad)} aria-pressed={pad} aria-label={pad ? t('Hide calculator') : t('Show calculator')} title={t('Calculator')}><Icon name="calc" /></button>}
        </div>
        {OPS.test(amount.replace(/^[-−]/, '')) && <p className="calc-result">= {m.fmt(cents)}</p>}
        {pad && <Keypad value={amount} onChange={setAmount} />}
        {type !== 'transfer' && (
          <div className="chips" role="radiogroup" aria-label={t('Category')}>
            {cats.map((c) => (
              <button type="button" key={c.id} role="radio" aria-checked={sel === c.id} className={sel === c.id ? 'chip on' : 'chip'} onClick={() => { setCat(c.id); setSub(''); }}>
                <span>{c.icon}</span>{catLabel(c)}
              </button>
            ))}
          </div>
        )}
        {type !== 'transfer' && selCat && (
          <div className="subs">
            <span className="subs-label">{t('{cat} › sub-category', { cat: catLabel(selCat) })}</span>
            <div className="chips small" role="radiogroup" aria-label={t('Sub-category')}>
              {subs.map((x) => <button type="button" key={x} role="radio" aria-checked={sub === x} className={sub === x ? 'chip on' : 'chip'} onClick={() => setSub(sub === x ? '' : x)}>{subLabel(x)}</button>)}
              {newSub === null ? (
                <button type="button" className="chip add" onClick={() => setNewSub('')}><Icon name="plus" size={13} />{t('New')}</button>
              ) : (
                <span className="chip-in">
                  <input autoFocus value={newSub} maxLength={30} placeholder={t('Name')} aria-label={t('New sub-category')} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } if (e.key === 'Escape') { e.stopPropagation(); setNewSub(null); } }} />
                  <button type="button" className="btn small" onClick={addSub}>{t('Add')}</button>
                </span>
              )}
            </div>
          </div>
        )}
        {type === 'expense' && (
          <div className="subs pay">
            <span className="subs-label">{t('Paid with')}</span>
            <div className="chips small" role="radiogroup" aria-label={t('Paid with')}>
              {([['cash', t('Cash'), 'cash'], ['card', t('Card'), 'card'], ['qr', 'QR', 'qr']] as const).map(([k, label, icon]) => (
                <button type="button" key={k} role="radio" aria-checked={pm === k} className={pm === k ? 'chip on' : 'chip'} onClick={() => { setPm(pm === k ? undefined : k); setNewMethod(null); }}>
                  <Icon name={icon} size={15} />{label}
                </button>
              ))}
            </div>
            {(pm === 'card' || pm === 'qr') && (
              <div className="chips small" role="radiogroup" aria-label={pm === 'card' ? t('Which card') : t('Which bank or app')}>
                {m.methods.filter((x) => x.kind === pm).map((x) => (
                  <button type="button" key={x.id} role="radio" aria-checked={pmid === x.id} className={pmid === x.id ? 'chip on' : 'chip'}
                    onClick={() => { setPmid(pmid === x.id ? undefined : x.id); if (x.acc && m.acc(x.acc) && pmid !== x.id) setAcc(x.acc); }}>{m.methodName(x)}</button>
                ))}
                {newMethod === null ? (
                  <button type="button" className="chip add" onClick={() => setNewMethod({ name: '', last4: '' })}><Icon name="plus" size={13} />{pm === 'card' ? t('New card') : t('New bank / app')}</button>
                ) : (
                  <span className="chip-in">
                    <input autoFocus list={pm === 'qr' ? 'qr-apps' : 'card-names'} value={newMethod.name} maxLength={30} aria-label={pm === 'card' ? t('Card name') : t('Bank or app name')}
                      placeholder={pm === 'card' ? t('e.g. {x}', { x: 'BCA Debit' }) : t('e.g. {x}', { x: 'GoPay' })} onChange={(e) => setNewMethod({ ...newMethod, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget.parentElement?.querySelector('.btn') as HTMLButtonElement)?.click(); } if (e.key === 'Escape') { e.stopPropagation(); setNewMethod(null); } }} />
                    {pm === 'card' && <input className="last4" inputMode="numeric" value={newMethod.last4} maxLength={4} placeholder={t('Last 4')} aria-label={t('Last 4 digits (optional)')} onChange={(e) => setNewMethod({ ...newMethod, last4: e.target.value.replace(/\D/g, '') })} />}
                    <button type="button" className="btn small" onClick={() => {
                      const name = newMethod.name.trim();
                      if (!name) return setNewMethod(null);
                      const rec: Omit<PayMethod, 'u'> = { id: 'pm_' + uid(), type: 'method', kind: pm, name, last4: pm === 'card' && newMethod.last4.length === 4 ? newMethod.last4 : undefined, acc };
                      put('settings', rec); setPmid(rec.id); setNewMethod(null);
                    }}>{t('Add')}</button>
                  </span>
                )}
              </div>
            )}
            <datalist id="qr-apps">{QR_APPS.map((x) => <option key={x} value={x} />)}</datalist>
            <datalist id="card-names">{CARD_NETWORKS.map((x) => <option key={x} value={x} />)}</datalist>
          </div>
        )}
        <div className="row2">
          <Field label={type === 'transfer' ? t('From') : t('Account')}>
            <select value={acc} onChange={(e) => setAcc(e.target.value)}>{m.accounts.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</select>
          </Field>
          {type === 'transfer' ? (
            <Field label={t('To')}>
              <select value={toAcc} onChange={(e) => setToAcc(e.target.value)}>{m.accounts.filter((a) => a.id !== acc).map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</select>
            </Field>
          ) : (
            <Field label={t('Date')}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          )}
        </div>
        {type === 'transfer' && <Field label={t('Date')}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>}
        <Field label={t('Note')}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === 'transfer' ? t('Optional') : t('Where or what for?')} maxLength={120} /></Field>
        {type === 'transfer' && m.accounts.length < 2 && <p className="hint">{t('Add a second account to record transfers.')}</p>}
      </form>
    </Modal>
  );
}

const fmtCalc = (v: number) => fmtInput(Math.round(Math.abs(v) * 100));

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
    if (k === '.') { const d = decimalSeparator(); if (current.includes('.') || current.includes(',')) return; return onChange(v + (current ? d : '0' + d)); }
    if (/[.,]\d{2}$/.test(current)) return; // two decimal places is enough for money
    onChange(current === '0' ? v.slice(0, -1) + k : v + k);
  };
  const keys: [string, string][] = [['C', 'fn'], ['÷', 'op'], ['×', 'op'], ['⌫', 'fn'], ['7', ''], ['8', ''], ['9', ''], ['−', 'op'], ['4', ''], ['5', ''], ['6', ''], ['+', 'op'], ['1', ''], ['2', ''], ['3', ''], ['=', 'eq'], ['0', 'zero'], ['.', '']];
  const label: Record<string, string> = { C: t('Clear'), '⌫': t('Delete'), '÷': t('Divide'), '×': t('Multiply'), '−': t('Minus'), '+': t('Plus'), '=': t('Equals'), '.': t('Decimal point') };
  return (
    <div className="keypad" role="group" aria-label={t('Calculator')}>
      {keys.map(([k, c]) => (
        <button type="button" key={k} className={c} onClick={() => press(k)} aria-label={label[k] ?? k}>{k === '⌫' ? <Icon name="back" size={22} /> : k === '.' ? decimalSeparator() : k}</button>
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
    <Modal title={method ? (method.kind === 'card' ? t('Edit card') : t('Edit QR bank / app')) : t('New payment method')} onClose={close}
      footer={<Actions close={close} disabled={!ok} onDelete={method ? () => remove('settings', method.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!ok) return;
        put('settings', { id: method?.id ?? 'pm_' + uid(), type: 'method', kind, name: name.trim(), last4: kind === 'card' && last4 ? last4 : undefined, network: kind === 'card' && network ? network : undefined, acc: acc || undefined }); close(); }}>
        {!method && <Seg value={kind} onChange={setKind} options={[['card', t('Card')], ['qr', t('QR bank / app')]]} />}
        <Field label={kind === 'card' ? t('Card name') : t('Bank or app')}>
          <input autoFocus list={kind === 'qr' ? 'qr-apps-2' : undefined} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={kind === 'card' ? t('e.g. {x}', { x: 'BCA Debit' }) : t('e.g. {x}', { x: 'GoPay, BCA mobile' })} />
          <datalist id="qr-apps-2">{QR_APPS.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        {kind === 'card' && (
          <div className="row2">
            <Field label={t('Last 4 digits')} hint={t('Optional. Helps match scanned receipts.')}><input inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} placeholder="4821" /></Field>
            <Field label={t('Network')}><select value={network} onChange={(e) => setNetwork(e.target.value)}><option value="">—</option>{CARD_NETWORKS.map((x) => <option key={x} value={x}>{x === 'Other' ? t('Other') : x}</option>)}</select></Field>
          </div>
        )}
        <Field label={t('Pays from account')} hint={t('Optional. Picking this method fills in the account for you.')}>
          <select value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">{t('No default')}</option>{m.accounts.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</select>
        </Field>
        {used > 0 && <p className="hint">{tp(used, 'Used by {n} transaction. Deleting it keeps them, marked as {kind} without a name.', 'Used by {n} transactions. Deleting it keeps them, marked as {kind} without a name.', { kind: kind === 'card' ? t('Card') : 'QR' })}</p>}
      </form>
    </Modal>
  );
}

function SettleForm({ m, who, owed, close }: { m: Model; who: string; owed: number; close: () => void }) {
  const accounts = m.accounts.filter((a) => a.type !== 'owed');
  const [v, setV] = useState(fmtInput(owed));
  const [acc, setAcc] = useState(accounts[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const c = parseAmount(v);
  const ok = c > 0 && !!acc;
  return (
    <Modal title={t('{who} paid you back', { who })} onClose={close} footer={<Actions close={close} label={t('Record payment')} disabled={!ok} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!ok) return;
        put('tx', { id: txId(date), date, type: 'transfer', amount: c, acc: 'acc_owed', toAcc: acc, who, note: t('{who} paid back', { who }) }); close(); }}>
        <Field label={t('Amount received')} hint={t('{who} owes you {a}. Enter less for a partial payment.', { who, a: m.fmt(owed) })}>
          <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} />
        </Field>
        <div className="row2">
          <Field label={t('Into account')}><select value={acc} onChange={(e) => setAcc(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</select></Field>
          <Field label={t('Date')}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
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
    <Modal title={`${c?.icon ?? ''} ${t('{cat} budget', { cat: catLabel(c) || t('Budget') })}`} onClose={close} footer={<Actions close={close} onDelete={cur && !cur.del ? () => remove('budgets', cat) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); const l = parseAmount(v); if (l > 0) put('budgets', { id: cat, limit: l }); else remove('budgets', cat); close(); }}>
        <Field label={t('Monthly limit')} hint={t('Applies to every month. Leave empty to stop tracking this category.')}>
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
    <Modal title={goal ? t('Edit goal') : t('New savings goal')} onClose={close} footer={<Actions close={close} disabled={!ok} onDelete={goal ? () => remove('goals', goal.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!ok) return; put('goals', { id: goal?.id ?? uid(), name: name.trim(), icon, target: parseAmount(target), saved: parseAmount(saved), due: due || undefined }); close(); }}>
        <div className="row-icon">
          <Field label={t('Icon')}><input value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 4))} className="icon-in" /></Field>
          <Field label={t('Name')}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. {x}', { x: t('Emergency fund') })} /></Field>
        </div>
        <div className="row2">
          <Field label={t('Target')}><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" /></Field>
          <Field label={t('Saved so far')}><input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0.00" /></Field>
        </div>
        <Field label={t('Target date (optional)')}><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

function FundForm({ m, goal, close }: { m: Model; goal: Goal; close: () => void }) {
  const [v, setV] = useState('');
  const [dir, setDir] = useState<'add' | 'take'>('add');
  const c = parseAmount(v);
  return (
    <Modal title={`${goal.icon} ${goal.name}`} onClose={close} footer={<Actions close={close} label={dir === 'add' ? t('Add') : t('Withdraw')} disabled={!c} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!c) return; put('goals', { ...goal, saved: Math.max(0, goal.saved + (dir === 'add' ? c : -c)) }); close(); }}>
        <Seg value={dir} onChange={setDir} options={[['add', t('Add money')], ['take', t('Withdraw')]]} />
        <Field label={t('Amount')} hint={t('{a} saved of {b}', { a: m.fmt(goal.saved), b: m.fmt(goal.target) })}>
          <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0.00" />
        </Field>
      </form>
    </Modal>
  );
}

function AccountForm({ m, acc, close }: { m: Model; acc?: Account; close: () => void }) {
  const [name, setName] = useState(acc?.name ?? '');
  const [type, setType] = useState<Account['type']>(acc?.type ?? 'bank');
  const [opening, setOpening] = useState(acc ? (acc.opening < 0 ? '-' : '') + fmtInput(Math.abs(acc.opening)) : '');
  const neg = opening.trim().startsWith('-');
  const canDelete = acc && m.accounts.length > 1;
  return (
    <Modal title={acc ? t('Edit account') : t('New account')} onClose={close} footer={<Actions close={close} disabled={!name.trim()} onDelete={canDelete ? () => remove('accounts', acc.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; put('accounts', { id: acc?.id ?? uid(), name: name.trim(), type, opening: parseAmount(opening) * (neg ? -1 : 1) }); close(); }}>
        <Field label={t('Name')}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. {x}', { x: t('Checking') })} /></Field>
        <div className="row2">
          <Field label={t('Type')}>
            <select value={type} onChange={(e) => setType(e.target.value as Account['type'])}>
              <option value="bank">{t('Bank account')}</option><option value="savings">{t('Savings')}</option><option value="card">{t('Credit card')}</option><option value="cash">{t('Cash')}</option><option value="owed">{t('Money friends owe me')}</option>
            </select>
          </Field>
          <Field label={t('Starting balance')} hint={t('Use a minus sign for money owed.')}><input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" /></Field>
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
    <Modal title={rec ? t('Edit recurring item') : t('New recurring item')} onClose={close} footer={<Actions close={close} disabled={!ok} onDelete={rec ? () => remove('recurring', rec.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!ok) return; put('recurring', { id: rec?.id ?? uid(), name: name.trim(), type, amount: parseAmount(amount), freq, next, acc, cat: cats.some((c) => c.id === cat) ? cat : cats[0]?.id ?? '' }); close(); }}>
        <Seg value={type} onChange={setType} options={[['expense', t('Bill / expense')], ['income', t('Income')]]} />
        <div className="row2">
          <Field label={t('Name')}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. {x}', { x: t('Rent') })} /></Field>
          <Field label={t('Amount')}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
        </div>
        <div className="row2">
          <Field label={t('Repeats')}>
            <select value={freq} onChange={(e) => setFreq(e.target.value as Recurring['freq'])}><option value="weekly">{t('Every week')}</option><option value="monthly">{t('Every month')}</option><option value="yearly">{t('Every year')}</option></select>
          </Field>
          <Field label={t('Next date')}><input type="date" value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
        </div>
        <div className="row2">
          <Field label={t('Category')}><select value={cats.some((c) => c.id === cat) ? cat : cats[0]?.id} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {catLabel(c)}</option>)}</select></Field>
          <Field label={t('Account')}><select value={acc} onChange={(e) => setAcc(e.target.value)}>{m.accounts.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</select></Field>
        </div>
        <p className="hint">{t('The transaction is added automatically on each due date, on whichever device opens first.')}</p>
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
    <Modal title={cat ? t('Edit category') : t('New category')} onClose={close} footer={<Actions close={close} disabled={!name.trim()} onDelete={cat && cat.id !== 'cat_other' ? () => remove('categories', cat.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; put('categories', { id: cat?.id ?? 'cat_' + uid(), name: name.trim(), icon, kind, subs: subList }); close(); }}>
        {!cat && <Seg value={kind} onChange={setKind} options={[['expense', t('Expense')], ['income', t('Income')]]} />}
        <div className="row-icon">
          <Field label={t('Icon')}><input value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 4))} className="icon-in" /></Field>
          <Field label={t('Name')}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
        <Field label={t('Sub-categories')} hint={t('Separate with commas, e.g. Vegetables, Meat & fish, Dairy. Removing one here doesn’t change transactions already saved with it.')}>
          <textarea rows={3} className="plain" value={subs} onChange={(e) => setSubs(e.target.value)} placeholder={t('Optional')} />
        </Field>
      </form>
    </Modal>
  );
}
