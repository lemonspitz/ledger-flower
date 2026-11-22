// Prints generated receipts (bench/synth.ts --dump <dir>) as receipt-like images and reads them with the
// app's own scanner, to see what the OCR makes of each language and script.
//   npx vite --port 5199 &
//   node bench/synth-ocr.cjs <dump-dir> <out.json> [--per 10] [--jobs 3] [--lang ja]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [dir, out] = process.argv.slice(2);
const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const per = Number(opt('--per', '10')), jobs = Number(opt('--jobs', '3')), only = opt('--lang', '');
const url = opt('--url', 'http://localhost:5199/');

(async () => {
  const done = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
  const todo = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const lang = f.replace(/\.json$/, '');
    if (only && lang !== only) continue;
    const list = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (let i = 0; i < Math.min(per, list.length); i++) if (!done[`${lang}/${i}`]) todo.push({ key: `${lang}/${i}`, lang, text: list[i].text, rtl: lang === 'ar' });
  }
  const browser = await chromium.launch();
  let n = 0;
  const save = () => fs.writeFileSync(out, JSON.stringify(done));
  async function worker() {
    const shot = await browser.newPage({ viewport: { width: 420, height: 400 }, deviceScaleFactor: 2 });
    const page = await browser.newPage();
    await page.goto(url);
    while (todo.length) {
      const x = todo.shift();
      // Thermal-printer look: monospace on off-white paper, slightly grey ink.
      await shot.setContent(`<body style="margin:0;background:#f4f1ea"><pre dir="${x.rtl ? 'auto' : 'ltr'}" style="margin:0;padding:18px 14px;font:15px/1.35 'DejaVu Sans Mono','WenQuanYi Zen Hei Mono','IPAGothic','Loma',monospace;color:#2a2a2a;white-space:pre">${x.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre></body>`);
      const png = await shot.locator('pre').screenshot();
      try {
        done[x.key] = await page.evaluate(async ({ b64, lang }) => {
          const { scanReceipt } = await import('/src/receipt.ts');
          const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' });
          return (await scanReceipt(blob, [], () => {}, lang)).text;
        }, { b64: png.toString('base64'), lang: x.lang });
      } catch (e) { console.error(x.key, e.message); }
      console.log(`${++n} ${x.key}`);
      if (n % 10 === 0) save();
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  save();
  await browser.close();
})();
