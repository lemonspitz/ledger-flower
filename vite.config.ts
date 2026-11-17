import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

/**
 * Service worker for the web version: stores the app on the device so it opens offline and can be installed
 * ("Add to Home Screen"). The app's own files are stored at install; the receipt reader's large files
 * (≈ 9 MB) are stored the first time a receipt is scanned. New versions replace old caches automatically.
 */
function serviceWorker(): Plugin {
  return {
    name: 'ledgerleaf-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const shell = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
        ...Object.keys(bundle).filter((f) => !f.endsWith('.map'))];
      const version = `${pkg.version}-${Date.now().toString(36)}`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `// Generated at build time (vite.config.ts)
const CACHE = 'ledgerleaf-${version}';
const SHELL = ${JSON.stringify(shell)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ledgerleaf-') && k !== CACHE && k !== 'ledgerleaf-ocr').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // sync relays (wss) and other sites go straight to the network
  // Pages: try the network first so updates arrive, fall back to the stored copy offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); return r; })
      .catch(() => caches.match('index.html', { ignoreVary: true })));
    return;
  }
  // Everything else is versioned or never changes: stored copy first. The OCR files live in their own cache across updates.
  const bucket = url.pathname.includes('/ocr/') ? 'ledgerleaf-ocr' : CACHE;
  // ignoreVary: module scripts are requested with an Origin header the stored copies were not fetched with.
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(bucket).then((c) => c.put(req, copy)); }
    return r;
  })));
});
` });
    },
  };
}

export default defineConfig({ base: './', plugins: [react(), serviceWorker()], define: { __APP_VERSION__: JSON.stringify(pkg.version) }, build: { target: 'es2022' } });
