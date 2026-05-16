// Minimal cron evaluator for VFOS scheduler.
//
// Supported syntax per field (5-field, UTC):
//   *           any
//   N           literal
//   N-M         inclusive range
//   N,M,...     comma-separated list (each item may be N, N-M, or */K)
//   */N         step from start of range (1-based for weekday: */2 = 0,2,4,6)
//
// Field order: minute hour day-of-month month day-of-week.
// day-of-week: 0..6 (Sun..Sat). day-of-month + day-of-week both unrestricted
// means "any day"; if either restricts, both must match (matches `cron` lib
// behaviour, not POSIX OR-semantics — simpler to reason about).

export interface CronSpec {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

const RANGES = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6],
} as const;

type FieldName = keyof typeof RANGES;
const ORDER: FieldName[] = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];

function parseField(raw: string, field: FieldName): number[] {
  const [lo, hi] = RANGES[field];
  const out = new Set<number>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '*') {
      for (let v = lo; v <= hi; v += 1) out.add(v);
      continue;
    }
    const stepMatch = trimmed.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (stepMatch) {
      const stepBase = stepMatch[1]!;
      const step = Number(stepMatch[2]);
      if (!Number.isFinite(step) || step <= 0) {
        throw new Error(`cron: invalid step in field "${field}": ${trimmed}`);
      }
      const [base_lo, base_hi] =
        stepBase === '*'
          ? [lo, hi]
          : (() => {
              const m = stepBase.match(/^(\d+)(?:-(\d+))?$/);
              if (!m) throw new Error(`cron: invalid step base "${stepBase}"`);
              const a = Number(m[1]);
              const b = m[2] !== undefined ? Number(m[2]) : hi;
              return [a, b];
            })();
      for (let v = base_lo; v <= base_hi; v += step) out.add(v);
      continue;
    }
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const a = Number(rangeMatch[1]);
      const b = Number(rangeMatch[2]);
      if (a > b) throw new Error(`cron: range reversed in "${field}": ${trimmed}`);
      for (let v = a; v <= b; v += 1) out.add(v);
      continue;
    }
    const literal = Number(trimmed);
    if (!Number.isFinite(literal)) {
      throw new Error(`cron: unparseable field "${field}": "${trimmed}"`);
    }
    out.add(literal);
  }
  const values = [...out].sort((a, b) => a - b);
  for (const v of values) {
    if (v < lo || v > hi) {
      throw new Error(
        `cron: value ${v} out of range for field "${field}" (${lo}..${hi})`,
      );
    }
  }
  if (values.length === 0) {
    throw new Error(`cron: empty value set for field "${field}"`);
  }
  return values;
}

export function parseCron(expr: string): CronSpec {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`cron: expected 5 fields, got ${fields.length} ("${expr}")`);
  }
  const out: Partial<CronSpec> = {};
  for (let i = 0; i < 5; i += 1) {
    const field = ORDER[i]!;
    out[field] = parseField(fields[i]!, field);
  }
  return out as CronSpec;
}

/**
 * Compute the next firing time strictly after `after` (UTC). Returns null if
 * no firing exists in the next 4 years (safety bound to avoid infinite loops
 * on impossible specs like Feb 30).
 */
export function nextRunAt(spec: CronSpec, after: Date): Date | null {
  // Start one minute past `after`, zero seconds/ms.
  const start = new Date(after);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  const limit = new Date(after.getTime() + 4 * 365 * 24 * 3600 * 1000);
  const cursor = new Date(start);
  while (cursor.getTime() < limit.getTime()) {
    const month = cursor.getUTCMonth() + 1;
    if (!spec.month.includes(month)) {
      // jump to first of next month
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }
    const day = cursor.getUTCDate();
    const weekday = cursor.getUTCDay();
    if (!spec.dayOfMonth.includes(day) || !spec.dayOfWeek.includes(weekday)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!spec.hour.includes(cursor.getUTCHours())) {
      cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    if (!spec.minute.includes(cursor.getUTCMinutes())) {
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1, 0, 0);
      continue;
    }
    return new Date(cursor);
  }
  return null;
}

export function validateCron(expr: string): void {
  const spec = parseCron(expr);
  const next = nextRunAt(spec, new Date());
  if (!next) throw new Error(`cron: no firing time in next 4 years for "${expr}"`);
}
