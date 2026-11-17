// Flower themes: each sets the accent, the background wash, the chart colours and
// the flower drawn behind the glass. Text colours meet contrast on glass.
import type { CSSProperties, ReactNode } from 'react';
import { FLOWERS, resolveFlower, type Flower, type FlowerId } from './flowers';

const mix = (a: string, pct: number, b: string) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

/** Colours the drawings use. Same in light and dark; the backdrop dims them in dark mode. */
export const artVars = (f: Flower) => ({
  '--petal1': f.petals[0], '--petal2': f.petals[1], '--heart': f.heart, '--stem': f.stem,
  '--stem2': mix(f.stem, 62, '#ffffff'), '--edge': mix(f.petals[0], 62, f.heart),
}) as CSSProperties;

export const swatchBg = (f: Flower) => `linear-gradient(135deg, ${mix(f.petals[0], 34, '#ffffff')}, ${mix(f.stem, 22, '#ffffff')})`;

const vars = (f: Flower, dark: boolean) => {
  const [accent, ink] = dark ? [f.accent[2], f.accent[3]] : [f.accent[0], f.accent[1]];
  const [s1, s2] = dark ? f.pair.dark : f.pair.light;
  const base = dark ? '#0d0d11' : '#ffffff', page = dark ? '#0b0b0e' : '#f8f6f3';
  const a = artVars(f) as Record<string, string>;
  return `
  --accent: ${accent}; --accent-ink: ${ink}; --series-1: ${s1}; --series-2: ${s2};
  --bg1: ${mix(dark ? accent : f.petals[0], dark ? 24 : 30, base)}; --bg2: ${mix(accent, dark ? 9 : 6, page)}; --bg3: ${mix(f.stem, dark ? 24 : 20, base)};
  ${Object.entries(a).map(([k, v]) => `${k}: ${v};`).join(' ')}
  --accent-wash: ${mix(accent, dark ? 22 : 14, 'transparent')};
  --track: ${mix(s1, dark ? 30 : 24, dark ? '#1d1d22' : '#ffffff')};`;
};

/** CSS for every theme, light and dark, following the same three-state theme rules as the rest of the app. */
export function themeCSS() {
  return FLOWERS.map((f) => `
:root[data-plant="${f.id}"] {${vars(f, false)} }
@media (prefers-color-scheme: dark) { :root[data-plant="${f.id}"]:not([data-theme='light']) {${vars(f, true)} } }
:root[data-plant="${f.id}"][data-theme='dark'] {${vars(f, true)} }`).join('\n');
}

// ───────── drawing kit (origin at the base, growing upward, ~270 tall) ─────────
type Shape = 'point' | 'round' | 'wide' | 'notch' | 'frill';
const SHAPES: Record<Shape, (l: number, w: number) => string> = {
  point: (l, w) => `M0 0C${w} ${-l * 0.22} ${w * 0.95} ${-l * 0.72} 0 ${-l}C${-w * 0.95} ${-l * 0.72} ${-w} ${-l * 0.22} 0 0Z`,
  round: (l, w) => `M0 0C${w} ${-l * 0.05} ${w * 1.15} ${-l} 0 ${-l}C${-w * 1.15} ${-l} ${-w} ${-l * 0.05} 0 0Z`,
  wide: (l, w) => `M0 0C${w * 1.4} ${-l * 0.25} ${w * 1.3} ${-l * 1.02} 0 ${-l}C${-w * 1.3} ${-l * 1.02} ${-w * 1.4} ${-l * 0.25} 0 0Z`,
  notch: (l, w) => `M0 0C${w} ${-l * 0.15} ${w * 1.25} ${-l * 0.82} ${w * 0.5} ${-l}L0 ${-l * 0.86}L${-w * 0.5} ${-l}C${-w * 1.25} ${-l * 0.82} ${-w} ${-l * 0.15} 0 0Z`,
  frill: (l, w) => `M0 0C${w} ${-l * 0.1} ${w * 1.2} ${-l * 0.8} ${w * 0.7} ${-l * 0.96}L${w * 0.35} ${-l * 0.9}L0 ${-l}L${-w * 0.35} ${-l * 0.9}L${-w * 0.7} ${-l * 0.96}C${-w * 1.2} ${-l * 0.8} ${-w} ${-l * 0.1} 0 0Z`,
};
const Petal = ({ l, w, shape = 'round', rot = 0, x = 0, y = 0, fill = 'var(--petal1)', edge = true }: { l: number; w: number; shape?: Shape; rot?: number; x?: number; y?: number; fill?: string; edge?: boolean }) => (
  <path d={SHAPES[shape](l, w)} transform={`translate(${x} ${y}) rotate(${rot})`} fill={fill} stroke={edge ? 'var(--edge)' : 'none'} strokeWidth={edge ? 1.6 : 0} strokeOpacity={0.55} strokeLinejoin="round" />
);
const Ring = ({ n, l, w, shape = 'round', fill = 'var(--petal1)', off = 0, shift = 0 }: { n: number; l: number; w: number; shape?: Shape; fill?: string; off?: number; shift?: number }) => (
  <g>{Array.from({ length: n }, (_, i) => <g key={i} transform={`rotate(${off + (i * 360) / n})`}><Petal l={l} w={w} shape={shape} x={shift} fill={fill} /></g>)}</g>
);
const Leaf = ({ l, w, rot = 0, x = 0, y = 0, fill = 'var(--stem)' }: { l: number; w: number; rot?: number; x?: number; y?: number; fill?: string }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`}>
    <path d={SHAPES.point(l, w)} fill={fill} />
    <path d={`M0 -3L0 ${-l * 0.88}`} stroke="var(--stem2)" strokeOpacity={0.6} strokeWidth={Math.max(1.2, w / 10)} strokeLinecap="round" />
  </g>
);
const Stem = ({ d, w = 6, c = 'var(--stem)' }: { d: string; w?: number; c?: string }) => <path d={d} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round" />;
const At = ({ x = 0, y = 0, s = 1, r = 0, children }: { x?: number; y?: number; s?: number; r?: number; children: ReactNode }) => <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>{children}</g>;
const bez = (t: number, p: number[][]) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]); };

function Iris() {
  const fall = (rot: number) => (
    <g transform={`rotate(${rot})`}><Petal l={84} w={30} fill="var(--petal1)" /><path d="M0 -10L0 -40" stroke="var(--heart)" strokeWidth="7" strokeLinecap="round" /></g>
  );
  return (
    <g>
      <Stem d="M0 40L0 -170" w={6} />
      <Leaf x={-6} y={40} l={210} w={14} rot={-12} /><Leaf x={6} y={40} l={170} w={13} rot={14} fill="var(--stem2)" />
      <At y={-180}>
        <Petal l={78} w={26} rot={-24} fill="var(--petal2)" /><Petal l={78} w={26} rot={24} fill="var(--petal2)" /><Petal l={84} w={26} fill="var(--petal2)" />
        {fall(-125)}{fall(125)}{fall(180)}
      </At>
    </g>
  );
}
function Rose() {
  return (
    <g>
      <Stem d="M0 40C-6 -20 6 -90 0 -150" w={7} />
      <Leaf y={-40} l={62} w={20} rot={-62} /><Leaf y={-90} l={56} w={18} rot={58} fill="var(--stem2)" />
      <At y={-190}>
        <Ring n={5} l={72} w={38} fill="var(--petal2)" />
        <Ring n={5} l={58} w={32} off={36} />
        <Ring n={4} l={42} w={26} off={12} fill="var(--petal2)" />
        <Ring n={3} l={27} w={19} off={55} />
        <path d="M0 0c8-6 4-16-6-14-12 2-14 18-2 24 16 6 28-10 22-24" stroke="var(--heart)" strokeWidth="4" fill="none" strokeLinecap="round" />
      </At>
    </g>
  );
}
function Sunflower() {
  return (
    <g>
      <Stem d="M0 40C6 -40-6 -100 0 -150" w={9} />
      <Leaf y={-40} l={84} w={28} rot={-58} /><Leaf y={-80} l={72} w={24} rot={60} fill="var(--stem2)" />
      <At y={-190}>
        <Ring n={22} l={68} w={14} shape="point" fill="var(--petal2)" off={8} />
        <Ring n={22} l={60} w={14} shape="point" />
        <circle r="42" fill="var(--heart)" />
        {Array.from({ length: 70 }, (_, i) => { const r = 38 * Math.sqrt(i / 70), a = i * 2.39996; return <circle key={i} cx={r * Math.cos(a)} cy={r * Math.sin(a)} r="2.3" fill="var(--petal1)" opacity="0.35" />; })}
      </At>
    </g>
  );
}
function Cherry() {
  const blossom = (x: number, y: number, s: number, r: number, k: number) => (
    <At key={k} x={x} y={y} s={s} r={r}><Ring n={5} l={56} w={24} shape="notch" fill={k % 2 ? 'var(--petal2)' : 'var(--petal1)'} /><circle r="9" fill="var(--heart)" />
      {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M0 0L0 -20`} transform={`rotate(${i * 45})`} stroke="var(--heart)" strokeWidth="2" />)}</At>
  );
  return (
    <g>
      <Stem d="M-120 40C-60 -40 0 -80 40 -180M-20 -60C30 -70 70 -90 110 -120" w={9} />
      <Leaf x={70} y={-95} l={40} w={12} rot={40} />
      {[[40, -190, 1.1, 10], [110, -125, 0.8, 30], [-30, -60, 0.9, -10], [-95, 5, 0.65, 20], [10, -120, 0.55, 40]].map(([x, y, s, r], i) => blossom(x, y, s, r, i))}
    </g>
  );
}
function Lavender() {
  return (
    <g>
      {[[-40, -14], [0, 0], [40, 12]].map(([x, r], k) => (
        <g key={k} transform={`translate(${x} 0) rotate(${r})`}>
          <Stem d="M0 40L0 -240" w={4} c="var(--stem2)" />
          <Leaf y={-10} l={70} w={6} rot={-20} fill="var(--stem2)" />
          {Array.from({ length: 10 }, (_, i) => <g key={i}><ellipse cx={-7} cy={-150 - i * 10} rx="7" ry="10" fill={i % 2 ? 'var(--petal1)' : 'var(--petal2)'} /><ellipse cx={7} cy={-155 - i * 10} rx="7" ry="10" fill="var(--petal1)" /></g>)}
        </g>
      ))}
    </g>
  );
}
function Lotus() {
  return (
    <g>
      <path d="M0 -20m-150 0a150 50 0 1 0 300 0a150 50 0 1 0 -300 0M0 -20L130 -48L118 -6Z" fill="var(--stem)" fillRule="evenodd" />
      <At y={-50}>
        {[-78, -52, 52, 78].map((r) => <Petal key={r} l={100} w={30} shape="point" rot={r} fill="var(--petal2)" />)}
        {[-28, 28].map((r) => <Petal key={r} l={124} w={36} shape="point" rot={r} fill="var(--petal2)" />)}
        <rect x="-18" y="-80" width="36" height="22" rx="8" fill="var(--heart)" />
        {[-40, 40].map((r) => <Petal key={r} l={112} w={34} shape="point" rot={r * 0.45} />)}
        <Petal l={128} w={36} shape="point" />
      </At>
    </g>
  );
}
function Tulip() {
  return (
    <g>
      <Stem d="M0 40C4 -40-4 -100 0 -150" w={7} />
      <Leaf y={30} l={160} w={26} rot={-20} /><Leaf y={30} l={130} w={22} rot={24} fill="var(--stem2)" />
      <At y={-148}>
        <path d="M-42 -8C-56 -60-34 -104 0 -112C34 -104 56 -60 42 -8C30 12-30 12-42 -8Z" fill="var(--petal2)" />
        <Petal l={110} w={30} shape="point" rot={-15} x={-12} />
        <Petal l={110} w={30} shape="point" rot={15} x={12} />
        <Petal l={100} w={26} shape="point" fill="var(--petal2)" />
      </At>
    </g>
  );
}
function Orchid() {
  const bloom = (x: number, y: number, s: number, r: number) => (
    <At key={x} x={x} y={y} s={s} r={r}>
      {[0, 125, 235].map((a) => <Petal key={a} l={52} w={15} rot={a} />)}
      <Petal l={50} w={30} rot={-72} /><Petal l={50} w={30} rot={72} />
      <path d="M0 6C14 14 16 32 0 38C-16 32-14 14 0 6Z" fill="var(--heart)" />
      <circle r="7" fill="var(--petal2)" />
    </At>
  );
  return (
    <g>
      <Leaf x={-60} y={40} l={110} w={34} rot={-72} /><Leaf x={-60} y={40} l={100} w={32} rot={64} fill="var(--stem2)" />
      <Stem d="M-60 40C-70 -100 0 -200 120 -232" w={4} />
      {bloom(-46, -140, 1, -6)}{bloom(18, -196, 0.85, 8)}
      <ellipse cx="96" cy="-226" rx="14" ry="10" fill="var(--petal2)" /><ellipse cx="120" cy="-232" rx="8" ry="6" fill="var(--stem2)" />
    </g>
  );
}
function Jasmine() {
  const bloom = (x: number, y: number, s: number) => <At key={`${x}${y}`} x={x} y={y} s={s} r={x}><Ring n={6} l={36} w={12} /><circle r="5" fill="var(--heart)" /></At>;
  return (
    <g>
      <Stem d="M0 40C0 -60-10 -150 0 -230M-4 -90C-30 -110-50 -140-60 -175M-6 -60C20 -90 40 -120 55 -155" w={4} />
      {[[-12, -40, -60], [6, -100, 55], [-36, -140, -40], [30, -130, 40], [-4, -180, -30]].map(([x, y, r], i) => <Leaf key={i} x={x} y={y} l={50} w={18} rot={r} fill={i % 2 ? 'var(--stem2)' : 'var(--stem)'} />)}
      {bloom(0, -238, 1)}{bloom(-62, -182, 0.9)}{bloom(56, -162, 0.85)}{bloom(-34, -110, 0.7)}
      <ellipse cx="28" cy="-214" rx="5" ry="11" fill="var(--petal2)" stroke="var(--edge)" strokeOpacity="0.5" /><ellipse cx="-78" cy="-142" rx="5" ry="10" fill="var(--petal2)" stroke="var(--edge)" strokeOpacity="0.5" />
    </g>
  );
}
function Hibiscus() {
  return (
    <g>
      <Stem d="M0 40C-6 -30 6 -100 0 -150" w={7} />
      <Leaf y={-30} l={80} w={30} rot={-60} /><Leaf y={-80} l={70} w={26} rot={62} fill="var(--stem2)" />
      <At y={-178} r={-10}>
        <Ring n={5} l={88} w={40} shape="wide" off={18} />
        <Ring n={5} l={34} w={14} off={18} fill="var(--heart)" />
        <path d="M0 0C10 -30 20 -62 36 -96" stroke="var(--petal2)" strokeWidth="5" fill="none" strokeLinecap="round" />
        {[[30, -88], [38, -96], [32, -100], [42, -104], [26, -94]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4.5" fill="#f6c844" />)}
      </At>
    </g>
  );
}
function Lily() {
  return (
    <g>
      <Stem d="M0 40C4 -40-4 -100 0 -150" w={6} />
      {[-40, 0, -80, -110].map((y, i) => <Leaf key={i} y={y} l={70} w={10} rot={i % 2 ? 50 : -50} fill={i % 2 ? 'var(--stem2)' : 'var(--stem)'} />)}
      <At y={-180}>
        <Ring n={3} l={92} w={24} shape="point" off={30} fill="var(--petal2)" />
        <Ring n={3} l={98} w={24} shape="point" />
        {Array.from({ length: 6 }, (_, i) => <g key={i} transform={`rotate(${i * 60 + 12})`}><path d="M0 0L0 -50" stroke="var(--stem2)" strokeWidth="2.5" /><ellipse cy="-52" rx="4" ry="8" fill="var(--heart)" /></g>)}
      </At>
    </g>
  );
}
function Daisy() {
  const bloom = (x: number, y: number, s: number) => <At key={x} x={x} y={y} s={s}><Ring n={21} l={50} w={7} /><circle r="15" fill="var(--heart)" /></At>;
  return (
    <g>
      <Stem d="M0 40C-4 -60 4 -140 0 -200M-10 40C-40 -40-60 -90-70 -130M10 40C40 -10 60 -60 70 -95" w={4} />
      {[-70, -30, 30, 60].map((r, i) => <Petal key={i} y={40} l={60} w={14} rot={r} fill="var(--stem)" edge={false} />)}
      {bloom(0, -200, 1)}{bloom(-70, -130, 0.78)}{bloom(70, -95, 0.66)}
    </g>
  );
}
function Poppy() {
  return (
    <g>
      <Stem d="M0 40C-10 -40 20 -110 10 -150" w={5} />
      <Stem d="M-6 20C-60 -20-70 -70-50 -90" w={4} />
      <ellipse cx="-50" cy="-98" rx="11" ry="16" fill="var(--stem)" transform="rotate(30 -50 -98)" />
      <Leaf y={30} l={70} w={16} rot={-60} /><Leaf y={20} l={64} w={14} rot={56} fill="var(--stem2)" />
      <At x={10} y={-185}>
        <Ring n={4} l={76} w={42} shape="wide" off={45} fill="var(--petal2)" />
        <Ring n={4} l={68} w={38} shape="wide" />
        <Ring n={4} l={22} w={12} off={45} fill="var(--heart)" />
        <circle r="13" fill="var(--stem2)" />
        {Array.from({ length: 8 }, (_, i) => <path key={i} d="M0 0L0 -12" transform={`rotate(${i * 45})`} stroke="var(--heart)" strokeWidth="2" />)}
      </At>
    </g>
  );
}
function Peony() {
  return (
    <g>
      <Stem d="M0 40C-4 -30 4 -90 0 -140" w={7} />
      {[[-56, -40], [58, -60], [-40, -100], [44, -112]].map(([r, y], i) => <Leaf key={i} y={y} l={60} w={20} rot={r} fill={i % 2 ? 'var(--stem2)' : 'var(--stem)'} />)}
      <At y={-188}>
        <Ring n={9} l={84} w={34} fill="var(--petal2)" />
        <Ring n={8} l={70} w={30} off={22} />
        <Ring n={7} l={54} w={26} off={8} fill="var(--petal2)" />
        <Ring n={6} l={38} w={20} off={30} />
        <Ring n={5} l={22} w={14} off={12} fill="var(--petal2)" />
        <circle r="6" fill="var(--heart)" />
      </At>
    </g>
  );
}
function Magnolia() {
  return (
    <g>
      <Stem d="M-120 40C-60 -20-20 -80 0 -120" w={9} />
      <Leaf x={-80} y={0} l={110} w={34} rot={-75} /><Leaf x={-40} y={-60} l={120} w={36} rot={60} fill="var(--stem2)" /><Leaf x={-60} y={-30} l={100} w={30} rot={-20} />
      <At y={-130}>
        <Petal l={100} w={34} rot={-36} fill="var(--petal2)" /><Petal l={100} w={34} rot={36} fill="var(--petal2)" />
        <ellipse cy="-70" rx="12" ry="26" fill="var(--heart)" />
        <Petal l={108} w={36} rot={-14} /><Petal l={108} w={36} rot={14} /><Petal l={96} w={32} fill="var(--petal2)" />
      </At>
    </g>
  );
}
function Frangipani() {
  const bloom = (x: number, y: number, s: number, r: number) => (
    <At key={x} x={x} y={y} s={s} r={r}><Ring n={5} l={56} w={24} shape="wide" shift={10} /><Ring n={5} l={22} w={10} shift={6} fill="var(--petal2)" /><circle r="9" fill="var(--heart)" /></At>
  );
  return (
    <g>
      <Stem d="M0 40C-4 -40 0 -90 -4 -130M-4 -120C-40 -150-50 -170-60 -190M-4 -120C30 -150 50 -170 60 -195" w={10} />
      {[-70, -40, 40, 72].map((r, i) => <Leaf key={i} y={-120} l={120} w={22} rot={r} fill={i % 2 ? 'var(--stem2)' : 'var(--stem)'} />)}
      {bloom(-62, -200, 1, 0)}{bloom(62, -205, 0.95, 30)}{bloom(0, -170, 0.85, 15)}
    </g>
  );
}
function Strelitzia() {
  return (
    <g>
      <Leaf x={-10} y={40} l={170} w={34} rot={-38} /><Leaf x={10} y={40} l={150} w={30} rot={34} fill="var(--stem2)" />
      <Stem d="M0 40L0 -120" w={8} />
      <path d="M-30 -118C10 -150 90 -152 150 -136C90 -126 30 -110-30 -112Z" fill="var(--stem2)" />
      <At x={20} y={-136}>
        <Petal l={120} w={13} shape="point" rot={-8} />
        <Petal l={108} w={13} shape="point" rot={14} fill="var(--petal2)" />
        <Petal l={96} w={12} shape="point" rot={34} />
        <Petal l={82} w={8} shape="point" rot={56} fill="var(--heart)" edge={false} />
      </At>
    </g>
  );
}
function Camellia() {
  return (
    <g>
      <Stem d="M-100 40C-50 -20-20 -90 0 -150M-40 -40C10 -60 50 -70 90 -80" w={6} />
      {[[-60, 0, -60], [-20, -90, 60], [40, -66, -30], [70, -80, 60], [-30, -60, -40]].map(([x, y, r], i) => <Leaf key={i} x={x} y={y} l={56} w={20} rot={r} fill={i % 2 ? 'var(--stem2)' : 'var(--stem)'} />)}
      <At y={-175}>
        <Ring n={7} l={72} w={34} fill="var(--petal2)" />
        <Ring n={6} l={54} w={30} off={25} />
        <circle r="16" fill="var(--heart)" />
        {Array.from({ length: 12 }, (_, i) => <circle key={i} cx={11 * Math.cos(i * 0.52)} cy={11 * Math.sin(i * 0.52)} r="2.6" fill="#fff4c2" />)}
      </At>
      <At x={92} y={-92} s={0.42}><Ring n={6} l={60} w={30} /><circle r="12" fill="var(--heart)" /></At>
    </g>
  );
}
function Bluebell() {
  const arc = [[-20, 40], [-20, -100], [10, -200], [100, -235]];
  const bell = 'M-14 0C-16 20-18 36-24 44L-12 40L-6 46L0 40L6 46L12 40L24 44C18 36 16 20 14 0C8 -6-8 -6-14 0Z';
  return (
    <g>
      <Leaf x={-24} y={40} l={170} w={13} rot={-24} /><Leaf x={-16} y={40} l={150} w={12} rot={18} fill="var(--stem2)" />
      <path d={`M${arc[0]}C${arc[1]} ${arc[2]} ${arc[3]}`} stroke="var(--stem)" strokeWidth="5" fill="none" strokeLinecap="round" />
      {[0.4, 0.52, 0.64, 0.75, 0.85, 0.94].map((t, i) => {
        const [x, y] = bez(t, arc);
        return <g key={i} transform={`translate(${x} ${y})`}><path d="M0 0C10 4 14 12 14 20" stroke="var(--stem)" strokeWidth="3" fill="none" /><At x={14} y={22} s={0.65 + t * 0.4} r={-12}><path d={bell} fill={i % 2 ? 'var(--petal2)' : 'var(--petal1)'} /></At></g>;
      })}
    </g>
  );
}
function Marigold() {
  const bloom = (x: number, y: number, s: number) => (
    <At key={x} x={x} y={y} s={s}>
      <Ring n={16} l={60} w={13} shape="frill" />
      <Ring n={14} l={50} w={13} shape="frill" off={11} fill="var(--petal2)" />
      <Ring n={12} l={38} w={12} shape="frill" off={4} />
      <Ring n={10} l={26} w={10} shape="frill" off={16} fill="var(--petal2)" />
      <circle r="8" fill="var(--heart)" />
    </At>
  );
  return (
    <g>
      <Stem d="M0 40C-4 -40 4 -120 0 -180M0 -40C30 -60 50 -90 70 -115" w={6} />
      {Array.from({ length: 8 }, (_, i) => <Leaf key={i} y={-10 - i * 14} l={34} w={7} rot={i % 2 ? 62 : -62} fill={i % 2 ? 'var(--stem2)' : 'var(--stem)'} />)}
      {bloom(0, -200, 1)}{bloom(70, -120, 0.62)}
    </g>
  );
}

// ───────── Flowers of Indonesia ─────────
function Rafflesia() {
  const spots = [[-20, -60], [10, -75], [30, -55], [-35, -85], [0, -95], [25, -90], [-10, -45], [40, -78], [-40, -62]];
  return (
    <g>
      <Stem d="M-150 30C-90 10-40 30 10 20S110 0 150 20" w={8} />
      <At y={-120}>
        {Array.from({ length: 5 }, (_, i) => (
          <g key={i} transform={`rotate(${i * 72})`}>
            <Petal l={118} w={62} shape="wide" />
            {spots.map(([x, y], k) => <circle key={k} cx={x * 0.9} cy={y} r={k % 3 ? 5 : 7} fill="#f6e4d6" opacity="0.85" />)}
          </g>
        ))}
        <circle r="50" fill="var(--petal2)" />
        <circle r="40" fill="var(--heart)" />
        <circle r="30" fill="#2a0c09" />
        {Array.from({ length: 14 }, (_, i) => <circle key={i} cx={20 * Math.cos(i * 0.45)} cy={20 * Math.sin(i * 0.45)} r="3" fill="var(--petal2)" opacity="0.7" />)}
      </At>
    </g>
  );
}
function Titan() {
  return (
    <g>
      <path d="M-30 40C-34 20-30 0-26 -10L26 -10C30 0 34 20 30 40Z" fill="var(--stem)" />
      <path d="M-26 -10C-110 -40-120 -120-70 -150C-60 -110-40 -70 0 -60C40 -70 60 -110 70 -150C120 -120 110 -40 26 -10Z" fill="var(--petal2)" />
      <path d="M-20 -14C-90 -44-96 -112-62 -138C-52 -102-34 -76 0 -68C34 -76 52 -102 62 -138C96 -112 90 -44 20 -14Z" fill="var(--petal1)" />
      {[-70, -40, 40, 70].map((x, i) => <path key={i} d={`M${x * 0.5} -30C${x * 0.9} -60 ${x} -100 ${x * 0.95} -130`} stroke="var(--petal2)" strokeOpacity="0.45" strokeWidth="3" fill="none" />)}
      <path d="M-16 -50C-20 -140-14 -230 0 -270C14 -230 20 -140 16 -50Z" fill="var(--heart)" stroke="var(--edge)" strokeOpacity="0.4" strokeWidth="2" />
    </g>
  );
}
function Edelweiss() {
  const star = (x: number, y: number, s: number) => (
    <At key={`${x}${y}`} x={x} y={y} s={s} r={x}>
      <Ring n={9} l={40} w={10} shape="point" fill="var(--petal2)" off={20} />
      <Ring n={9} l={34} w={9} shape="point" />
      {[[0, 0], [-8, -6], [8, -5], [-6, 8], [7, 7]].map(([a, b], i) => <circle key={i} cx={a} cy={b} r="6" fill="var(--heart)" />)}
    </At>
  );
  return (
    <g>
      <Stem d="M0 40C-4 -40 0 -110 0 -160M-2 -60C-40 -90-60 -120-70 -150M2 -80C40 -100 58 -120 66 -140" w={4} c="var(--stem)" />
      {Array.from({ length: 8 }, (_, i) => <Leaf key={i} y={20 - i * 18} l={44} w={6} rot={i % 2 ? 58 : -58} fill="var(--stem)" />)}
      {star(0, -175, 1)}{star(-72, -160, 0.8)}{star(68, -150, 0.75)}{star(-18, -128, 0.55)}
    </g>
  );
}
function BlackOrchid() {
  const bloom = (x: number, y: number, s: number, r: number) => (
    <At key={x} x={x} y={y} s={s} r={r}>
      {[0, 130, 230].map((a) => <Petal key={a} l={58} w={14} shape="point" rot={a} />)}
      <Petal l={52} w={11} shape="point" rot={-70} fill="var(--petal2)" /><Petal l={52} w={11} shape="point" rot={70} fill="var(--petal2)" />
      <path d="M0 4C20 10 26 34 14 50C6 58-6 58-14 50C-26 34-20 10 0 4Z" fill="var(--heart)" />
      {[-8, 0, 8].map((v) => <path key={v} d={`M${v * 0.6} 10L${v} 46`} stroke="#4a5a2a" strokeWidth="1.5" />)}
    </At>
  );
  return (
    <g>
      <Leaf x={-20} y={40} l={150} w={22} rot={-28} /><Leaf x={0} y={40} l={130} w={20} rot={10} fill="var(--stem2)" />
      <Stem d="M10 30C40 -60 60 -140 20 -230" w={4} />
      {bloom(46, -110, 0.9, 20)}{bloom(42, -180, 0.8, -10)}{bloom(18, -236, 0.6, -20)}
    </g>
  );
}
function TigerOrchid() {
  const spots = [[0, -20], [-6, -34], [6, -42], [0, -50], [-4, -14]];
  const bloom = (x: number, y: number, s: number) => (
    <At key={`${x}${y}`} x={x} y={y} s={s}>
      {Array.from({ length: 5 }, (_, i) => (
        <g key={i} transform={`rotate(${i * 72})`}><Petal l={54} w={18} />{spots.map(([a, b], k) => <circle key={k} cx={a} cy={b} r="4" fill="var(--heart)" opacity="0.85" />)}</g>
      ))}
      <circle r="8" fill="var(--heart)" />
    </At>
  );
  return (
    <g>
      {[-30, -10, 12].map((x, i) => <path key={i} d={`M${x} 40C${x - 6} -40 ${x + 4} -100 ${x - 4} -140`} stroke="var(--stem)" strokeWidth="10" strokeLinecap="round" fill="none" />)}
      {[-60, -40, 40, 60].map((r, i) => <Leaf key={i} x={-10} y={-120} l={90} w={10} rot={r} fill={i % 2 ? 'var(--stem2)' : 'var(--stem)'} />)}
      <Stem d="M20 30C60 -40 90 -140 110 -250" w={4} />
      {[[46, -40, 0.62], [70, -100, 0.62], [88, -160, 0.6], [102, -220, 0.55]].map(([x, y, s]) => bloom(x, y, s))}
    </g>
  );
}
function Vanda() {
  const bloom = (x: number, y: number, s: number, r: number) => (
    <At key={x} x={x} y={y} s={s} r={r}>
      {Array.from({ length: 5 }, (_, i) => (
        <g key={i} transform={`rotate(${i * 72 + 36})`}><Petal l={56} w={24} />{[[0, -18], [-8, -30], [8, -32], [0, -42], [-6, -48], [6, -46]].map(([a, b], k) => <circle key={k} cx={a} cy={b} r="3.6" fill="#8a4a2a" opacity="0.75" />)}</g>
      ))}
      <path d="M0 0C12 6 14 26 0 36C-14 26-12 6 0 0Z" fill="var(--heart)" />
      <circle r="6" fill="#fff" />
    </At>
  );
  return (
    <g>
      <Stem d="M0 40L0 -120" w={8} />
      {Array.from({ length: 6 }, (_, i) => <Leaf key={i} y={20 - i * 22} l={86} w={11} rot={i % 2 ? 66 : -66} fill={i % 2 ? 'var(--stem2)' : 'var(--stem)'} />)}
      <Stem d="M0 -100C30 -140 50 -180 50 -240" w={3} />
      {bloom(32, -150, 0.85, 10)}{bloom(54, -218, 0.75, -10)}{bloom(-20, -170, 0.7, -20)}
    </g>
  );
}
function TorchGinger() {
  return (
    <g>
      <Stem d="M0 40L0 -150" w={7} />
      <At y={-170}>
        <Ring n={14} l={86} w={20} shape="point" fill="var(--petal2)" off={12} />
        <Ring n={12} l={66} w={18} shape="point" />
        <Ring n={10} l={40} w={14} shape="point" off={18} fill="var(--heart)" />
        <circle r="14" fill="var(--petal1)" />
        {Array.from({ length: 10 }, (_, i) => <circle key={i} cx={56 * Math.cos(i * 0.63)} cy={56 * Math.sin(i * 0.63)} r="3" fill="#f6d04d" />)}
      </At>
      <Leaf x={-60} y={40} l={130} w={20} rot={-20} /><Leaf x={60} y={40} l={120} w={18} rot={24} fill="var(--stem2)" />
    </g>
  );
}
function Clove() {
  const bud = (x: number, y: number, r: number) => (
    <g key={`${x}${y}`} transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d="M-4 0L-5 -26L5 -26L4 0Z" fill="var(--heart)" />
      <circle cy={-32} r="8" fill="var(--petal1)" />
      {[-5, 5].map((v) => <path key={v} d={`M${v} -26L${v * 2} -30`} stroke="var(--heart)" strokeWidth="3" />)}
    </g>
  );
  const open = (x: number, y: number) => (
    <g key={`o${x}${y}`} transform={`translate(${x} ${y})`}>
      <path d="M-4 0L-5 -24L5 -24L4 0Z" fill="var(--heart)" />
      {Array.from({ length: 16 }, (_, i) => { const a = -Math.PI / 2 + (i - 7.5) * 0.17, L = 26 + (i % 3) * 5; return <g key={i}><path d={`M0 -24L${L * Math.cos(a)} ${-24 + L * Math.sin(a)}`} stroke="var(--petal2)" strokeWidth="1.6" /><circle cx={L * Math.cos(a)} cy={-24 + L * Math.sin(a)} r="2.2" fill="#f2d27a" /></g>; })}
    </g>
  );
  return (
    <g>
      <Stem d="M0 40C-4 -40 4 -90 0 -150M0 -100C-30 -120-50 -130-70 -150M0 -110C30 -125 50 -140 70 -160" w={5} />
      {[[-40, -80, -60], [40, -90, 60], [-60, -40, -40], [60, -40, 50]].map(([x, y, r], i) => <Leaf key={i} x={x * 0.4} y={y} l={70} w={20} rot={r} fill={i % 2 ? 'var(--stem2)' : 'var(--stem)'} />)}
      {[[0, -150, 0], [-14, -146, -24], [14, -146, 24], [-70, -150, -10], [-82, -144, -34], [70, -160, 10], [84, -152, 32]].map(([x, y, r]) => bud(x, y, r))}
      {open(-56, -152)}{open(56, -164)}
    </g>
  );
}
function Kenanga() {
  const bloom = (x: number, y: number, s: number) => (
    <At key={x} x={x} y={y} s={s}>
      {[-40, -20, -4, 10, 26, 44].map((a, i) => (
        <path key={i} d={`M0 0C${a * 0.4} 14 ${a * 0.9} 40 ${a * 0.7 + (i % 2 ? 8 : -8)} 86C${a * 0.7} 70 ${a * 0.6} 40 0 0Z`} fill={i % 2 ? 'var(--petal2)' : 'var(--petal1)'} stroke="var(--edge)" strokeOpacity="0.5" strokeWidth="1.6" />
      ))}
      <circle r="7" fill="var(--heart)" />
    </At>
  );
  return (
    <g>
      <Stem d="M-140 -220C-60 -200 20 -200 140 -240M-40 -205C-30 -180-20 -170-10 -160M60 -214C64 -196 70 -186 76 -176" w={6} />
      {[[-100, -212, 120], [-20, -204, 70], [100, -228, 120], [30, -210, 140]].map(([x, y, r], i) => <Leaf key={i} x={x} y={y} l={70} w={22} rot={r} fill={i % 2 ? 'var(--stem2)' : 'var(--stem)'} />)}
      {bloom(-10, -158, 1)}{bloom(76, -174, 0.85)}{bloom(-90, -190, 0.65)}
    </g>
  );
}
function Cempaka() {
  return (
    <g>
      <Stem d="M0 40C-4 -40 4 -110 0 -150" w={6} />
      <Leaf y={-30} l={96} w={28} rot={-58} /><Leaf y={-80} l={90} w={26} rot={56} fill="var(--stem2)" />
      <At y={-160}>
        {[-58, -34, 34, 58].map((r) => <Petal key={r} l={92} w={13} shape="point" rot={r} fill="var(--petal2)" />)}
        {[-46, -20, 20, 46].map((r) => <Petal key={r} l={102} w={14} shape="point" rot={r} />)}
        <Petal l={108} w={15} shape="point" fill="var(--petal2)" />
        <ellipse cy="-26" rx="7" ry="18" fill="var(--heart)" />
      </At>
    </g>
  );
}

const ART: Record<FlowerId, () => ReactNode> = {
  iris: Iris, rose: Rose, sunflower: Sunflower, cherry: Cherry, lavender: Lavender, lotus: Lotus, tulip: Tulip, orchid: Orchid,
  jasmine: Jasmine, hibiscus: Hibiscus, lily: Lily, daisy: Daisy, poppy: Poppy, peony: Peony, magnolia: Magnolia,
  frangipani: Frangipani, strelitzia: Strelitzia, camellia: Camellia, bluebell: Bluebell, marigold: Marigold,
  rafflesia: Rafflesia, titan: Titan, edelweiss: Edelweiss, blackorchid: BlackOrchid, tigerorchid: TigerOrchid,
  vanda: Vanda, torchginger: TorchGinger, clove: Clove, kenanga: Kenanga, cempaka: Cempaka,
};

export function FlowerArt({ flower, className, style }: { flower: string; className?: string; style?: CSSProperties }) {
  const A = ART[resolveFlower(flower)];
  return <svg className={className} style={style} viewBox="-160 -280 320 330" aria-hidden><A /></svg>;
}

/** The scene behind the glass: a soft colour wash and large flower drawings in the corners. */
export function Backdrop({ flower }: { flower: string }) {
  return (
    <div className="backdrop" aria-hidden>
      <FlowerArt flower={flower} className="leaf leaf-a" />
      <FlowerArt flower={flower} className="leaf leaf-b" />
      <FlowerArt flower={flower} className="leaf leaf-c" />
    </div>
  );
}
