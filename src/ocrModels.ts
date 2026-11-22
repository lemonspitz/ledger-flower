// Optional text-reader models for scripts the built-in English one can't read (Japanese, Chinese, Korean, Thai,
// Arabic, Russian, Vietnamese). Downloaded once from Settings, kept on this device (IndexedDB), and used by the
// receipt scanner from then on, also offline. Only the model is downloaded; receipt photos never leave the device.

export interface OcrModel { code: string; name: string; english: string; app: string; kb: number }
/** Sizes are the compressed downloads. */
export const OCR_MODELS: OcrModel[] = [
  { code: 'jpn', name: '日本語', english: 'Japanese', app: 'ja', kb: 1983 },
  { code: 'chi_sim', name: '简体中文', english: 'Chinese (Simplified)', app: 'zh-Hans', kb: 1679 },
  { code: 'chi_tra', name: '繁體中文', english: 'Chinese (Traditional)', app: 'zh-Hant', kb: 1618 },
  { code: 'kor', name: '한국어', english: 'Korean', app: 'ko', kb: 1536 },
  { code: 'tha', name: 'ไทย', english: 'Thai', app: 'th', kb: 876 },
  { code: 'ara', name: 'العربية', english: 'Arabic', app: 'ar', kb: 1623 },
  { code: 'rus', name: 'Русский', english: 'Russian', app: 'ru', kb: 2617 },
  { code: 'vie', name: 'Tiếng Việt', english: 'Vietnamese', app: 'vi', kb: 1390 },
];
/** The model that reads the script of an app language, if it needs one. */
export const modelForLang = (appLang: string) => OCR_MODELS.find((m) => m.app === appLang);

/** Where models are fetched from: this site (the web version), the app's site, then a public mirror of the same files. */
const sources = (code: string) => [
  ...(typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname) ? [new URL(`./ocr/models/${code}.traineddata.gz`, document.baseURI).href] : []),
  `https://lemonspitz.github.io/ledger-flower/ocr/models/${code}.traineddata.gz`,
  `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${code}@1.0.0/4.0.0_best_int/${code}.traineddata.gz`,
];

// ── storage ──
// Kept where the text reader looks for language files before downloading anything (its IndexedDB cache, under
// our own folder name), so it reads them from the device. See OCR_CACHE in receipt.ts.
export const OCR_CACHE = 'll-ocr';
const DB = 'keyval-store', STORE = 'keyval';
const key = (code: string) => `${OCR_CACHE}/${code}.traineddata`;
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise<T>((res, rej) => {
    const t = d.transaction(STORE, mode), q = run(t.objectStore(STORE));
    t.oncomplete = () => { res(q.result); d.close(); };
    t.onerror = t.onabort = () => { rej(t.error ?? q.error); d.close(); };
  });
}

/** Codes of the models on this device. */
export async function installedModels(): Promise<string[]> {
  try {
    const keys = (await tx('readonly', (s) => s.getAllKeys())).map(String);
    return OCR_MODELS.map((m) => m.code).filter((c) => keys.includes(key(c)));
  } catch { return []; }
}
export async function removeModel(code: string) { await tx('readwrite', (s) => s.delete(key(code))); }
/** Stores a model's (gzip) file. */
export async function saveModel(code: string, data: Uint8Array) { await tx('readwrite', (s) => s.put(data, key(code))); }

/** Downloads a model (reporting 0–1) and keeps it. Tries each source in turn. */
export async function downloadModel(code: string, onProgress: (p: number) => void, signal?: AbortSignal) {
  const m = OCR_MODELS.find((x) => x.code === code);
  if (!m) throw new Error('unknown model');
  let last: unknown;
  for (const url of sources(code)) {
    try {
      const resp = await fetch(url, { signal, cache: 'no-store' });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      const total = Number(resp.headers.get('content-length')) || m.kb * 1024;
      const reader = resp.body.getReader(), parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        onProgress(Math.min(0.99, got / total));
      }
      const data = new Uint8Array(got);
      let at = 0;
      for (const p of parts) { data.set(p, at); at += p.length; }
      // A real model is gzip and around the listed size; anything else (an error page, a cut-off file) is refused.
      if (!(data[0] === 0x1f && data[1] === 0x8b) || got < m.kb * 1024 * 0.7) throw new Error('incomplete download');
      await saveModel(code, data);
      onProgress(1);
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error('download failed');
}
