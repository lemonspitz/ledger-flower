import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import QRCode from 'qrcode';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { curMonth, toCsv, useModel, type Model } from './calc';
import { demoData } from './demo';
import { Dialogs, type Dialog } from './forms';
import { flushSave, getData, replaceAll, put, runRecurring, type Data } from './store';
import { DEFAULT_RELAYS, loadPrefs, newSyncCode, normalizeCode, savePrefs, sync, type LocalPrefs } from './sync';
import { Card, Field, Icon, Seg } from './ui';
import { Accounts, Budgets, Dashboard, Goals, Insights, NO_FILTER, Transactions, type TxFilter, type ViewProps } from './views';

const NAV: [string, string, string][] = [
  ['overview', 'Overview', 'home'], ['transactions', 'Transactions', 'list'], ['budgets', 'Budgets', 'target'],
  ['insights', 'Insights', 'chart'], ['goals', 'Goals', 'flag'], ['accounts', 'Accounts', 'wallet'], ['settings', 'Settings', 'gear'],
];
declare const __APP_VERSION__: string;
const APP_VERSION = __APP_VERSION__;
const AUTHOR = 'lemonspitz';
const AUTHOR_URL = 'https://github.com/lemonspitz';
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'ZAR', 'NGN', 'KES', 'AED', 'SAR', 'TRY', 'KRW', 'SGD', 'HKD', 'NZD', 'PHP', 'IDR', 'THB', 'VND', 'EGP', 'PKR', 'BDT'];

function useSync() { return useSyncExternalStore(sync.subscribe, sync.getStatus); }

async function download(name: string, text: string, type: string) {
  if (Capacitor.isNativePlatform()) {
    // Android has no "save file" for web downloads: write it out and open the share sheet.
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, url: uri });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function SyncBadge({ onClick }: { onClick: () => void }) {
  const s = useSync();
  const open = s.relays.filter((r) => r.state === 'open').length;
  const [label, cls] = !s.on ? ['Sync off', 'off'] : open && s.initial ? ['Synced', 'live'] : open ? ['Syncing…', 'busy'] : ['Offline — will sync later', 'down'];
  return <button className={`sync-badge ${cls}`} onClick={onClick} title="Sync settings"><i />{label}</button>;
}

export default function App() {
  const m = useModel();
  const [view, setView] = useState('overview');
  const [month, setMonth] = useState(curMonth());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [filter, setFilter] = useState<TxFilter>(NO_FILTER);
  const [prefs, setPrefsState] = useState<LocalPrefs>(loadPrefs);
  const setPrefs = useCallback((p: LocalPrefs) => { savePrefs(p); setPrefsState(p); }, []);

  useEffect(() => { document.documentElement.dataset.theme = prefs.theme === 'auto' ? '' : prefs.theme; }, [prefs.theme]);
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
  // Recurring items that arrive from another device may already be due here.
  const recKey = m.recurring.map((r) => r.id + r.next).join();
  useEffect(() => { runRecurring(); }, [recKey]);

  const go = useCallback((v: string, f?: Partial<TxFilter>) => { if (f) setFilter({ ...NO_FILTER, ...f }); setView(v); window.scrollTo(0, 0); document.querySelector('main')?.scrollTo(0, 0); }, []);
  const props: ViewProps = { m, month, setMonth, open: setDialog, go };
  const mobileMore = ['goals', 'accounts', 'settings'].includes(view);
  const [sheet, setSheet] = useState(false);

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><img className="logo" src="./icon.svg" alt="" width={26} height={26} />Ledgerleaf</div>
        <nav>{NAV.map(([id, label, icon]) => <button key={id} className={view === id ? 'on' : ''} onClick={() => go(id)}><Icon name={icon} />{label}</button>)}</nav>
        <button className="btn primary add" onClick={() => setDialog({ k: 'tx' })}><Icon name="plus" size={16} />Add transaction</button>
        <SyncBadge onClick={() => go('settings')} />
        <p className="credit side-credit">Made by <a href={AUTHOR_URL} target="_blank" rel="noreferrer">{AUTHOR}</a></p>
      </aside>
      <main>
        <div className="mobile-top"><div className="brand"><img className="logo" src="./icon.svg" alt="" width={26} height={26} />Ledgerleaf</div><SyncBadge onClick={() => go('settings')} /></div>
        {view === 'overview' && <Dashboard {...props} />}
        {view === 'transactions' && <Transactions {...props} filter={filter} setFilter={setFilter} />}
        {view === 'budgets' && <Budgets {...props} />}
        {view === 'insights' && <Insights {...props} />}
        {view === 'goals' && <Goals {...props} />}
        {view === 'accounts' && <Accounts {...props} />}
        {view === 'settings' && <SettingsView m={m} prefs={prefs} setPrefs={setPrefs} open={setDialog} />}
      </main>
      <nav className="tabs">
        {NAV.slice(0, 2).map(([id, label, icon]) => <button key={id} className={view === id ? 'on' : ''} onClick={() => go(id)}><Icon name={icon} />{label}</button>)}
        <button className="fab" onClick={() => setDialog({ k: 'tx' })} aria-label="Add transaction"><Icon name="plus" size={26} /></button>
        {NAV.slice(2, 4).map(([id, label, icon]) => <button key={id} className={view === id ? 'on' : ''} onClick={() => go(id)}><Icon name={icon} />{label}</button>)}
        <button className={mobileMore || sheet ? 'on' : ''} onClick={() => setSheet(!sheet)} aria-expanded={sheet} aria-haspopup="menu"><Icon name="more" />More</button>
      </nav>
      {sheet && <MoreSheet view={view} onPick={(id) => { setSheet(false); go(id); }} onClose={() => setSheet(false)} />}
      {dialog && <Dialogs d={dialog} m={m} close={() => setDialog(null)} />}
    </div>
  );
}

function MoreSheet({ view, onPick, onClose }: { view: string; onPick: (id: string) => void; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const close = useCallback(() => { setClosing(true); setTimeout(onClose, 180); }, [onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close]);
  return (
    <div className={`sheet-scrim${closing ? ' closing' : ''}`} onClick={close}>
      <div className="sheet" role="menu" aria-label="More" onClick={(e) => e.stopPropagation()} style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
        onTouchMove={(e) => { if (startY.current !== null) setDrag(Math.max(0, e.touches[0].clientY - startY.current)); }}
        onTouchEnd={() => { if (drag > 70) close(); setDrag(0); startY.current = null; }}>
        <div className="sheet-handle" />
        {NAV.slice(4).map(([id, label, icon]) => (
          <button key={id} role="menuitem" className={view === id ? 'on' : ''} onClick={() => onPick(id)}><span className="sheet-ic"><Icon name={icon} /></span>{label}<Icon name="right" size={16} /></button>
        ))}
        <p className="credit">Made by <a href={AUTHOR_URL} target="_blank" rel="noreferrer">{AUTHOR}</a></p>
      </div>
    </div>
  );
}

function SettingsView({ m, prefs, setPrefs, open }: { m: Model; prefs: LocalPrefs; setPrefs: (p: LocalPrefs) => void; open: (d: Dialog) => void }) {
  const [confirm, setConfirm] = useState<'demo' | 'erase' | null>(null);
  const restore = (file: File) => file.text().then((t) => {
    const d = JSON.parse(t) as Partial<Data>;
    if (!d || typeof d !== 'object' || !d.tx || !d.accounts) throw new Error('not a backup');
    replaceAll(d);
  }).catch(() => alert('That file is not a Ledgerleaf backup.'));
  return (
    <div className="page narrow">
      <header className="page-head"><h1>Settings</h1></header>
      <SyncCard prefs={prefs} setPrefs={setPrefs} />
      <Card title="Preferences">
        <div className="form">
          <div className="row2">
            <Field label="Currency" hint="Shared with your other devices.">
              <select value={m.currency} onChange={(e) => put('settings', { id: 'settings', currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label="Appearance" hint="Only on this device.">
              <Seg value={prefs.theme} onChange={(theme) => setPrefs({ ...prefs, theme })} options={[['auto', 'System'], ['light', 'Light'], ['dark', 'Dark']]} />
            </Field>
          </div>
        </div>
      </Card>
      <Card title="Categories" action={<button className="btn small" onClick={() => open({ k: 'category' })}><Icon name="plus" size={14} />Add</button>}>
        <div className="chips">{m.categories.map((c) => <button key={c.id} className="chip" onClick={() => open({ k: 'category', cat: c })}><span>{c.icon}</span>{c.name}{c.kind === 'income' && <small>income</small>}</button>)}</div>
      </Card>
      <Card title="Your data" sub="Everything is stored on this device, and on your other devices if sync is on.">
        <div className="btn-row">
          <button className="btn" onClick={() => void download(`ledgerleaf-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(m), 'text/csv')}>Export CSV</button>
          <button className="btn" onClick={() => void download(`ledgerleaf-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(getData()), 'application/json')}>Download backup</button>
          <label className="btn">Restore backup<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ''; }} /></label>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => setConfirm('demo')}>Load sample data</button>
          <button className="btn danger ghost" onClick={() => setConfirm('erase')}>Erase everything</button>
        </div>
        {confirm && (
          <div className="confirm">
            <p>{confirm === 'demo' ? 'This replaces all current data with a year of sample data' : 'This permanently deletes all transactions, budgets, goals and accounts'}{prefs.code ? ' — on every synced device.' : '.'}</p>
            <button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn danger" onClick={() => { replaceAll(confirm === 'demo' ? demoData() : null); setConfirm(null); }}>{confirm === 'demo' ? 'Replace my data' : 'Erase'}</button>
          </div>
        )}
      </Card>
      <Card title="About">
        <div className="about">
          <img src="./icon.svg" alt="" width={56} height={56} />
          <div>
            <b>Ledgerleaf {APP_VERSION}</b>
            <p>Created by <a href={AUTHOR_URL} target="_blank" rel="noreferrer">{AUTHOR}</a></p>
            <small className="muted">Your data stays on your devices · © {new Date().getFullYear()} {AUTHOR}</small>
          </div>
        </div>
      </Card>
    </div>
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
  const open = s.relays.filter((r) => r.state === 'open').length;
  return (
    <Card title="Sync across devices" sub={prefs.code ? undefined : 'Keep your phone and computers up to date with each other, instantly and end-to-end encrypted. No account needed.'}>
      {prefs.code ? (
        <div className="sync-on">
          <div className={`sync-state ${open ? 'live' : 'down'}`}>
            <Icon name={open ? 'check' : 'warn'} size={18} />
            <div>
              <b>{open ? (s.initial ? 'Sync is on and up to date' : 'Connecting and catching up…') : 'Can’t reach a sync server right now'}</b>
              <small>{open ? `${open} of ${s.relays.length} servers connected${s.lastSync ? ` · last change ${new Date(s.lastSync).toLocaleTimeString()}` : ''}` : 'Changes are saved here and will sync when you’re back online.'}</small>
            </div>
          </div>
          <p className="hint">To add a device, install Ledgerleaf on it, open Settings → Sync and enter this code. Anyone with the code can read your budget, so share it only with your own devices.</p>
          {show ? (
            <div className="code-box">
              {qr && <img src={qr} alt="Sync code as QR" width={140} height={140} />}
              <div><code>{prefs.code}</code><div className="btn-row"><button className="btn small" onClick={() => void navigator.clipboard?.writeText(prefs.code!)}>Copy</button><button className="btn small" onClick={() => setShow(false)}>Hide</button></div></div>
            </div>
          ) : <button className="btn" onClick={() => setShow(true)}>Show sync code</button>}
          <div className="btn-row">
            <button className="link" onClick={() => setAdv(!adv)}>{adv ? 'Hide' : 'Show'} servers</button>
            <button className="link danger" onClick={() => setPrefs({ ...prefs, code: undefined })}>Stop syncing this device</button>
          </div>
        </div>
      ) : (
        <div className="sync-off">
          <div className="sync-opt">
            <b>First device</b>
            <p>Create a sync code, then enter it on your other devices.</p>
            <button className="btn primary" onClick={() => { setPrefs({ ...prefs, code: newSyncCode() }); setShow(true); }}><Icon name="sync" size={16} />Turn on sync</button>
          </div>
          <div className="sync-opt">
            <b>Already syncing elsewhere?</b>
            <p>Enter the code shown on your other device.</p>
            <form className="join" onSubmit={(e) => { e.preventDefault(); if (code) { setPrefs({ ...prefs, code }); setJoin(''); } }}>
              <input value={join} onChange={(e) => setJoin(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" aria-label="Sync code" autoCapitalize="characters" spellCheck={false} />
              <button className="btn" disabled={!code}>Join</button>
            </form>
            <button className="link" onClick={() => setAdv(!adv)}>{adv ? 'Hide' : 'Show'} servers</button>
          </div>
        </div>
      )}
      {adv && (
        <div className="relays">
          {s.relays.map((r) => <div key={r.url} className="relay"><i className={r.state} />{r.url}<small>{r.state === 'open' ? 'connected' : r.state}{r.error ? ` · ${r.error}` : ''}</small></div>)}
          <Field label="Sync servers (one per line)" hint="Encrypted copies are relayed through these servers. Use the same list on every device. You can run your own with the included server/relay.mjs.">
            <textarea rows={3} value={relayText} onChange={(e) => setRelayText(e.target.value)} spellCheck={false} />
          </Field>
          <div className="btn-row"><button className="btn small" onClick={saveRelays}>Save servers</button><button className="btn small ghost" onClick={() => { setRelayText(DEFAULT_RELAYS.join('\n')); setPrefs({ ...prefs, relays: DEFAULT_RELAYS }); }}>Reset to default</button></div>
        </div>
      )}
    </Card>
  );
}
