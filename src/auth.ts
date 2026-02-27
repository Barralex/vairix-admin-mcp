import { chromium } from "playwright-core";
import { existsSync } from "fs";
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

function findSystemChrome(): string {
  const paths = [
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    // Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];

  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    "Google Chrome not found. Install Chrome and try again."
  );
}

export async function authenticate(): Promise<SessionData> {
  const chromePath = findSystemChrome();

  const browser = await chromium.launch({
    headless: false,
    executablePath: chromePath,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOGIN_URL);

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
