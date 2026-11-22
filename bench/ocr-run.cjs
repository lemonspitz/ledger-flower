// Reads CORD receipt photos with the app's own scanner (the same Tesseract build and clean-up the app uses)
// and saves the text it read, for bench/cord.ts --ocr.
//   npx vite --port 5199 &              (in the project folder)
//   node bench/ocr-run.cjs <cord-dir> <out.json> [--split heldout|train|all] [--limit N] [--jobs 3]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [dir, out] = process.argv.slice(2);
const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const split = opt('--split', 'heldout'), limit = Number(opt('--limit', '0')), jobs = Number(opt('--jobs', '3'));
const url = opt('--url', 'http://localhost:5199/');

(async () => {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))
    .filter((x) => (split === 'all' ? true : split === 'train' ? x.split === 'train' : x.split !== 'train'));
  const done = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
  let todo = index.filter((x) => !(x.id in done));
  if (limit) todo = todo.slice(0, Math.max(0, limit - Object.keys(done).length));
  const browser = await chromium.launch();
  let n = 0;
  const save = () => fs.writeFileSync(out, JSON.stringify(done));
  async function worker() {
    const page = await browser.newPage();
    await page.goto(url);
    while (todo.length) {
      const x = todo.shift();
      const b64 = fs.readFileSync(path.join(dir, 'img', x.img)).toString('base64');
      const t0 = Date.now();
      try {
        done[x.id] = await page.evaluate(async ({ b64, type }) => {
          const { scanReceipt } = await import('/src/receipt.ts');
          const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });
          return (await scanReceipt(blob, [], () => {})).text;
        }, { b64, type: x.img.endsWith('.png') ? 'image/png' : 'image/jpeg' });
      } catch (e) { console.error(x.id, e.message); }
      console.log(`${++n} ${x.id} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      if (n % 5 === 0) save();
    }
    await page.close();
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  save();
  await browser.close();
})();
