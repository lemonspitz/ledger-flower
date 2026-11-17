// Real-time, end-to-end encrypted sync.
//
// Devices that share a sync code derive the same keys from it. Data is split
// into "buckets" (one for settings/accounts/budgets…, one per month of
// transactions). Each bucket is gzipped, AES-GCM encrypted and stored on relay
// servers as a replaceable signed event (Nostr protocol, kind 30078). Every
// device keeps a live WebSocket subscription, so a change on one device shows
// up on the others within a moment; devices that were offline catch up when
// they reconnect. Relays only ever see ciphertext.
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { bytesToHex, utf8ToBytes, concatBytes } from '@noble/hashes/utils.js';
import { allBuckets, bucketRecords, mergeRemote, onDirty, type Wire } from './store';

export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const KIND = 30078;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I/L)

export function newSyncCode() {
  const b = crypto.getRandomValues(new Uint8Array(20));
  let s = '';
  for (let i = 0; i < 20; i++) s += ALPHABET[b[i] % ALPHABET.length] + (i % 4 === 3 && i < 19 ? '-' : '');
  return s;
}
export const normalizeCode = (c: string) => {
  const raw = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.length === 20 ? raw.replace(/(.{4})(?=.)/g, '$1-') : null;
};

export interface RelayStatus { url: string; state: 'connecting' | 'open' | 'closed'; error?: string; pausedUntil?: number }
/** received: buckets that came in from the servers (i.e. from another device or an earlier session).
 *  pending: changes still waiting for a server to accept them. */
export interface SyncStatus { on: boolean; relays: RelayStatus[]; lastSync: number; initial: boolean; received: number; pending: number }

interface Conn {
  url: string; ws?: WebSocket; state: RelayStatus['state']; error?: string; eose: boolean;
  seen: Map<string, string>; sent: Map<string, string>; queue: string[]; pump?: ReturnType<typeof setTimeout>;
  retry: number; timer?: ReturnType<typeof setTimeout>;
  pausedUntil: number; strikes: number; pauseTimer?: ReturnType<typeof setTimeout>;
}
interface NEvent { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string }

const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(t as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Order-independent fingerprint of a bucket's contents. */
function digest(recs: { id: string; u: number }[]) {
  let a = 0, b = 0;
  for (const r of recs) {
    let h = 2166136261;
    const s = r.id + ':' + r.u;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    a = (a + (h >>> 0)) % 4294967296; b ^= Math.imul(h, 2654435761);
  }
  return `${recs.length}.${a}.${b >>> 0}`;
}

class SyncEngine {
  private conns: Conn[] = [];
  private sk?: Uint8Array; private pk = ''; private aes?: CryptoKey; private tagKey?: Uint8Array;
  private dirty = new Set<string>();
  private flushTimer?: ReturnType<typeof setTimeout>;
  private lastCreated = new Map<string, number>();
  private seenEvents = new Map<string, { b: string; dg: string }>();
  private chain: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private status: SyncStatus = { on: false, relays: [], lastSync: 0, initial: false, received: 0, pending: 0 };
  private gen = 0;

  constructor() {
    onDirty((bs) => { if (!this.status.on) return; bs.forEach((b) => this.dirty.add(b)); this.scheduleFlush(250); });
    if (typeof window !== 'undefined') {
      const wake = () => this.conns.forEach((c) => { if (c.state === 'closed') { clearTimeout(c.timer); this.open(c); } });
      window.addEventListener('online', wake);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    }
  }

  subscribe = (f: () => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
  getStatus = () => this.status;
  private publish(patch: Partial<SyncStatus> = {}) {
    const now = Date.now();
    const live = this.conns.filter((c) => c.state === 'open' && c.pausedUntil <= now);
    const pending = live.length ? Math.min(...live.map((c) => c.queue.length + c.sent.size)) : 0;
    this.status = { ...this.status, ...patch, pending, relays: this.conns.map((c) => ({ url: c.url, state: c.state, error: c.error, pausedUntil: c.pausedUntil > now ? c.pausedUntil : undefined })) };
    this.listeners.forEach((f) => f());
  }

  async start(code: string, relays: string[]) {
    this.stop();
    const gen = ++this.gen;
    const ikm = utf8ToBytes(code.replace(/-/g, ''));
    const salt = utf8ToBytes('ledgerleaf-sync-v1');
    this.sk = hkdf(sha256, ikm, salt, utf8ToBytes('nostr-sk'), 32);
    this.pk = bytesToHex(schnorr.getPublicKey(this.sk));
    this.tagKey = hkdf(sha256, ikm, salt, utf8ToBytes('d-tag'), 32);
    const raw = hkdf(sha256, ikm, salt, utf8ToBytes('aes-gcm'), 32);
    this.aes = await crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
    if (gen !== this.gen) return;
    this.conns = [...new Set(relays)].map((url) => ({ url, state: 'connecting', eose: false, seen: new Map(), sent: new Map(), queue: [], retry: 0, pausedUntil: 0, strikes: 0 }));
    this.publish({ on: true, initial: false, received: 0 });
    this.conns.forEach((c) => this.open(c));
  }

  stop() {
    this.gen++;
    for (const c of this.conns) { clearTimeout(c.timer); clearTimeout(c.pump); clearTimeout(c.pauseTimer); c.ws && (c.ws.onclose = null); try { c.ws?.close(); } catch { /* already closed */ } }
    this.conns = []; this.dirty.clear(); this.seenEvents.clear(); this.lastCreated.clear();
    clearTimeout(this.flushTimer);
    this.publish({ on: false, initial: false, received: 0 });
  }

  private open(c: Conn) {
    const gen = this.gen;
    c.state = 'connecting'; c.eose = false; c.seen = new Map(); c.sent = new Map(); c.queue = [];
    this.publish();
    let ws: WebSocket;
    try { ws = new WebSocket(c.url); } catch (e) { c.state = 'closed'; c.error = String(e); this.publish(); return; }
    c.ws = ws;
    ws.onopen = () => {
      c.state = 'open'; c.retry = 0; c.error = undefined;
      ws.send(JSON.stringify(['REQ', 'll', { kinds: [KIND], authors: [this.pk] }]));
      this.publish();
    };
    ws.onmessage = (m) => {
      if (gen !== this.gen) return;
      let msg: unknown[];
      try { msg = JSON.parse(String(m.data)); } catch { return; }
      if (msg[0] === 'EVENT' && msg[2]) this.chain = this.chain.then(() => this.onEvent(c, msg[2] as NEvent)).catch((e) => console.warn('sync event', e));
      else if (msg[0] === 'EOSE') this.chain = this.chain.then(() => this.onEose(c));
      else if (msg[0] === 'OK' && msg[2] === false) {
        const b = c.sent.get(String(msg[1]));
        c.sent.delete(String(msg[1]));
        const why = String(msg[3] || 'rejected');
        c.error = why;
        if (b) c.seen.delete(b);
        if (/^(rate-limited|banned|blocked)/i.test(why)) {
          // The server is throttling us: stop sending to it for a while instead of hammering it
          // (retrying quickly is what turns a rate limit into a ban). Other servers carry on.
          if (c.pausedUntil <= Date.now()) c.strikes++;
          const wait = /^banned/i.test(why) ? 15 * 60000 : Math.min(15 * 60000, 30000 * 2 ** Math.min(c.strikes - 1, 5));
          c.pausedUntil = Math.max(c.pausedUntil, Date.now() + wait);
          for (const m of c.queue) { const id = JSON.parse(m)[1].id; const qb = c.sent.get(id); if (qb) { c.seen.delete(qb); this.dirty.add(qb); } c.sent.delete(id); }
          c.queue = []; clearTimeout(c.pump); c.pump = undefined;
          if (b) this.dirty.add(b);
          clearTimeout(c.pauseTimer); c.pauseTimer = setTimeout(() => { this.allDirty(); this.scheduleFlush(0); this.publish(); }, c.pausedUntil - Date.now() + 500);
        } else if (b) { this.dirty.add(b); this.scheduleFlush(8000); }
        this.publish();
      } else if (msg[0] === 'OK') { c.sent.delete(String(msg[1])); if (c.pausedUntil <= Date.now()) { c.error = undefined; c.strikes = 0; } this.publish({ lastSync: Date.now() }); }
      else if (msg[0] === 'NOTICE') console.info('relay notice', c.url, msg[1]);
    };
    ws.onclose = () => {
      if (gen !== this.gen) return;
      c.state = 'closed'; c.eose = false;
      c.timer = setTimeout(() => this.open(c), Math.min(30000, 1000 * 2 ** c.retry++));
      this.publish();
    };
    ws.onerror = () => { c.error = 'connection failed'; };
  }

  private async onEvent(c: Conn, ev: NEvent) {
    if (ev.pubkey !== this.pk || ev.kind !== KIND) return;
    let known = this.seenEvents.get(ev.id);
    if (!known) {
      const buf = unb64(ev.content);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12) as BufferSource }, this.aes!, buf.subarray(12) as BufferSource);
      const body = JSON.parse(new TextDecoder().decode(await pipe(new Uint8Array(plain), new DecompressionStream('gzip')))) as { b: string; r: Wire[] };
      known = { b: body.b, dg: digest(body.r) };
      this.seenEvents.set(ev.id, known);
      this.lastCreated.set(body.b, Math.max(this.lastCreated.get(body.b) ?? 0, ev.created_at));
      mergeRemote(body.r);
      this.publish({ lastSync: Date.now(), received: this.status.received + 1 });
    }
    c.seen.set(known.b, known.dg);
    // If we hold anything the sender didn't, send our merged copy back out.
    if (digest(bucketRecords(known.b)) !== known.dg) { this.dirty.add(known.b); this.scheduleFlush(c.eose ? 300 : 1500); }
  }

  private allDirty() { allBuckets().forEach((b) => this.dirty.add(b)); }

  private onEose(c: Conn) {
    c.eose = true;
    this.allDirty();
    this.scheduleFlush(50);
    this.publish({ initial: true });
  }

  private scheduleFlush(ms: number) {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => { this.chain = this.chain.then(() => this.flush()).catch((e) => console.warn('sync flush', e)); }, ms);
  }

  private async flush() {
    const buckets = [...this.dirty];
    this.dirty.clear();
    for (const b of buckets) {
      const recs = bucketRecords(b);
      const dg = digest(recs);
      const now = Date.now();
      const ready = (c: Conn) => c.state === 'open' && c.eose && c.pausedUntil <= now;
      const targets = this.conns.filter((c) => ready(c) && c.seen.get(b) !== dg);
      if (!targets.length) {
        if (this.conns.some((c) => !ready(c))) this.dirty.add(b); // retry once reconnected / unpaused
        continue;
      }
      const ev = await this.buildEvent(b, recs);
      this.seenEvents.set(ev.id, { b, dg });
      const wire = JSON.stringify(['EVENT', ev]);
      for (const c of targets) { c.seen.set(b, dg); c.sent.set(ev.id, b); c.queue.push(wire); this.pump(c); }
    }
    this.publish();
  }

  // Space out publishes so a first upload of many months doesn't trip relay rate limits.
  private pump(c: Conn) {
    if (c.pump || !c.queue.length) return;
    const next = () => {
      c.pump = undefined;
      const m = c.queue.shift();
      if (!m) return;
      if (c.ws?.readyState === 1) c.ws.send(m);
      if (c.queue.length) c.pump = setTimeout(next, 400);
    };
    c.pump = setTimeout(next, 0);
  }

  private async buildEvent(b: string, recs: Wire[]): Promise<NEvent> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const zipped = await pipe(new TextEncoder().encode(JSON.stringify({ b, r: recs })), new CompressionStream('gzip'));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.aes!, zipped as BufferSource));
    const content = b64(concatBytes(iv, ct));
    const created_at = Math.max(Math.floor(Date.now() / 1000), (this.lastCreated.get(b) ?? 0) + 1);
    this.lastCreated.set(b, created_at);
    const tags = [['d', bytesToHex(sha256(concatBytes(this.tagKey!, utf8ToBytes(b)))).slice(0, 32)]];
    const idBytes = sha256(utf8ToBytes(JSON.stringify([0, this.pk, created_at, KIND, tags, content])));
    return { id: bytesToHex(idBytes), pubkey: this.pk, created_at, kind: KIND, tags, content, sig: bytesToHex(schnorr.sign(idBytes, this.sk!)) };
  }
}

export const sync = new SyncEngine();

// ---------- device-local preferences (never synced) ----------
export interface LocalPrefs { code?: string; relays: string[]; theme: 'auto' | 'light' | 'dark'; plant: string }
const LKEY = 'll.local.v1';
export function loadPrefs(): LocalPrefs {
  try { return { relays: DEFAULT_RELAYS, theme: 'auto', plant: 'monstera', ...JSON.parse(localStorage.getItem(LKEY) || '{}') }; } catch { return { relays: DEFAULT_RELAYS, theme: 'auto', plant: 'monstera' }; }
}
export function savePrefs(p: LocalPrefs) { localStorage.setItem(LKEY, JSON.stringify(p)); }
