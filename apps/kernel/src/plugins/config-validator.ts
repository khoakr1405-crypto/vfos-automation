import type { AgentConfigField, AgentConfigSchema } from '@vfos/sdk';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  // Cleaned config: defaults applied, extra properties dropped, primitives
  // coerced where unambiguous (e.g. "250" → 250 when schema says number).
  cleaned: Record<string, unknown>;
}

/**
 * Validate a per-tenant config payload against an agent's configSchema.
 * Intentionally minimal — supports number/integer/string/boolean with
 * min/max/enum/default. Top-level must be `{ type: 'object', properties }`.
 * Extra keys are dropped (not errored) so renaming a config key in a
 * plugin update doesn't brick existing tenants.
 */
export function validateConfig(
  schema: AgentConfigSchema | undefined,
  input: Record<string, unknown>,
): ValidationResult {
  if (!schema) {
    // No schema → free-form passthrough, no validation.
    return { ok: true, errors: [], cleaned: input };
  }
  if (schema.type !== 'object') {
    return { ok: false, errors: ['configSchema.type must be "object"'], cleaned: {} };
  }
  const errors: string[] = [];
  const cleaned: Record<string, unknown> = {};
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  for (const [key, field] of Object.entries(props)) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === '') {
      if (required.has(key)) {
        errors.push(`required field missing: "${key}"`);
        continue;
      }
      if (field.default !== undefined) cleaned[key] = field.default;
      continue;
    }
    const { value, error } = coerceAndCheck(field, raw, key);
    if (error) errors.push(error);
    else cleaned[key] = value;
  }
  // Drop extras silently — extras likely mean stale stored config or
  // unknown keys from the cockpit; surfacing them as errors hurts UX.

  return { ok: errors.length === 0, errors, cleaned };
}

function coerceAndCheck(
  field: AgentConfigField,
  raw: unknown,
  key: string,
): { value?: unknown; error?: string } {
  switch (field.type) {
    case 'number':
    case 'integer': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
      if (!Number.isFinite(n)) {
        return { error: `"${key}" must be ${field.type === 'integer' ? 'an integer' : 'a number'}` };
      }
      if (field.type === 'integer' && !Number.isInteger(n)) {
        return { error: `"${key}" must be an integer` };
      }
      if (field.minimum !== undefined && n < field.minimum) {
        return { error: `"${key}" must be >= ${field.minimum}` };
      }
      if (field.maximum !== undefined && n > field.maximum) {
        return { error: `"${key}" must be <= ${field.maximum}` };
      }
      return { value: n };
    }
    case 'string': {
      if (typeof raw !== 'string') return { error: `"${key}" must be a string` };
      if (field.minLength !== undefined && raw.length < field.minLength) {
        return { error: `"${key}" must be at least ${field.minLength} chars` };
      }
      if (field.maxLength !== undefined && raw.length > field.maxLength) {
        return { error: `"${key}" must be at most ${field.maxLength} chars` };
      }
      if (field.enum && !field.enum.includes(raw)) {
        return { error: `"${key}" must be one of: ${field.enum.join(', ')}` };
      }
      return { value: raw };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { value: raw };
      if (raw === 'true') return { value: true };
      if (raw === 'false') return { value: false };
      return { error: `"${key}" must be a boolean` };
    }
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = field;
      void _exhaustive;
      return { error: `"${key}" has an unsupported field type` };
    }
  }
}
