#!/usr/bin/env node
// Optional self-hosted sync relay for Ledgerleaf.
//
//   node server/relay.mjs            → ws://0.0.0.0:7447
//   PORT=8080 DATA=./relay.json node server/relay.mjs
//
// Put it behind HTTPS (wss://) for use outside your home network, then add its
// address under Settings → Sync → Relay servers in the app. It stores only
// encrypted blobs: it cannot read your budget.
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const PORT = Number(process.env.PORT || 7447);
const FILE = process.env.DATA || './relay-data.json';
const MAX = 512 * 1024;

/** key "pubkey:d" → event (kind 30078 is replaceable per pubkey + d tag) */
const events = new Map(existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : []);
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { writeFileSync(FILE + '.tmp', JSON.stringify([...events])); renameSync(FILE + '.tmp', FILE); }, 500); };

function valid(ev) {
  try {
    if (ev.kind !== 30078 || typeof ev.content !== 'string' || ev.content.length > MAX) return 'invalid: only kind 30078 up to 512KB';
    const id = bytesToHex(sha256(utf8ToBytes(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]))));
    if (id !== ev.id) return 'invalid: bad id';
    if (!schnorr.verify(hexToBytes(ev.sig), hexToBytes(ev.id), hexToBytes(ev.pubkey))) return 'invalid: bad signature';
    if (ev.created_at > Date.now() / 1000 + 900) return 'invalid: created_at too far in the future';
    return null;
  } catch { return 'invalid: malformed event'; }
}
const matches = (f, ev) => (!f.authors || f.authors.includes(ev.pubkey)) && (!f.kinds || f.kinds.includes(ev.kind)) && (!f.since || ev.created_at >= f.since);

const wss = new WebSocketServer({ port: PORT, maxPayload: MAX * 2 });
wss.on('connection', (ws) => {
  ws.subs = new Map();
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    const send = (x) => ws.send(JSON.stringify(x));
    if (m[0] === 'REQ') {
      const filters = m.slice(2);
      ws.subs.set(m[1], filters);
      for (const ev of events.values()) if (filters.some((f) => matches(f, ev))) send(['EVENT', m[1], ev]);
      send(['EOSE', m[1]]);
    } else if (m[0] === 'CLOSE') ws.subs.delete(m[1]);
    else if (m[0] === 'EVENT') {
      const ev = m[1];
      const err = valid(ev);
      if (err) return send(['OK', ev?.id ?? '', false, err]);
      const key = ev.pubkey + ':' + (ev.tags.find((t) => t[0] === 'd')?.[1] ?? '');
      const cur = events.get(key);
      if (cur && cur.created_at >= ev.created_at) return send(['OK', ev.id, cur.id === ev.id, cur.id === ev.id ? 'duplicate:' : 'invalid: a newer version exists']);
      events.set(key, ev); save();
      send(['OK', ev.id, true, '']);
      for (const c of wss.clients) for (const [sub, fs] of c.subs ?? []) if (c.readyState === 1 && fs.some((f) => matches(f, ev))) c.send(JSON.stringify(['EVENT', sub, ev]));
    }
  });
});
console.log(`Ledgerleaf relay listening on ws://0.0.0.0:${PORT} (data: ${FILE})`);
