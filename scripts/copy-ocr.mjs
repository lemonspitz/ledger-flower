// Copies the offline OCR engine (Tesseract WASM + English model) into public/ocr
// so receipt scanning works with no network access.
import { cpSync, mkdirSync } from 'node:fs';

const out = 'public/ocr';
mkdirSync(out, { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const v of ['relaxedsimd-lstm', 'simd-lstm', 'lstm']) cpSync(`node_modules/tesseract.js-core/tesseract-core-${v}.wasm.js`, `${out}/tesseract-core-${v}.wasm.js`);
cpSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', `${out}/eng.traineddata.gz`);
console.log('OCR assets copied to', out);
