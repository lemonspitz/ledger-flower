// Copies the offline OCR engine (Tesseract WASM + language models) into public/ocr
// so receipt scanning works with no network access.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const out = 'public/ocr';
mkdirSync(out, { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const v of ['relaxedsimd-lstm', 'simd-lstm', 'lstm']) cpSync(`node_modules/tesseract.js-core/tesseract-core-${v}.wasm.js`, `${out}/tesseract-core-${v}.wasm.js`);
// Stored uncompressed: Android's build tools unpack *.gz assets and drop the
// extension, so a .gz name would not exist inside the APK.
// Only the English model is built in. The others (Japanese, Chinese, Korean, Thai, Arabic, Russian, Vietnamese)
// are optional downloads from Settings; see scripts/ocr-models.mjs.
rmSync(`${out}/eng.traineddata.gz`, { force: true });
writeFileSync(`${out}/eng.traineddata`, gunzipSync(readFileSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')));
for (const lang of ['jpn', 'chi_sim', 'chi_tra', 'kor', 'tha', 'ara', 'rus', 'vie']) rmSync(`${out}/${lang}.traineddata`, { force: true });
console.log('OCR assets copied to', out);
