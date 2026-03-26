import { useTradingTheme } from '../context/ThemeContext';

interface MetricCard {
  label: string;
  value: string;
  unit?: string;
  level: 'low' | 'medium' | 'high';
  sparkline: number[];
  change?: string;
  changeDir?: 'up' | 'down' | 'flat';
}

const metrics: MetricCard[] = [
  { label: 'Portfolio DV01', value: '$2,898', level: 'medium', sparkline: [2650, 2700, 2850, 2780, 2900, 2820, 2898], change: '+2.8%', changeDir: 'up' },
  { label: 'Total Duration', value: '5.42', unit: 'yrs', level: 'medium', sparkline: [5.1, 5.3, 5.5, 5.2, 5.4, 5.3, 5.42], change: '+0.12', changeDir: 'up' },
  { label: 'Convexity', value: '0.82', level: 'low', sparkline: [0.78, 0.80, 0.79, 0.81, 0.83, 0.82, 0.82], change: 'flat', changeDir: 'flat' },
  { label: 'VaR (1d 95%)', value: '$124K', level: 'high', sparkline: [95, 105, 110, 98, 115, 120, 124], change: '+3.3%', changeDir: 'up' },
  { label: 'Sharpe Ratio', value: '1.87', level: 'low', sparkline: [1.65, 1.72, 1.80, 1.75, 1.82, 1.85, 1.87], change: '+0.02', changeDir: 'up' },
  { label: 'Credit Spread', value: '72bp', level: 'medium', sparkline: [68, 70, 75, 72, 71, 73, 72], change: '-1bp', changeDir: 'down' },
];

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 64;
  const h = 20;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  // Gradient fill
  const fillPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg width={w} height={h} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`spark-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={fillPoints}
        fill={`url(#spark-grad-${color.replace('#', '')})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MiniDonut({ pct, color, isDark }: { pct: number; color: string; isDark: boolean }) {
  const r = 12;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <svg width={30} height={30} style={{ flexShrink: 0 }}>
      <circle cx={15} cy={15} r={r} fill="none" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'} strokeWidth={3} />
      <circle
        cx={15} cy={15} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 15 15)"
      />
    </svg>
  );
}

export function RiskMetrics() {
  const tradingTheme = useTradingTheme();

  const levelColors = {
    low: { border: `${tradingTheme.colors.positive}26`, bg: `${tradingTheme.colors.positive}0a`, dot: tradingTheme.colors.positive, stroke: tradingTheme.colors.positive, label: 'LOW' },
    medium: { border: `${tradingTheme.colors.warning}26`, bg: `${tradingTheme.colors.warning}0a`, dot: tradingTheme.colors.warning, stroke: tradingTheme.colors.warning, label: 'MED' },
    high: { border: `${tradingTheme.colors.negative}26`, bg: `${tradingTheme.colors.negative}0a`, dot: tradingTheme.colors.negative, stroke: tradingTheme.colors.negative, label: 'HIGH' },
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: tradingTheme.colors.bg, padding: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 5 }}>
        {metrics.map((m, i) => {
          const colors = levelColors[m.level];
          const donutPct = [65, 72, 45, 88, 52, 60][i];
          const cardBg = tradingTheme.isDark
            ? 'linear-gradient(135deg, rgba(23, 27, 46, 0.8), rgba(19, 22, 38, 0.9))'
            : `linear-gradient(135deg, ${tradingTheme.colors.surface}, ${tradingTheme.colors.cardBg})`;
          const cardBorder = tradingTheme.isDark ? colors.border : `${tradingTheme.colors.border}`;
          return (
            <div
              key={m.label}
              style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
                borderRadius: 6,
                padding: '8px 10px',
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <MiniDonut pct={donutPct} color={colors.dot} isDark={tradingTheme.isDark} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: tradingTheme.colors.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.label}
                    </div>
                    <span style={{ fontSize: 8, fontWeight: 700, color: colors.dot, letterSpacing: '0.05em' }}>
                      {colors.label}
                    </span>
                  </div>
                </div>
                <Sparkline data={m.sparkline} color={colors.stroke} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                  <span className="card-value" style={{ fontSize: 16, color: tradingTheme.colors.text }}>{m.value}</span>
                  {m.unit && <span style={{ fontSize: 10, color: tradingTheme.colors.textSecondary, marginLeft: 3 }}>{m.unit}</span>}
                </div>
                {m.change && (
                  <span className="font-mono-num" style={{
                    fontSize: 10,
                    color: m.changeDir === 'up' ? (m.level === 'high' ? tradingTheme.colors.negative : tradingTheme.colors.positive) : m.changeDir === 'down' ? tradingTheme.colors.positive : tradingTheme.colors.textMuted,
                  }}>{m.change}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
