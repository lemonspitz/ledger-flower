// Settings → Receipt reading: download or remove the text-reader models for non-Latin scripts.
import { useEffect, useRef, useState } from 'react';
import { getLang, getLocale, t } from './i18n';
import { downloadModel, installedModels, OCR_MODELS, removeModel } from './ocrModels';
import { Card, Icon } from './ui';

export function OcrCard() {
  const [have, setHave] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<Record<string, number>>({});
  const [error, setError] = useState<{ code: string; msg: string } | null>(null);
  const aborts = useRef<Record<string, AbortController>>({});
  const refresh = () => void installedModels().then(setHave);
  useEffect(refresh, []);
  useEffect(() => () => Object.values(aborts.current).forEach((a) => a.abort()), []);
  const mb = (kb: number) => `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(kb / 1024)} MB`;
  const lang = getLang();
  // The model for the app's language first.
  const list = [...OCR_MODELS].sort((a, b) => Number(b.app === lang) - Number(a.app === lang));

  const get = async (code: string) => {
    const ac = new AbortController();
    aborts.current[code] = ac;
    setError(null); setBusy((b) => ({ ...b, [code]: 0 }));
    try { await downloadModel(code, (p) => setBusy((b) => ({ ...b, [code]: p })), ac.signal); }
    catch (e) { if ((e as Error).name !== 'AbortError') setError({ code, msg: (e as Error).message }); }
    finally { delete aborts.current[code]; setBusy((b) => { const n = { ...b }; delete n[code]; return n; }); refresh(); }
  };
  const drop = async (code: string) => { await removeModel(code); refresh(); };

  return (
    <Card title={t('Receipt reading')} sub={t('English and other languages written in Latin letters are built in. To read receipts printed in another script, download its text reader once; it then works offline.')}>
      <div className="ocr-list">
        {list.map((x) => {
          const p = busy[x.code], on = have?.includes(x.code);
          return (
            <div key={x.code} className="ocr-row">
              <span className="ocr-name">
                <b>{x.name}</b>
                <small>{x.english} · {mb(x.kb)}{x.app === lang ? ` · ${t('for your language')}` : ''}</small>
                {p !== undefined && <span className="meter"><i style={{ width: `${Math.max(4, p * 100)}%` }} /></span>}
                {error?.code === x.code && <small className="ocr-err">{t('Download failed ({reason}). Check your connection and try again.', { reason: error.msg })}</small>}
              </span>
              {p !== undefined ? (
                <button className="btn small ghost" onClick={() => aborts.current[x.code]?.abort()}>{Math.round(p * 100)}% · {t('Cancel')}</button>
              ) : on ? (
                <span className="ocr-on"><Icon name="check" size={14} />{t('Downloaded')}<button className="btn small ghost" onClick={() => void drop(x.code)}>{t('Remove')}</button></span>
              ) : (
                <button className="btn small" disabled={have === null} onClick={() => void get(x.code)}>{t('Download')}</button>
              )}
            </div>
          );
        })}
      </div>
      <small className="hint">{t('Each downloaded language makes scanning a little slower. Only the language file is downloaded; receipt photos never leave this device.')}</small>
    </Card>
  );
}
