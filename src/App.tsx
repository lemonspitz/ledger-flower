import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import QRCode from 'qrcode';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { NUM_FORMATS, curMonth, moneyFormatter, useModel, type Model } from './calc';
import { buildWorkbook, csvName, toTidyCsv, xlsxName } from './export';
import { createPortal } from 'react-dom';
import { ImportDialog } from './ImportDialog';
import { readFile, type Sheet } from './importer';
import { demoData } from './demo';
import { Dialogs, type Dialog } from './forms';
import { flushSave, getData, replaceAll, put, runRecurring, type Data, type Settings, type NumFmt } from './store';
import { DEFAULT_RELAYS, loadPrefs, newSyncCode, normalizeCode, savePrefs, sync, type LocalPrefs } from './sync';
import { Card, Field, Icon, Seg } from './ui';
import { Backdrop, FlowerArt, artVars, swatchBg } from './themes';
import { FLOWERS, flowerById, resolveFlower } from './flowers';
import { LockCard, LockScreen, useAppLock } from './lock';
import { checkBudgetAlerts, onReminderTap, scheduleReminders } from './reminders';
import { ReminderCard } from './ReminderCard';
import { onAddLink, pushWidget } from './widget';
import { LANGS, catLabel, detectLanguage, getLang, getLocale, setLanguage, t, tp, tr } from './i18n';
import { Accounts, Budgets, Dashboard, Goals, Insights, NO_FILTER, Transactions, type TxFilter, type ViewProps } from './views';

const NAV_RAW: [string, string, string][] = [
  ['overview', 'Overview', 'home'], ['transactions', 'Transactions', 'list'], ['budgets', 'Budgets', 'target'],
  ['insights', 'Insights', 'chart'], ['goals', 'Goals', 'flag'], ['accounts', 'Accounts', 'wallet'], ['settings', 'Settings', 'gear'],
];
const nav = () => NAV_RAW.map(([id, label, icon]) => [id, t(label), icon] as [string, string, string]);
declare const __APP_VERSION__: string;
const APP_VERSION = __APP_VERSION__;
const AUTHOR = 'lemonspitz';
const AUTHOR_URL = 'https://github.com/lemonspitz';
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'ZAR', 'NGN', 'KES', 'AED', 'SAR', 'TRY', 'KRW', 'SGD', 'HKD', 'NZD', 'PHP', 'IDR', 'THB', 'VND', 'EGP', 'PKR', 'BDT'];

function useSync() { return useSyncExternalStore(sync.subscribe, sync.getStatus); }

async function download(name: string, content: string | Uint8Array, type: string) {
  if (Capacitor.isNativePlatform()) {
    // Android has no "save file" for web downloads: write it out and open the share sheet.
    const { uri } = typeof content === 'string'
      ? await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 })
      : await Filesystem.writeFile({ path: name, data: toBase64(content), directory: Directory.Cache });
    await Share.share({ title: name, url: uri });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content as BlobPart], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function toBase64(u: Uint8Array) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }

/** Builds the Excel report. The spreadsheet library is loaded only now, so it doesn't slow down opening the app. */
async function exportExcel(m: Model, flowerId: string) {
  const { default: ExcelJS } = await import('exceljs');
  const file = await buildWorkbook(ExcelJS, m, flowerById(flowerId));
  await download(xlsxName(), file, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function SyncBadge({ onClick }: { onClick: () => void }) {
  const s = useSync();
  const open = s.relays.filter((r) => r.state === 'open' && !r.pausedUntil).length;
  const [label, cls] = !s.on ? [t('Sync off'), 'off'] : open && s.initial && !s.pending ? [t('Synced'), 'live'] : open ? [t('Syncing…'), 'busy'] : [t('Offline — will sync later'), 'down'];
  return <button className={`sync-badge ${cls}`} onClick={onClick} title={t('Sync settings')}><i />{label}</button>;
}

export default function App() {
  const m = useModel();
  const [view, setView] = useState('overview');
  const [month, setMonth] = useState(curMonth());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [filter, setFilter] = useState<TxFilter>(NO_FILTER);
  const [prefs, setPrefsState] = useState<LocalPrefs>(loadPrefs);
  const setPrefs = useCallback((p: LocalPrefs) => { savePrefs(p); setPrefsState(p); }, []);

  const plant = resolveFlower(prefs.plant);
  // Language: switch when the setting changes, then redraw everything in it.
  const [, setLangTick] = useState(0);
  useEffect(() => {
    const want = !prefs.lang || prefs.lang === 'auto' ? detectLanguage() : prefs.lang;
    if (want !== getLang()) void setLanguage(want).then(() => setLangTick((n) => n + 1));
  }, [prefs.lang]);
  useEffect(() => {
    const r = document.documentElement;
    if (prefs.theme === 'auto') delete r.dataset.theme; else r.dataset.theme = prefs.theme;
    r.dataset.plant = plant;
  }, [prefs.theme, plant]);
  // Phone status bar (clock, battery): light text on the dark theme, dark text on the light one.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && mq.matches);
      void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [prefs.theme]);
  useEffect(() => {
    if (prefs.code) void sync.start(prefs.code, prefs.relays); else sync.stop();
  }, [prefs.code, prefs.relays]);
  useEffect(() => {
    runRecurring();
    const t = setInterval(runRecurring, 60 * 60 * 1000);
    const save = () => flushSave();
    window.addEventListener('pagehide', save);
    return () => { clearInterval(t); window.removeEventListener('pagehide', save); };
  }, []);
  // Reminders: reschedule when bills or settings change; budget alerts whenever spending changes.
  const billKey = m.recurring.map((r) => r.id + r.next + r.amount + r.name).join() + JSON.stringify(prefs.remind) + getLang();
  useEffect(() => { void scheduleReminders(m, prefs.remind); }, [billKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void checkBudgetAlerts(m, prefs.remind); }, [m, prefs.remind]);
  useEffect(() => onReminderTap(() => setDialog({ k: 'tx' })), []);
  // Home-screen widget (Android): keep its numbers current, and let its + button open Add transaction.
  useEffect(() => { const id = setTimeout(() => pushWidget(m), 400); return () => clearTimeout(id); }, [m, prefs.lang]);
  useEffect(() => onAddLink(() => setDialog({ k: 'tx' })), []);
  // Recurring items that arrive from another device may already be due here.
  const recKey = m.recurring.map((r) => r.id + r.next).join();
  useEffect(() => { runRecurring(); }, [recKey]);

  const { locked, unlock, hidden } = useAppLock(prefs.lock);
  const eraseDevice = () => { try { localStorage.removeItem('ll.data.v1'); localStorage.removeItem('ll.local.v1'); } catch { /* ignore */ } location.reload(); };

  const go = useCallback((v: string, f?: Partial<TxFilter>) => { if (f) setFilter({ ...NO_FILTER, ...f }); setView(v); window.scrollTo(0, 0); document.querySelector('main')?.scrollTo(0, 0); }, []);
  const props: ViewProps = { m, month, setMonth, open: setDialog, go };
  const [sheet, setSheet] = useState(false);
  // One-time hint so people discover the pull-up menu; gone for good once it has been opened.
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem('ll.pullHintSeen'); } catch { return false; } });
  useEffect(() => { if (sheet && hint) { setHint(false); try { localStorage.setItem('ll.pullHintSeen', '1'); } catch { /* storage unavailable */ } } }, [sheet, hint]);
  // Pull-up dock: how far (px) the menu is being dragged up from the dock, or null when not dragging.
  const [pull, setPull] = useState<number | null>(null);
  const suppressClick = useRef(false);
  const PULL_OPEN = 90;
  // Once a press starts on the dock, follow that finger anywhere on screen (a quick swipe leaves the dock immediately).
  const dockDown = (e: React.PointerEvent) => {
    if (sheet) return;
    const id = e.pointerId, y0 = e.clientY;
    let moved = false, dy = 0;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      dy = Math.max(0, y0 - ev.clientY);
      if (!moved && dy > 8) moved = true;
      if (moved) { ev.preventDefault(); setPull(dy); }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moved) return;
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 50);
      if (dy > PULL_OPEN && ev.type === 'pointerup') { setSheet(true); setPull(null); }
      else { setPull(0); setTimeout(() => setPull(null), 200); }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  if (locked && prefs.lock) return <><Backdrop flower={plant} /><LockScreen lock={prefs.lock} flower={plant} onUnlock={unlock} onErase={eraseDevice} /></>;

  return (
    <>
    <Backdrop flower={plant} />
    <div className={`app${hidden && prefs.lock ? ' privacy' : ''}`}>
      <aside className="side">
        <div className="brand"><img className="logo" src="./icon.svg" alt="" width={26} height={26} />Ledger Flower</div>
        <nav>{nav().map(([id, label, icon]) => <button key={id} className={view === id ? 'on' : ''} onClick={() => go(id)}><Icon name={icon} />{label}</button>)}</nav>
        <button className="btn primary add" onClick={() => setDialog({ k: 'tx' })}><Icon name="plus" size={16} />{t('Add transaction')}</button>
        <SyncBadge onClick={() => go('settings')} />
        <p className="credit side-credit">{t('Made by')} <a href={AUTHOR_URL} target="_blank" rel="noreferrer">{AUTHOR}</a></p>
      </aside>
      <main>
        <div className="mobile-top"><div className="brand"><img className="logo" src="./icon.svg" alt="" width={26} height={26} />Ledger Flower</div><SyncBadge onClick={() => go('settings')} /></div>
        {view === 'overview' && <Dashboard {...props} />}
        {view === 'transactions' && <Transactions {...props} filter={filter} setFilter={setFilter} />}
        {view === 'budgets' && <Budgets {...props} />}
        {view === 'insights' && <Insights {...props} />}
        {view === 'goals' && <Goals {...props} />}
        {view === 'accounts' && <Accounts {...props} />}
        {view === 'settings' && <SettingsView m={m} prefs={prefs} setPrefs={setPrefs} open={setDialog} />}
      </main>
      <nav className="tabs" onPointerDown={dockDown}
        onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); } }}>
        {nav().slice(0, 2).map(([id, label, icon]) => <button key={id} className={view === id ? 'on' : ''} onClick={() => go(id)}><Icon name={icon} />{label}</button>)}
        <button className="fab" onClick={() => setDialog({ k: 'tx' })} aria-label={t('Add transaction')}><Icon name="plus" size={26} /></button>
        {nav().slice(2, 4).map(([id, label, icon]) => <button key={id} className={view === id ? 'on' : ''} onClick={() => go(id)}><Icon name={icon} />{label}</button>)}
        <button className="sr-only" onClick={() => setSheet(!sheet)} aria-expanded={sheet} aria-haspopup="menu">{t('All sections')}</button>
        {hint && <span className="dock-hint" aria-hidden><Icon name="up" size={13} />{t('Drag up for more')}</span>}
      </nav>
      {(sheet || pull !== null) && <MoreSheet key="menu" view={view} pull={sheet ? undefined : pull ?? 0} animateIn={pull === null && sheet}
        onPick={(id) => { setSheet(false); setPull(null); go(id); }} onClose={() => { setSheet(false); setPull(null); }} />}
      {dialog && <Dialogs d={dialog} m={m} close={() => setDialog(null)} />}
    </div>
    </>
  );
}

function MoreSheet({ view, onPick, onClose, pull, animateIn }: { view: string; onPick: (id: string) => void; onClose: () => void; pull?: number; animateIn: boolean }) {
  const [closing, setClosing] = useState(false);
  const [slideIn] = useState(animateIn);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const close = useCallback(() => { setClosing(true); setTimeout(onClose, 180); }, [onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close]);
  return (
    <div className={`sheet-scrim${closing ? ' closing' : ''}${slideIn ? '' : ' no-anim'}`} onClick={close} style={pull !== undefined ? { background: `rgba(0,0,0,${Math.min(0.4, pull / 600)})` } : undefined}>
      <div className="sheet" role="menu" aria-label={t('All sections')} onClick={(e) => e.stopPropagation()}
        style={pull !== undefined ? { transform: `translateY(max(0px, calc(100% - ${pull + 70}px)))`, transition: pull === 0 ? undefined : 'none' } : drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
        onTouchMove={(e) => { if (startY.current !== null) setDrag(Math.max(0, e.touches[0].clientY - startY.current)); }}
        onTouchEnd={() => { if (drag > 70) close(); setDrag(0); startY.current = null; }}>
        <div className="sheet-handle" />
        <div className="sheet-grid">
          {nav().map(([id, label, icon]) => (
            <button key={id} role="menuitem" className={view === id ? 'on' : ''} onClick={() => onPick(id)}><span className="sheet-ic"><Icon name={icon} /></span>{label}</button>
          ))}
        </div>
        <p className="credit">{t('Made by')} <a href={AUTHOR_URL} target="_blank" rel="noreferrer">{AUTHOR}</a></p>
      </div>
    </div>
  );
}

function SettingsView({ m, prefs, setPrefs, open }: { m: Model; prefs: LocalPrefs; setPrefs: (p: LocalPrefs) => void; open: (d: Dialog) => void }) {
  const plant = resolveFlower(prefs.plant);
  const [busy, setBusy] = useState(false);
  // Keep the other preferences in the record when changing one of them.
  const saveSettings = (patch: Partial<Settings>) => put('settings', { ...(m.data.settings.settings as Settings | undefined), id: 'settings', currency: m.currency, ...patch } as Settings);
  const [confirm, setConfirm] = useState<'demo' | 'erase' | null>(null);
  const [importing, setImporting] = useState<{ file: string; sheets: Sheet[] } | null>(null);
  const startImport = (file: File) => {
    setBusy(true);
    void readFile(file).then((sheets) => {
      if (!sheets.some((s) => s.rows.length > 1)) throw new Error(t('no table in it'));
      setImporting({ file: file.name, sheets });
    }).catch((e) => alert(t('That file couldn’t be read ({reason}).', { reason: (e as Error).message }))).finally(() => setBusy(false));
  };
  const restore = (file: File) => file.text().then((t) => {
    const d = JSON.parse(t) as Partial<Data>;
    if (!d || typeof d !== 'object' || !d.tx || !d.accounts) throw new Error('not a backup');
    replaceAll(d);
  }).catch(() => alert(t('That file is not a Ledger Flower backup.')));
  return (
    <div className="page narrow">
      <header className="page-head"><h1>{t('Settings')}</h1></header>
      <SyncCard prefs={prefs} setPrefs={setPrefs} />
      <LockCard prefs={prefs} setPrefs={setPrefs} />
      <ReminderCard m={m} prefs={prefs} setPrefs={setPrefs} />
      <Card title={t('Preferences')}>
        <div className="form">
          <div className="row2">
            <Field label={t('Language')} hint={t('Only on this device.')}>
              <select value={prefs.lang ?? 'auto'} onChange={(e) => setPrefs({ ...prefs, lang: e.target.value })} aria-label={t('Language')}>
                <option value="auto">{t('Automatic')} — {LANGS.find((x) => x.code === detectLanguage())?.name}</option>
                {LANGS.map((x) => <option key={x.code} value={x.code}>{x.name}{x.name !== x.english ? ` · ${x.english}` : ''}</option>)}
              </select>
            </Field>
            <Field label={t('Currency')} hint={t('Shared with your other devices.')}>
              <select value={m.currency} onChange={(e) => saveSettings({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            </div>
          <div className="row2">
            <Field label={t('Appearance')} hint={t('Only on this device.')}>
              <Seg value={prefs.theme} onChange={(theme) => setPrefs({ ...prefs, theme })} options={[['auto', t('System')], ['light', t('Light')], ['dark', t('Dark')]]} />
            </Field>
            </div>
          <div className="row2">
            <Field label={t('Number format')} hint={t('How amounts are shown and how typed amounts are read. Shared with your other devices.')}>
              <select value={m.numFmt} onChange={(e) => saveSettings({ numFmt: e.target.value as NumFmt })} aria-label={t('Number format')}>
                {(Object.keys(NUM_FORMATS) as NumFmt[]).map((k) => (
                  <option key={k} value={k}>{(k === 'auto' ? t('Same as this device') + ' — ' : '') + moneyFormatter(m.currency, k, m.decimals).format(1234567.89)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('Decimals')} hint={m.decimals === 'auto' ? t('Automatic: {x} for {cur}.', { x: moneyFormatter(m.currency, m.numFmt, 'auto').format(1000), cur: m.currency }) : undefined}>
              <Seg value={m.decimals} onChange={(decimals) => saveSettings({ decimals })} options={[['auto', t('Automatic')], ['show', t('Always')], ['hide', t('Never')]]} />
            </Field>
          </div>
          <div className="field">
            <span>{t('Flower theme')}</span>
            <div className="themes-scroll" role="radiogroup" aria-label={t('Flower theme')}>
            {([[t('Flowers of Indonesia'), FLOWERS.filter((f) => f.region === 'id')], [t('Flowers of the world'), FLOWERS.filter((f) => f.region !== 'id')]] as const).map(([group, list]) => (
            <div key={group}>
            <b className="theme-group">{group} <small>{list.length}</small></b>
            <div className="themes">
              {list.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={plant === f.id} className={`theme-opt${plant === f.id ? ' on' : ''}`} onClick={() => setPrefs({ ...prefs, plant: f.id })} style={artVars(f)}>
                  <span className="theme-swatch" style={{ background: swatchBg(f) }}>
                    <FlowerArt flower={f.id} />
                    <i style={{ background: f.accent[0] }} />
                  </span>
                  <b>{t(f.name)}</b>
                  <small>{t(f.blurb)}</small>
                  {plant === f.id && <span className="check"><Icon name="check" size={14} /></span>}
                </button>
              ))}
            </div>
            </div>
            ))}
            </div>
            <small>{t('Only on this device.')}</small>
          </div>
          <FlowerInfo id={plant} />
        </div>
      </Card>
      <Card title={t('Payment methods')} sub={t('Cards and QR banks or apps you pay with. Pick one when adding an expense.')}
        action={<button className="btn small" onClick={() => open({ k: 'method' })}><Icon name="plus" size={14} />{t('Add')}</button>}>
        {m.methods.length ? (
          <div className="tx-list flush">
            {m.methods.map((x) => (
              <button key={x.id} className="tx" onClick={() => open({ k: 'method', method: x })}>
                <span className="tx-ic"><Icon name={x.kind} size={18} /></span>
                <span className="tx-main"><b>{m.methodName(x)}</b><small>{x.kind === 'card' ? `${t('Card')}${x.network ? ` · ${x.network}` : ''}` : t('QR bank / app')}{m.acc(x.acc) ? ` · ${t('from {acc}', { acc: m.acc(x.acc)!.name })}` : ''}</small></span>
                <Icon name="right" size={16} />
              </button>
            ))}
          </div>
        ) : (
          <div className="btn-row">
            <button className="btn" onClick={() => open({ k: 'method', kind: 'card' })}><Icon name="card" size={16} />{t('Add a card')}</button>
            <button className="btn" onClick={() => open({ k: 'method', kind: 'qr' })}><Icon name="qr" size={16} />{t('Add a QR bank / app')}</button>
          </div>
        )}
      </Card>
      <Card title={t('Categories')} action={<button className="btn small" onClick={() => open({ k: 'category' })}><Icon name="plus" size={14} />{t('Add')}</button>}>
        <div className="chips">{m.categories.map((c) => <button key={c.id} className="chip" onClick={() => open({ k: 'category', cat: c })}><span>{c.icon}</span>{catLabel(c)}{c.kind === 'income' && <small>{t('income')}</small>}</button>)}</div>
      </Card>
      <Card title={t('Your data')} sub={t('Everything is stored on this device, and on your other devices if sync is on. The Excel report has an overview with charts in your flower theme’s colours, plus tidy tables of every transaction, month, category and account; the CSV is the transactions table as plain text.')}>
        <div className="btn-row">
          <button className="btn primary" disabled={busy} onClick={() => { setBusy(true); void exportExcel(m, plant).catch((e) => alert(t('Could not create the Excel report: {reason}', { reason: (e as Error).message }))).finally(() => setBusy(false)); }}>{busy ? t('Preparing…') : t('Export Excel report')}</button>
          <button className="btn" onClick={() => void download(csvName(), toTidyCsv(m), 'text/csv')}>{t('Export CSV')}</button>
          <button className="btn" onClick={() => void download(`ledger-flower-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(getData()), 'application/json')}>{t('Download backup')}</button>
          <label className="btn">{t('Import from another app or spreadsheet')}<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,.numbers,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) startImport(f); e.target.value = ''; }} /></label>
          <label className="btn">{t('Restore backup')}<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ''; }} /></label>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => setConfirm('demo')}>{t('Load sample data')}</button>
          <button className="btn danger ghost" onClick={() => setConfirm('erase')}>{t('Erase everything')}</button>
        </div>
        {importing && createPortal(<ImportDialog m={m} file={importing.file} sheets={importing.sheets} close={() => setImporting(null)} />, document.body)}
        {confirm && (
          <div className="confirm">
            <p>{confirm === 'demo' ? (prefs.code ? t('This replaces all current data with a year of sample data — on every synced device.') : t('This replaces all current data with a year of sample data.')) : (prefs.code ? t('This permanently deletes all transactions, budgets, goals and accounts — on every synced device.') : t('This permanently deletes all transactions, budgets, goals and accounts.'))}</p>
            <button className="btn ghost" onClick={() => setConfirm(null)}>{t('Cancel')}</button>
            <button className="btn danger" onClick={() => { replaceAll(confirm === 'demo' ? demoData() : null); setConfirm(null); }}>{confirm === 'demo' ? t('Replace my data') : t('Erase')}</button>
          </div>
        )}
      </Card>
      <Card title={t('About')}>
        <div className="about">
          <img src="./icon.svg" alt="" width={56} height={56} />
          <div>
            <b>Ledger Flower {APP_VERSION}</b>
            <p>{t('Created by')} <a href={AUTHOR_URL} target="_blank" rel="noreferrer">{AUTHOR}</a></p>
            <small className="muted">{t('Your data stays on your devices')} · © {new Date().getFullYear()} {AUTHOR}</small>
          </div>
        </div>
      </Card>
    </div>
  );
}

function FlowerInfo({ id }: { id: string }) {
  const f = flowerById(id);
  return (
    <section className="flower-info" aria-label={t(f.name)}>
      <div className="flower-hero" style={{ ...artVars(f), background: swatchBg(f) }}><FlowerArt flower={f.id} /></div>
      <div className="flower-text">
        <small className="eyebrow">{t('About your flower')}{f.region === 'id' ? ` · ${t('native to Indonesia')}` : ''}</small>
        <h3>{t(f.name)}</h3>
        <p className="latin"><i>{f.latin}</i> · {t(f.family)}</p>
        <dl>
          {f.local && <><dt>{t('Indonesian name')}</dt><dd>{f.local}</dd></>}
          <dt>{t('Origin')}</dt><dd>{t(f.origin)}</dd>
          <dt>{t('Where to find it')}</dt><dd>{t(f.where)}</dd>
          <dt>{t('In bloom')}</dt><dd>{t(f.season)}</dd>
          <dt>{t('Meaning')}</dt><dd>{t(f.meaning)}</dd>
        </dl>
        <b className="facts-title">{t('Did you know?')}</b>
        <ul className="facts">{f.facts.map((x) => <li key={x}>{t(x)}</li>)}</ul>
      </div>
    </section>
  );
}

function SyncCard({ prefs, setPrefs }: { prefs: LocalPrefs; setPrefs: (p: LocalPrefs) => void }) {
  const s = useSync();
  const [join, setJoin] = useState('');
  const [qr, setQr] = useState('');
  const [show, setShow] = useState(false);
  const [adv, setAdv] = useState(false);
  const [relayText, setRelayText] = useState(prefs.relays.join('\n'));
  const code = normalizeCode(join);
  useEffect(() => { if (prefs.code && show) void QRCode.toDataURL(prefs.code, { margin: 1, width: 180 }).then(setQr); }, [prefs.code, show]);
  const saveRelays = () => {
    const list = relayText.split(/\s+/).map((x) => x.trim()).filter((x) => /^wss?:\/\/.+/.test(x));
    setPrefs({ ...prefs, relays: list.length ? list : DEFAULT_RELAYS });
    setRelayText((list.length ? list : DEFAULT_RELAYS).join('\n'));
  };
  const open = s.relays.filter((r) => r.state === 'open' && !r.pausedUntil).length;
  const paused = s.relays.filter((r) => r.state === 'open' && r.pausedUntil);
  const resume = paused.length ? new Date(Math.min(...paused.map((r) => r.pausedUntil!))).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' }) : '';
  const headline = !open ? t('Can’t reach a sync server right now') : !s.initial ? t('Connecting and catching up…') : s.pending ? tp(s.pending, 'Sending your data… {n} part left', 'Sending your data… {n} parts left') : t('Sync is on and up to date');
  const detail = !open ? (paused.length ? t('The servers are busy — retrying at {time}. Changes are saved here meanwhile.', { time: resume }) : t('Changes are saved here and will sync when you’re back online.'))
    : [t('{a} of {b} servers connected', { a: open, b: s.relays.length }), paused.length ? t('{n} busy, retrying at {time}', { n: paused.length, time: resume }) : '', s.lastSync ? t('last change {time}', { time: new Date(s.lastSync).toLocaleTimeString(getLocale()) }) : ''].filter(Boolean).join(' · ');
  return (
    <Card title={t('Sync across devices')} sub={prefs.code ? undefined : t('Keep your phone and computers up to date with each other, instantly and end-to-end encrypted. No account needed.')}>
      {prefs.code ? (
        <div className="sync-on">
          <div className={`sync-state ${open ? 'live' : 'down'}`}>
            <Icon name={open ? 'check' : 'warn'} size={18} />
            <div>
              <b>{headline}</b>
              <small>{detail}</small>
            </div>
          </div>
          {open > 0 && s.initial && !s.received && !s.pending && (
            <div className="sync-alone">
              <b>{t('Nothing has come in from another device yet')}</b>
              <p>{tr('Your code starts with {code}. Check that your other device shows the same code (Settings → Sync → Show sync code) and has Ledger Flower open with sync on.', { code: <code>{prefs.code.slice(0, 4)}</code> })}</p>
              <p>{t('If the codes differ, “Turn on sync” was pressed on both. Here, tap “Stop syncing this device”, then use Join with the code from the device that has your data. Nothing on this device is lost.')}</p>
            </div>
          )}
          <p className="hint">{t('To add a device, install Ledger Flower on it, open Settings → Sync and enter this code. Anyone with the code can read your budget, so share it only with your own devices.')}</p>
          {show ? (
            <div className="code-box">
              {qr && <img src={qr} alt={t('Sync code as QR')} width={140} height={140} />}
              <div><code>{prefs.code}</code><div className="btn-row"><button className="btn small" onClick={() => void navigator.clipboard?.writeText(prefs.code!)}>{t('Copy')}</button><button className="btn small" onClick={() => setShow(false)}>{t('Hide')}</button></div></div>
            </div>
          ) : <button className="btn" onClick={() => setShow(true)}>{t('Show sync code')}</button>}
          <div className="btn-row">
            <button className="link" onClick={() => setAdv(!adv)}>{adv ? t('Hide servers') : t('Show servers')}</button>
            <button className="link danger" onClick={() => setPrefs({ ...prefs, code: undefined })}>{t('Stop syncing this device')}</button>
          </div>
        </div>
      ) : (
        <div className="sync-off">
          <div className="sync-opt">
            <b>{t('First device')}</b>
            <p>{t('Create a sync code, then enter it on your other devices.')}</p>
            <button className="btn primary" onClick={() => { setPrefs({ ...prefs, code: newSyncCode() }); setShow(true); }}><Icon name="sync" size={16} />{t('Turn on sync')}</button>
          </div>
          <div className="sync-opt">
            <b>{t('Already syncing elsewhere?')}</b>
            <p>{t('Enter the code shown on your other device.')}</p>
            <form className="join" onSubmit={(e) => { e.preventDefault(); if (code) { setPrefs({ ...prefs, code }); setJoin(''); } }}>
              <input value={join} onChange={(e) => setJoin(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" aria-label={t('Sync code')} autoCapitalize="characters" spellCheck={false} />
              <button className="btn" disabled={!code}>{t('Join')}</button>
            </form>
            <button className="link" onClick={() => setAdv(!adv)}>{adv ? t('Hide servers') : t('Show servers')}</button>
          </div>
        </div>
      )}
      {adv && (
        <div className="relays">
          {s.relays.map((r) => <div key={r.url} className="relay"><i className={r.pausedUntil ? 'busy' : r.state} />{r.url}<small>{r.pausedUntil ? t('busy, retrying at {time}', { time: new Date(r.pausedUntil).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' }) }) : r.state === 'open' ? t('connected') : r.state === 'connecting' ? t('connecting') : t('disconnected')}{r.error ? ` · ${r.error}` : ''}</small></div>)}
          <Field label={t('Sync servers (one per line)')} hint={t('Encrypted copies are relayed through these servers. Use the same list on every device. You can run your own with the included server/relay.mjs.')}>
            <textarea rows={3} value={relayText} onChange={(e) => setRelayText(e.target.value)} spellCheck={false} />
          </Field>
          <div className="btn-row"><button className="btn small" onClick={saveRelays}>{t('Save servers')}</button><button className="btn small ghost" onClick={() => { setRelayText(DEFAULT_RELAYS.join('\n')); setPrefs({ ...prefs, relays: DEFAULT_RELAYS }); }}>{t('Reset to default')}</button></div>
        </div>
      )}
    </Card>
  );
}
