import { useId, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/context";

/**
 * Small, dependency-free SVG charts for the CEO screens (Dashboard 0.20.0). Thin marks, 4px rounded data ends on the
 * baseline, a 2px gap between fills, one axis, recessive grid, a hover/focus tooltip with the real values of the period,
 * and a legend whenever there are two or more series. Every chart has a table next to it on the page.
 */
export type Series = { key: string; label: string; color: string };
export type BarPoint = { label: string; values: Record<string, number>; tooltip: ReactNode };

const W = 900; const H = 240; const PAD = { top: 12, right: 12, bottom: 28, left: 56 };

function niceTop(max: number): number {
  if (max <= 0) return 1;
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / step) * step;
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return <ul className="ceo-legend">{series.map((s) => <li key={s.key}><span className="ceo-swatch" style={{ background: s.color }} aria-hidden="true" />{s.label}</li>)}</ul>;
}

/**
 * Vertical bars per period, stacked by series (parts of one total) or `grouped` side by side (different measures that must
 * never read as a sum). One series = plain bars. Values are already in display units.
 */
export function StackedBars({ points, series, label, format, grouped = false }: { points: BarPoint[]; series: Series[]; label: string; format: (value: number) => string; grouped?: boolean }) {
  const { number } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const totals = points.map((p) => grouped ? Math.max(0, ...series.map((s) => p.values[s.key] ?? 0)) : series.reduce((sum, s) => sum + Math.max(0, p.values[s.key] ?? 0), 0));
  const top = niceTop(Math.max(0, ...totals));
  const plotW = W - PAD.left - PAD.right; const plotH = H - PAD.top - PAD.bottom;
  const slot = points.length > 0 ? plotW / points.length : plotW;
  const barW = Math.max(2, Math.min(36, slot - 2));
  const y = (value: number) => PAD.top + plotH * (1 - value / top);
  const every = Math.max(1, Math.ceil(points.length / 10));
  return (
    <div className="ceo-chart">
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} aria-describedby={`${id}-tip`} onMouseLeave={() => setActive(null)}>
        {[0, top / 2, top].map((tick) => <g key={tick}><line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="ceo-grid" /><text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="ceo-axis">{tick >= 10 ? number(Math.round(tick)) : format(tick)}</text></g>)}
        {points.map((p, index) => {
          const x = PAD.left + index * slot + (slot - barW) / 2;
          let base = 0;
          const groupW = Math.max(1, (barW - 2 * (series.length - 1)) / series.length);
          const segments = grouped ? series.map((s, sIndex) => {
            const value = Math.max(0, p.values[s.key] ?? 0);
            if (value <= 0) return null;
            const height = Math.max(1, y(0) - y(value));
            return <path key={s.key} d={roundedTop(x + sIndex * (groupW + 2), y(value), groupW, height, Math.min(4, groupW / 2, height))} fill={s.color} opacity={active === null || active === index ? 1 : 0.55} />;
          }) : series.map((s, sIndex) => {
            const value = Math.max(0, p.values[s.key] ?? 0);
            if (value <= 0) return null;
            const y0 = y(base); const y1 = y(base + value);
            base += value;
            const height = Math.max(1, y0 - y1 - (sIndex > 0 ? 2 : 0));
            const isTop = series.slice(sIndex + 1).every((next) => (p.values[next.key] ?? 0) <= 0);
            return <path key={s.key} d={roundedTop(x, y1, barW, height, isTop ? Math.min(4, barW / 2, height) : 0)} fill={s.color} opacity={active === null || active === index ? 1 : 0.55} />;
          });
          return (
            <g key={p.label}>
              {segments}
              {index % every === 0 && <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="ceo-axis">{p.label.length > 7 ? p.label.slice(5) : p.label}</text>}
              <rect x={PAD.left + index * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" tabIndex={0} aria-label={`${p.label}: ${format(totals[index])}`}
                onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} />
            </g>
          );
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="ceo-baseline" />
      </svg>
      <div id={`${id}-tip`} className={`ceo-tooltip${active === null ? " is-idle" : ""}`} role="status" aria-live="polite"
        style={active === null ? undefined : { left: `${Math.min(88, Math.max(12, ((PAD.left + (active + 0.5) * slot) / W) * 100))}%` }}>
        {active !== null && <><strong>{points[active].label}</strong>{points[active].tooltip}</>}
      </div>
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Horizontal bars (categories, SKUs, employees): label, bar, value; the bar length is relative to the largest row. */
export function HBars({ rows, label, color = "#2a78d6" }: { rows: { key: string; label: ReactNode; value: number; display: string; color?: string; note?: ReactNode }[]; label: string; color?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="ceo-hbars" aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} title={typeof row.label === "string" ? `${row.label}: ${row.display}` : row.display}>
          <span className="ceo-hbar-label">{row.label}</span>
          <span className="ceo-hbar-track" aria-hidden="true"><span style={{ width: `${max > 0 ? Math.max(1, (row.value / max) * 100) : 0}%`, background: row.color ?? color }} /></span>
          <span className="ceo-hbar-value">{row.display}{row.note}</span>
        </li>
      ))}
    </ul>
  );
}

/** A chart with its table below (shown on demand) and the reconciliation line: the table proves the chart's totals. */
export function ChartCard({ title, description, chart, table, reconciled, actions }: { title: string; description?: ReactNode; chart: ReactNode; table: ReactNode; reconciled?: boolean; actions?: ReactNode }) {
  const { t } = useI18n(); const c = t.ceo.charts;
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="card ceo-card">
      <div className="ceo-card-head">
        <div><h2>{title}</h2>{description && <p className="muted small">{description}</p>}</div>
        <div className="ceo-card-actions">{actions}<button type="button" className="button button-ghost" aria-pressed={showTable} aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>{c.table}</button></div>
      </div>
      {chart}
      {showTable && <div className="table-wrap ceo-table">{table}</div>}
      {reconciled !== undefined && <p className={`small ${reconciled ? "muted" : "form-error"}`} role="note">{reconciled ? c.reconciled : c.notReconciled}</p>}
    </section>
  );
}
