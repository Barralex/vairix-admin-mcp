import { chromium } from "playwright-core";
import { existsSync } from "fs";
import { execSync } from "child_process";
import keytar from "keytar";

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
  } catch {
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
  const paths = [
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

  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    "No Chromium-based browser found. Install Chrome, Edge, or Brave and try again."
  );
}

export async function authenticate(): Promise<SessionData> {
  const chromePath = findChromiumBrowser();

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

  // Wait for the user to login - detect redirect away from /login
  await page.waitForURL((url) => !url.toString().includes("/login"), {
    timeout: 300_000, // 5 minutes
  });

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
  return session;
}

export async function getSession(): Promise<SessionData> {
  const existing = await loadSession();

  if (existing) {
    const valid = await isSessionValid(existing);
    if (valid) return existing;
  }

  return authenticate();
}
