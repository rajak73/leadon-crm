/**
 * Dependency-free inline SVG charts (render in preview + real browser). Colors
 * use theme CSS variables so they adapt to dark mode.
 */

const PALETTE = ['#4f46e5', '#0ea5e9', '#f59e0b', '#a855f7', '#ec4899', '#22c55e', '#ef4444', '#14b8a6'];

export function BarChart({ data, height = 200, valuePrefix = '' }: { data: { label: string; value: number }[]; height?: number; valuePrefix?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = 100 / (data.length * 1.5);
  return (
    <svg viewBox={`0 0 100 ${height / 2}`} width="100%" height={height} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      {data.map((d, i) => {
        const x = i * (100 / data.length) + (100 / data.length - barW) / 2;
        const h = (d.value / max) * (height / 2 - 20);
        const y = height / 2 - 14 - h;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={Math.max(0.5, h)} rx={1} fill={PALETTE[i % PALETTE.length]} />
            <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize="3.2" fill="var(--muted)">{valuePrefix}{d.value}</text>
            <text x={x + barW / 2} y={height / 2 - 8} textAnchor="middle" fontSize="2.8" fill="var(--muted)">
              {d.label.length > 8 ? d.label.slice(0, 8) + '…' : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({ data, size = 180 }: { data: { label: string; value: number }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 60, cx = 80, cy = 80, stroke = 26;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 160 160" width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * circ;
          const el = (
            <circle key={d.label} cx={cx} cy={cy} r={r} fill="none"
              stroke={PALETTE[i % PALETTE.length]} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} />
          );
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="700" fill="var(--text)">{total}</text>
      </svg>
      <div>
        {data.map((d, i) => (
          <div key={d.label} className="row" style={{ gap: 8, marginBottom: 4, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: PALETTE[i % PALETTE.length], display: 'inline-block' }} />
            <span>{d.label}</span>
            <span className="subtle">{d.value} ({Math.round((d.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LineChart({ data, height = 200, color = '#4f46e5', valuePrefix = '' }: { data: { label: string; value: number }[]; height?: number; color?: string; valuePrefix?: string }) {
  if (data.length === 0) return <div className="empty">No data</div>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100, h = 50;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => `${(i * step).toFixed(2)},${(h - 4 - (d.value / max) * (h - 10)).toFixed(2)}`);
  const total = data.reduce((s, d) => s + d.value, 0);
  // Show a handful of x-axis labels to avoid clutter.
  const labelEvery = Math.ceil(data.length / 6);
  return (
    <div>
      <div className="subtle" style={{ fontSize: 12, marginBottom: 6 }}>Total in range: <strong>{valuePrefix}{total}</strong></div>
      <svg viewBox={`0 0 ${w} ${h + 8}`} width="100%" height={height} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <polyline fill="none" stroke={color} strokeWidth="0.8" points={pts.join(' ')} />
        <polygon fill={color} fillOpacity="0.08" stroke="none" points={`0,${h - 4} ${pts.join(' ')} ${((data.length - 1) * step).toFixed(2)},${h - 4}`} />
        {data.map((d, i) => (
          <circle key={i} cx={(i * step).toFixed(2)} cy={(h - 4 - (d.value / max) * (h - 10)).toFixed(2)} r="0.7" fill={color} />
        ))}
        {data.map((d, i) => (i % labelEvery === 0 ? (
          <text key={'l' + i} x={(i * step).toFixed(2)} y={h + 5} textAnchor="middle" fontSize="2.6" fill="var(--muted)">{d.label}</text>
        ) : null))}
      </svg>
    </div>
  );
}
