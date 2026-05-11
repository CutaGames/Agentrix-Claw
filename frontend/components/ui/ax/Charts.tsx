/**
 * Charts.tsx — Lightweight recharts wrappers themed for Agentrix v4.
 *
 * Exposes:
 *  - <Sparkline />        → tiny inline trend line (used in Stat tiles)
 *  - <TrendChart />       → larger area chart for Dashboard panels
 *  - <RingProgress />     → circular progress with center label (AXP expiry, energy)
 *  - <EmotionBar />       → segmented bar for pet emotion breakdown
 *
 * All components are SSR-safe (rendered in container with explicit height) and
 * gracefully handle empty data with a muted placeholder.
 */
import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// ---------- color tokens (kept in JS to thread into recharts inline svg) ----------
const COLORS = {
  accent:    '#22D3FF',
  accentSoft:'#67E8F9',
  warm:      '#F59E0B',
  warmSoft:  '#FBBF24',
  purple:    '#7C3AED',
  purpleSoft:'#A78BFA',
  success:   '#10B981',
  danger:    '#EF4444',
  line:      '#1C2230',
  mist:      '#94A3B8',
  fog:       '#CBD5E1',
};

const ACCENT_MAP = {
  accent: COLORS.accent,
  warm:   COLORS.warm,
  purple: COLORS.purple,
  success:COLORS.success,
  danger: COLORS.danger,
} as const;

export type ChartAccent = keyof typeof ACCENT_MAP;

// ============================================================================
// Sparkline — minimal inline trend line for Stat tiles
// ============================================================================

export interface SparklineProps {
  /** Array of numbers — will be mapped to {i, v} points. */
  data: number[];
  /** Visual color theme. */
  accent?: ChartAccent;
  /** Pixel height, default 32. */
  height?: number;
  /** Whether to draw a soft area gradient under the line. */
  area?: boolean;
  className?: string;
}

export function Sparkline({
  data,
  accent = 'accent',
  height = 32,
  area = true,
  className,
}: SparklineProps): React.ReactElement {
  const color = ACCENT_MAP[accent];
  const points = React.useMemo(
    () => data.map((v, i) => ({ i, v })),
    [data],
  );
  const gradientId = `sparkline-${accent}`;

  if (data.length === 0) {
    return <div className={className} style={{ height }} />;
  }

  return (
    <div className={className} style={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={area ? `url(#${gradientId})` : 'none'}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// TrendChart — area chart for Dashboard / Wallet / AXP analytics
// ============================================================================

export interface TrendDatum {
  /** Display label on the X axis (e.g. "Mon", "May 5"). */
  label: string;
  /** Numeric value plotted on Y axis. */
  value: number;
}

export interface TrendChartProps {
  data: TrendDatum[];
  accent?: ChartAccent;
  height?: number;
  /** Format function for tooltip + Y-axis label. Defaults to `n.toLocaleString()`. */
  formatValue?: (n: number) => string;
  /** Show X axis labels. Default true. */
  showAxis?: boolean;
}

export function TrendChart({
  data,
  accent = 'accent',
  height = 200,
  formatValue = (n) => n.toLocaleString(),
  showAxis = true,
}: TrendChartProps): React.ReactElement {
  const color = ACCENT_MAP[accent];
  const gradientId = `trend-${accent}`;

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-ax-mist"
        style={{ height }}
      >
        — No data —
      </div>
    );
  }

  return (
    <div style={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showAxis && (
            <>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: COLORS.mist }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: COLORS.mist }}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={formatValue}
              />
            </>
          )}
          <Tooltip
            contentStyle={{
              background: '#0E1118',
              border: `1px solid ${COLORS.line}`,
              borderRadius: 8,
              fontSize: 12,
              padding: '6px 10px',
              color: COLORS.fog,
            }}
            cursor={{ stroke: color, strokeOpacity: 0.25, strokeWidth: 1 }}
            formatter={(value: number | string) =>
              [typeof value === 'number' ? formatValue(value) : value, '']
            }
            separator=""
            labelStyle={{ color: COLORS.mist, fontSize: 11 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: '#0E1118', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// RingProgress — circular progress with center label (AXP expiry, energy)
// ============================================================================

export interface RingProgressProps {
  /** Percentage 0-100. */
  value: number;
  /** Pixel size (width=height), default 96. */
  size?: number;
  /** Stroke width, default size/12. */
  strokeWidth?: number;
  accent?: ChartAccent;
  /** Center label (string or React node). */
  label?: React.ReactNode;
  /** Sub-label below the value. */
  hint?: React.ReactNode;
}

export function RingProgress({
  value,
  size = 96,
  strokeWidth,
  accent = 'accent',
  label,
  hint,
}: RingProgressProps): React.ReactElement {
  const color = ACCENT_MAP[accent];
  const sw = strokeWidth ?? Math.max(4, Math.round(size / 12));
  const clamped = Math.max(0, Math.min(100, value));
  const data = [
    { name: 'value', value: clamped },
    { name: 'rest', value: 100 - clamped },
  ];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={size / 2 - sw}
          outerRadius={size / 2}
          startAngle={90}
          endAngle={-270}
          dataKey="value"
          stroke="none"
          isAnimationActive
        >
          <Cell fill={color} />
          <Cell fill={COLORS.line} />
        </Pie>
      </PieChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {label !== undefined ? label : (
          <span className="text-base font-bold tabular-nums text-ax-ink">{Math.round(clamped)}%</span>
        )}
        {hint && <span className="mt-0.5 text-[10px] text-ax-mist">{hint}</span>}
      </div>
    </div>
  );
}

// ============================================================================
// EmotionBar — segmented horizontal bar of emotion percentages (used in pet UI)
// ============================================================================

export interface EmotionSegment {
  label: string;
  value: number;
  emoji?: string;
  color?: string;
}

export function EmotionBar({
  segments,
  height = 8,
}: {
  segments: EmotionSegment[];
  height?: number;
}): React.ReactElement {
  const total = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  const palette = [COLORS.accent, COLORS.warm, COLORS.purple, COLORS.success, COLORS.danger];

  return (
    <div className="w-full">
      <div
        className="flex w-full overflow-hidden rounded-full bg-white/[0.04]"
        style={{ height }}
      >
        {segments.map((s, i) => (
          <div
            key={s.label}
            style={{
              width: `${(s.value / total) * 100}%`,
              background: s.color ?? palette[i % palette.length],
            }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ax-mist">
        {segments.map((s, i) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: s.color ?? palette[i % palette.length] }}
            />
            {s.emoji} {s.label}
            <span className="tabular-nums text-ax-fog">{Math.round((s.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Convenience: SimpleLineChart — minimal line w/o tooltip (compact spaces)
// ============================================================================

export function SimpleLineChart({
  data,
  accent = 'accent',
  height = 80,
}: {
  data: number[];
  accent?: ChartAccent;
  height?: number;
}): React.ReactElement {
  const color = ACCENT_MAP[accent];
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
