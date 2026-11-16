// Plant themes: each sets the accent, the background wash, the leaf colours,
// and the plant drawn behind the glass. Chart colours come from pairs checked
// for colour-blind readability (see README); text colours meet contrast on glass.
import { useId, type CSSProperties, type ReactNode } from 'react';

type Plant = 'monstera' | 'eucalyptus' | 'fern' | 'bamboo' | 'sunflower' | 'maple' | 'sakura' | 'lavender' | 'lotus' | 'olive';
interface Mode { accent: string; ink: string; bg: [string, string, string]; leaf: [string, string]; s1: string; s2: string }
export interface Theme { id: Plant; name: string; blurb: string; light: Mode; dark: Mode }

const GV = { light: ['#008300', '#6250d6'], dark: ['#0ca30c', '#9085e9'] }; // green · violet
const AO = { light: ['#1baf7a', '#eb6834'], dark: ['#199e70', '#d95926'] }; // aqua · orange
const BO = { light: ['#2a78d6', '#eb6834'], dark: ['#3987e5', '#d95926'] }; // blue · orange
const OB = { light: ['#eb6834', '#2a78d6'], dark: ['#d95926', '#3987e5'] }; // orange · blue
const MG = { light: ['#e87ba4', '#008300'], dark: ['#d55181', '#0ca30c'] }; // magenta · green
const VR = { light: ['#6250d6', '#e34948'], dark: ['#9085e9', '#e66767'] }; // violet · red

const t = (id: Plant, name: string, blurb: string, s: typeof GV, l: Omit<Mode, 's1' | 's2'>, d: Omit<Mode, 's1' | 's2'>): Theme =>
  ({ id, name, blurb, light: { ...l, s1: s.light[0], s2: s.light[1] }, dark: { ...d, s1: s.dark[0], s2: s.dark[1] } });

export const THEMES: Theme[] = [
  t('monstera', 'Monstera', 'Deep tropical green', GV,
    { accent: '#1f8a4c', ink: '#156b39', bg: ['#d6f0dc', '#eef6e6', '#cfe9e3'], leaf: ['#2f9a5a', '#7cc48f'] },
    { accent: '#34b36a', ink: '#6fd497', bg: ['#0f2a1b', '#0b1a12', '#12302a'], leaf: ['#1d6b3e', '#2f8a55'] }),
  t('eucalyptus', 'Eucalyptus', 'Soft silver sage', AO,
    { accent: '#3f8576', ink: '#2c6457', bg: ['#dde9e4', '#eef2ee', '#d8e3e8'], leaf: ['#7fa89c', '#a9c7bd'] },
    { accent: '#5fae9c', ink: '#8fd0c0', bg: ['#14241f', '#0e1714', '#16232a'], leaf: ['#3c6b5f', '#4f8576'] }),
  t('fern', 'Fern', 'Cool forest teal', BO,
    { accent: '#0e7490', ink: '#0b5b72', bg: ['#d3ece9', '#e9f3ee', '#d4e4ef'], leaf: ['#2a8c84', '#6fbfa9'] },
    { accent: '#22a3c4', ink: '#6ccbe3', bg: ['#0c2426', '#0a171a', '#0f2230'], leaf: ['#17605e', '#237a72'] }),
  t('bamboo', 'Bamboo', 'Fresh spring green', GV,
    { accent: '#4d8a10', ink: '#3b6b0b', bg: ['#e6f2cf', '#f2f6e6', '#d9eccf'], leaf: ['#7db33a', '#b5d97a'] },
    { accent: '#7cc33a', ink: '#a6dc72', bg: ['#1a2a0e', '#11190a', '#16260f'], leaf: ['#3f6b1a', '#548a25'] }),
  t('sunflower', 'Sunflower', 'Warm summer gold', BO,
    { accent: '#b07a00', ink: '#7f5800', bg: ['#fbefc6', '#f8f4e3', '#e6efd2'], leaf: ['#f0b52a', '#7aa43a'] },
    { accent: '#e0a91a', ink: '#f3cb5e', bg: ['#2a220b', '#181409', '#1b2410'], leaf: ['#8a6512', '#4c6b1f'] }),
  t('maple', 'Maple', 'Autumn red and amber', OB,
    { accent: '#c8430f', ink: '#9a330b', bg: ['#fbe1cf', '#f8efe4', '#f6dccf'], leaf: ['#e0662f', '#efa043'] },
    { accent: '#ec6a37', ink: '#f59a72', bg: ['#2c160c', '#1a0f09', '#2a1a0c'], leaf: ['#8a3515', '#9a5a1a'] }),
  t('sakura', 'Sakura', 'Cherry blossom pink', MG,
    { accent: '#cf2f78', ink: '#a1205c', bg: ['#fbe0ea', '#f9f0f2', '#f1e0ee'], leaf: ['#f39ac0', '#f8c6da'] },
    { accent: '#ec6aa4', ink: '#f59cc4', bg: ['#2a1220', '#190c14', '#24122a'], leaf: ['#8a2f5a', '#a0476f'] }),
  t('lavender', 'Lavender', 'Calm purple fields', VR,
    { accent: '#7343d9', ink: '#5a2fb8', bg: ['#e7e0f8', '#f2eff7', '#e0e6f4'], leaf: ['#9b7be3', '#8fb28a'] },
    { accent: '#a083f0', ink: '#c2b0f7', bg: ['#1d1630', '#120f1d', '#18192c'], leaf: ['#5a3f9a', '#3f5f3f'] }),
  t('lotus', 'Blue Lotus', 'Still water blue', BO,
    { accent: '#2563eb', ink: '#1d4fbf', bg: ['#dbe7fb', '#eef2f8', '#dcecf0'], leaf: ['#5b8fe0', '#7dc1b0'] },
    { accent: '#5b8ff2', ink: '#9ab9f7', bg: ['#0f1a33', '#0b111f', '#0f2229'], leaf: ['#2a4f9a', '#245e57'] }),
  t('olive', 'Olive', 'Mediterranean olive grove', GV,
    { accent: '#6a7d22', ink: '#515f18', bg: ['#e8edd2', '#f3f3e6', '#e3e8d6'], leaf: ['#8a9c4a', '#b8c48a'] },
    { accent: '#9fb54a', ink: '#c2d47a', bg: ['#1c2210', '#13170b', '#1a2014'], leaf: ['#4f5c22', '#66753a'] }),
];
export const THEME_IDS = THEMES.map((x) => x.id);
export type ThemeId = Plant;

const vars = (m: Mode, dark: boolean) => `
  --accent: ${m.accent}; --accent-ink: ${m.ink}; --series-1: ${m.s1}; --series-2: ${m.s2};
  --bg1: ${m.bg[0]}; --bg2: ${m.bg[1]}; --bg3: ${m.bg[2]}; --leaf1: ${m.leaf[0]}; --leaf2: ${m.leaf[1]};
  --accent-wash: color-mix(in srgb, ${m.accent} ${dark ? 22 : 14}%, transparent);
  --track: color-mix(in srgb, ${m.s1} ${dark ? 30 : 24}%, ${dark ? '#1b221d' : '#ffffff'});`;

/** CSS for every theme, light and dark, following the same three-state theme rules as the rest of the app. */
export function themeCSS() {
  return THEMES.map((x) => `
:root[data-plant="${x.id}"] {${vars(x.light, false)} }
@media (prefers-color-scheme: dark) { :root[data-plant="${x.id}"]:not([data-theme='light']) {${vars(x.dark, true)} } }
:root[data-plant="${x.id}"][data-theme='dark'] {${vars(x.dark, true)} }`).join('\n');
}

// ───────── plant drawings (origin at the base, growing upward, ~260 tall) ─────────
const leafD = (len: number, w: number) => `M0 0C${w} ${-len * 0.22} ${w * 0.95} ${-len * 0.72} 0 ${-len}C${-w * 0.95} ${-len * 0.72} ${-w} ${-len * 0.22} 0 0Z`;
const Leaf = ({ len, w, rot = 0, x = 0, y = 0, fill = 'var(--leaf1)', vein = true }: { len: number; w: number; rot?: number; x?: number; y?: number; fill?: string; vein?: boolean }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`}>
    <path d={leafD(len, w)} fill={fill} />
    {vein && <path d={`M0 -4L0 ${-len * 0.9}`} stroke="var(--vein)" strokeWidth={Math.max(1.2, w / 9)} strokeLinecap="round" />}
  </g>
);

function Monstera() {
  // The splits and holes are cut out of the leaf with a mask, so whatever is behind shows through.
  const id = useId().replace(/:/g, '');
  const slits = [[-1, 0.3], [-1, 0.5], [-1, 0.68], [1, 0.32], [1, 0.52], [1, 0.7]];
  return (
    <g>
      <defs>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="-170" y="-280" width="340" height="260">
          <rect x="-170" y="-280" width="340" height="260" fill="#fff" />
          {slits.map(([s, f], i) => <path key={i} d={`M${s * 18} ${-40 - f * 190}L${s * 160} ${-40 - f * 190 + 32}`} stroke="#000" strokeWidth="11" strokeLinecap="round" />)}
          {[[-55, -110], [52, -150], [-40, -190]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="9" ry="14" fill="#000" />)}
        </mask>
      </defs>
      <path d="M0 40C-6 10-4 -20 0 -40" stroke="var(--leaf2)" strokeWidth="9" fill="none" strokeLinecap="round" />
      <g mask={`url(#m${id})`}>
        <path d="M0 -40C-110 -50-150 -170-80 -235C-40 -270-8 -250 0 -232C8 -250 40 -270 80 -235C150 -170 110 -50 0 -40Z" fill="var(--leaf1)" />
        <path d="M0 -44C0 -120 0 -180 0 -232" stroke="var(--vein)" strokeWidth="4" fill="none" />
      </g>
    </g>
  );
}
function Eucalyptus() {
  const pts = Array.from({ length: 9 }, (_, i) => i);
  return (
    <g>
      <path d="M0 30C10 -60-20 -150 8 -250" stroke="var(--leaf2)" strokeWidth="5" fill="none" strokeLinecap="round" />
      {pts.map((i) => { const y = -10 - i * 27, x = Math.sin(i * 0.7) * 8, s = i % 2 ? 1 : -1, r = 26 - i * 1.5;
        return <ellipse key={i} cx={x + s * (r + 4)} cy={y} rx={r} ry={r * 0.88} fill={i % 3 === 1 ? 'var(--leaf2)' : 'var(--leaf1)'} />; })}
    </g>
  );
}
function Fern() {
  return (
    <g>
      <path d="M0 30Q-20 -120 20 -255" stroke="var(--leaf1)" strokeWidth="5" fill="none" strokeLinecap="round" />
      {Array.from({ length: 16 }, (_, i) => { const tt = i / 16, y = -10 - i * 15, x = -18 * Math.sin(tt * 2.2) + tt * 30, len = 70 * (1 - tt) + 14;
        return <g key={i}><Leaf x={x} y={y} len={len} w={9} rot={-68 + tt * 20} vein={false} /><Leaf x={x} y={y} len={len} w={9} rot={68 - tt * 20} fill="var(--leaf2)" vein={false} /></g>; })}
    </g>
  );
}
function Bamboo() {
  return (
    <g>
      <rect x="-9" y="-150" width="18" height="190" rx="8" fill="var(--leaf2)" />
      <rect x="-12" y="-62" width="24" height="7" rx="3" fill="var(--vein)" /><rect x="-12" y="-130" width="24" height="7" rx="3" fill="var(--vein)" />
      <Leaf y={-128} len={170} w={17} rot={-38} /><Leaf y={-128} len={150} w={15} rot={8} /><Leaf y={-128} len={160} w={16} rot={48} fill="var(--leaf2)" />
      <Leaf y={-60} len={120} w={13} rot={-70} fill="var(--leaf2)" /><Leaf y={-60} len={110} w={12} rot={72} />
    </g>
  );
}
function Sunflower() {
  return (
    <g>
      <path d="M0 40C6 -40-6 -90 0 -140" stroke="var(--leaf2)" strokeWidth="9" fill="none" />
      <Leaf y={-40} len={80} w={26} rot={-55} fill="var(--leaf2)" /><Leaf y={-70} len={70} w={22} rot={58} fill="var(--leaf2)" />
      <g transform="translate(0 -185)">
        {Array.from({ length: 18 }, (_, i) => <Leaf key={i} len={62} w={16} rot={i * 20} y={0} vein={false} />)}
        <circle r="42" fill="var(--vein)" /><circle r="30" fill="var(--leaf2)" opacity="0.6" />
      </g>
    </g>
  );
}
function Maple() {
  const half = [[0, -250], [18, -200], [55, -222], [48, -170], [105, -178], [80, -132], [100, -98], [48, -100], [36, -70], [12, -82]];
  const pts = [...half, ...half.slice(1).reverse().map(([x, y]) => [-x, y])].map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <g>
      <path d="M0 30L0 -80" stroke="var(--leaf2)" strokeWidth="6" strokeLinecap="round" />
      <polygon points={pts} fill="var(--leaf1)" stroke="var(--leaf1)" strokeWidth="10" strokeLinejoin="round" />
      {[[0, -240], [52, -210], [95, -170], [-52, -210], [-95, -170]].map(([x, y], i) => <path key={i} d={`M0 -82L${x * 0.85} ${y * 0.9 + 8}`} stroke="var(--vein)" strokeWidth="3" />)}
    </g>
  );
}
function Sakura() {
  const petal = 'M0 0C20 -10 28 -42 13 -62L0 -53L-13 -62C-28 -42-20 -10 0 0Z';
  const blossom = (x: number, y: number, s: number, r: number) => (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${r})`}>
      {Array.from({ length: 5 }, (_, i) => <path key={i} d={petal} transform={`rotate(${i * 72})`} fill="var(--leaf1)" />)}
      <circle r="10" fill="var(--leaf2)" />
    </g>
  );
  return (
    <g>
      <path d="M-120 40C-60 -40 0 -80 40 -180M-20 -60C30 -70 70 -90 110 -120" stroke="var(--vein)" strokeWidth="9" fill="none" strokeLinecap="round" />
      {blossom(40, -190, 1.1, 10)}{blossom(110, -125, 0.8, 30)}{blossom(-30, -60, 0.9, -10)}{blossom(-95, 5, 0.65, 20)}{blossom(10, -120, 0.55, 40)}
    </g>
  );
}
function Lavender() {
  return (
    <g>
      {[[-40, -14], [0, 0], [40, 12]].map(([x, r], k) => (
        <g key={k} transform={`translate(${x} 0) rotate(${r})`}>
          <path d="M0 40L0 -240" stroke="var(--leaf2)" strokeWidth="4" strokeLinecap="round" />
          <Leaf y={-10} len={70} w={6} rot={-20} fill="var(--leaf2)" vein={false} />
          {Array.from({ length: 10 }, (_, i) => <g key={i}><ellipse cx={-7} cy={-150 - i * 10} rx="7" ry="10" fill="var(--leaf1)" /><ellipse cx={7} cy={-155 - i * 10} rx="7" ry="10" fill="var(--leaf1)" /></g>)}
        </g>
      ))}
    </g>
  );
}
function Lotus() {
  return (
    <g>
      <path d="M0 -20m-150 0a150 50 0 1 0 300 0a150 50 0 1 0 -300 0M0 -20L130 -48L118 -6Z" fill="var(--leaf2)" fillRule="evenodd" />
      <g transform="translate(-10 -60)">
        {[-60, -30, 0, 30, 60].map((r, i) => <Leaf key={i} len={i === 2 ? 130 : 105} w={i === 2 ? 34 : 30} rot={r} fill={i % 2 ? 'var(--leaf1)' : 'var(--vein)'} vein={false} />)}
      </g>
    </g>
  );
}
function Olive() {
  return (
    <g>
      <path d="M-110 30C-40 -60 20 -140 60 -250" stroke="var(--vein)" strokeWidth="6" fill="none" strokeLinecap="round" />
      {Array.from({ length: 11 }, (_, i) => { const tt = i / 11; const x = -110 + tt * 170, y = 30 - tt * 280, s = i % 2 ? 1 : -1;
        return <Leaf key={i} x={x} y={y} len={80} w={11} rot={20 + s * 55} fill={i % 3 ? 'var(--leaf1)' : 'var(--leaf2)'} />; })}
      {[[-30, -90], [10, -150], [-62, -40]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="12" ry="16" fill="var(--leaf2)" />)}
    </g>
  );
}
export const PLANTS: Record<Plant, () => ReactNode> = { monstera: Monstera, eucalyptus: Eucalyptus, fern: Fern, bamboo: Bamboo, sunflower: Sunflower, maple: Maple, sakura: Sakura, lavender: Lavender, lotus: Lotus, olive: Olive };

export function PlantArt({ plant, className, style }: { plant: ThemeId; className?: string; style?: CSSProperties }) {
  const P = PLANTS[plant] ?? Monstera;
  return <svg className={className} style={style} viewBox="-160 -280 320 330" aria-hidden><P /></svg>;
}

/** The scene behind the glass: a soft colour wash and large plant drawings in the corners. */
export function Backdrop({ plant }: { plant: ThemeId }) {
  return (
    <div className="backdrop" aria-hidden>
      <PlantArt plant={plant} className="leaf leaf-a" />
      <PlantArt plant={plant} className="leaf leaf-b" />
      <PlantArt plant={plant} className="leaf leaf-c" />
    </div>
  );
}
