export interface PromSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export interface PromSeries {
  name: string;
  help: string;
  type: string;
  samples: PromSample[];
}

const LINE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+([\d.eE+\-NaN]+)/;

function parseLabels(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1];
    const value = m[2];
    if (key !== undefined && value !== undefined) {
      out[key] = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
    }
  }
  return out;
}

export function parsePrometheus(text: string): PromSeries[] {
  const map = new Map<string, PromSeries>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('# HELP ')) {
      const rest = line.slice('# HELP '.length);
      const sp = rest.indexOf(' ');
      if (sp < 0) continue;
      const name = rest.slice(0, sp);
      const help = rest.slice(sp + 1);
      const existing = map.get(name) ?? { name, help: '', type: 'unknown', samples: [] };
      existing.help = help;
      map.set(name, existing);
      continue;
    }
    if (line.startsWith('# TYPE ')) {
      const rest = line.slice('# TYPE '.length);
      const sp = rest.indexOf(' ');
      if (sp < 0) continue;
      const name = rest.slice(0, sp);
      const type = rest.slice(sp + 1);
      const existing = map.get(name) ?? { name, help: '', type: 'unknown', samples: [] };
      existing.type = type;
      map.set(name, existing);
      continue;
    }
    if (line.startsWith('#')) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const name = m[1];
    if (!name) continue;
    const labels = parseLabels(m[3]);
    const value = Number(m[4]);
    if (!Number.isFinite(value)) continue;
    const baseName = name.replace(/_(bucket|sum|count)$/, '');
    const series =
      map.get(baseName) ??
      map.get(name) ??
      { name: baseName, help: '', type: 'unknown', samples: [] };
    series.samples.push({ name, labels, value });
    map.set(series.name, series);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function counterTotal(series: PromSeries): number {
  return series.samples
    .filter((s) => s.name === series.name)
    .reduce((acc, s) => acc + s.value, 0);
}

export function topLabels(series: PromSeries, labelKey: string, top = 5): {
  label: string;
  value: number;
}[] {
  const buckets = new Map<string, number>();
  for (const s of series.samples) {
    if (s.name !== series.name) continue;
    const k = s.labels[labelKey] ?? '(none)';
    buckets.set(k, (buckets.get(k) ?? 0) + s.value);
  }
  return [...buckets.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}
