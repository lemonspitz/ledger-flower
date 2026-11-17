import { useMemo, useState, type ReactNode } from 'react';
import { addMonths, cumulative, curMonth, dayLabel, daysIn, monthName, monthsBack, pct, type Model } from './calc';
import { ColumnChart, LineChart, Meter, MiniBars, RankBars } from './charts';
import type { Dialog } from './forms';
import { today, type Tx } from './store';
import { Card, Delta, Empty, Icon, Seg } from './ui';
import { accLabel, catLabel, getLocale, subLabel, t, tp, tr } from './i18n';
const tt = t; // for places where `t` is a local name (a transaction or a budget tone)

export interface TxFilter { q: string; type: 'all' | Tx['type']; cat: string; acc: string; month: string; pay: string }
export const NO_FILTER: TxFilter = { q: '', type: 'all', cat: '', acc: '', month: '', pay: '' };
export interface ViewProps { m: Model; month: string; setMonth: (m: string) => void; open: (d: Dialog) => void; go: (view: string, f?: Partial<TxFilter>) => void }

export function MonthNav({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  return (
    <div className="month-nav">
      <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('Previous month')}><Icon name="left" /></button>
      <strong>{monthName(month)}</strong>
      <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= curMonth()} aria-label={t('Next month')}><Icon name="right" /></button>
    </div>
  );
}

const tone = (spent: number, limit: number, paceShare = 1) => (spent > limit ? 'over' : spent < limit && spent > limit * Math.max(0.85, Math.min(1, paceShare + 0.15)) ? 'warn' : 'ok');

function TxRow({ t, m, onClick }: { t: Tx; m: Model; onClick: () => void }) {
  const c = m.cat(t.cat);
  const title = t.note || (t.type === 'transfer' ? tt('Transfer') : c ? catLabel(c) : tt('Uncategorized'));
  const paid = m.payLabel(t);
  const sub = t.type === 'transfer' ? `${accLabel(m.acc(t.acc)) || '—'} → ${accLabel(m.acc(t.toAcc)) || '—'}` : `${c ? catLabel(c) : tt('Uncategorized')}${t.sub ? ` › ${subLabel(t.sub)}` : ''} · ${paid || accLabel(m.acc(t.acc)) || '—'}`;
  return (
    <button className="tx" onClick={onClick}>
      <span className="tx-ic">{t.type === 'transfer' ? '⇄' : c?.icon ?? '📦'}</span>
      <span className="tx-main"><b>{title}</b><small>{sub}{t.rid && ` · ${tt('recurring')}`}</small></span>
      <span className={`tx-amt ${t.type}`}>{t.type === 'expense' ? '−' : t.type === 'income' ? '+' : ''}{m.fmt(t.amount)}</span>
    </button>
  );
}

// ───────────────────────── Dashboard ─────────────────────────
export function Dashboard({ m, month, setMonth, open, go }: ViewProps) {
  const cur = m.month(month), prevM = addMonths(month, -1), prev = m.month(prevM);
  const isNow = month === curMonth();
  const dayN = isNow ? Number(today().slice(8, 10)) : daysIn(month);
  const budgetTotal = m.budgets.reduce((a, b) => a + b.limit, 0);
  const net = cur.inc - cur.exp;
  const months6 = monthsBack(6, month);
  const cats = [...cur.cats].sort((a, b) => b[1] - a[1]);
  const top = cats.slice(0, 6);
  const budgetRows = m.budgets.map((b) => ({ b, spent: cur.cats.get(b.id) ?? 0 })).sort((a, b) => b.spent / b.b.limit - a.spent / a.b.limit).slice(0, 5);
  const projected = isNow && dayN > 3 ? Math.round((cur.exp / dayN) * daysIn(month)) : null;
  const upcoming = m.recurring.slice(0, 4);

  if (!m.txs.length) {
    return (
      <div className="page">
        <header className="page-head"><h1>{t('Overview')}</h1></header>
        <Card>
          <Empty icon="🌸" title={t('Welcome to Ledger Flower')}>
            <p>{t('Add your first transaction to start seeing where your money goes — or load sample data to explore every screen first.')}</p>
            <div className="empty-actions">
              <button className="btn primary" onClick={() => open({ k: 'tx' })}><Icon name="plus" size={16} />{t('Add a transaction')}</button>
              <button className="btn" onClick={() => go('settings')}>{t('Load sample data in Settings')}</button>
            </div>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head"><h1>{t('Overview')}</h1><MonthNav month={month} setMonth={setMonth} /></header>

      <div className="kpis">
        <div className="hero-tile">
          <span className="label">{t('Total balance')}</span>
          <span className="hero">{m.fmt(m.netWorth)}</span>
          <span className="sub">{tp(m.accounts.length, 'across {n} account', 'across {n} accounts')}</span>
        </div>
        <div className="tile"><span className="label">{t('Income')}</span><span className="value">{m.fmt0(cur.inc)}</span><Delta now={cur.inc} prev={prev.inc} goodUp label={monthName(prevM, 'short')} /></div>
        <div className="tile"><span className="label">{t('Spent')}</span><span className="value">{m.fmt0(cur.exp)}</span><Delta now={cur.exp} prev={prev.exp} goodUp={false} label={monthName(prevM, 'short')} /></div>
        <div className="tile"><span className="label">{net >= 0 ? t('Saved') : t('Overspent')}</span><span className="value">{m.fmt0(Math.abs(net))}</span><span className="delta flat">{cur.inc ? t('{p}% of income', { p: pct(net, cur.inc) }) : t('no income yet')}</span></div>
      </div>

      <div className="grid">
        <Card className="span2" title={t('Spending pace')} sub={projected !== null ? (budgetTotal ? (projected > budgetTotal ? t('On track to spend about {a} this month — {b} over your budgets.', { a: m.fmt0(projected), b: m.fmt0(projected - budgetTotal) }) : t('On track to spend about {a} this month — {b} under your budgets.', { a: m.fmt0(projected), b: m.fmt0(budgetTotal - projected) })) : t('On track to spend about {a} this month.', { a: m.fmt0(projected) })) : t('Running total of spending, day by day.')}>
          <LineChart
            labels={Array.from({ length: Math.max(daysIn(month), daysIn(prevM)) }, (_, i) => String(i + 1))}
            series={[
              { name: monthName(prevM), color: 'var(--series-muted)', values: cumulative(prev, prevM), muted: true },
              { name: monthName(month), color: 'var(--series-1)', values: cumulative(cur, month, dayN) },
            ]}
            refLine={budgetTotal ? { value: budgetTotal, label: t('Budget {a}', { a: m.fmt0(budgetTotal) }) } : undefined}
            fmt={m.fmt} fmtAxis={m.fmtc} tipLabel={(i) => t('Day {d}', { d: i + 1 })}
          />
        </Card>

        <Card title={t('Where it went')} sub={cats.length ? tp(cats.length, '{n} category this month', '{n} categories this month') : undefined} action={<button className="link" onClick={() => go('insights')}>{t('Insights')}</button>}>
          {top.length ? (
            <RankBars fmt={m.fmt0} onPick={(id) => go('transactions', { cat: id, month })}
              rows={top.map(([id, v]) => ({ id, value: v, note: `${pct(v, cur.exp)}%`, label: <><span className="em">{m.cat(id)?.icon ?? '📦'}</span>{catLabel(m.cat(id)) || t('Other')}</> }))} />
          ) : <p className="muted">{t('No spending recorded for {month}.', { month: monthName(month) })}</p>}
        </Card>

        <Card title={t('Budgets')} sub={budgetTotal ? t('{a} left of {b}', { a: m.fmt0(Math.max(0, budgetTotal - m.budgets.reduce((a, b) => a + (cur.cats.get(b.id) ?? 0), 0))), b: m.fmt0(budgetTotal) }) : undefined} action={<button className="link" onClick={() => go('budgets')}>{budgetTotal ? t('All budgets') : t('Set up')}</button>}>
          {budgetRows.length ? (
            <div className="meter-list">
              {budgetRows.map(({ b, spent }) => {
                const t = tone(spent, b.limit, isNow ? dayN / daysIn(month) : 1);
                return (
                  <div key={b.id} className="meter-row">
                    <div className="meter-top"><span><span className="em">{m.cat(b.id)?.icon}</span>{catLabel(m.cat(b.id))}</span><span className="num">{m.fmt0(spent)} <small>/ {m.fmt0(b.limit)}</small></span></div>
                    <Meter value={spent} max={b.limit} tone={t} />
                    {t === 'over' && <small className="status over"><Icon name="warn" size={13} />{tt('Over by {a}', { a: m.fmt0(spent - b.limit) })}</small>}
                  </div>
                );
              })}
            </div>
          ) : <p className="muted">{t('Set a monthly limit per category and track it here.')}</p>}
        </Card>

        <Card className="span2" title={t('Cash flow')} sub={t('Income and spending, last 6 months')}>
          <ColumnChart labels={months6.map((x) => monthName(x, 'short'))} fmt={m.fmt0} fmtAxis={m.fmtc}
            series={[
              { name: t('Income'), color: 'var(--series-1)', values: months6.map((x) => m.month(x).inc) },
              { name: t('Spending'), color: 'var(--series-2)', values: months6.map((x) => m.month(x).exp) },
            ]}
            extra={(i) => { const s = m.month(months6[i]); return <span className="tip-net">{t('Net')}<em>{s.inc - s.exp < 0 ? '−' : '+'}{m.fmt0(Math.abs(s.inc - s.exp))}</em></span>; }}
          />
        </Card>

        <Card title={t('Recent')} action={<button className="link" onClick={() => go('transactions')}>{t('See all')}</button>}>
          <div className="tx-list flush">{m.txs.slice(0, 6).map((t) => <TxRow key={t.id} t={t} m={m} onClick={() => open({ k: 'tx', tx: t })} />)}</div>
        </Card>

        <Card title={t('Coming up')} action={<button className="link" onClick={() => go('accounts')}>{t('Manage')}</button>}>
          {upcoming.length ? (
            <div className="tx-list flush">
              {upcoming.map((r) => (
                <button key={r.id} className="tx" onClick={() => open({ k: 'recurring', rec: r })}>
                  <span className="tx-ic">{m.cat(r.cat)?.icon ?? '🔁'}</span>
                  <span className="tx-main"><b>{r.name}</b><small>{dayLabel(r.next)} · {t(r.freq)}</small></span>
                  <span className={`tx-amt ${r.type}`}>{r.type === 'expense' ? '−' : '+'}{m.fmt(r.amount)}</span>
                </button>
              ))}
            </div>
          ) : <p className="muted">{t('Add rent, salary or subscriptions as recurring items and they\'ll be entered for you.')}</p>}
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────── Transactions ─────────────────────────
export function Transactions({ m, open, filter, setFilter }: ViewProps & { filter: TxFilter; setFilter: (f: TxFilter) => void }) {
  const [limit, setLimit] = useState(150);
  const list = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return m.txs.filter((t) =>
      (filter.type === 'all' || t.type === filter.type) && (!filter.cat || t.cat === filter.cat) &&
      (!filter.acc || t.acc === filter.acc || t.toAcc === filter.acc) && (!filter.month || t.date.startsWith(filter.month)) &&
      (!filter.pay || (filter.pay.startsWith('pm_') ? t.pmid === filter.pay : filter.pay === 'none' ? t.type === 'expense' && !t.pm : t.pm === filter.pay)) &&
      (!q || t.note.toLowerCase().includes(q) || (t.sub?.toLowerCase().includes(q) ?? false) || catLabel(m.cat(t.cat)).toLowerCase().includes(q) || (m.cat(t.cat)?.name.toLowerCase().includes(q) ?? false) || m.payLabel(t).toLowerCase().includes(q)));
  }, [m, filter]);
  const inc = list.reduce((a, t) => a + (t.type === 'income' ? t.amount : 0), 0);
  const exp = list.reduce((a, t) => a + (t.type === 'expense' ? t.amount : 0), 0);
  const groups: [string, Tx[]][] = [];
  for (const t of list.slice(0, limit)) { const g = groups[groups.length - 1]; if (g && g[0] === t.date) g[1].push(t); else groups.push([t.date, [t]]); }
  const active = filter.q || filter.type !== 'all' || filter.cat || filter.acc || filter.month || filter.pay;
  const monthOpts = [...m.months.keys()].sort().reverse();
  const set = (p: Partial<TxFilter>) => { setLimit(150); setFilter({ ...filter, ...p }); };
  return (
    <div className="page">
      <header className="page-head"><h1>{t('Transactions')}</h1><button className="btn primary desk" onClick={() => open({ k: 'tx' })}><Icon name="plus" size={16} />{t('Add')}</button></header>
      <div className="filters">
        <label className="search"><Icon name="search" size={16} /><input placeholder={t('Search notes, categories, payments')} value={filter.q} onChange={(e) => set({ q: e.target.value })} /></label>
        <select value={filter.month} onChange={(e) => set({ month: e.target.value })} aria-label={t('Month')}><option value="">{t('All time')}</option>{monthOpts.map((x) => <option key={x} value={x}>{monthName(x)}</option>)}</select>
        <select value={filter.type} onChange={(e) => set({ type: e.target.value as TxFilter['type'] })} aria-label={t('Type')}><option value="all">{t('All types')}</option><option value="expense">{t('Expenses')}</option><option value="income">{t('Income')}</option><option value="transfer">{t('Transfers')}</option></select>
        <select value={filter.cat} onChange={(e) => set({ cat: e.target.value })} aria-label={t('Category')}><option value="">{t('All categories')}</option>{m.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {catLabel(c)}</option>)}</select>
        <select value={filter.acc} onChange={(e) => set({ acc: e.target.value })} aria-label={t('Account')}><option value="">{t('All accounts')}</option>{m.accounts.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</select>
        <select value={filter.pay} onChange={(e) => set({ pay: e.target.value })} aria-label={t('Payment')}><option value="">{t('All payments')}</option><option value="cash">{t('Cash')}</option>
          <option value="card">{t('Any card')}</option>{m.methods.filter((x) => x.kind === 'card').map((x) => <option key={x.id} value={x.id}>{t('Card')} · {m.methodName(x)}</option>)}
          <option value="qr">{t('Any QR')}</option>{m.methods.filter((x) => x.kind === 'qr').map((x) => <option key={x.id} value={x.id}>QR · {x.name}</option>)}
          <option value="none">{t('Not recorded')}</option></select>
        {active && <button className="link" onClick={() => setFilter(NO_FILTER)}>{t('Clear')}</button>}
      </div>
      <div className="totals">
        <span>{tp(list.length, '{n} transaction', '{n} transactions')}</span>
        <span><i className="key" style={{ background: 'var(--series-1)' }} />{t('In')} <b>{m.fmt(inc)}</b></span>
        <span><i className="key" style={{ background: 'var(--series-2)' }} />{t('Out')} <b>{m.fmt(exp)}</b></span>
      </div>
      {groups.length ? groups.map(([d, ts]) => (
        <section key={d} className="day">
          <h4><span>{dayLabel(d)}</span><span>{(() => { const n = ts.reduce((a, t) => a + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0); return n ? `${n < 0 ? '−' : '+'}${m.fmt(Math.abs(n))}` : ''; })()}</span></h4>
          <div className="tx-list">{ts.map((t) => <TxRow key={t.id} t={t} m={m} onClick={() => open({ k: 'tx', tx: t })} />)}</div>
        </section>
      )) : <Card><Empty icon="🧾" title={active ? t('Nothing matches these filters') : t('No transactions yet')}>{!active && <button className="btn primary" onClick={() => open({ k: 'tx' })}>{t('Add your first')}</button>}</Empty></Card>}
      {list.length > limit && <button className="btn wide" onClick={() => setLimit(limit + 300)}>{t('Show more')}</button>}
    </div>
  );
}

// ───────────────────────── Budgets ─────────────────────────
export function Budgets({ m, month, setMonth, open, go }: ViewProps) {
  const cur = m.month(month);
  const isNow = month === curMonth();
  const dayN = isNow ? Number(today().slice(8, 10)) : daysIn(month);
  const daysLeft = daysIn(month) - dayN + 1;
  const total = m.budgets.reduce((a, b) => a + b.limit, 0);
  const spentB = m.budgets.reduce((a, b) => a + (cur.cats.get(b.id) ?? 0), 0);
  const expenseCats = m.categories.filter((c) => c.kind === 'expense');
  const budgeted = expenseCats.filter((c) => m.budgets.some((b) => b.id === c.id));
  const rest = expenseCats.filter((c) => !budgeted.includes(c));
  const avg3 = (id: string) => Math.round(monthsBack(3, addMonths(curMonth(), -1)).reduce((a, x) => a + (m.month(x).cats.get(id) ?? 0), 0) / 3);
  return (
    <div className="page">
      <header className="page-head"><h1>{t('Budgets')}</h1><MonthNav month={month} setMonth={setMonth} /></header>
      {total > 0 && (
        <Card>
          <div className="budget-sum">
            <div><span className="label">{spentB > total ? t('Over budget by') : t('Left to spend')}</span><span className="hero">{m.fmt0(Math.abs(total - spentB))}</span></div>
            <div className="budget-sum-r">
              <span>{t('{a} spent of {b} budgeted', { a: m.fmt0(spentB), b: m.fmt0(total) })}</span>
              {isNow && spentB < total && <span className="muted">{tp(daysLeft, '≈ {a} per day for the next {n} day', '≈ {a} per day for the next {n} days', { a: m.fmt0((total - spentB) / daysLeft) })}</span>}
            </div>
          </div>
          <Meter value={spentB} max={total} tone={tone(spentB, total, isNow ? dayN / daysIn(month) : 1)} />
        </Card>
      )}
      <Card title={t('Monthly limits')} sub={budgeted.length ? t('Tap a category to change its limit.') : undefined}>
        {budgeted.length ? (
          <div className="meter-list roomy">
            {budgeted.map((c) => {
              const limit = m.data.budgets[c.id].limit, spent = cur.cats.get(c.id) ?? 0;
              const t = tone(spent, limit, isNow ? dayN / daysIn(month) : 1);
              return (
                <button key={c.id} className="meter-row click" onClick={() => open({ k: 'budget', cat: c.id })}>
                  <div className="meter-top"><span><span className="em">{c.icon}</span>{catLabel(c)}</span><span className="num">{m.fmt0(spent)} <small>/ {m.fmt0(limit)}</small></span></div>
                  <Meter value={spent} max={limit} tone={t} />
                  <small className={`status ${t}`}>
                    {t === 'over' ? <><Icon name="warn" size={13} />{tt('Over by {a}', { a: m.fmt0(spent - limit) })}</> : t === 'warn' ? <><Icon name="warn" size={13} />{tt('{a} left — spending faster than the month', { a: m.fmt0(limit - spent) })}</> : <>{tt('{a} left · {p}% used', { a: m.fmt0(limit - spent), p: pct(spent, limit) })}</>}
                  </small>
                </button>
              );
            })}
          </div>
        ) : <Empty icon="🎯" title={t('No budgets yet')}><p>{t('Pick a category below and give it a monthly limit.')}</p></Empty>}
      </Card>
      {rest.length > 0 && (
        <Card title={t('Not budgeted')} sub={t('Spending this month and your recent average')}>
          <div className="plain-list">
            {rest.map((c) => (
              <div key={c.id} className="plain-row">
                <span><span className="em">{c.icon}</span>{catLabel(c)}</span>
                <span className="num muted">{m.fmt0(cur.cats.get(c.id) ?? 0)}{avg3(c.id) > 0 && <small> · {t('avg {a}', { a: m.fmt0(avg3(c.id)) })}</small>}</span>
                <button className="btn small" onClick={() => open({ k: 'budget', cat: c.id })}>{t('Set limit')}</button>
              </div>
            ))}
          </div>
          <button className="link pad" onClick={() => go('settings')}>{t('Edit categories in Settings')}</button>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────── Goals ─────────────────────────
export function Goals({ m, open }: ViewProps) {
  const totalSaved = m.goals.reduce((a, g) => a + g.saved, 0), totalTarget = m.goals.reduce((a, g) => a + g.target, 0);
  return (
    <div className="page">
      <header className="page-head"><h1>{t('Goals')}</h1><button className="btn primary" onClick={() => open({ k: 'goal' })}><Icon name="plus" size={16} />{t('New goal')}</button></header>
      {m.goals.length ? (
        <>
          <p className="lede">{tp(m.goals.length, '{a} saved toward {b} across {n} goal.', '{a} saved toward {b} across {n} goals.', { a: m.fmt0(totalSaved), b: m.fmt0(totalTarget) })}</p>
          <div className="grid">
            {m.goals.sort((a, b) => b.saved / b.target - a.saved / a.target).map((g) => {
              const left = Math.max(0, g.target - g.saved);
              const monthsLeft = g.due ? Math.max(1, (Number(g.due.slice(0, 4)) - new Date().getFullYear()) * 12 + Number(g.due.slice(5, 7)) - (new Date().getMonth() + 1) + (Number(g.due.slice(8)) >= new Date().getDate() ? 1 : 0)) : 0;
              const late = g.due && g.due < today() && left > 0;
              return (
                <Card key={g.id} title={<><span className="em">{g.icon}</span>{g.name}</>} action={<button className="link" onClick={() => open({ k: 'goal', goal: g })}>{t('Edit')}</button>}>
                  <div className="goal-fig"><span className="value">{m.fmt0(g.saved)}</span><span className="muted">{t('of {a} · {p}%', { a: m.fmt0(g.target), p: pct(g.saved, g.target) })}</span></div>
                  <Meter value={g.saved} max={g.target} />
                  <p className="goal-note">
                    {left === 0 ? <span className="status good"><Icon name="check" size={13} />{t('Goal reached')}</span>
                      : late ? <span className="status over"><Icon name="warn" size={13} />{t('Target date passed — {a} to go', { a: m.fmt0(left) })}</span>
                        : g.due ? <>{t('Save {a} a month to get there by {d}.', { a: m.fmt0(left / monthsLeft), d: new Date(g.due + 'T00:00').toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' }) })}</>
                          : <>{t('{a} to go.', { a: m.fmt0(left) })}</>}
                  </p>
                  <button className="btn wide" onClick={() => open({ k: 'fund', goal: g })}>{t('Add or withdraw')}</button>
                </Card>
              );
            })}
          </div>
        </>
      ) : <Card><Empty icon="🏁" title={t('Save toward something')}><p>{t('Create a goal, set a target and optional date, and track progress as you put money aside.')}</p></Empty></Card>}
    </div>
  );
}

// ───────────────────────── Insights ─────────────────────────
export function Insights({ m, go }: ViewProps) {
  const [range, setRange] = useState<'3' | '6' | '12'>('6');
  const [subCat, setSubCat] = useState('');
  const ms = monthsBack(Number(range));
  const labels = ms.map((x) => monthName(x, 'short'));
  const sums = ms.map((x) => m.month(x));
  const inc = sums.reduce((a, s) => a + s.inc, 0), exp = sums.reduce((a, s) => a + s.exp, 0);
  const catTotals = new Map<string, number>();
  sums.forEach((s) => s.cats.forEach((v, k) => catTotals.set(k, (catTotals.get(k) ?? 0) + v)));
  const ranked = [...catTotals].sort((a, b) => b[1] - a[1]);
  const worth = m.netWorthAt(ms);
  const wd = new Array(7).fill(0);
  const start = ms[0] + '-01';
  const period = m.txs.filter((t) => t.date >= start && t.type === 'expense');
  period.forEach((t) => { const [y, mo, d] = t.date.split('-').map(Number); wd[(new Date(y, mo - 1, d).getDay() + 6) % 7] += t.amount; });
  const weeks = Math.max(1, Math.round((Date.now() - new Date(start + 'T00:00').getTime()) / 6048e5));
  const biggest = [...period].sort((a, b) => b.amount - a.amount).slice(0, 6);
  const byPay = new Map<string, { label: string; value: number; filter: string }>();
  for (const t of period) {
    const key = t.pm ? (t.pm === 'cash' ? 'cash' : m.method(t.pmid) ? t.pmid! : t.pm) : 'none';
    const label = t.pm ? m.payLabel(t) : tt('Not recorded');
    const cur = byPay.get(key) ?? { label, value: 0, filter: key };
    cur.value += t.amount; byPay.set(key, cur);
  }
  const payRows = [...byPay.values()].sort((a, b) => (a.filter === 'none' ? 1 : 0) - (b.filter === 'none' ? 1 : 0) || b.value - a.value);
  const payIcon = (f: string) => (f === 'cash' ? 'cash' : f === 'none' ? 'more' : f === 'qr' || m.method(f)?.kind === 'qr' ? 'qr' : 'card');
  const withSubs = ranked.filter(([id]) => (m.cat(id)?.subs?.length ?? 0) > 0 || period.some((t) => t.cat === id && t.sub));
  const subId = withSubs.some(([id]) => id === subCat) ? subCat : withSubs[0]?.[0] ?? '';
  const subTotals = new Map<string, number>();
  period.forEach((t) => { if ((t.cat || 'cat_other') === subId) subTotals.set(t.sub ?? '', (subTotals.get(t.sub ?? '') ?? 0) + t.amount); });
  const subRows = [...subTotals].sort((a, b) => b[1] - a[1]);
  const subSum = subRows.reduce((a, r) => a + r[1], 0);

  const notes: ReactNode[] = [];
  const cm = curMonth(), now = m.month(cm);
  const prior = monthsBack(3, addMonths(cm, -1)).map((x) => m.month(x));
    let worst: [string, number, number] | null = null;
  now.cats.forEach((v, k) => {
    const avg = prior.reduce((a, s) => a + (s.cats.get(k) ?? 0), 0) / 3;
    if (avg > 2000 && v > avg * 1.1 && (!worst || v - avg > worst[1] - worst[2])) worst = [k, v, avg];
  });
  if (worst) notes.push(tr('{cat} is above usual: {a} so far this month against a typical {b} for a full month.', { cat: <b>{catLabel(m.cat(worst[0]))}</b>, a: m.fmt0(worst[1]), b: m.fmt0(worst[2]) }));
  if (ranked[0] && exp) notes.push(tr('{cat} is your largest category — {p}% of spending over these {n} months.', { cat: <b>{catLabel(m.cat(ranked[0][0])) || t('Other')}</b>, p: pct(ranked[0][1], exp), n: range }));
  if (inc) notes.push(inc >= exp ? tr('You kept {p} of your income ({a}) over this period.', { p: <b>{pct(inc - exp, inc)}%</b>, a: m.fmt0(inc - exp) }) : tr('You spent {a} more than you earned over this period.', { a: <b>{m.fmt0(exp - inc)}</b> }));
  const over = m.budgets.filter((b) => (now.cats.get(b.id) ?? 0) > b.limit);
  if (over.length) notes.push(tp(over.length, '{n} budget is over the limit this month: {list}.', '{n} budgets are over the limit this month: {list}.', { list: over.map((b) => catLabel(m.cat(b.id))).join(', ') }));
  const subs = m.recurring.filter((r) => r.type === 'expense').reduce((a, r) => a + (r.freq === 'weekly' ? r.amount * 52 / 12 : r.freq === 'yearly' ? r.amount / 12 : r.amount), 0);
  if (subs) notes.push(tr('Recurring bills add up to about {a} a month before you spend on anything else.', { a: <b>{m.fmt0(subs)}</b> }));

  if (!m.txs.length) return <div className="page"><header className="page-head"><h1>{t('Insights')}</h1></header><Card><Empty icon="📈" title={t('Nothing to chart yet')}><p>{t('Insights appear once you\'ve recorded some transactions.')}</p></Empty></Card></div>;

  return (
    <div className="page">
      <header className="page-head"><h1>{t('Insights')}</h1><Seg value={range} onChange={setRange} options={[['3', tp(3, '{n} month', '{n} months')], ['6', tp(6, '{n} month', '{n} months')], ['12', tp(12, '{n} month', '{n} months')]]} /></header>
      <div className="kpis three">
        <div className="tile"><span className="label">{t('Average income')}</span><span className="value">{m.fmt0(inc / ms.length)}</span><span className="delta flat">{t('per month')}</span></div>
        <div className="tile"><span className="label">{t('Average spending')}</span><span className="value">{m.fmt0(exp / ms.length)}</span><span className="delta flat">{t('per month')}</span></div>
        <div className="tile"><span className="label">{t('Savings rate')}</span><span className="value">{inc ? pct(inc - exp, inc) : 0}%</span><span className="delta flat">{t('of income kept')}</span></div>
      </div>
      <div className="grid">
        {notes.length > 0 && <Card className="span2" title={t('What stands out')}><ul className="notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Card>}
        <Card className="span2" title={t('Total balance')} sub={t('All accounts combined, at the end of each month')}>
          <LineChart labels={labels} series={[{ name: t('Total balance'), color: 'var(--series-1)', values: worth }]} fmt={m.fmt0} fmtAxis={m.fmtc} area zeroBased={false} height={200} />
        </Card>
        <Card className="span2" title={t('Income and spending')}>
          <ColumnChart labels={labels} fmt={m.fmt0} fmtAxis={m.fmtc}
            series={[{ name: t('Income'), color: 'var(--series-1)', values: sums.map((s) => s.inc) }, { name: t('Spending'), color: 'var(--series-2)', values: sums.map((s) => s.exp) }]}
            extra={(i) => <span className="tip-net">{t('Net')}<em>{sums[i].inc - sums[i].exp < 0 ? '−' : '+'}{m.fmt0(Math.abs(sums[i].inc - sums[i].exp))}</em></span>} />
        </Card>
        {payRows.some((r) => r.filter !== 'none') && (
          <Card title={t('By payment method')} sub={t('Spending over {n} months, by card, QR app and cash', { n: range })}>
            <RankBars fmt={m.fmt0} onPick={(f) => go('transactions', { pay: f })}
              rows={payRows.map((r) => ({ id: r.filter, value: r.value, note: `${pct(r.value, exp)}%`, label: <><span className="em pay-ic"><Icon name={payIcon(r.filter)} size={15} /></span>{r.filter === 'none' ? <span className="muted">{r.label}</span> : r.label}</> }))} />
          </Card>
        )}
        <Card title={t('Spending by category')} sub={t('Total over {n} months', { n: range })}>
          <RankBars fmt={m.fmt0} onPick={(id) => go('transactions', { cat: id })} rows={ranked.slice(0, 8).map(([id, v]) => ({ id, value: v, note: `${pct(v, exp)}%`, label: <><span className="em">{m.cat(id)?.icon ?? '📦'}</span>{catLabel(m.cat(id)) || t('Other')}</> }))} />
        </Card>
        {subId && (
          <Card title={t('Inside a category')} sub={t('Spending split by sub-category')} action={<select className="mini-select" value={subId} onChange={(e) => setSubCat(e.target.value)} aria-label={t('Category')}>{withSubs.map(([id]) => <option key={id} value={id}>{catLabel(m.cat(id)) || t('Other')}</option>)}</select>}>
            <RankBars fmt={m.fmt0} onPick={(id) => go('transactions', id ? { cat: subId, q: id } : { cat: subId })}
              rows={subRows.map(([name, v]) => ({ id: name, value: v, note: `${pct(v, subSum)}%`, label: name ? subLabel(name) : <span className="muted">{t('No sub-category')}</span> }))} />
            {subRows.length === 1 && !subRows[0][0] && <p className="hint pad">{t('Pick a sub-category when adding {cat} spending, or scan a receipt and save its items separately, to see the split here.', { cat: catLabel(m.cat(subId)) })}</p>}
          </Card>
        )}
        <Card title={t('By day of the week')} sub={t('Average spent per weekday')}>
          <ColumnChart labels={WEEKDAYS()} fmt={m.fmt0} fmtAxis={m.fmtc} height={200} series={[{ name: t('Average spent'), color: 'var(--series-1)', values: wd.map((v) => Math.round(v / weeks)) }]} />
        </Card>
        <Card className="span2" title={t('Category trends')} sub={t('Monthly spending per category; the latest month is highlighted')}>
          <div className="multiples">
            {ranked.slice(0, 6).map(([id]) => {
              const vals = sums.map((s) => s.cats.get(id) ?? 0);
              return (
                <div key={id} className="multi">
                  <div className="multi-head"><span><span className="em">{m.cat(id)?.icon ?? '📦'}</span>{catLabel(m.cat(id)) || t('Other')}</span><b>{m.fmt0(vals[vals.length - 1])}</b></div>
                  <MiniBars values={vals} labels={labels} fmt={m.fmt0} />
                  <div className="multi-foot"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="span2" title={t('Largest expenses')}>
          <table className="table">
            <thead><tr><th>{t('Date')}</th><th>{t('What')}</th><th>{t('Category')}</th><th className="r">{t('Amount')}</th></tr></thead>
            <tbody>{biggest.map((t) => <tr key={t.id}><td>{dayLabel(t.date)}</td><td>{t.note || '—'}</td><td>{catLabel(m.cat(t.cat)) || tt('Other')}</td><td className="r">{m.fmt(t.amount)}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────── Accounts & recurring ─────────────────────────
const TYPE_LABEL = { bank: 'Bank account', savings: 'Savings', card: 'Credit card', cash: 'Cash', owed: 'Money friends owe you' } as const;
const WEEKDAYS = () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(getLocale(), { weekday: 'short' })); // 1 Jan 2024 was a Monday
const TYPE_ICON = { bank: '🏦', savings: '🐖', card: '💳', cash: '💵', owed: '🤝' } as const;
export function Accounts({ m, open, go }: ViewProps) {
  return (
    <div className="page">
      <header className="page-head"><h1>{t('Accounts')}</h1><button className="btn primary" onClick={() => open({ k: 'account' })}><Icon name="plus" size={16} />{t('Account')}</button></header>
      <Card title={t('Balances')} sub={t('Total {a}', { a: m.fmt(m.netWorth) })}>
        <div className="tx-list flush">
          {m.accounts.map((a) => (
            <div key={a.id} className="tx static">
              <span className="tx-ic">{TYPE_ICON[a.type]}</span>
              <button className="tx-main as-btn" onClick={() => go('transactions', { acc: a.id })}><b>{accLabel(a)}</b><small>{t(TYPE_LABEL[a.type])} · {t('view transactions')}</small></button>
              <span className="tx-amt">{m.fmt(m.balances.get(a.id) ?? 0)}</span>
              <button className="btn small" onClick={() => open({ k: 'account', acc: a })}>{t('Edit')}</button>
            </div>
          ))}
        </div>
        {m.accounts.length > 1 && <button className="btn pad" onClick={() => open({ k: 'tx', preset: { type: 'transfer' } })}>{t('Transfer between accounts')}</button>}
      </Card>
      {m.owed.size > 0 && (
        <Card title={t('Owed to me')} sub={t('From split bills you paid · {a} in total', { a: m.fmt([...m.owed.values()].reduce((a, b) => a + b, 0)) })}>
          <div className="tx-list flush">
            {[...m.owed].sort((a, b) => b[1] - a[1]).map(([who, amt]) => (
              <div key={who} className="tx static">
                <span className="tx-ic avatar-ic">{who.slice(0, 1).toUpperCase()}</span>
                <button className="tx-main as-btn" onClick={() => go('transactions', { acc: 'acc_owed', q: who })}><b>{who}</b><small>{amt > 0 ? t('owes you') : t('you owe back')} · {t('view history')}</small></button>
                <span className="tx-amt">{m.fmt(Math.abs(amt))}</span>
                {amt > 0 && <button className="btn small" onClick={() => open({ k: 'settle', who, amount: amt })}>{t('Settle')}</button>}
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card title={t('Recurring')} sub={t('Bills, subscriptions and paychecks that enter themselves')} action={<button className="btn small" onClick={() => open({ k: 'recurring' })}><Icon name="plus" size={14} />{t('Add')}</button>}>
        {m.recurring.length ? (
          <div className="tx-list flush">
            {m.recurring.map((r) => (
              <button key={r.id} className="tx" onClick={() => open({ k: 'recurring', rec: r })}>
                <span className="tx-ic">{m.cat(r.cat)?.icon ?? '🔁'}</span>
                <span className="tx-main"><b>{r.name}</b><small>{t('Next {d}', { d: dayLabel(r.next) })} · {t(r.freq)} · {accLabel(m.acc(r.acc))}</small></span>
                <span className={`tx-amt ${r.type}`}>{r.type === 'expense' ? '−' : '+'}{m.fmt(r.amount)}</span>
              </button>
            ))}
          </div>
        ) : <p className="muted">{t('Nothing recurring yet.')}</p>}
      </Card>
    </div>
  );
}
