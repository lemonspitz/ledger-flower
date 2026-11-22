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
// English plus the scripts the app's languages need (Japanese, Chinese, Korean, Thai, Arabic, Russian, Vietnamese);
// the scanner loads only the one for the app's language.
for (const lang of ['eng', 'jpn', 'chi_sim', 'chi_tra', 'kor', 'tha', 'ara', 'rus', 'vie']) {
  rmSync(`${out}/${lang}.traineddata.gz`, { force: true });
  writeFileSync(`${out}/${lang}.traineddata`, gunzipSync(readFileSync(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`)));
}
console.log('OCR assets copied to', out);
