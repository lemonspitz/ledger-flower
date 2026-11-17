// Checks every translation file against src/locales/keys.ts: right length (up to the UI part at least),
// and the same {placeholders} as the English text, so a skipped or shifted line is caught.
// Usage: node scripts/i18n-check.mjs [code ...]
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../src/locales/', import.meta.url);
const KEYS = JSON.parse(readFileSync(new URL('keys.ts', dir), 'utf8').match(/KEYS: string\[\] = (\[[\s\S]*?\]);/)[1]);
const PLURAL = JSON.parse(readFileSync(new URL('keys.ts', dir), 'utf8').match(/PLURAL_ONE: Record<string, string> = (\{[\s\S]*?\});/)[1]);
const holes = (s) => [...new Set((s.match(/\{\w+\}/g) ?? []))].sort().join(',');
const want = process.argv.slice(2);
let bad = 0;
for (const f of readdirSync(dir).filter((x) => /^[a-z]{2}(-[A-Z][a-z]+)?\.ts$/.test(x))) {
  const code = f.replace('.ts', '');
  if (want.length && !want.includes(code)) continue;
  const src = readFileSync(new URL(f, dir), 'utf8').replace(/^[\s\S]*?export default /, '').replace(/;\s*$/, '');
  const rows = new Function(`return ${src}`)();
  const issues = [];
  rows.forEach((v, i) => {
    if (i >= KEYS.length) { issues.push(`#${i} extra entry`); return; }
    if (v == null || v === '') return;
    const en = holes(KEYS[i]);
    const forms = typeof v === 'string' ? [v] : Object.values(v);
    for (const form of forms) {
      // A plural's singular may drop {n} ("one item"), so only require the other placeholders.
      const h = holes(form), need = PLURAL[KEYS[i]] ? en.split(',').filter((x) => x !== '{n}').join(',') : en;
      const ok = PLURAL[KEYS[i]] ? need.split(',').filter(Boolean).every((x) => h.includes(x)) && h.split(',').filter(Boolean).every((x) => en.includes(x)) : h === en;
      if (!ok) issues.push(`#${i} placeholders ${h || '-'} ≠ ${en || '-'}  (${KEYS[i].slice(0, 50)} → ${String(form).slice(0, 50)})`);
    }
  });
  const ui = KEYS.indexOf('Iris');
  const done = rows.filter((v) => v != null && v !== '').length;
  console.log(`${code}: ${rows.length} entries, ${done} translated (UI ${Math.min(rows.length, ui)}/${ui}, flowers ${Math.max(0, rows.length - ui)}/${KEYS.length - ui})${issues.length ? `, ${issues.length} problem(s)` : ', ok'}`);
  issues.slice(0, 15).forEach((x) => console.log('   ' + x));
  bad += issues.length;
}
process.exit(bad ? 1 : 0);
