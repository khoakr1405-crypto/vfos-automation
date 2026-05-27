import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowser,
  CdpBootstrapError,
  clampCaptchaWaitSeconds,
  detectProfileLock,
  expandEnvPath,
  resolveBrowserPath,
  resolveUserDataDir,
  waitForCaptchaResolution,
  type BootstrapDeps,
  type CaptchaPage,
} from "../src/cdp-bootstrap.ts";

/**
 * Build a BootstrapDeps fake. Tests pass overrides for whatever they need to
 * exercise; defaults are conservative no-ops so an unexpected side effect
 * shows up as a test failure rather than touching the real filesystem.
 */
function fakeDeps(overrides: Partial<BootstrapDeps> = {}): BootstrapDeps {
  return {
    probePort: async () => false,
    fileExists: () => false,
    isFile: () => false,
    ensureDir: () => {},
    spawn: () => {
      throw new Error("test deps: spawn() should not be called");
    },
    openLogFds: () => ({
      stdout_fd: -1,
      stderr_fd: -1,
      close: () => {},
    }),
    sleep: async () => {},
    now: () => 0,
    envGet: () => undefined,
    ...overrides,
  };
}

describe("expandEnvPath", () => {
  test("replaces %LOCALAPPDATA% when env adapter returns a value", () => {
    const out = expandEnvPath("%LOCALAPPDATA%\\CocCoc\\browser.exe", (k) =>
      k === "LOCALAPPDATA" ? "C:\\Users\\u\\AppData\\Local" : undefined,
    );
    assert.equal(out, "C:\\Users\\u\\AppData\\Local\\CocCoc\\browser.exe");
  });

  test("leaves placeholder untouched when env var missing", () => {
    const out = expandEnvPath("%MISSING%\\x.exe", () => undefined);
    assert.equal(out, "%MISSING%\\x.exe");
  });

  test("returns unchanged when there is no placeholder", () => {
    const out = expandEnvPath("C:\\plain\\path", () => undefined);
    assert.equal(out, "C:\\plain\\path");
  });
});

describe("resolveBrowserPath", () => {
  test("prefers config.browser_path_override when it points to a real file", () => {
    const deps = fakeDeps({ isFile: (p) => p === "X:\\override\\browser.exe" });
    const p = resolveBrowserPath({ browser_path_override: "X:\\override\\browser.exe" }, deps);
    assert.equal(p, "X:\\override\\browser.exe");
  });

  test("uses VFOS_BROWSER_PATH env when no override is set", () => {
    const deps = fakeDeps({
      envGet: (k) => (k === "VFOS_BROWSER_PATH" ? "X:\\env\\browser.exe" : undefined),
      isFile: (p) => p === "X:\\env\\browser.exe",
    });
    const p = resolveBrowserPath({}, deps);
    assert.equal(p, "X:\\env\\browser.exe");
  });

  test("falls back to default Cốc Cốc Program Files path", () => {
    const deps = fakeDeps({
      isFile: (p) => p === "C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe",
    });
    const p = resolveBrowserPath({}, deps);
    assert.equal(p, "C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe");
  });

  test("throws ERR_CDP_BROWSER_NOT_FOUND_ON_DISK when no candidate exists", () => {
    const deps = fakeDeps();
    assert.throws(
      () => resolveBrowserPath({}, deps),
      (e: unknown) =>
        e instanceof CdpBootstrapError && e.reason_code === "ERR_CDP_BROWSER_NOT_FOUND_ON_DISK",
    );
  });
});

describe("resolveUserDataDir", () => {
  test("uses config override first", () => {
    const dir = resolveUserDataDir({ user_data_dir_override: "X:\\profile" }, fakeDeps());
    assert.equal(dir, "X:\\profile");
  });

  test("uses VFOS_BROWSER_USER_DATA_DIR env when no override", () => {
    const deps = fakeDeps({
      envGet: (k) => (k === "VFOS_BROWSER_USER_DATA_DIR" ? "X:\\profile-env" : undefined),
    });
    assert.equal(resolveUserDataDir({}, deps), "X:\\profile-env");
  });

  test("throws ERR_CDP_USER_DATA_DIR_REQUIRED when neither is set", () => {
    assert.throws(
      () => resolveUserDataDir({}, fakeDeps()),
      (e: unknown) =>
        e instanceof CdpBootstrapError && e.reason_code === "ERR_CDP_USER_DATA_DIR_REQUIRED",
    );
  });

  test("treats blank env as missing", () => {
    const deps = fakeDeps({
      envGet: (k) => (k === "VFOS_BROWSER_USER_DATA_DIR" ? "   " : undefined),
    });
    assert.throws(
      () => resolveUserDataDir({}, deps),
      (e: unknown) =>
        e instanceof CdpBootstrapError && e.reason_code === "ERR_CDP_USER_DATA_DIR_REQUIRED",
    );
  });
});

describe("detectProfileLock", () => {
  test("returns null when no lock files present", () => {
    const deps = fakeDeps();
    assert.equal(detectProfileLock("X:\\profile", deps), null);
  });

  test("returns the lock file path when SingletonLock present", () => {
    const deps = fakeDeps({
      fileExists: (p) => p === "X:\\profile/SingletonLock",
    });
    const hit = detectProfileLock("X:\\profile", deps);
    assert.equal(hit, "X:\\profile/SingletonLock");
  });
});

describe("bootstrapBrowser — scenarios", () => {
  test("scenario 1: port already open → status=already_running, no spawn", async () => {
    const deps = fakeDeps({ probePort: async () => true });
    const r = await bootstrapBrowser({}, deps);
    assert.equal(r.status, "already_running");
    assert.equal(r.browser_path, null);
    assert.equal(r.user_data_dir, null);
  });

  test("scenario 2: auto-bootstrap — port closed, exe + user-data-dir ok, spawn + poll", async () => {
    let spawnCalled = false;
    let spawnArgs: string[] = [];
    let probeCount = 0;
    const deps = fakeDeps({
      probePort: async () => {
        probeCount++;
        return probeCount > 1; // closed initially, open after first poll
      },
      isFile: (p) => p === "X:\\browser.exe",
      fileExists: () => false,
      envGet: (k) => (k === "VFOS_BROWSER_USER_DATA_DIR" ? "X:\\profile" : undefined),
      spawn: (_cmd, args) => {
        spawnCalled = true;
        spawnArgs = args;
        return { unref: () => {} };
      },
      sleep: async () => {},
      now: (() => {
        let n = 0;
        return () => (n += 100);
      })(),
    });
    const r = await bootstrapBrowser(
      {
        browser_path_override: "X:\\browser.exe",
        port_wait_timeout_ms: 5000,
        port_poll_interval_ms: 100,
      },
      deps,
    );
    assert.equal(r.status, "launched");
    assert.equal(r.browser_path, "X:\\browser.exe");
    assert.equal(r.user_data_dir, "X:\\profile");
    assert.equal(spawnCalled, true);
    assert.ok(spawnArgs.some((a) => a.startsWith("--remote-debugging-port=")));
    assert.ok(spawnArgs.some((a) => a.startsWith("--user-data-dir=")));
  });

  test("scenario 3: no browser exe found → ERR_CDP_BROWSER_NOT_FOUND_ON_DISK", async () => {
    const deps = fakeDeps({
      probePort: async () => false,
      envGet: (k) => (k === "VFOS_BROWSER_USER_DATA_DIR" ? "X:\\profile" : undefined),
    });
    await assert.rejects(
      bootstrapBrowser({}, deps),
      (e: unknown) =>
        e instanceof CdpBootstrapError && e.reason_code === "ERR_CDP_BROWSER_NOT_FOUND_ON_DISK",
    );
  });

  test("scenario 4: profile locked → ERR_CDP_PROFILE_LOCKED, spawn never called", async () => {
    let spawnCalled = false;
    const deps = fakeDeps({
      probePort: async () => false,
      isFile: (p) => p === "X:\\browser.exe",
      fileExists: (p) => p === "X:\\profile/SingletonLock",
      envGet: (k) => (k === "VFOS_BROWSER_USER_DATA_DIR" ? "X:\\profile" : undefined),
      spawn: () => {
        spawnCalled = true;
        return { unref: () => {} };
      },
    });
    await assert.rejects(
      bootstrapBrowser({ browser_path_override: "X:\\browser.exe" }, deps),
      (e: unknown) =>
        e instanceof CdpBootstrapError && e.reason_code === "ERR_CDP_PROFILE_LOCKED",
    );
    assert.equal(spawnCalled, false);
  });

  test("scenario 5: port never opens after spawn → ERR_CDP_PORT_TIMEOUT_AFTER_LAUNCH", async () => {
    const deps = fakeDeps({
      probePort: async () => false,
      isFile: (p) => p === "X:\\browser.exe",
      envGet: (k) => (k === "VFOS_BROWSER_USER_DATA_DIR" ? "X:\\profile" : undefined),
      spawn: () => ({ unref: () => {} }),
      sleep: async () => {},
      now: (() => {
        let n = 0;
        return () => (n += 1000);
      })(),
    });
    await assert.rejects(
      bootstrapBrowser(
        {
          browser_path_override: "X:\\browser.exe",
          port_wait_timeout_ms: 3000,
          port_poll_interval_ms: 1000,
        },
        deps,
      ),
      (e: unknown) =>
        e instanceof CdpBootstrapError && e.reason_code === "ERR_CDP_PORT_TIMEOUT_AFTER_LAUNCH",
    );
  });

  test("scenario 6: --no-auto-launch + closed port → ERR_CDP_BROWSER_LAUNCH_FAILED (no spawn)", async () => {
    let spawnCalled = false;
    const deps = fakeDeps({
      probePort: async () => false,
      spawn: () => {
        spawnCalled = true;
        return { unref: () => {} };
      },
    });
    await assert.rejects(
      bootstrapBrowser({ no_auto_launch: true }, deps),
      (e: unknown) =>
        e instanceof CdpBootstrapError && e.reason_code === "ERR_CDP_BROWSER_LAUNCH_FAILED",
    );
    assert.equal(spawnCalled, false);
  });

  test("scenario 7: missing user-data-dir → ERR_CDP_USER_DATA_DIR_REQUIRED, spawn not called", async () => {
    let spawnCalled = false;
    const deps = fakeDeps({
      probePort: async () => false,
      isFile: (p) => p === "X:\\browser.exe",
      spawn: () => {
        spawnCalled = true;
        return { unref: () => {} };
      },
    });
    await assert.rejects(
      bootstrapBrowser({ browser_path_override: "X:\\browser.exe" }, deps),
      (e: unknown) =>
        e instanceof CdpBootstrapError && e.reason_code === "ERR_CDP_USER_DATA_DIR_REQUIRED",
    );
    assert.equal(spawnCalled, false);
  });
});

// ── CAPTCHA guard ────────────────────────────────────────────────────────────

describe("clampCaptchaWaitSeconds", () => {
  test("clamps below minimum (10)", () => {
    assert.equal(clampCaptchaWaitSeconds(3), 10);
  });
  test("clamps above maximum (60)", () => {
    assert.equal(clampCaptchaWaitSeconds(120), 60);
  });
  test("preserves in-range value", () => {
    assert.equal(clampCaptchaWaitSeconds(25), 25);
  });
  test("defaults to 20 when undefined", () => {
    assert.equal(clampCaptchaWaitSeconds(undefined), 20);
  });
});

describe("waitForCaptchaResolution", () => {
  test("clears immediately when DOM has no signals", async () => {
    const page: CaptchaPage = {
      url: () => "https://affiliate.shopee.vn/offer/product_offer",
      evaluate: async () => [] as never,
    };
    const r = await waitForCaptchaResolution(page, {
      waitSeconds: 20,
      pollIntervalMs: 1000,
      sleep: async () => {},
      now: (() => {
        let n = 0;
        return () => (n += 100);
      })(),
    });
    assert.equal(r.cleared, true);
    assert.equal(r.reason_code, null);
  });

  test("clears mid-wait when operator solves CAPTCHA at tick 5", async () => {
    let polls = 0;
    const page: CaptchaPage = {
      url: () => "https://affiliate.shopee.vn/offer/product_offer",
      evaluate: async () => {
        polls++;
        return (polls < 5 ? ["dom:div[class*=captcha]"] : []) as never;
      },
    };
    const r = await waitForCaptchaResolution(page, {
      waitSeconds: 20,
      pollIntervalMs: 1000,
      sleep: async () => {},
      now: (() => {
        let n = 0;
        return () => (n += 1000);
      })(),
    });
    assert.equal(r.cleared, true);
    assert.equal(r.reason_code, null);
    assert.ok(polls >= 5);
  });

  test("timeout when captcha persists → ERR_CAPTCHA_TIMEOUT", async () => {
    const page: CaptchaPage = {
      url: () => "https://verify.shopee.vn/",
      evaluate: async () => ["dom:.shopee-popup__container"] as never,
    };
    const r = await waitForCaptchaResolution(page, {
      waitSeconds: 10,
      pollIntervalMs: 1000,
      sleep: async () => {},
      now: (() => {
        let n = 0;
        return () => (n += 1000);
      })(),
    });
    assert.equal(r.cleared, false);
    assert.equal(r.reason_code, "ERR_CAPTCHA_TIMEOUT");
    assert.ok(r.signals.length > 0);
  });
});
