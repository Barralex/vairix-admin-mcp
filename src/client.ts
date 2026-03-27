import { loadSession, isSessionValid, type SessionData } from "./auth.js";
import type { ProjectOption } from "./domain.js";

const BASE_URL = "https://admin.vairix.com";

let cachedSession: SessionData | null = null;
let sessionValidatedAt = 0;
const SESSION_TTL = 60_000;

export async function session(): Promise<SessionData> {
  if (cachedSession && Date.now() - sessionValidatedAt < SESSION_TTL) {
    return cachedSession;
  }

  if (cachedSession) {
    const valid = await isSessionValid(cachedSession);
    if (valid) {
      sessionValidatedAt = Date.now();
      return cachedSession;
    }
  }

  const saved = await loadSession();
  if (!saved) throw new Error("Not authenticated. Use the `auth` tool first.");

  const valid = await isSessionValid(saved);
  if (!valid) throw new Error("Session expired. Use the `auth` tool to login again.");

  if (!cachedSession || cachedSession.cookies !== saved.cookies) {
    formDataCache = null;
  }
  cachedSession = saved;
  sessionValidatedAt = Date.now();
  return saved;
}

interface FormData {
  csrfFormToken: string;
  csrfMetaToken: string;
  staffId: string;
  projects: ProjectOption[];
  fetchedAt: number;
}

let formDataCache: FormData | null = null;
const FORM_DATA_TTL = 300_000;

export async function fetchFormData(): Promise<FormData> {
  if (formDataCache && Date.now() - formDataCache.fetchedAt < FORM_DATA_TTL) {
    return formDataCache;
  }

  const s = await session();
  const res = await fetch(`${BASE_URL}/admin/daily_hours/new`, {
    headers: { Cookie: s.cookies },
    redirect: "follow",
  });
  if (res.status !== 200) throw new Error(`Failed to load form: ${res.status}`);
  const html = await res.text();

  const formTokenMatch = html.match(
    /name="authenticity_token"[^>]*value="([^"]+)"/
  );
  const csrfFormToken = formTokenMatch ? formTokenMatch[1] : s.csrfToken;

  const metaTokenMatch = html.match(
    /meta name="csrf-token" content="([^"]+)"/
  );
  const csrfMetaToken = metaTokenMatch ? metaTokenMatch[1] : s.csrfToken;

  let staffId = "";
  const staffMatch = html.match(
    /name="daily_hour\[staff_id\]"[\s\S]*?option[^>]*value="(\d+)"[^>]*selected/
  );
  if (staffMatch) {
    staffId = staffMatch[1];
  } else {
    const altMatch = html.match(
      /name="daily_hour\[staff_id\]"[\s\S]*?selected[^>]*value="(\d+)"/
    );
    if (altMatch) staffId = altMatch[1];
    else throw new Error("Could not find staff_id");
  }

  const projects: ProjectOption[] = [];
  const projectSelectMatch = html.match(
    /name="daily_hour\[project_id\]"[^>]*>([\s\S]*?)<\/select>/
  );
  if (projectSelectMatch) {
    const regex = /<option value="(\d+)">([^<]+)<\/option>/g;
    let m;
    while ((m = regex.exec(projectSelectMatch[1])) !== null) {
      projects.push({ id: m[1], name: m[2] });
    }
  }

  formDataCache = { csrfFormToken, csrfMetaToken, staffId, projects, fetchedAt: Date.now() };
  return formDataCache;
}

export async function apiGet(path: string): Promise<Response> {
  const s = await session();
  return fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: s.cookies },
    redirect: "follow",
  });
}

export async function apiPost(
  path: string,
  body: Record<string, string>
): Promise<Response> {
  const s = await session();

  for (let attempt = 0; attempt < 2; attempt++) {
    const form = await fetchFormData();

    const params = new URLSearchParams({
      authenticity_token: form.csrfFormToken,
      ...body,
    });

    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: s.cookies,
      },
      body: params.toString(),
      redirect: "manual",
    });

    if (res.status === 302 || res.status === 303 || res.status === 200) {
      return res;
    }

    if (attempt === 0) {
      formDataCache = null;
      continue;
    }

    return res;
  }

  throw new Error("POST failed after retry");
}

export async function apiDelete(path: string): Promise<Response> {
  const s = await session();

  for (let attempt = 0; attempt < 2; attempt++) {
    const form = await fetchFormData();

    const res = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: {
        Cookie: s.cookies,
        "X-CSRF-Token": form.csrfMetaToken,
      },
      redirect: "manual",
    });

    if (res.status === 200 || res.status === 302 || res.status === 303) {
      return res;
    }

    if (attempt === 0) {
      formDataCache = null;
      continue;
    }

    return res;
  }

  throw new Error("DELETE failed after retry");
}
