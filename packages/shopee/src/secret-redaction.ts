/**
 * Secret Redaction — Shopee Cookie Fetcher v0
 *
 * Masks ALL known Shopee cookie / session / CSRF markers from any string
 * before it reaches console.log, error messages, or output artifacts.
 *
 * Security contract:
 *   - This module NEVER stores or caches unredacted values.
 *   - Every public function returns a SAFE string.
 *   - Caller must ALWAYS use redacted output — never raw input.
 */

/**
 * Known Shopee cookie / token key names that MUST be masked.
 * If any new keys are discovered, add them here.
 */
const SECRET_MARKERS = [
  // Shopee authentication / session
  "SPC_EC",
  "SPC_ST",
  "SPC_U",
  "SPC_T_ID",
  "SPC_R_T_ID",
  "SPC_T_IV",
  "SPC_R_T_IV",
  "SPC_SI",
  "SPC_SC_TK",
  "SPC_SC_UD",
  "SPC_SC_SA_TK",
  "SPC_SC_SA_UD",
  "SPC_SC_OFFLINE_TOKEN",
  "SPC_SC_MAIN_SHOP_SA_UD",
  "SPC_SC_SESSION",
  "SPC_STK",
  "SPC_CDS",
  "SPC_CDS_CHAT",
  "SPC_F",
  "SPC_CLIENTID",
  "csrftoken",
  "shopee_webUnique_ccd",
  "ds",
  "REC_T_ID",
  "REC7iLP4Q",
  "_sapid",
  "SC_SSO",
  "SC_SSO_U",
  "AMP_TOKEN",
  "shopee_token",
  // 3rd-party tracking session ids that ride along in the cookie header
  "_ga",
  "_ga_4GPP1ZXG63",
  "_gcl_au",
  "_fbp",
  "_hjSession",
  "_hjSessionUser",
  "_hjSession_868286",
  "_hjSessionUser_868286",
  "_med",
  "_QPWSDCXHZQA",
] as const;

/**
 * Build a regex that matches `KEY=VALUE` patterns in cookie-style strings.
 * Each key-value match will have the value replaced with `[REDACTED]`.
 *
 * Matches: `SPC_EC=somevalue123;` or `SPC_EC=somevalue123` (end-of-string)
 */
function buildRedactionRegex(): RegExp {
  const keys = SECRET_MARKERS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Match KEY=<value> where value is NOT already [REDACTED]
  // Uses negative lookahead to skip already-redacted values
  return new RegExp(`(${keys.join("|")})\\s*=\\s*(?!\\[REDACTED\\])[^;\\s]+`, "gi");
}

const REDACTION_RE = buildRedactionRegex();

/**
 * Additional patterns to catch raw cookie headers or full cookie strings
 * that could leak into error messages.
 */
const HEADER_PATTERNS = [
  /Cookie:\s*.+/gi,
  /Set-Cookie:\s*.+/gi,
  /cookie:\s*.+/gi,
  /set-cookie:\s*.+/gi,
];

/**
 * Redact all known secret markers from a string.
 *
 * @param input — Raw string that may contain cookie values
 * @returns Sanitized string with all secret values replaced by `[REDACTED]`
 *
 * @example
 *   redactSecrets("SPC_EC=abc123; SPC_ST=xyz789; foo=bar")
 *   // → "SPC_EC=[REDACTED]; SPC_ST=[REDACTED]; foo=bar"
 */
export function redactSecrets(input: string): string {
  let safe = input.replace(REDACTION_RE, (match) => {
    const eqIdx = match.indexOf("=");
    if (eqIdx === -1) return "[REDACTED]";
    return `${match.substring(0, eqIdx + 1)}[REDACTED]`;
  });

  // Redact entire Cookie/Set-Cookie header lines
  for (const pattern of HEADER_PATTERNS) {
    safe = safe.replace(pattern, (match) => {
      const colonIdx = match.indexOf(":");
      if (colonIdx === -1) return "[REDACTED]";
      return `${match.substring(0, colonIdx + 1)} [REDACTED]`;
    });
  }

  return safe;
}

/**
 * Validate that a string does NOT contain any known secret markers with
 * real (unredacted) values. Used as a safety gate before writing JSON artifacts.
 *
 * Strategy: find all KEY=VALUE matches, then check each VALUE is not a real
 * secret (i.e., it's either absent or is the `[REDACTED]` placeholder).
 * Also checks for raw Cookie/Set-Cookie headers with real values.
 *
 * @returns `true` if the string appears clean (no unredacted secrets detected)
 */
export function isSecretFree(input: string): boolean {
  // Check for KEY=<value> patterns — capture the value to inspect
  const keys = SECRET_MARKERS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const kvRe = new RegExp(
    `(?:${keys.join("|")})\\s*=\\s*([^;\\s]+)`,
    "gi",
  );
  let kvMatch: RegExpExecArray | null;
  while ((kvMatch = kvRe.exec(input)) !== null) {
    const value = kvMatch[1] ?? "";
    // [REDACTED] is safe; anything else is a leaked secret
    if (value !== "[REDACTED]") {
      return false;
    }
  }

  // Check for Cookie headers with real values (not "[REDACTED]")
  const cookieHeaderRe = /(?:^|[\r\n])(?:set-)?cookie:\s*(.+)/gim;
  let hdrMatch: RegExpExecArray | null;
  while ((hdrMatch = cookieHeaderRe.exec(input)) !== null) {
    const value = hdrMatch[1]?.trim() ?? "";
    if (value !== "[REDACTED]" && value.length > 0) {
      return false;
    }
  }

  return true;
}

/**
 * Wrap an Error's message through redaction.
 * Returns a new Error with redacted message + same stack.
 *
 * Special-case: `Headers.append` / `TypeError: ... invalid header value`
 * errors thrown by undici/fetch echo back the ENTIRE invalid header value
 * (including the raw cookie). Even with redactSecrets the noise is huge
 * and any unknown key would leak — so we collapse the message to a
 * generic, safe one and never include the offending value.
 */
export function redactError(err: unknown): Error {
  if (err instanceof Error) {
    const rawMsg = err.message;
    const isInvalidHeader =
      /Headers\.(append|set)/i.test(rawMsg) ||
      /invalid header (value|name)/i.test(rawMsg);
    const safeMsg = isInvalidHeader
      ? "invalid header value (likely cookie sanitization issue — value not logged)"
      : redactSecrets(rawMsg);
    const safe = new Error(safeMsg);
    safe.stack = err.stack ? redactSecrets(err.stack) : undefined;
    return safe;
  }
  return new Error(redactSecrets(String(err)));
}
