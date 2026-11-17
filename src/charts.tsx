import { useEffect, useRef, useState, type ReactNode } from 'react';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceScale(max: number, min = 0) {
  const span = Math.max(max - min, 1);
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v < max + step * 0.999; v += step) ticks.push(v);
  return { lo, hi: ticks[ticks.length - 1], ticks };
}

export interface Series { name: string; color: string; values: (number | null)[]; muted?: boolean }

export function Legend({ series }: { series: { name: string; color: string; line?: boolean }[] }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.name}><i className={s.line ? 'key line' : 'key'} style={{ background: s.color }} />{s.name}</span>
      ))}
    </div>
  );
}

function Tip({ x, w, children }: { x: number; w: number; children: ReactNode }) {
  const left = x > w / 2;
  return <div className="tip" style={left ? { right: w - x + 12 } : { left: x + 12 }}>{children}</div>;
}

/** Grouped columns — e.g. income vs spending per month. */
export function ColumnChart({ labels, series, fmt, fmtAxis, height = 220, extra }: {
  labels: string[]; series: Series[]; fmt: (n: number) => string; fmtAxis: (n: number) => string; height?: number;
  extra?: (i: number) => ReactNode;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 46, padB = 24, padT = 8;
  const ih = height - padB - padT, iw = Math.max(w - padL - 4, 10);
  const { hi, ticks } = niceScale(Math.max(1, ...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const band = iw / labels.length;
  const bw = Math.max(3, Math.min(24, (band - 10) / series.length - 2));
  const y = (v: number) => padT + ih - (v / hi) * ih;
  const every = Math.ceil(labels.length / Math.max(1, Math.floor(iw / 44)));
  return (
    <div className="chart" ref={ref}>
      {series.length > 1 && <Legend series={series} />}
      <div className="plot" style={{ height }} onMouseLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(', ')}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={w} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="tick">{fmtAxis(t)}</text>
              </g>
            ))}
            {labels.map((l, i) => {
              const cx = padL + band * i + band / 2;
              const total = series.length * bw + (series.length - 1) * 2;
              return (
                <g key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
                  <rect x={padL + band * i} y={padT} width={band} height={ih} className={hover === i ? 'band on' : 'band'} />
                  {series.map((s, si) => {
                    const v = s.values[i] ?? 0;
                    const h = Math.max(v > 0 ? 2 : 0, padT + ih - y(v));
                    const x = cx - total / 2 + si * (bw + 2);
                    const r = Math.min(4, h, bw / 2);
                    return <path key={si} fill={s.color} d={`M${x},${padT + ih} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z`} />;
                  })}
                  {i % every === (labels.length - 1) % every && <text x={cx} y={height - 6} textAnchor="middle" className="tick">{l}</text>}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && (
          <Tip x={padL + band * hover + band / 2} w={w}>
            <b>{labels[hover]}</b>
            {series.map((s) => <span key={s.name}><i className="key" style={{ background: s.color }} />{s.name}<em>{fmt(s.values[hover] ?? 0)}</em></span>)}
            {extra?.(hover)}
          </Tip>
        )}
      </div>
    </div>
  );
}

/** Lines over an ordered x axis, with an optional horizontal reference line. */
export function LineChart({ labels, series, fmt, fmtAxis, height = 220, refLine, area, tipLabel, zeroBased = true }: {
  labels: string[]; series: Series[]; fmt: (n: number) => string; fmtAxis: (n: number) => string; height?: number;
  refLine?: { value: number; label: string }; area?: boolean; tipLabel?: (i: number) => string; zeroBased?: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 46, padB = 24, padT = 12, padR = 10;
  const ih = height - padB - padT, iw = Math.max(w - padL - padR, 10);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (refLine) all.push(refLine.value);
  const min = zeroBased ? Math.min(0, ...all) : Math.min(...all);
  const { lo, hi, ticks } = niceScale(Math.max(1, ...all), min);
  const n = labels.length;
  const x = (i: number) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => padT + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const path = (vals: (number | null)[]) => vals.map((v, i) => (v === null ? '' : `${i === 0 || vals[i - 1] === null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join('');
  const every = Math.ceil(n / Math.max(1, Math.floor(iw / 48)));
  const move = (cx: number, el: Element) => {
    const r = el.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.round(((cx - r.left - padL) / iw) * (n - 1)))));
  };
  const lastIdx = (v: (number | null)[]) => { let k = -1; v.forEach((p, i) => { if (p !== null) k = i; }); return k; };
  return (
    <div className="chart" ref={ref}>
      {series.length > 1 && <Legend series={series.map((s) => ({ ...s, line: true }))} />}
      <div className="plot" style={{ height }} onMouseMove={(e) => move(e.clientX, e.currentTarget)} onTouchMove={(e) => move(e.touches[0].clientX, e.currentTarget)} onTouchStart={(e) => move(e.touches[0].clientX, e.currentTarget)} onMouseLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(', ')}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={w} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="tick">{fmtAxis(t)}</text>
              </g>
            ))}
            {labels.map((l, i) => i % every === 0 && <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="tick">{l}</text>)}
            {refLine && (
              <g>
                <line x1={padL} x2={w - padR} y1={y(refLine.value)} y2={y(refLine.value)} className="refline" />
                <text x={padL + 6} y={y(refLine.value) - 6} className="tick strong">{refLine.label}</text>
              </g>
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} className="cross" />}
            {series.map((s) => {
              const li = lastIdx(s.values);
              return (
                <g key={s.name}>
                  {area && !s.muted && li >= 0 && <path d={`${path(s.values)}L${x(li)},${y(lo)}L${x(0)},${y(lo)}Z`} fill={s.color} opacity={0.1} />}
                  <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {!s.muted && li >= 0 && <circle cx={x(li)} cy={y(s.values[li]!)} r={4} fill={s.color} className="dot" />}
                  {hover !== null && s.values[hover] != null && <circle cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} className="dot" />}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && (
          <Tip x={x(hover)} w={w}>
            <b>{tipLabel ? tipLabel(hover) : labels[hover]}</b>
            {series.map((s) => s.values[hover] != null && <span key={s.name}><i className="key line" style={{ background: s.color }} />{s.name}<em>{fmt(s.values[hover]!)}</em></span>)}
          </Tip>
        )}
      </div>
    </div>
  );
}

/** Tiny single-series column chart used in small multiples. */
export function MiniBars({ values, labels, fmt, color = 'var(--series-1)' }: { values: number[]; labels: string[]; fmt: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="minibars">
      {values.map((v, i) => (
        <div key={i} className="mb" title={`${labels[i]}: ${fmt(v)}`}>
          <i style={{ height: `${Math.max(v > 0 ? 4 : 0, (v / max) * 100)}%`, background: i === values.length - 1 ? color : 'var(--series-muted)' }} />
        </div>
      ))}
    </div>
  );
}

export function Meter({ value, max, tone }: { value: number; max: number; tone?: 'ok' | 'warn' | 'over' }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`meter ${tone ?? 'ok'}`} role="meter" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${p}%` }} />
    </div>
  );
}

/** Ranked horizontal bars: one hue, largest first. */
export function RankBars({ rows, fmt, onPick }: { rows: { id: string; label: ReactNode; value: number; note?: string }[]; fmt: (n: number) => string; onPick?: (id: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rank">
      {rows.map((r) => (
        <button key={r.id} className="rank-row" onClick={() => onPick?.(r.id)} disabled={!onPick}>
          <span className="rank-label">{r.label}</span>
          <span className="rank-val">{fmt(r.value)}{r.note && <small>{r.note}</small>}</span>
          <span className="rank-track"><i style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} /></span>
        </button>
      ))}
    </div>
  );
}
