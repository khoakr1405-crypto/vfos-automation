/**
 * Shopee CDP browser bootstrap (Round 27B).
 *
 * Wraps the operator pre-requisite of "open Cốc Cốc with
 * --remote-debugging-port=9222". When invoked by the CDP extraction CLI:
 *
 *   1. Probe 127.0.0.1:9222. If already listening → skip launch.
 *   2. Otherwise resolve the Cốc Cốc executable (Cốc Cốc only — never Chrome/
 *      Edge) by VFOS_BROWSER_PATH env override or standard Windows paths.
 *   3. Refuse to launch unless a safe user-data-dir is configured
 *      (VFOS_BROWSER_USER_DATA_DIR) — we will never silently spawn a fresh
 *      profile that drops the user's Shopee login session.
 *   4. Refuse to launch if the user-data-dir is currently locked by another
 *      browser instance (SingletonLock / LockFile present).
 *   5. spawn detached with --remote-debugging-port=9222 + --user-data-dir,
 *      redirect stdout/stderr to production/_commerce/cdp_bootstrap.log,
 *      then poll the port until it accepts a TCP connection (default 15s).
 *
 * Also exports the CAPTCHA / login-wall human-assist guard primitives that
 * the CLI runs after attaching to the page.
 *
 * Security HARD:
 *   - Never write cookies, tokens, or auth headers to the log file.
 *   - Never input password / OTP / captcha.
 *   - Never close the browser when the CLI exits — operator reuses the
 *     session.
 *
 * Testability:
 *   - All side effects (probePort, fileExists, lstat, spawn, openLogFile,
 *     sleep, now, env) are injectable via `BootstrapDeps`. Tests pass in
 *     fakes; production wires up real fs/net/child_process implementations.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import {
  closeSync,
  mkdirSync,
  existsSync as nodeExistsSync,
  lstatSync as nodeLstatSync,
  openSync,
} from 'node:fs';
import { type Socket, connect } from 'node:net';
import { dirname } from 'node:path';

export type CdpBootstrapReasonCode =
  | 'ERR_CDP_BROWSER_NOT_FOUND_ON_DISK'
  | 'ERR_CDP_PORT_TIMEOUT_AFTER_LAUNCH'
  | 'ERR_CDP_PROFILE_LOCKED'
  | 'ERR_CDP_USER_DATA_DIR_REQUIRED'
  | 'ERR_CDP_BROWSER_LAUNCH_FAILED';

export class CdpBootstrapError extends Error {
  reason_code: CdpBootstrapReasonCode;
  constructor(reason_code: CdpBootstrapReasonCode, message: string) {
    super(message);
    this.reason_code = reason_code;
    this.name = 'CdpBootstrapError';
  }
}

/** Outcome of `bootstrapBrowser` */
export interface BootstrapResult {
  status: 'already_running' | 'launched';
  browser_path: string | null;
  user_data_dir: string | null;
  port: number;
  waited_ms_after_launch: number;
}

export interface BootstrapConfig {
  /** CDP host (default "127.0.0.1") */
  host?: string;
  /** CDP port (default 9222) */
  port?: number;
  /** Total ms to wait for the port to open after spawn (default 15000) */
  port_wait_timeout_ms?: number;
  /** Poll interval while waiting for the port (default 1000) */
  port_poll_interval_ms?: number;
  /** TCP connect probe timeout per attempt (default 500) */
  port_probe_timeout_ms?: number;
  /** Optional override — bypass env + path discovery */
  browser_path_override?: string;
  /** Optional override — bypass env user-data-dir lookup */
  user_data_dir_override?: string;
  /** Optional log file path (default production/_commerce/cdp_bootstrap.log) */
  log_path?: string;
  /** URL to open in the spawned browser (default Shopee Affiliate offer page) */
  start_url?: string;
  /** If true, never spawn — only probe (used by --no-auto-launch) */
  no_auto_launch?: boolean;
  /**
   * When no override/env user-data-dir is set, fall back to the VFOS-dedicated
   * default profile (see resolveDefaultUserDataDir) instead of throwing
   * ERR_CDP_USER_DATA_DIR_REQUIRED. This lets the operator run the flow without
   * any one-time env setup: the browser still auto-opens; they only sign in to
   * Shopee once inside that dedicated profile and the session persists.
   */
  use_default_user_data_dir?: boolean;
}

export interface SpawnHandle {
  unref(): void;
}

export interface BootstrapDeps {
  probePort: (host: string, port: number, timeoutMs: number) => Promise<boolean>;
  fileExists: (path: string) => boolean;
  isFile: (path: string) => boolean;
  ensureDir: (path: string) => void;
  spawn: (
    cmd: string,
    args: string[],
    opts: { detached: boolean; stdio: ['ignore', number, number] | 'ignore' },
  ) => SpawnHandle;
  openLogFds: (path: string) => { stdout_fd: number; stderr_fd: number; close: () => void };
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  envGet: (key: string) => string | undefined;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9222;
const DEFAULT_PORT_WAIT_TIMEOUT_MS = 15_000;
const DEFAULT_PORT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_PORT_PROBE_TIMEOUT_MS = 500;
const DEFAULT_START_URL = 'https://affiliate.shopee.vn/offer/product_offer';
export const DEFAULT_CAPTCHA_WAIT_SECONDS = 20;
export const MIN_CAPTCHA_WAIT_SECONDS = 10;
export const MAX_CAPTCHA_WAIT_SECONDS = 60;

/**
 * Default browser-executable search order. Cốc Cốc ONLY — the operator's single
 * designated browser for the Shopee Affiliate workflow (Round 26B). We do NOT
 * fall back to Chrome or Edge: a different browser would not carry the Shopee
 * affiliate login session and would land on a login wall. Set VFOS_BROWSER_PATH
 * if Cốc Cốc is installed at a non-standard location.
 */
export const DEFAULT_BROWSER_PATHS_WIN32 = [
  'C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe',
  'C:\\Program Files (x86)\\CocCoc\\Browser\\Application\\browser.exe',
  // %LOCALAPPDATA% expansion happens at runtime in resolveBrowserPath()
  '%LOCALAPPDATA%\\CocCoc\\Browser\\Application\\browser.exe',
] as const;

/**
 * Profile-lock files that indicate the user-data-dir is already owned by a
 * running browser instance. Spawning a second instance against the same
 * directory either silently joins the running one (defeating debug flag) or
 * crashes (corrupting state). Bail early.
 */
const PROFILE_LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'LockFile'] as const;

// ── Real-world default deps ──────────────────────────────────────────────────

export function realProbePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolveProbe) => {
    let settled = false;
    const sock: Socket = connect({ host, port });
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {}
      resolveProbe(ok);
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(timeoutMs, () => done(false));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export const realDeps: BootstrapDeps = {
  probePort: realProbePort,
  fileExists: (p) => nodeExistsSync(p),
  isFile: (p) => {
    try {
      return nodeLstatSync(p).isFile();
    } catch {
      return false;
    }
  },
  ensureDir: (p) => {
    if (!nodeExistsSync(p)) mkdirSync(p, { recursive: true });
  },
  spawn: (cmd, args, opts) => nodeSpawn(cmd, args, opts),
  openLogFds: (path) => {
    const dir = dirname(path);
    if (!nodeExistsSync(dir)) mkdirSync(dir, { recursive: true });
    const fd = openSync(path, 'a');
    return {
      stdout_fd: fd,
      stderr_fd: fd,
      close: () => {
        try {
          closeSync(fd);
        } catch {}
      },
    };
  },
  sleep,
  now: () => Date.now(),
  envGet: (k) => process.env[k],
};

// ── Helpers (pure-ish, testable) ─────────────────────────────────────────────

/**
 * Expand a Windows-style %LOCALAPPDATA% prefix using the env adapter.
 * Returns the original path unchanged if no %VAR% prefix is present or the
 * referenced env var is undefined.
 */
export function expandEnvPath(p: string, envGet: (k: string) => string | undefined): string {
  return p.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (whole, name) => {
    const v = envGet(name);
    return v == null ? whole : v;
  });
}

/**
 * Resolve which browser executable to spawn. Priority:
 *   1. config.browser_path_override (used by tests)
 *   2. VFOS_BROWSER_PATH env
 *   3. DEFAULT_BROWSER_PATHS_WIN32 in order (Cốc Cốc first, then Chrome)
 *
 * Throws ERR_CDP_BROWSER_NOT_FOUND_ON_DISK if no candidate exists.
 */
export function resolveBrowserPath(config: BootstrapConfig, deps: BootstrapDeps): string {
  const candidates: string[] = [];
  if (config.browser_path_override) candidates.push(config.browser_path_override);
  const envPath = deps.envGet('VFOS_BROWSER_PATH');
  if (envPath) candidates.push(envPath);
  for (const p of DEFAULT_BROWSER_PATHS_WIN32) candidates.push(expandEnvPath(p, deps.envGet));

  for (const c of candidates) {
    if (c && deps.isFile(c)) return c;
  }

  throw new CdpBootstrapError(
    'ERR_CDP_BROWSER_NOT_FOUND_ON_DISK',
    `Could not find Cốc Cốc. Install Cốc Cốc or set VFOS_BROWSER_PATH to its browser.exe. (Cốc Cốc is the only supported browser for the Shopee Affiliate flow.) Tried: ${candidates.join(', ')}`,
  );
}

/**
 * Resolve which user-data-dir to pass via --user-data-dir.
 *
 * Priority:
 *   1. config.user_data_dir_override (used by tests)
 *   2. VFOS_BROWSER_USER_DATA_DIR env
 *
 * If neither is set we refuse to launch. The reason: silently spawning a
 * fresh profile would drop the operator's Shopee login session, so the very
 * first action of the new browser would be a login wall — and we are
 * forbidden from typing credentials. Requiring an explicit env makes the
 * operator point at the real profile that already has Shopee logged in.
 */
export function resolveUserDataDir(config: BootstrapConfig, deps: BootstrapDeps): string {
  if (config.user_data_dir_override) return config.user_data_dir_override;
  const envDir = deps.envGet('VFOS_BROWSER_USER_DATA_DIR');
  if (envDir && envDir.trim() !== '') return envDir;
  throw new CdpBootstrapError(
    'ERR_CDP_USER_DATA_DIR_REQUIRED',
    'Set VFOS_BROWSER_USER_DATA_DIR to a Cốc Cốc profile path that already has Shopee logged in. We never spawn a blank profile (login wall) or silently reuse a default profile that may be locked by an open browser window.',
  );
}

/**
 * VFOS-dedicated default Cốc Cốc profile, used when the operator has not set
 * VFOS_BROWSER_USER_DATA_DIR. This is a SEPARATE profile owned by VFOS — never
 * the operator's daily Cốc Cốc profile — so it never collides with (locks) a
 * browser window they already have open. The Shopee Affiliate login persists
 * inside this directory after a one-time sign-in, so every later run auto-opens
 * straight into the catalog. It lives outside the repo (under %LOCALAPPDATA% /
 * home) so it is never committed; only if neither is available do we fall back
 * to a repo-local (gitignored) path.
 */
export function resolveDefaultUserDataDir(deps: BootstrapDeps): string {
  const localAppData = deps.envGet('LOCALAPPDATA');
  if (localAppData && localAppData.trim() !== '') {
    return `${localAppData.replace(/[\\/]+$/, '')}\\VFOS\\coccoc-cdp-profile`;
  }
  const home = deps.envGet('USERPROFILE') ?? deps.envGet('HOME');
  if (home && home.trim() !== '') {
    return `${home.replace(/[\\/]+$/, '')}\\.vfos\\coccoc-cdp-profile`;
  }
  return 'production/_commerce/coccoc_cdp_profile';
}

/**
 * Check whether the supplied user-data-dir is currently owned by another
 * browser instance. We never auto-delete these lock files — the owner
 * process may still be alive.
 */
export function detectProfileLock(userDataDir: string, deps: BootstrapDeps): string | null {
  for (const lockName of PROFILE_LOCK_FILES) {
    const path = `${userDataDir.replace(/[\\/]+$/, '')}/${lockName}`;
    if (deps.fileExists(path)) return path;
  }
  return null;
}

// ── Main bootstrap orchestrator ──────────────────────────────────────────────

/**
 * Probe the CDP port; if closed, spawn a browser with debug flags and poll
 * until the port opens.
 *
 * Returns a `BootstrapResult` describing what happened. Throws
 * `CdpBootstrapError` for the error scenarios listed in Round 27B Section III.
 */
export async function bootstrapBrowser(
  config: BootstrapConfig = {},
  deps: BootstrapDeps = realDeps,
): Promise<BootstrapResult> {
  const host = config.host ?? DEFAULT_HOST;
  const port = config.port ?? DEFAULT_PORT;
  const probeTimeout = config.port_probe_timeout_ms ?? DEFAULT_PORT_PROBE_TIMEOUT_MS;

  if (await deps.probePort(host, port, probeTimeout)) {
    return {
      status: 'already_running',
      browser_path: null,
      user_data_dir: null,
      port,
      waited_ms_after_launch: 0,
    };
  }

  if (config.no_auto_launch) {
    throw new CdpBootstrapError(
      'ERR_CDP_BROWSER_LAUNCH_FAILED',
      `--no-auto-launch was set and ${host}:${port} is not listening`,
    );
  }

  const browserPath = resolveBrowserPath(config, deps);
  let userDataDir: string;
  try {
    userDataDir = resolveUserDataDir(config, deps);
  } catch (err) {
    // No override/env profile set. If the caller opted into the safe default,
    // use the VFOS-dedicated profile (auto-created) instead of bailing out and
    // forcing the operator to launch the browser by hand.
    if (
      config.use_default_user_data_dir &&
      err instanceof CdpBootstrapError &&
      err.reason_code === 'ERR_CDP_USER_DATA_DIR_REQUIRED'
    ) {
      userDataDir = resolveDefaultUserDataDir(deps);
      deps.ensureDir(userDataDir);
    } else {
      throw err;
    }
  }

  const lockPath = detectProfileLock(userDataDir, deps);
  if (lockPath) {
    throw new CdpBootstrapError(
      'ERR_CDP_PROFILE_LOCKED',
      `Profile at ${userDataDir} is locked (${lockPath}). Close the existing browser window using this profile, or set VFOS_BROWSER_USER_DATA_DIR to a dedicated VFOS profile.`,
    );
  }

  const logPath = config.log_path ?? 'production/_commerce/cdp_bootstrap.log';
  let logFds: { stdout_fd: number; stderr_fd: number; close: () => void } | null = null;
  try {
    logFds = deps.openLogFds(logPath);
  } catch {
    logFds = null;
  }

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    config.start_url ?? DEFAULT_START_URL,
  ];

  try {
    const child = deps.spawn(browserPath, args, {
      detached: true,
      stdio: logFds ? ['ignore', logFds.stdout_fd, logFds.stderr_fd] : 'ignore',
    });
    child.unref();
  } catch (err) {
    if (logFds) logFds.close();
    throw new CdpBootstrapError(
      'ERR_CDP_BROWSER_LAUNCH_FAILED',
      `spawn() failed for ${browserPath}: ${(err as Error).message}`,
    );
  }

  const totalTimeout = config.port_wait_timeout_ms ?? DEFAULT_PORT_WAIT_TIMEOUT_MS;
  const pollInterval = config.port_poll_interval_ms ?? DEFAULT_PORT_POLL_INTERVAL_MS;
  const start = deps.now();
  while (deps.now() - start < totalTimeout) {
    await deps.sleep(pollInterval);
    if (await deps.probePort(host, port, probeTimeout)) {
      if (logFds) logFds.close();
      return {
        status: 'launched',
        browser_path: browserPath,
        user_data_dir: userDataDir,
        port,
        waited_ms_after_launch: deps.now() - start,
      };
    }
  }

  if (logFds) logFds.close();
  throw new CdpBootstrapError(
    'ERR_CDP_PORT_TIMEOUT_AFTER_LAUNCH',
    `Browser launched but ${host}:${port} did not start listening within ${totalTimeout}ms. Check ${logPath} for stderr.`,
  );
}

// ── CAPTCHA / login-wall human-assist guard ──────────────────────────────────

export interface CaptchaPage {
  url(): string;
  evaluate<T>(fn: () => T): Promise<T>;
}

/**
 * Signals we treat as "CAPTCHA / login wall / verification screen present".
 * Any single match is enough; we wait for ALL of them to disappear before
 * resuming extraction.
 */
export interface CaptchaDetection {
  detected: boolean;
  /** Which signal(s) matched. Empty when detected=false. */
  signals: string[];
}

const CAPTCHA_URL_PATTERNS = [
  'verify.shopee.vn',
  'shopee.vn/security',
  'shopee.vn/verify',
  '/buyer/login',
  'shopee.vn/account/login',
] as const;

/**
 * DOM selectors and text fragments that suggest a verification / login
 * overlay is on screen. Run inside page.evaluate() so the selectors run in
 * the browser context.
 */
function captchaDomScript(): string[] {
  const signals: string[] = [];
  const sel = [
    'div[class*="captcha"]',
    'iframe[src*="captcha"]',
    'iframe[src*="security"]',
    '.shopee-popup__container',
    'div[role="dialog"][class*="login"]',
  ];
  for (const s of sel) {
    if (document.querySelector(s)) signals.push(`dom:${s}`);
  }
  const text = (document.body?.innerText ?? '').toLowerCase();
  for (const kw of ['xác minh', 'captcha', 'verify', 'security check', 'đăng nhập']) {
    if (text.includes(kw)) signals.push(`text:${kw}`);
  }
  return signals;
}

export async function detectCaptchaGuard(page: CaptchaPage): Promise<CaptchaDetection> {
  const url = page.url();
  const urlMatches = CAPTCHA_URL_PATTERNS.filter((p) => url.includes(p)).map((p) => `url:${p}`);
  if (urlMatches.length > 0) {
    return { detected: true, signals: urlMatches };
  }
  try {
    const domMatches = await page.evaluate(captchaDomScript);
    const signals = [...urlMatches, ...domMatches];
    return { detected: signals.length > 0, signals };
  } catch (err) {
    const msg = (err as Error).message;
    if (
      msg.includes('context was destroyed') ||
      msg.includes('navigation') ||
      msg.includes('navigating')
    ) {
      return { detected: true, signals: ['transient-redirect'] };
    }
    throw err;
  }
}

export interface CaptchaWaitOptions {
  /** Total wait budget in seconds — clamped to [MIN, MAX] */
  waitSeconds?: number;
  /** Poll interval in ms (default 1000) */
  pollIntervalMs?: number;
  /** Adapter for sleep + now — injected so tests don't actually sleep */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Optional progress hook (called once per poll). */
  onTick?: (info: {
    secondsElapsed: number;
    secondsRemaining: number;
    detection: CaptchaDetection;
  }) => void;
}

export interface CaptchaWaitResult {
  cleared: boolean;
  signals: string[];
  waited_seconds: number;
  reason_code: 'ERR_CAPTCHA_TIMEOUT' | null;
}

/** Clamp waitSeconds into the configured min/max range. */
export function clampCaptchaWaitSeconds(raw: number | undefined): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_CAPTCHA_WAIT_SECONDS;
  return Math.max(MIN_CAPTCHA_WAIT_SECONDS, Math.min(MAX_CAPTCHA_WAIT_SECONDS, Math.round(n)));
}

/**
 * Block until the CAPTCHA / login overlay clears, or until the wait budget
 * expires. Never closes the browser, never inputs credentials.
 */
export async function waitForCaptchaResolution(
  page: CaptchaPage,
  opts: CaptchaWaitOptions = {},
): Promise<CaptchaWaitResult> {
  const waitSeconds = clampCaptchaWaitSeconds(opts.waitSeconds);
  const pollInterval = opts.pollIntervalMs ?? 1000;
  const sleepFn = opts.sleep ?? sleep;
  const nowFn = opts.now ?? (() => Date.now());

  const start = nowFn();
  const deadline = start + waitSeconds * 1000;
  let lastDetection: CaptchaDetection = { detected: true, signals: ['initial'] };

  while (nowFn() < deadline) {
    lastDetection = await detectCaptchaGuard(page);
    const elapsed = (nowFn() - start) / 1000;
    if (opts.onTick) {
      opts.onTick({
        secondsElapsed: Math.floor(elapsed),
        secondsRemaining: Math.max(0, waitSeconds - Math.floor(elapsed)),
        detection: lastDetection,
      });
    }
    if (!lastDetection.detected) {
      return {
        cleared: true,
        signals: [],
        waited_seconds: Math.floor((nowFn() - start) / 1000),
        reason_code: null,
      };
    }
    await sleepFn(pollInterval);
  }

  return {
    cleared: false,
    signals: lastDetection.signals,
    waited_seconds: waitSeconds,
    reason_code: 'ERR_CAPTCHA_TIMEOUT',
  };
}
