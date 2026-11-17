// App lock: a PIN on every platform, plus fingerprint / face unlock on phones that have it.
// Only a salted PBKDF2 hash of the PIN is kept, on this device only (never synced). The lock keeps
// other people out of the app on an unlocked phone; it does not encrypt the data on the device.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';
import { Card, Field, Icon, Seg } from './ui';
import { FlowerArt } from './themes';
import { t } from './i18n';
import type { LocalPrefs } from './sync';

export interface LockPrefs { hash: string; salt: string; len: number; bio?: boolean; after: 0 | 1 | 5 }

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 150_000 }, key, 256));
}
export async function makeLock(pin: string, prev?: LockPrefs): Promise<LockPrefs> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  return { hash: await hashPin(pin, salt), salt, len: pin.length, bio: prev?.bio, after: prev?.after ?? 0 };
}
export const checkPin = async (pin: string, l: LockPrefs) => (await hashPin(pin, l.salt)) === l.hash;

/** What this device offers: 'face', 'fingerprint', or null (PIN only). */
export async function biometry(): Promise<'face' | 'fingerprint' | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await BiometricAuth.checkBiometry();
    if (!r.isAvailable) return null;
    return r.biometryType === BiometryType.faceId || r.biometryType === BiometryType.faceAuthentication ? 'face' : 'fingerprint';
  } catch { return null; }
}
async function bioUnlock() {
  try {
    await BiometricAuth.authenticate({ reason: t('Unlock Ledger Flower'), cancelTitle: t('Use PIN'), androidTitle: t('Unlock Ledger Flower'), androidSubtitle: t('Use your fingerprint or face'), allowDeviceCredential: false, androidConfirmationRequired: false });
    return true;
  } catch { return false; }
}

/** Locks on start and after the app has been in the background for the chosen time. */
export function useAppLock(lock: LockPrefs | undefined) {
  const [locked, setLocked] = useState(!!lock);
  const [hidden, setHidden] = useState(false);
  const away = useRef<number | null>(null);
  useEffect(() => { if (!lock) setLocked(false); }, [lock]);
  useEffect(() => {
    if (!lock) return;
    const leave = () => { away.current = Date.now(); setHidden(true); if (lock.after === 0) setLocked(true); };
    const back = () => {
      setHidden(false);
      if (away.current !== null && Date.now() - away.current >= lock.after * 60_000) setLocked(true);
      away.current = null;
    };
    const vis = () => (document.hidden ? leave() : back());
    document.addEventListener('visibilitychange', vis);
    let sub: { remove: () => void } | undefined;
    if (Capacitor.isNativePlatform()) void CapApp.addListener('appStateChange', ({ isActive }) => (isActive ? back() : leave())).then((h) => { sub = h; });
    return () => { document.removeEventListener('visibilitychange', vis); sub?.remove(); };
  }, [lock]);
  return { locked, unlock: useCallback(() => setLocked(false), []), hidden };
}

/** Full-screen lock: PIN pad, and fingerprint / face when turned on. */
export function LockScreen({ lock, flower, onUnlock, onErase }: { lock: LockPrefs; flower: string; onUnlock: () => void; onErase: () => void }) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  const [fails, setFails] = useState(0);
  const [wait, setWait] = useState(0);
  const [bio, setBio] = useState<'face' | 'fingerprint' | null>(null);
  const [forgot, setForgot] = useState<0 | 1 | 2>(0);
  const tried = useRef(false);
  const tryBio = useCallback(async () => { if (await bioUnlock()) onUnlock(); }, [onUnlock]);
  useEffect(() => {
    if (!lock.bio) return;
    void biometry().then((b) => { setBio(b); if (b && !tried.current) { tried.current = true; void tryBio(); } });
  }, [lock.bio, tryBio]);
  useEffect(() => { if (wait <= 0) return; const id = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(id); }, [wait]);
  const press = async (k: string) => {
    if (wait > 0) return;
    setBad(false);
    if (k === '⌫') return setPin(pin.slice(0, -1));
    const next = (pin + k).slice(0, lock.len);
    setPin(next);
    if (next.length === lock.len) {
      if (await checkPin(next, lock)) { onUnlock(); return; }
      const f = fails + 1;
      setFails(f); setBad(true); setPin('');
      if (f >= 5) setWait(Math.min(300, 30 * 2 ** (f - 5))); // slow down guessing after 5 wrong tries
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) void press(e.key); else if (e.key === 'Backspace') void press('⌫'); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return (
    <div className="lock" role="dialog" aria-modal="true" aria-label={t('Ledger Flower is locked')}>
      <div className="lock-art" aria-hidden><FlowerArt flower={flower} /></div>
      <div className="lock-box">
        <img src="./icon.svg" alt="" width={52} height={52} />
        <h1>{t('Enter your PIN')}</h1>
        <div className={`pin-dots${bad ? ' bad' : ''}`} aria-live="polite" aria-label={t('{a} of {b} digits entered', { a: pin.length, b: lock.len })}>
          {Array.from({ length: lock.len }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
        </div>
        <p className="lock-msg">{wait > 0 ? t('Too many tries. Try again in {s} s.', { s: wait }) : bad ? t('Wrong PIN') : ' '}</p>
        <div className="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => <button key={k} onClick={() => void press(k)} disabled={wait > 0}>{k}</button>)}
          {bio ? <button className="fn" onClick={() => void tryBio()} aria-label={bio === 'face' ? t('Unlock with face') : t('Unlock with fingerprint')}><Icon name={bio === 'face' ? 'face' : 'finger'} size={26} /></button> : <span />}
          <button onClick={() => void press('0')} disabled={wait > 0}>0</button>
          <button className="fn" onClick={() => void press('⌫')} aria-label={t('Delete')}><Icon name="back" size={22} /></button>
        </div>
        {forgot === 0 && <button className="link" onClick={() => setForgot(1)}>{t('Forgot PIN?')}</button>}
        {forgot > 0 && (
          <div className="lock-forgot">
            <p>{t('The PIN can’t be recovered, because it is never stored or sent anywhere. You can erase Ledger Flower on this device and start again. If sync was on, join with your sync code from another device afterwards and your data comes back.')}</p>
            {forgot === 1
              ? <div className="btn-row"><button className="btn ghost" onClick={() => setForgot(0)}>{t('Cancel')}</button><button className="btn danger" onClick={() => setForgot(2)}>{t('Erase this device')}</button></div>
              : <div className="btn-row"><button className="btn ghost" onClick={() => setForgot(0)}>{t('Cancel')}</button><button className="btn danger" onClick={onErase}>{t('Yes, erase everything on this device')}</button></div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Settings card: set, change or remove the PIN; fingerprint / face; when to lock. */
export function LockCard({ prefs, setPrefs }: { prefs: LocalPrefs; setPrefs: (p: LocalPrefs) => void }) {
  const lock = prefs.lock;
  const [step, setStep] = useState<null | 'new' | 'confirm' | 'old' | 'off'>(null);
  const [first, setFirst] = useState('');
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [bio, setBio] = useState<'face' | 'fingerprint' | null>(null);
  useEffect(() => { void biometry().then(setBio); }, []);
  const reset = () => { setStep(null); setVal(''); setFirst(''); setErr(''); };
  const submit = async () => {
    setErr('');
    if (step === 'old' || step === 'off') {
      if (!lock || !(await checkPin(val, lock))) { setErr(t('Wrong PIN')); setVal(''); return; }
      if (step === 'off') { setPrefs({ ...prefs, lock: undefined }); reset(); return; }
      setStep('new'); setVal(''); return;
    }
    if (!/^\d{4,6}$/.test(val)) { setErr(t('Use 4 to 6 digits.')); return; }
    if (step === 'new') { setFirst(val); setVal(''); setStep('confirm'); return; }
    if (val !== first) { setErr(t('The PINs don’t match. Try again.')); setVal(''); setFirst(''); setStep('new'); return; }
    setPrefs({ ...prefs, lock: await makeLock(val, lock) });
    reset();
  };
  const label = step === 'new' ? t('New PIN (4–6 digits)') : step === 'confirm' ? t('Enter the new PIN again') : t('Current PIN');
  return (
    <Card title={t('App lock')} sub={t('Ask for a PIN, fingerprint or face when Ledger Flower opens. Set on each device separately.')}>
      {step ? (
        <form className="form lock-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label={label}>
            <input autoFocus type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))} />
          </Field>
          {err && <p className="status over"><Icon name="warn" size={13} />{err}</p>}
          <div className="btn-row"><button type="button" className="btn ghost" onClick={reset}>{t('Cancel')}</button><button className="btn primary" disabled={val.length < 4}>{step === 'confirm' ? t('Save PIN') : t('Next')}</button></div>
        </form>
      ) : lock ? (
        <div className="form">
          <p className="status good"><Icon name="lock" size={14} />{t('App lock is on')}</p>
          {bio && (
            <label className="check"><input type="checkbox" checked={!!lock.bio} onChange={async (e) => {
              const on = e.target.checked;
              if (on && !(await bioUnlock())) return; // confirm it works before relying on it
              setPrefs({ ...prefs, lock: { ...lock, bio: on } });
            }} />{bio === 'face' ? t('Unlock with face') : t('Unlock with fingerprint')}</label>
          )}
          <Field label={t('Lock again after leaving the app')}>
            <Seg value={String(lock.after) as '0' | '1' | '5'} onChange={(v) => setPrefs({ ...prefs, lock: { ...lock, after: Number(v) as 0 | 1 | 5 } })}
              options={[['0', t('Immediately')], ['1', t('After 1 minute')], ['5', t('After 5 minutes')]]} />
          </Field>
          <div className="btn-row"><button className="btn" onClick={() => setStep('old')}>{t('Change PIN')}</button><button className="btn danger ghost" onClick={() => setStep('off')}>{t('Turn off app lock')}</button></div>
        </div>
      ) : (
        <button className="btn primary" onClick={() => setStep('new')}><Icon name="lock" size={16} />{t('Set up app lock')}</button>
      )}
    </Card>
  );
}
