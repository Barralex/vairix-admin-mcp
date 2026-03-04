import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, appendFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ---- Environment detection ----

export function isWSL(): boolean {
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    const version = readFileSync("/proc/version", "utf-8");
    return /microsoft/i.test(version);
  } catch {
    return false;
  }
}

export interface Environment {
  isWSL: boolean;
  platform: string;
  nodeVersion: string;
  nodeMajor: number;
}

export function detectEnvironment(): Environment {
  const ver = process.version.replace(/^v/, "");
  return {
    isWSL: isWSL(),
    platform: process.platform,
    nodeVersion: ver,
    nodeMajor: parseInt(ver.split(".")[0], 10),
  };
}

// ---- Browser paths (shared with auth.ts) ----

export function getBrowserPaths(): string[] {
  return [
    // macOS - Chrome
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    // macOS - Edge
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    // macOS - Brave
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    // macOS - Chromium
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    // Linux - Chrome
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    // Linux - Edge
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    // Linux - Brave
    "/usr/bin/brave-browser",
    "/usr/bin/brave-browser-stable",
    // Linux - Chromium
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    // Windows - Chrome
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    // Windows - Edge
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    // Windows - Brave
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  ];
}

// ---- Health checks ----

export interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
  fix?: string;
}

export function checkNodeVersion(): CheckResult {
  const env = detectEnvironment();
  if (env.nodeMajor >= 18) {
    return { name: "Node.js", status: "ok", message: `v${env.nodeVersion}` };
  }
  return {
    name: "Node.js",
    status: "fail",
    message: `v${env.nodeVersion} (requires >= 18)`,
    fix: "Install Node.js 18 or later: https://nodejs.org",
  };
}

export function checkBrowser(): CheckResult {
  const env = detectEnvironment();
  const paths = getBrowserPaths();
  const found = paths.find((p) => existsSync(p));

  if (found) {
    const name = found.split("/").pop() ?? found;
    return { name: "Browser", status: "ok", message: name };
  }

  if (env.isWSL) {
    return {
      name: "Browser",
      status: "fail",
      message: "No Chromium browser found inside WSL",
      fix: "Install Chrome in WSL: sudo apt install -y chromium-browser\nOr: wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && sudo dpkg -i google-chrome-stable_current_amd64.deb && sudo apt -f install -y",
    };
  }

  return {
    name: "Browser",
    status: "fail",
    message: "No Chromium-based browser found",
    fix: "Install Chrome, Edge, or Brave.",
  };
}

export async function checkKeychain(): Promise<CheckResult> {
  const env = detectEnvironment();
  try {
    const keytar = await import("keytar");
    const testKey = "vairix-admin-mcp-healthcheck";
    await keytar.default.setPassword(testKey, "test", "ok");
    const val = await keytar.default.getPassword(testKey, "test");
    await keytar.default.deletePassword(testKey, "test");
    if (val === "ok") {
      return { name: "Keychain", status: "ok", message: "Working" };
    }
    return { name: "Keychain", status: "fail", message: "Read/write test failed" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (env.isWSL) {
      return {
        name: "Keychain",
        status: "fail",
        message: `Keychain unavailable in WSL: ${msg}`,
        fix: "Install libsecret and gnome-keyring:\n  sudo apt install -y libsecret-1-dev gnome-keyring\n  eval $(gnome-keyring-daemon --start --components=secrets 2>/dev/null)",
      };
    }
    return {
      name: "Keychain",
      status: "fail",
      message: `Keychain error: ${msg}`,
      fix: env.platform === "linux"
        ? "Install libsecret: sudo apt install -y libsecret-1-dev"
        : undefined,
    };
  }
}

export async function runAllChecks(): Promise<CheckResult[]> {
  return [
    checkNodeVersion(),
    checkBrowser(),
    await checkKeychain(),
  ];
}

export function runStartupChecks(): { fatal?: string; warnings: string[] } {
  const warnings: string[] = [];
  const env = detectEnvironment();

  if (env.nodeMajor < 18) {
    return {
      fatal: `Node.js ${env.nodeVersion} is not supported. Please upgrade to Node.js 18 or later.`,
      warnings,
    };
  }

  if (env.isWSL) {
    warnings.push(
      "Running inside WSL. Browser auth and keychain require extra setup. Run with --health-check for details."
    );
  }

  return { warnings };
}

export function formatCheckResults(checks: CheckResult[]): string {
  const lines = checks.map((c) => {
    const icon = c.status === "ok" ? "[OK]" : c.status === "warn" ? "[WARN]" : "[FAIL]";
    let line = `${icon} ${c.name}: ${c.message}`;
    if (c.fix) {
      line += `\n     Fix: ${c.fix}`;
    }
    return line;
  });

  const hasFailure = checks.some((c) => c.status === "fail");
  const summary = hasFailure
    ? "\nSome checks failed. Fix the issues above before using the server."
    : "\nAll checks passed.";

  return lines.join("\n") + summary;
}

// ---- Error enhancement ----

export function enhanceError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const env = detectEnvironment();

  if (!env.isWSL) return msg;

  if (/no chromium|browser.*not found|executable.*not found|launch/i.test(msg)) {
    return `${msg}\n\nWSL detected: You need a browser installed inside WSL, not just on Windows.\nInstall Chrome: sudo apt install -y chromium-browser\nOr run --health-check for full setup instructions.`;
  }

  if (/keytar|keychain|secret|dbus/i.test(msg)) {
    return `${msg}\n\nWSL detected: The OS keychain requires libsecret and gnome-keyring.\nInstall: sudo apt install -y libsecret-1-dev gnome-keyring\nThen: eval $(gnome-keyring-daemon --start --components=secrets 2>/dev/null)`;
  }

  return msg;
}

// ---- Logging ----

const LOG_DIR = join(homedir(), ".vairix-admin-mcp", "logs");
const LOG_FILE = join(LOG_DIR, "vairix-admin-mcp.log");
const MAX_LOG_SIZE = 1_048_576; // 1MB

export function log(level: "info" | "warn" | "error", message: string): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });

    try {
      const stat = statSync(LOG_FILE);
      if (stat.size > MAX_LOG_SIZE) {
        renameSync(LOG_FILE, `${LOG_FILE}.1`);
      }
    } catch {}

    const timestamp = new Date().toISOString();
    const line = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {}
}
