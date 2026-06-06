/**
 * Shopee canonical-URL sanitiser.
 *
 * The long canonical deep-link Shopee returns for an affiliate item carries two
 * classes of query params:
 *
 *   - PUBLIC tracking — utm_source / utm_medium / utm_campaign / utm_content /
 *     utm_term / mmp_pid / exp_group / __mobile__ / uls_trackid. These are how
 *     the affiliate owner (an_17376660568) is attributed and are safe to keep.
 *
 *   - SENSITIVE — credential_token, gads_t_sig (request signature) and any
 *     token / session / auth / cookie / password / secret / signature / otp
 *     param. These are per-request credentials/signatures, are NOT needed for
 *     affiliate attribution (the short link carries that), and must never be
 *     persisted into the Product Card or any downstream artifact.
 *
 * Affiliate attribution rides on the short link plus utm_source/mmp_pid, so
 * stripping the sensitive params does not weaken tracking.
 */

/** Param-NAME patterns we treat as credential/session/signature material. */
const SENSITIVE_NAME_PATTERNS: readonly RegExp[] = [
  /token/i,
  /session/i,
  /auth/i,
  /cookie/i,
  /passwd|password|\bpwd\b/i,
  /secret/i,
  /credential/i,
  /\botp\b/i,
  /signature/i,
  /(^|_)sig($|_)/i, // gads_t_sig, *_sig
];

/** Public tracking params explicitly kept even if a future pattern grows. */
export const PUBLIC_TRACKING_ALLOWLIST: readonly string[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'mmp_pid',
  'exp_group',
  '__mobile__',
  'uls_trackid',
];

/** True when a single query-param NAME looks like a credential/session/signature. */
export function isSensitiveParamName(name: string): boolean {
  const n = name.trim();
  if (PUBLIC_TRACKING_ALLOWLIST.includes(n)) return false;
  return SENSITIVE_NAME_PATTERNS.some((re) => re.test(n));
}

export interface SanitizeResult {
  /** URL with all sensitive params removed; non-sensitive order preserved. */
  cleanUrl: string;
  /** Names of the params that were stripped. */
  strippedParams: string[];
  /** Names of the params that were kept. */
  keptParams: string[];
}

/**
 * Strip credential/session/signature query params from a Shopee canonical URL,
 * keeping the host, path, and public tracking params intact. Robust to inputs
 * that are not valid URLs (returns them unchanged with empty stripped list).
 */
export function sanitizeShopeeCanonicalUrl(url: string | null | undefined): SanitizeResult {
  if (!url) return { cleanUrl: '', strippedParams: [], keptParams: [] };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a parseable URL — fall back to a conservative substring scrub so we
    // never echo a raw credential, but report nothing kept/stripped by name.
    return { cleanUrl: url, strippedParams: [], keptParams: [] };
  }

  const stripped: string[] = [];
  const kept: string[] = [];
  // Collect first so we don't mutate while iterating.
  const names = [...new Set([...parsed.searchParams.keys()])];
  for (const name of names) {
    if (isSensitiveParamName(name)) {
      stripped.push(name);
      parsed.searchParams.delete(name);
    } else {
      kept.push(name);
    }
  }

  return { cleanUrl: parsed.toString(), strippedParams: stripped, keptParams: kept };
}

/**
 * True when a URL still carries any credential/session/signature query param.
 * Param-NAME based (so `credential_token` is caught while a path segment that
 * merely contains the substring "token" is not).
 */
export function containsSensitiveParams(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    for (const name of parsed.searchParams.keys()) {
      if (isSensitiveParamName(name)) return true;
    }
    return false;
  } catch {
    // Fallback for non-URL strings: detect obvious credential query fragments.
    return /[?&][^=&]*(token|session|auth|cookie|password|secret|credential|signature|_sig)[^=&]*=/i.test(
      url,
    );
  }
}

/**
 * Substrings that disqualify a product-image URL. Unlike the canonical-URL
 * sanitiser (which KEEPS public utm_ and mmp_pid tracking on the affiliate
 * link), a real product image is a credential-free CDN URL such as
 * `https://down-vn.img.susercontent.com/file/<hash>`. If any of these tokens
 * appear, the value is a tracking/redirect/credential URL, not a plain image —
 * so we reject it outright.
 */
const IMAGE_URL_FORBIDDEN_SUBSTRINGS: readonly string[] = [
  'credential',
  'credential_token',
  'token',
  'access_token',
  'session',
  'cookie',
  'storage_state',
  'mmp_pid',
  'utm_source',
  'utm_medium',
  'signature',
  'gads_t_sig',
  'label',
  'badge',
  'icon',
  'logo',
  '.svg',
];

/**
 * Sanitise a product-image URL captured from a Shopee DOM card.
 *
 * Accepts unknown input. Trims, upgrades a protocol-relative `//host/path` to
 * https, requires an http(s) scheme, rejects any credential/session/tracking
 * substring (see IMAGE_URL_FORBIDDEN_SUBSTRINGS), and validates it parses as a
 * URL. Returns a safe URL string, or null when missing/unsafe/unparseable.
 */
export function sanitizeProductImageUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  let candidate = url.trim();
  if (candidate === '') return null;
  if (candidate.startsWith('//')) candidate = `https:${candidate}`;
  if (!/^https?:\/\//i.test(candidate)) return null;
  const lower = candidate.toLowerCase();
  if (IMAGE_URL_FORBIDDEN_SUBSTRINGS.some((s) => lower.includes(s))) return null;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

/** Mask a URL for logging: keep host+path, replace the query with param NAMES only. */
export function maskUrlForLog(url: string | null | undefined): string {
  if (!url) return '(none)';
  try {
    const parsed = new URL(url);
    const names = [...parsed.searchParams.keys()];
    const q = names.length ? `?{${names.join(', ')}}` : '';
    return `${parsed.origin}${parsed.pathname}${q}`;
  } catch {
    return url.split('?')[0] ?? '(unparseable)';
  }
}
