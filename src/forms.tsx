import { useState } from 'react';
import { parseAmount, type Model } from './calc';
import { put, remove, today, txId, uid, type Account, type Category, type Goal, type Recurring, type Tx, type TxType } from './store';
import { Field, Modal, Seg } from './ui';

const amt = (c?: number) => (c ? (c / 100).toFixed(2) : '');

export type Dialog =
  | { k: 'tx'; tx?: Tx; preset?: Partial<Tx> }
  | { k: 'budget'; cat: string }
  | { k: 'goal'; goal?: Goal }
  | { k: 'fund'; goal: Goal }
  | { k: 'account'; acc?: Account }
  | { k: 'recurring'; rec?: Recurring }
  | { k: 'category'; cat?: Category };

export function Dialogs({ d, m, close }: { d: Dialog; m: Model; close: () => void }) {
  switch (d.k) {
    case 'tx': return <TxForm m={m} tx={d.tx} preset={d.preset} close={close} />;
    case 'budget': return <BudgetForm m={m} cat={d.cat} close={close} />;
    case 'goal': return <GoalForm goal={d.goal} close={close} />;
    case 'fund': return <FundForm m={m} goal={d.goal} close={close} />;
    case 'account': return <AccountForm m={m} acc={d.acc} close={close} />;
    case 'recurring': return <RecurringForm m={m} rec={d.rec} close={close} />;
    case 'category': return <CategoryForm cat={d.cat} close={close} />;
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

function TxForm({ m, tx, preset, close }: { m: Model; tx?: Tx; preset?: Partial<Tx>; close: () => void }) {
  const init = tx ?? preset ?? {};
  const [type, setType] = useState<TxType>(init.type ?? 'expense');
  const [amount, setAmount] = useState(amt(init.amount));
  const [date, setDate] = useState(init.date ?? today());
  const [acc, setAcc] = useState(init.acc ?? m.accounts[0]?.id ?? '');
  const [toAcc, setToAcc] = useState(init.toAcc ?? m.accounts.find((a) => a.id !== acc)?.id ?? '');
  const [cat, setCat] = useState(init.cat ?? '');
  const [note, setNote] = useState(init.note ?? '');
  const cats = m.categories.filter((c) => c.kind === type);
  const cents = parseAmount(amount);
  const ok = cents > 0 && acc && (type === 'transfer' ? toAcc && toAcc !== acc : true);
  const sel = cats.some((c) => c.id === cat) ? cat : cats[0]?.id;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const chosen = sel;
    put('tx', {
      id: tx?.id ?? txId(date), date, amount: cents, type, acc, note: note.trim(), rid: tx?.rid,
      cat: type === 'transfer' ? undefined : chosen, toAcc: type === 'transfer' ? toAcc : undefined,
    });
    close();
  };
  return (
    <Modal title={tx ? 'Edit transaction' : 'New transaction'} onClose={close} footer={<Actions close={close} disabled={!ok} onDelete={tx ? () => remove('tx', tx.id) : undefined} />}>
      <form id="dlg" onSubmit={save} className="form">
        <Seg value={type} onChange={setType} options={[['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']]} />
        <div className="amount-in">
          <span>{type === 'expense' ? '−' : type === 'income' ? '+' : '⇄'}</span>
          <input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
        </div>
        {type !== 'transfer' && (
          <div className="chips" role="radiogroup" aria-label="Category">
            {cats.map((c) => (
              <button type="button" key={c.id} role="radio" aria-checked={sel === c.id} className={sel === c.id ? 'chip on' : 'chip'} onClick={() => setCat(c.id)}>
                <span>{c.icon}</span>{c.name}
              </button>
            ))}
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
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === 'transfer' ? 'Optional' : 'Where or what for?'} maxLength={120} /></Field>
        {type === 'transfer' && m.accounts.length < 2 && <p className="hint">Add a second account to record transfers.</p>}
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
              <option value="bank">Bank account</option><option value="savings">Savings</option><option value="card">Credit card</option><option value="cash">Cash</option>
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
  return (
    <Modal title={cat ? 'Edit category' : 'New category'} onClose={close} footer={<Actions close={close} disabled={!name.trim()} onDelete={cat && cat.id !== 'cat_other' ? () => remove('categories', cat.id) : undefined} />}>
      <form id="dlg" className="form" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; put('categories', { id: cat?.id ?? 'cat_' + uid(), name: name.trim(), icon, kind }); close(); }}>
        {!cat && <Seg value={kind} onChange={setKind} options={[['expense', 'Expense'], ['income', 'Income']]} />}
        <div className="row-icon">
          <Field label="Icon"><input value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 4))} className="icon-in" /></Field>
          <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
      </form>
    </Modal>
  );
}
