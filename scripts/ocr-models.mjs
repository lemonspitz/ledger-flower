// Copies the optional text-reader models (gzip, as downloaded by the app) into a folder of the published web
// version, so the app can download them from its own site: node scripts/ocr-models.mjs dist/ocr/models
import { copyFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2] || 'dist/ocr/models';
mkdirSync(out, { recursive: true });
for (const lang of ['jpn', 'chi_sim', 'chi_tra', 'kor', 'tha', 'ara', 'rus', 'vie']) copyFileSync(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `${out}/${lang}.traineddata.gz`);
console.log('OCR models copied to', out);
