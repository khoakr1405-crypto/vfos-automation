import { ACCENT_TEXT, type AccentKey } from '@/lib/nav';

type SparklineProps = {
  data: number[];
  accent?: AccentKey;
  width?: number;
  height?: number;
};

/** Dependency-free inline sparkline (SVG polyline). Decorative, mock data. */
export function Sparkline({ data, accent = 'blue', width = 120, height = 34 }: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const y = (v: number) => height - ((v - min) / range) * (height - 6) - 3;

  const points = data.map((v, i) => `${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lastX = (data.length - 1) * stepX;
  const lastY = y(data[data.length - 1] ?? min);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={ACCENT_TEXT[accent]}
      aria-hidden
    >
      <title>sparkline</title>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.2} fill="currentColor" />
    </svg>
  );
}
