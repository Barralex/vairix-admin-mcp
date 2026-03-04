import { chromium } from "playwright-core";
import { existsSync } from "fs";
import { execSync } from "child_process";
import keytar from "keytar";
import { getBrowserPaths, detectEnvironment, log } from "./diagnostics.js";

const SERVICE = "vairix-admin-mcp";
const BASE_URL = "https://admin.vairix.com";
const LOGIN_URL = `${BASE_URL}/admin/login`;

export interface SessionData {
  cookies: string;
  csrfToken: string;
  email: string;
  savedAt: string;
}

async function saveSession(session: SessionData): Promise<void> {
  await keytar.setPassword(SERVICE, "session", JSON.stringify(session));
}

export async function loadSession(): Promise<SessionData | null> {
  try {
    const data = await keytar.getPassword(SERVICE, "session");
    if (!data) return null;
    return JSON.parse(data) as SessionData;
  } catch (e) {
    log("error", `Failed to load session: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await keytar.deletePassword(SERVICE, "session");
  await keytar.deletePassword(SERVICE, "main_project").catch(() => {});
}

export async function saveMainProject(projectId: string, projectName: string): Promise<void> {
  await keytar.setPassword(SERVICE, "main_project", JSON.stringify({ id: projectId, name: projectName }));
}

export async function loadMainProject(): Promise<{ id: string; name: string } | null> {
  try {
    const data = await keytar.getPassword(SERVICE, "main_project");
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function isSessionValid(session: SessionData): Promise<boolean> {
  try {
    const res = await fetch(
      `${BASE_URL}/admin/daily_hours.json?scope=today`,
      {
        headers: { Cookie: session.cookies },
        redirect: "manual",
      }
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

function getScreenSize(): { width: number; height: number } {
  try {
    if (process.platform === "win32") {
      const output = execSync(
        'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $s = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; Write-Output \\"$($s.Width),$($s.Height)\\""',
        { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }
      ).trim();
      const [w, h] = output.split(",").map(Number);
      if (w && h) return { width: w, height: h };
    } else if (process.platform === "darwin") {
      const output = execSync(
        "system_profiler SPDisplaysDataType 2>/dev/null | grep Resolution",
        { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }
      ).trim();
      const match = output.match(/(\d+)\s*x\s*(\d+)/);
      if (match) return { width: Number(match[1]), height: Number(match[2]) };
    }
  } catch {}
  return { width: 1920, height: 1080 };
}

function findChromiumBrowser(): string {
  const paths = getBrowserPaths();

  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  const env = detectEnvironment();
  if (env.isWSL) {
    throw new Error(
      "No Chromium-based browser found inside WSL. You need a browser installed in WSL itself, not just on Windows. Run with --health-check for setup instructions."
    );
  }

  throw new Error(
    "No Chromium-based browser found. Install Chrome, Edge, or Brave and try again."
  );
}

export async function authenticate(): Promise<SessionData> {
  log("info", "Authentication started");
  const chromePath = findChromiumBrowser();
  log("info", `Browser found: ${chromePath}`);

  const windowWidth = 900;
  const windowHeight = 700;
  const screen = getScreenSize();
  const left = Math.round((screen.width - windowWidth) / 2);
  const top = Math.round((screen.height - windowHeight) / 2);

  const browser = await chromium.launch({
    headless: false,
    executablePath: chromePath,
    args: [
      "--disable-blink-features=AutomationControlled",
      `--window-size=${windowWidth},${windowHeight}`,
      `--window-position=${left},${top}`,
    ],
  });

  const context = await browser.newContext({
    viewport: { width: windowWidth, height: windowHeight - 80 },
  });
  const page = await context.newPage();

  await page.goto(LOGIN_URL);
  await page.waitForLoadState("domcontentloaded");

  if (process.platform === "win32") {
    try {
      execSync(
        `powershell -Command "(New-Object -ComObject WScript.Shell).AppActivate('admin.vairix.com')"`,
        { stdio: "ignore" }
      );
    } catch {}
  } else {
    await page.bringToFront();
  }

  try {
    await page.waitForURL((url) => !url.toString().includes("/login"), {
      timeout: 120_000,
    });
  } catch {
    await browser.close();
    log("warn", "Authentication timed out");
    throw new Error("Login timed out. Chrome was closed or login was not completed in time. Try again with `auth`.");
  }

  await page.waitForLoadState("networkidle");

  // Capture cookies
  const browserCookies = await context.cookies();
  const cookieHeader = browserCookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  // Get CSRF token
  const csrfToken = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta?.getAttribute("content") ?? "";
  });

  // Get user email from the page
  const email = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a"));
    const emailLink = links.find((a) =>
      a.textContent?.includes("@vairix.com")
    );
    return emailLink?.textContent?.trim() ?? "unknown";
  });

  await browser.close();

  const session: SessionData = {
    cookies: cookieHeader,
    csrfToken,
    email,
    savedAt: new Date().toISOString(),
  };

  await saveSession(session);
  log("info", `Authentication successful: ${email}`);
  return session;
}
