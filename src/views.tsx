import { useMemo, useState, type ReactNode } from 'react';
import { addMonths, cumulative, curMonth, dayLabel, daysIn, monthName, monthsBack, pct, type Model } from './calc';
import { ColumnChart, LineChart, Meter, MiniBars, RankBars } from './charts';
import type { Dialog } from './forms';
import { today, type Tx } from './store';
import { Card, Delta, Empty, Icon, Seg } from './ui';

export interface TxFilter { q: string; type: 'all' | Tx['type']; cat: string; acc: string; month: string; pay: string }
export const NO_FILTER: TxFilter = { q: '', type: 'all', cat: '', acc: '', month: '', pay: '' };
export interface ViewProps { m: Model; month: string; setMonth: (m: string) => void; open: (d: Dialog) => void; go: (view: string, f?: Partial<TxFilter>) => void }

export function MonthNav({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  return (
    <div className="month-nav">
      <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><Icon name="left" /></button>
      <strong>{monthName(month)}</strong>
      <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= curMonth()} aria-label="Next month"><Icon name="right" /></button>
    </div>
  );
}

const tone = (spent: number, limit: number, paceShare = 1) => (spent > limit ? 'over' : spent < limit && spent > limit * Math.max(0.85, Math.min(1, paceShare + 0.15)) ? 'warn' : 'ok');

function TxRow({ t, m, onClick }: { t: Tx; m: Model; onClick: () => void }) {
  const c = m.cat(t.cat);
  const title = t.note || (t.type === 'transfer' ? 'Transfer' : c?.name ?? 'Uncategorized');
  const paid = m.payLabel(t);
  const sub = t.type === 'transfer' ? `${m.acc(t.acc)?.name ?? '—'} → ${m.acc(t.toAcc)?.name ?? '—'}` : `${c?.name ?? 'Uncategorized'}${t.sub ? ` › ${t.sub}` : ''} · ${paid || m.acc(t.acc)?.name || '—'}`;
  return (
    <button className="tx" onClick={onClick}>
      <span className="tx-ic">{t.type === 'transfer' ? '⇄' : c?.icon ?? '📦'}</span>
      <span className="tx-main"><b>{title}</b><small>{sub}{t.rid && ' · recurring'}</small></span>
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
        <header className="page-head"><h1>Overview</h1></header>
        <Card>
          <Empty icon="🌱" title="Welcome to Ledgerleaf">
            <p>Add your first transaction to start seeing where your money goes — or load sample data to explore every screen first.</p>
            <div className="empty-actions">
              <button className="btn primary" onClick={() => open({ k: 'tx' })}><Icon name="plus" size={16} />Add a transaction</button>
              <button className="btn" onClick={() => go('settings')}>Load sample data in Settings</button>
            </div>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head"><h1>Overview</h1><MonthNav month={month} setMonth={setMonth} /></header>

      <div className="kpis">
        <div className="hero-tile">
          <span className="label">Total balance</span>
          <span className="hero">{m.fmt(m.netWorth)}</span>
          <span className="sub">across {m.accounts.length} account{m.accounts.length === 1 ? '' : 's'}</span>
        </div>
        <div className="tile"><span className="label">Income</span><span className="value">{m.fmt0(cur.inc)}</span><Delta now={cur.inc} prev={prev.inc} goodUp label={monthName(prevM, 'short')} /></div>
        <div className="tile"><span className="label">Spent</span><span className="value">{m.fmt0(cur.exp)}</span><Delta now={cur.exp} prev={prev.exp} goodUp={false} label={monthName(prevM, 'short')} /></div>
        <div className="tile"><span className="label">{net >= 0 ? 'Saved' : 'Overspent'}</span><span className="value">{m.fmt0(Math.abs(net))}</span><span className="delta flat">{cur.inc ? `${pct(net, cur.inc)}% of income` : 'no income yet'}</span></div>
      </div>

      <div className="grid">
        <Card className="span2" title="Spending pace" sub={projected !== null ? `On track to spend about ${m.fmt0(projected)} this month${budgetTotal ? ` — ${projected > budgetTotal ? `${m.fmt0(projected - budgetTotal)} over` : `${m.fmt0(budgetTotal - projected)} under`} your budgets` : ''}.` : 'Running total of spending, day by day.'}>
          <LineChart
            labels={Array.from({ length: Math.max(daysIn(month), daysIn(prevM)) }, (_, i) => String(i + 1))}
            series={[
              { name: monthName(prevM), color: 'var(--series-muted)', values: cumulative(prev, prevM), muted: true },
              { name: monthName(month), color: 'var(--series-1)', values: cumulative(cur, month, dayN) },
            ]}
            refLine={budgetTotal ? { value: budgetTotal, label: `Budget ${m.fmt0(budgetTotal)}` } : undefined}
            fmt={m.fmt} fmtAxis={m.fmtc} tipLabel={(i) => `Day ${i + 1}`}
          />
        </Card>

        <Card title="Where it went" sub={cats.length ? `${cats.length} categor${cats.length === 1 ? 'y' : 'ies'} this month` : undefined} action={<button className="link" onClick={() => go('insights')}>Insights</button>}>
          {top.length ? (
            <RankBars fmt={m.fmt0} onPick={(id) => go('transactions', { cat: id, month })}
              rows={top.map(([id, v]) => ({ id, value: v, note: `${pct(v, cur.exp)}%`, label: <><span className="em">{m.cat(id)?.icon ?? '📦'}</span>{m.cat(id)?.name ?? 'Other'}</> }))} />
          ) : <p className="muted">No spending recorded for {monthName(month)}.</p>}
        </Card>

        <Card title="Budgets" sub={budgetTotal ? `${m.fmt0(Math.max(0, budgetTotal - m.budgets.reduce((a, b) => a + (cur.cats.get(b.id) ?? 0), 0)))} left of ${m.fmt0(budgetTotal)}` : undefined} action={<button className="link" onClick={() => go('budgets')}>{budgetTotal ? 'All budgets' : 'Set up'}</button>}>
          {budgetRows.length ? (
            <div className="meter-list">
              {budgetRows.map(({ b, spent }) => {
                const t = tone(spent, b.limit, isNow ? dayN / daysIn(month) : 1);
                return (
                  <div key={b.id} className="meter-row">
                    <div className="meter-top"><span><span className="em">{m.cat(b.id)?.icon}</span>{m.cat(b.id)?.name}</span><span className="num">{m.fmt0(spent)} <small>/ {m.fmt0(b.limit)}</small></span></div>
                    <Meter value={spent} max={b.limit} tone={t} />
                    {t === 'over' && <small className="status over"><Icon name="warn" size={13} />Over by {m.fmt0(spent - b.limit)}</small>}
                  </div>
                );
              })}
            </div>
          ) : <p className="muted">Set a monthly limit per category and track it here.</p>}
        </Card>

        <Card className="span2" title="Cash flow" sub="Income and spending, last 6 months">
          <ColumnChart labels={months6.map((x) => monthName(x, 'short'))} fmt={m.fmt0} fmtAxis={m.fmtc}
            series={[
              { name: 'Income', color: 'var(--series-1)', values: months6.map((x) => m.month(x).inc) },
              { name: 'Spending', color: 'var(--series-2)', values: months6.map((x) => m.month(x).exp) },
            ]}
            extra={(i) => { const s = m.month(months6[i]); return <span className="tip-net">Net<em>{s.inc - s.exp < 0 ? '−' : '+'}{m.fmt0(Math.abs(s.inc - s.exp))}</em></span>; }}
          />
        </Card>

        <Card title="Recent" action={<button className="link" onClick={() => go('transactions')}>See all</button>}>
          <div className="tx-list flush">{m.txs.slice(0, 6).map((t) => <TxRow key={t.id} t={t} m={m} onClick={() => open({ k: 'tx', tx: t })} />)}</div>
        </Card>

        <Card title="Coming up" action={<button className="link" onClick={() => go('accounts')}>Manage</button>}>
          {upcoming.length ? (
            <div className="tx-list flush">
              {upcoming.map((r) => (
                <button key={r.id} className="tx" onClick={() => open({ k: 'recurring', rec: r })}>
                  <span className="tx-ic">{m.cat(r.cat)?.icon ?? '🔁'}</span>
                  <span className="tx-main"><b>{r.name}</b><small>{dayLabel(r.next)} · {r.freq}</small></span>
                  <span className={`tx-amt ${r.type}`}>{r.type === 'expense' ? '−' : '+'}{m.fmt(r.amount)}</span>
                </button>
              ))}
            </div>
          ) : <p className="muted">Add rent, salary or subscriptions as recurring items and they'll be entered for you.</p>}
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
      (!q || t.note.toLowerCase().includes(q) || (t.sub?.toLowerCase().includes(q) ?? false) || (m.cat(t.cat)?.name.toLowerCase().includes(q) ?? false) || m.payLabel(t).toLowerCase().includes(q)));
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
      <header className="page-head"><h1>Transactions</h1><button className="btn primary desk" onClick={() => open({ k: 'tx' })}><Icon name="plus" size={16} />Add</button></header>
      <div className="filters">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search notes, categories, payments" value={filter.q} onChange={(e) => set({ q: e.target.value })} /></label>
        <select value={filter.month} onChange={(e) => set({ month: e.target.value })} aria-label="Month"><option value="">All time</option>{monthOpts.map((x) => <option key={x} value={x}>{monthName(x)}</option>)}</select>
        <select value={filter.type} onChange={(e) => set({ type: e.target.value as TxFilter['type'] })} aria-label="Type"><option value="all">All types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="transfer">Transfers</option></select>
        <select value={filter.cat} onChange={(e) => set({ cat: e.target.value })} aria-label="Category"><option value="">All categories</option>{m.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select>
        <select value={filter.acc} onChange={(e) => set({ acc: e.target.value })} aria-label="Account"><option value="">All accounts</option>{m.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select value={filter.pay} onChange={(e) => set({ pay: e.target.value })} aria-label="Payment"><option value="">All payments</option><option value="cash">Cash</option>
          <option value="card">Any card</option>{m.methods.filter((x) => x.kind === 'card').map((x) => <option key={x.id} value={x.id}>Card · {m.methodName(x)}</option>)}
          <option value="qr">Any QR</option>{m.methods.filter((x) => x.kind === 'qr').map((x) => <option key={x.id} value={x.id}>QR · {x.name}</option>)}
          <option value="none">Not recorded</option></select>
        {active && <button className="link" onClick={() => setFilter(NO_FILTER)}>Clear</button>}
      </div>
      <div className="totals">
        <span>{list.length} transaction{list.length === 1 ? '' : 's'}</span>
        <span><i className="key" style={{ background: 'var(--series-1)' }} />In <b>{m.fmt(inc)}</b></span>
        <span><i className="key" style={{ background: 'var(--series-2)' }} />Out <b>{m.fmt(exp)}</b></span>
      </div>
      {groups.length ? groups.map(([d, ts]) => (
        <section key={d} className="day">
          <h4><span>{dayLabel(d)}</span><span>{(() => { const n = ts.reduce((a, t) => a + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0); return n ? `${n < 0 ? '−' : '+'}${m.fmt(Math.abs(n))}` : ''; })()}</span></h4>
          <div className="tx-list">{ts.map((t) => <TxRow key={t.id} t={t} m={m} onClick={() => open({ k: 'tx', tx: t })} />)}</div>
        </section>
      )) : <Card><Empty icon="🧾" title={active ? 'Nothing matches these filters' : 'No transactions yet'}>{!active && <button className="btn primary" onClick={() => open({ k: 'tx' })}>Add your first</button>}</Empty></Card>}
      {list.length > limit && <button className="btn wide" onClick={() => setLimit(limit + 300)}>Show more</button>}
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
      <header className="page-head"><h1>Budgets</h1><MonthNav month={month} setMonth={setMonth} /></header>
      {total > 0 && (
        <Card>
          <div className="budget-sum">
            <div><span className="label">{spentB > total ? 'Over budget by' : 'Left to spend'}</span><span className="hero">{m.fmt0(Math.abs(total - spentB))}</span></div>
            <div className="budget-sum-r">
              <span>{m.fmt0(spentB)} spent of {m.fmt0(total)} budgeted</span>
              {isNow && spentB < total && <span className="muted">≈ {m.fmt0((total - spentB) / daysLeft)} per day for the next {daysLeft} day{daysLeft === 1 ? '' : 's'}</span>}
            </div>
          </div>
          <Meter value={spentB} max={total} tone={tone(spentB, total, isNow ? dayN / daysIn(month) : 1)} />
        </Card>
      )}
      <Card title="Monthly limits" sub={budgeted.length ? 'Tap a category to change its limit.' : undefined}>
        {budgeted.length ? (
          <div className="meter-list roomy">
            {budgeted.map((c) => {
              const limit = m.data.budgets[c.id].limit, spent = cur.cats.get(c.id) ?? 0;
              const t = tone(spent, limit, isNow ? dayN / daysIn(month) : 1);
              return (
                <button key={c.id} className="meter-row click" onClick={() => open({ k: 'budget', cat: c.id })}>
                  <div className="meter-top"><span><span className="em">{c.icon}</span>{c.name}</span><span className="num">{m.fmt0(spent)} <small>/ {m.fmt0(limit)}</small></span></div>
                  <Meter value={spent} max={limit} tone={t} />
                  <small className={`status ${t}`}>
                    {t === 'over' ? <><Icon name="warn" size={13} />Over by {m.fmt0(spent - limit)}</> : t === 'warn' ? <><Icon name="warn" size={13} />{m.fmt0(limit - spent)} left — spending faster than the month</> : <>{m.fmt0(limit - spent)} left · {pct(spent, limit)}% used</>}
                  </small>
                </button>
              );
            })}
          </div>
        ) : <Empty icon="🎯" title="No budgets yet"><p>Pick a category below and give it a monthly limit.</p></Empty>}
      </Card>
      {rest.length > 0 && (
        <Card title="Not budgeted" sub="Spending this month and your recent average">
          <div className="plain-list">
            {rest.map((c) => (
              <div key={c.id} className="plain-row">
                <span><span className="em">{c.icon}</span>{c.name}</span>
                <span className="num muted">{m.fmt0(cur.cats.get(c.id) ?? 0)}{avg3(c.id) > 0 && <small> · avg {m.fmt0(avg3(c.id))}</small>}</span>
                <button className="btn small" onClick={() => open({ k: 'budget', cat: c.id })}>Set limit</button>
              </div>
            ))}
          </div>
          <button className="link pad" onClick={() => go('settings')}>Edit categories in Settings</button>
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
      <header className="page-head"><h1>Goals</h1><button className="btn primary" onClick={() => open({ k: 'goal' })}><Icon name="plus" size={16} />New goal</button></header>
      {m.goals.length ? (
        <>
          <p className="lede">{m.fmt0(totalSaved)} saved toward {m.fmt0(totalTarget)} across {m.goals.length} goal{m.goals.length === 1 ? '' : 's'}.</p>
          <div className="grid">
            {m.goals.sort((a, b) => b.saved / b.target - a.saved / a.target).map((g) => {
              const left = Math.max(0, g.target - g.saved);
              const monthsLeft = g.due ? Math.max(1, (Number(g.due.slice(0, 4)) - new Date().getFullYear()) * 12 + Number(g.due.slice(5, 7)) - (new Date().getMonth() + 1) + (Number(g.due.slice(8)) >= new Date().getDate() ? 1 : 0)) : 0;
              const late = g.due && g.due < today() && left > 0;
              return (
                <Card key={g.id} title={<><span className="em">{g.icon}</span>{g.name}</>} action={<button className="link" onClick={() => open({ k: 'goal', goal: g })}>Edit</button>}>
                  <div className="goal-fig"><span className="value">{m.fmt0(g.saved)}</span><span className="muted">of {m.fmt0(g.target)} · {pct(g.saved, g.target)}%</span></div>
                  <Meter value={g.saved} max={g.target} />
                  <p className="goal-note">
                    {left === 0 ? <span className="status good"><Icon name="check" size={13} />Goal reached</span>
                      : late ? <span className="status over"><Icon name="warn" size={13} />Target date passed — {m.fmt0(left)} to go</span>
                        : g.due ? <>Save {m.fmt0(left / monthsLeft)} a month to get there by {new Date(g.due + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.</>
                          : <>{m.fmt0(left)} to go.</>}
                  </p>
                  <button className="btn wide" onClick={() => open({ k: 'fund', goal: g })}>Add or withdraw</button>
                </Card>
              );
            })}
          </div>
        </>
      ) : <Card><Empty icon="🏁" title="Save toward something"><p>Create a goal, set a target and optional date, and track progress as you put money aside.</p></Empty></Card>}
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
    const label = t.pm ? m.payLabel(t) : 'Not recorded';
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
  if (worst) notes.push(<><b>{m.cat(worst[0])?.name}</b> is above usual: {m.fmt0(worst[1])} so far this month against a typical {m.fmt0(worst[2])} for a full month.</>);
  if (ranked[0] && exp) notes.push(<><b>{m.cat(ranked[0][0])?.name ?? 'Other'}</b> is your largest category — {pct(ranked[0][1], exp)}% of spending over these {range} months.</>);
  if (inc) notes.push(inc >= exp ? <>You kept <b>{pct(inc - exp, inc)}%</b> of your income ({m.fmt0(inc - exp)}) over this period.</> : <>You spent <b>{m.fmt0(exp - inc)}</b> more than you earned over this period.</>);
  const over = m.budgets.filter((b) => (now.cats.get(b.id) ?? 0) > b.limit);
  if (over.length) notes.push(<>{over.length} budget{over.length === 1 ? ' is' : 's are'} over the limit this month: {over.map((b) => m.cat(b.id)?.name).join(', ')}.</>);
  const subs = m.recurring.filter((r) => r.type === 'expense').reduce((a, r) => a + (r.freq === 'weekly' ? r.amount * 52 / 12 : r.freq === 'yearly' ? r.amount / 12 : r.amount), 0);
  if (subs) notes.push(<>Recurring bills add up to about <b>{m.fmt0(subs)}</b> a month before you spend on anything else.</>);

  if (!m.txs.length) return <div className="page"><header className="page-head"><h1>Insights</h1></header><Card><Empty icon="📈" title="Nothing to chart yet"><p>Insights appear once you've recorded some transactions.</p></Empty></Card></div>;

  return (
    <div className="page">
      <header className="page-head"><h1>Insights</h1><Seg value={range} onChange={setRange} options={[['3', '3 months'], ['6', '6 months'], ['12', '12 months']]} /></header>
      <div className="kpis three">
        <div className="tile"><span className="label">Average income</span><span className="value">{m.fmt0(inc / ms.length)}</span><span className="delta flat">per month</span></div>
        <div className="tile"><span className="label">Average spending</span><span className="value">{m.fmt0(exp / ms.length)}</span><span className="delta flat">per month</span></div>
        <div className="tile"><span className="label">Savings rate</span><span className="value">{inc ? pct(inc - exp, inc) : 0}%</span><span className="delta flat">of income kept</span></div>
      </div>
      <div className="grid">
        {notes.length > 0 && <Card className="span2" title="What stands out"><ul className="notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Card>}
        <Card className="span2" title="Total balance" sub="All accounts combined, at the end of each month">
          <LineChart labels={labels} series={[{ name: 'Total balance', color: 'var(--series-1)', values: worth }]} fmt={m.fmt0} fmtAxis={m.fmtc} area zeroBased={false} height={200} />
        </Card>
        <Card className="span2" title="Income and spending">
          <ColumnChart labels={labels} fmt={m.fmt0} fmtAxis={m.fmtc}
            series={[{ name: 'Income', color: 'var(--series-1)', values: sums.map((s) => s.inc) }, { name: 'Spending', color: 'var(--series-2)', values: sums.map((s) => s.exp) }]}
            extra={(i) => <span className="tip-net">Net<em>{sums[i].inc - sums[i].exp < 0 ? '−' : '+'}{m.fmt0(Math.abs(sums[i].inc - sums[i].exp))}</em></span>} />
        </Card>
        {payRows.some((r) => r.filter !== 'none') && (
          <Card title="By payment method" sub={`Spending over ${range} months, by card, QR app and cash`}>
            <RankBars fmt={m.fmt0} onPick={(f) => go('transactions', { pay: f })}
              rows={payRows.map((r) => ({ id: r.filter, value: r.value, note: `${pct(r.value, exp)}%`, label: <><span className="em pay-ic"><Icon name={payIcon(r.filter)} size={15} /></span>{r.filter === 'none' ? <span className="muted">{r.label}</span> : r.label}</> }))} />
          </Card>
        )}
        <Card title="Spending by category" sub={`Total over ${range} months`}>
          <RankBars fmt={m.fmt0} onPick={(id) => go('transactions', { cat: id })} rows={ranked.slice(0, 8).map(([id, v]) => ({ id, value: v, note: `${pct(v, exp)}%`, label: <><span className="em">{m.cat(id)?.icon ?? '📦'}</span>{m.cat(id)?.name ?? 'Other'}</> }))} />
        </Card>
        {subId && (
          <Card title="Inside a category" sub="Spending split by sub-category" action={<select className="mini-select" value={subId} onChange={(e) => setSubCat(e.target.value)} aria-label="Category">{withSubs.map(([id]) => <option key={id} value={id}>{m.cat(id)?.name ?? 'Other'}</option>)}</select>}>
            <RankBars fmt={m.fmt0} onPick={(id) => go('transactions', id ? { cat: subId, q: id } : { cat: subId })}
              rows={subRows.map(([name, v]) => ({ id: name, value: v, note: `${pct(v, subSum)}%`, label: name || <span className="muted">No sub-category</span> }))} />
            {subRows.length === 1 && !subRows[0][0] && <p className="hint pad">Pick a sub-category when adding {m.cat(subId)?.name.toLowerCase()} spending, or scan a receipt and save its items separately, to see the split here.</p>}
          </Card>
        )}
        <Card title="By day of the week" sub="Average spent per weekday">
          <ColumnChart labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} fmt={m.fmt0} fmtAxis={m.fmtc} height={200} series={[{ name: 'Average spent', color: 'var(--series-1)', values: wd.map((v) => Math.round(v / weeks)) }]} />
        </Card>
        <Card className="span2" title="Category trends" sub="Monthly spending per category; the latest month is highlighted">
          <div className="multiples">
            {ranked.slice(0, 6).map(([id]) => {
              const vals = sums.map((s) => s.cats.get(id) ?? 0);
              return (
                <div key={id} className="multi">
                  <div className="multi-head"><span><span className="em">{m.cat(id)?.icon ?? '📦'}</span>{m.cat(id)?.name ?? 'Other'}</span><b>{m.fmt0(vals[vals.length - 1])}</b></div>
                  <MiniBars values={vals} labels={labels} fmt={m.fmt0} />
                  <div className="multi-foot"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="span2" title="Largest expenses">
          <table className="table">
            <thead><tr><th>Date</th><th>What</th><th>Category</th><th className="r">Amount</th></tr></thead>
            <tbody>{biggest.map((t) => <tr key={t.id}><td>{dayLabel(t.date)}</td><td>{t.note || '—'}</td><td>{m.cat(t.cat)?.name ?? 'Other'}</td><td className="r">{m.fmt(t.amount)}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────── Accounts & recurring ─────────────────────────
const TYPE_LABEL = { bank: 'Bank account', savings: 'Savings', card: 'Credit card', cash: 'Cash', owed: 'Money friends owe you' } as const;
const TYPE_ICON = { bank: '🏦', savings: '🐖', card: '💳', cash: '💵', owed: '🤝' } as const;
export function Accounts({ m, open, go }: ViewProps) {
  return (
    <div className="page">
      <header className="page-head"><h1>Accounts</h1><button className="btn primary" onClick={() => open({ k: 'account' })}><Icon name="plus" size={16} />Account</button></header>
      <Card title="Balances" sub={`Total ${m.fmt(m.netWorth)}`}>
        <div className="tx-list flush">
          {m.accounts.map((a) => (
            <div key={a.id} className="tx static">
              <span className="tx-ic">{TYPE_ICON[a.type]}</span>
              <button className="tx-main as-btn" onClick={() => go('transactions', { acc: a.id })}><b>{a.name}</b><small>{TYPE_LABEL[a.type]} · view transactions</small></button>
              <span className="tx-amt">{m.fmt(m.balances.get(a.id) ?? 0)}</span>
              <button className="btn small" onClick={() => open({ k: 'account', acc: a })}>Edit</button>
            </div>
          ))}
        </div>
        {m.accounts.length > 1 && <button className="btn pad" onClick={() => open({ k: 'tx', preset: { type: 'transfer' } })}>Transfer between accounts</button>}
      </Card>
      {m.owed.size > 0 && (
        <Card title="Owed to me" sub={`From split bills you paid · ${m.fmt([...m.owed.values()].reduce((a, b) => a + b, 0))} in total`}>
          <div className="tx-list flush">
            {[...m.owed].sort((a, b) => b[1] - a[1]).map(([who, amt]) => (
              <div key={who} className="tx static">
                <span className="tx-ic avatar-ic">{who.slice(0, 1).toUpperCase()}</span>
                <button className="tx-main as-btn" onClick={() => go('transactions', { acc: 'acc_owed', q: who })}><b>{who}</b><small>{amt > 0 ? 'owes you' : 'you owe back'} · view history</small></button>
                <span className="tx-amt">{m.fmt(Math.abs(amt))}</span>
                {amt > 0 && <button className="btn small" onClick={() => open({ k: 'settle', who, amount: amt })}>Settle</button>}
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card title="Recurring" sub="Bills, subscriptions and paychecks that enter themselves" action={<button className="btn small" onClick={() => open({ k: 'recurring' })}><Icon name="plus" size={14} />Add</button>}>
        {m.recurring.length ? (
          <div className="tx-list flush">
            {m.recurring.map((r) => (
              <button key={r.id} className="tx" onClick={() => open({ k: 'recurring', rec: r })}>
                <span className="tx-ic">{m.cat(r.cat)?.icon ?? '🔁'}</span>
                <span className="tx-main"><b>{r.name}</b><small>Next {dayLabel(r.next)} · {r.freq} · {m.acc(r.acc)?.name}</small></span>
                <span className={`tx-amt ${r.type}`}>{r.type === 'expense' ? '−' : '+'}{m.fmt(r.amount)}</span>
              </button>
            ))}
          </div>
        ) : <p className="muted">Nothing recurring yet.</p>}
      </Card>
    </div>
  );
}
