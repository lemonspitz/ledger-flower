// The import screen: shows what was understood from the file (columns, dates, amounts, categories, accounts)
// with everything changeable, a preview of the result, and one button to add it.
import { useMemo, useState } from 'react';
import type { Model } from './calc';
import {
  build, convert, detect, isNew, loadMemory, newTarget, remember, ROLES, saveMemory, suggestAccounts, suggestCategories,
  type AccChoice, type CatChoice, type Plan, type Role, type Sheet,
} from './importer';
import { accLabel, catLabel, subLabel, t, tp } from './i18n';
import { put, remove, uid } from './store';
import { Field, Modal } from './ui';

const ROLE_LABEL = (): Record<Role, string> => ({
  date: t('Date'), time: t('Time'), amount: t('Amount'), outflow: t('Money out'), inflow: t('Money in'), type: t('Type'),
  category: t('Category'), subcategory: t('Sub-category'), account: t('Account'), toAccount: t('To account'),
  note: t('Note'), payee: t('Payee'), currency: t('Currency'), ignore: t('Skip'),
});

export function ImportDialog({ m, file, sheets, close }: { m: Model; file: string; sheets: Sheet[]; close: () => void }) {
  const [memory] = useState(loadMemory);
  const [sheetIdx, setSheetIdx] = useState(() => Math.max(0, sheets.findIndex((s) => detect(s, memory).roles.includes('date'))));
  const sheet = sheets[sheetIdx];
  const [plan, setPlan] = useState<Plan>(() => withAccount(detect(sheet, memory), m));
  const [catPick, setCatPick] = useState<Record<string, string>>({});
  const [accPick, setAccPick] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ n: number; undo: () => void } | null>(null);
  const L = ROLE_LABEL();

  const conv = useMemo(() => convert(sheet, plan), [sheet, plan]);
  const cats: CatChoice[] = useMemo(() => suggestCategories(conv.rows, m.data, memory, catLabel).map((c) => ({ ...c, target: catPick[c.key] ?? c.target })), [conv, m.data, memory, catPick]);
  const accs: AccChoice[] = useMemo(() => suggestAccounts(conv.rows, m.data, memory).map((a) => ({ ...a, target: accPick[a.key] ?? a.target })), [conv, m.data, memory, accPick]);
  const built = useMemo(() => build(conv.rows, plan, cats, accs, m.data, uid), [conv, plan, cats, accs, m.data]);

  const pickSheet = (i: number) => { setSheetIdx(i); setPlan(withAccount(detect(sheets[i], memory), m)); setCatPick({}); setAccPick({}); };
  const setRole = (j: number, r: Role) => setPlan((p) => {
    const roles = [...p.roles];
    // One column per meaning (notes can be several): the column that had this meaning is skipped instead.
    if (r !== 'note' && r !== 'ignore') roles.forEach((x, k) => { if (x === r) roles[k] = 'ignore'; });
    roles[j] = r;
    return { ...p, roles };
  });
  const hasAmount = plan.roles.some((r) => r === 'amount' || r === 'outflow' || r === 'inflow');
  const ready = plan.roles.includes('date') && hasAmount && built.tx.length > 0;
  const header = plan.header >= 0 ? sheet.rows[plan.header] : null;
  const width = plan.roles.length;
  const sample = (j: number) => sheet.rows.slice(plan.header + 1).map((r) => r[j]).find((v) => v != null && String(v).trim() !== '');
  const show = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v)).slice(0, 28);

  const doImport = () => {
    put('accounts', ...built.accounts);
    put('categories', ...built.categories);
    put('tx', ...built.tx);
    saveMemory(remember(memory, sheet, plan, cats, accs, built));
    const txIds = built.tx.map((x) => x.id), newCats = built.categories.filter((c) => !m.data.categories[c.id]).map((c) => c.id), newAccs = built.accounts.map((a) => a.id);
    setDone({ n: built.tx.length, undo: () => { remove('tx', ...txIds); if (newCats.length) remove('categories', ...newCats); if (newAccs.length) remove('accounts', ...newAccs); close(); } });
  };

  if (done) return (
    <Modal title={t('Import')} onClose={close} footer={<><button className="btn ghost" onClick={done.undo}>{t('Undo import')}</button><button className="btn primary" onClick={close}>{t('Done')}</button></>}>
      <p className="imp-done">{tp(done.n, 'Added {n} transaction.', 'Added {n} transactions.')} {t('Your choices are remembered, so the next file like this one imports the same way.')}</p>
    </Modal>
  );

  const catOptions = (kind: 'expense' | 'income', c: CatChoice) => (
    <select value={c.target} onChange={(e) => setCatPick({ ...catPick, [c.key]: e.target.value })} aria-label={c.name}>
      <option value={newTarget(c.name)}>{t('New category “{name}”', { name: c.name })}</option>
      {m.categories.filter((x) => x.kind === kind).map((x) => [
        <option key={x.id} value={x.id}>{x.icon} {catLabel(x)}</option>,
        ...(x.subs ?? []).map((s) => <option key={x.id + s} value={x.id + '\u0000' + s}>{' '}{catLabel(x)} › {subLabel(s)}</option>),
      ])}
    </select>
  );
  const how = (h: CatChoice['how'] | AccChoice['how']) => ({ remembered: t('as last time'), 'same name': t('same name'), 'sub-category': t('same name'), similar: t('similar'), notes: t('from notes'), new: t('new') })[h];

  return (
    <Modal wide title={t('Import')} onClose={close} footer={<>
      <button className="btn ghost" onClick={close}>{t('Cancel')}</button>
      <button className="btn primary" disabled={!ready} onClick={doImport}>{tp(built.tx.length, 'Add {n} transaction', 'Add {n} transactions')}</button>
    </>}>
      <div className="form imp">
        <p className="hint">
          <b>{file}</b>{plan.source ? ` · ${t('looks like a {app} export', { app: plan.source })}` : ''} · {tp(conv.rows.length, '{n} transaction found', '{n} transactions found')}
        </p>
        {sheets.length > 1 && (
          <Field label={t('Sheet')}>
            <select value={sheetIdx} onChange={(e) => pickSheet(Number(e.target.value))}>{sheets.map((s, i) => <option key={i} value={i}>{s.name} ({s.rows.length})</option>)}</select>
          </Field>
        )}

        <section>
          <h3>{t('Columns')}</h3>
          <div className="imp-cols">
            {Array.from({ length: width }, (_, j) => (
              <label key={j} className={plan.roles[j] === 'ignore' ? 'off' : ''}>
                <span className="imp-col-name">{header ? show(header[j]) || t('Column {n}', { n: j + 1 }) : t('Column {n}', { n: j + 1 })}</span>
                <small>{show(sample(j))}</small>
                <select value={plan.roles[j]} onChange={(e) => setRole(j, e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{L[r]}</option>)}</select>
              </label>
            ))}
          </div>
          {!plan.roles.includes('date') && <p className="imp-warn">{t('Choose which column has the date.')}</p>}
          {!hasAmount && <p className="imp-warn">{t('Choose which column has the amount.')}</p>}
        </section>

        <div className="row2">
          <Field label={t('Dates are written')}>
            <select value={plan.order} onChange={(e) => setPlan({ ...plan, order: e.target.value as Plan['order'] })}>
              <option value="dmy">{t('Day first')} (31/12/2024)</option><option value="mdy">{t('Month first')} (12/31/2024)</option><option value="ymd">{t('Year first')} (2024-12-31)</option>
            </select>
          </Field>
          <Field label={t('Amounts are written')}>
            <select value={plan.decimal} onChange={(e) => setPlan({ ...plan, decimal: e.target.value as Plan['decimal'] })}><option value=".">1,234.56</option><option value=",">1.234,56</option></select>
          </Field>
          {plan.roles.includes('amount') && !plan.roles.includes('type') && (
            <Field label={t('Amounts without a minus are')}>
              <select value={plan.positive} onChange={(e) => setPlan({ ...plan, positive: e.target.value as Plan['positive'] })}><option value="expense">{t('Spending')}</option><option value="income">{t('Income')}</option></select>
            </Field>
          )}
          {!plan.roles.includes('account') && (
            <Field label={t('Add to account')}>
              <select value={plan.account} onChange={(e) => setPlan({ ...plan, account: e.target.value })}>
                {m.accounts.filter((a) => a.type !== 'owed').map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}
                <option value={newTarget(file.replace(/\.[^.]+$/, ''))}>{t('New account “{name}”', { name: file.replace(/\.[^.]+$/, '') })}</option>
              </select>
            </Field>
          )}
        </div>

        {cats.length > 0 && (
          <section>
            <h3>{t('Categories')}</h3>
            <div className="imp-map">
              {cats.map((c) => (
                <div key={c.key}>
                  <span><b>{c.name}{c.sub ? ` › ${c.sub}` : ''}</b><small>{tp(c.count, '{n} row', '{n} rows')} · {how(c.how)}{c.kind === 'income' ? ` · ${t('income')}` : ''}</small></span>
                  {catOptions(c.kind, c)}
                </div>
              ))}
            </div>
          </section>
        )}

        {accs.length > 0 && (
          <section>
            <h3>{t('Accounts')}</h3>
            <div className="imp-map">
              {accs.map((a) => (
                <div key={a.key}>
                  <span><b>{a.name}</b><small>{tp(a.count, '{n} row', '{n} rows')} · {how(a.how)}</small></span>
                  <select value={a.target} onChange={(e) => setAccPick({ ...accPick, [a.key]: e.target.value })} aria-label={a.name}>
                    <option value={newTarget(a.name)}>{t('New account “{name}”', { name: a.name })}</option>
                    {m.accounts.map((x) => <option key={x.id} value={x.id}>{accLabel(x)}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3>{t('Preview')}</h3>
          <table className="imp-preview">
            <tbody>
              {built.tx.slice(0, 8).map((x) => {
                const c = m.cat(x.cat) ?? built.categories.find((k) => k.id === x.cat);
                return (
                  <tr key={x.id}>
                    <td>{x.date}</td>
                    <td className="imp-note">{x.note || '—'}<small>{x.type === 'transfer' ? t('Transfer') : c ? `${catLabel(c)}${x.sub ? ` › ${subLabel(x.sub)}` : ''}` : ''}</small></td>
                    <td className={`r tx-amt ${x.type}`}>{x.type === 'expense' ? '−' : x.type === 'income' ? '+' : ''}{m.fmt(x.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="imp-notes">
            {built.duplicates > 0 && <li>{tp(built.duplicates, '{n} is already in the app and is left out.', '{n} are already in the app and are left out.')}</li>}
            {conv.skipped.length > 0 && <li>{tp(conv.skipped.length, '{n} line without a readable date or amount is left out (line {lines}).', '{n} lines without a readable date or amount are left out (lines {lines}).', { lines: conv.skipped.slice(0, 5).map((s) => s.line).join(', ') + (conv.skipped.length > 5 ? '…' : '') })}</li>}
            {built.guessed > 0 && <li>{tp(built.guessed, '{n} without a category was sorted by its note, like your earlier transactions.', '{n} without a category were sorted by their notes, like your earlier transactions.')}</li>}
            {built.byWords > 0 && <li>{tp(built.byWords, '{n} without a category was sorted by the shop or words in its note.', '{n} without a category were sorted by the shop or words in their notes.')}</li>}
            {conv.currencies.some((c) => c !== m.currency) && <li>{t('Some rows are in {list}. Amounts are added as they are, without converting to {cur}.', { list: conv.currencies.filter((c) => c !== m.currency).join(', '), cur: m.currency })}</li>}
            {built.accounts.length > 0 && <li>{tp(built.accounts.length, '{n} new account will be added.', '{n} new accounts will be added.')}</li>}
            {built.categories.filter((c) => !m.data.categories[c.id]).length > 0 && <li>{tp(built.categories.filter((c) => !m.data.categories[c.id]).length, '{n} new category will be added.', '{n} new categories will be added.')}</li>}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

/** Rows without an account column go to the remembered account, or the first ordinary one. */
function withAccount(p: Plan, m: Model): Plan {
  const ok = p.account && (isNew(p.account) || m.acc(p.account));
  return ok ? p : { ...p, account: m.accounts.find((a) => a.type !== 'owed')?.id ?? newTarget('Imported') };
}
