import { loadSession, isSessionValid, type SessionData } from "./auth.js";

const BASE_URL = "https://admin.vairix.com";

// Session cache with TTL — avoids re-validating on every tool call
let cachedSession: SessionData | null = null;
let sessionValidatedAt = 0;
const SESSION_TTL = 60_000;

async function session(): Promise<SessionData> {
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

// Unified form data cache — CSRF tokens, staffId, and projects from /admin/daily_hours/new
export interface ProjectOption {
  id: string;
  name: string;
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

async function fetchFormData(): Promise<FormData> {
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

async function apiGet(path: string): Promise<Response> {
  const s = await session();
  return fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: s.cookies },
    redirect: "follow",
  });
}

async function apiPost(
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

async function apiDelete(path: string): Promise<Response> {
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

// ---- Public API ----

export interface HourEntry {
  id: number;
  initial_date: string;
  hours: number;
  category: number;
  description: string;
  project_id: number;
  staff_id: number;
  extra_allocation: boolean;
  in_home: boolean;
  confirm: boolean;
  billable: boolean | null;
}

const CATEGORY_MAP: Record<number, string> = {
  1: "Desarrollador",
  2: "Gerente de proyecto",
  3: "Testing",
  4: "Arquitecto",
  5: "Otro",
};

const CATEGORY_REVERSE: Record<string, string> = {
  desarrollador: "1",
  dev: "1",
  developer: "1",
  "gerente de proyecto": "2",
  pm: "2",
  testing: "3",
  qa: "3",
  arquitecto: "4",
  architect: "4",
  otro: "5",
  other: "5",
};

export function categoryName(cat: number): string {
  return CATEGORY_MAP[cat] ?? `Unknown(${cat})`;
}

export function categoryId(name: string): string {
  return CATEGORY_REVERSE[name.toLowerCase()] ?? "1";
}

export interface GetHoursFilter {
  scope?: string;
  date_from?: string;
  date_to?: string;
  project_id?: string;
}

const MAX_PAGES = 10;
const PER_PAGE = 100;

export async function getHours(
  filter: GetHoursFilter = {}
): Promise<HourEntry[]> {
  const { scope = "current_month", date_from, date_to, project_id } = filter;

  const all: HourEntry[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({ scope, page: String(page), per_page: String(PER_PAGE) });
    if (date_from) params.set("q[initial_date_gteq]", date_from);
    if (date_to) params.set("q[initial_date_lteq]", date_to);
    if (project_id) params.set("q[project_id_eq]", project_id);

    const res = await apiGet(`/admin/daily_hours.json?${params}`);
    if (res.status !== 200) throw new Error(`Failed to get hours: ${res.status}`);

    const entries: HourEntry[] = await res.json();
    all.push(...entries);
    if (entries.length < PER_PAGE) break;
  }

  return all;
}

export async function getPendingDays(): Promise<string[]> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthStart = `${monthPrefix}-01`;
  const todayStr = `${monthPrefix}-${String(today).padStart(2, "0")}`;

  let hours = await getHours({ scope: "current_month" });

  // At month boundaries, server (UTC) may be in a different month than the client.
  // Use date range filters instead of fetching all hours.
  if (!hours.some((h) => h.initial_date.startsWith(monthPrefix))) {
    hours = await getHours({ scope: "all", date_from: monthStart, date_to: todayStr });
  }

  const loggedDates = new Set(hours.map((h) => h.initial_date));

  const pending: string[] = [];
  for (let day = 1; day <= today; day++) {
    const d = new Date(year, month, day);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!loggedDates.has(dateStr)) pending.push(dateStr);
  }

  return pending;
}

export async function getProjects(): Promise<ProjectOption[]> {
  return (await fetchFormData()).projects;
}

export async function createHour(params: {
  date: string;
  project_id: string;
  hours: string;
  category: string;
  description: string;
  extra_allocation?: boolean;
  in_home?: boolean;
}): Promise<{ success: boolean; message: string }> {
  const { staffId } = await fetchFormData();

  const body: Record<string, string> = {
    "daily_hour[initial_date]": params.date,
    "daily_hour[project_id]": params.project_id,
    "daily_hour[staff_id]": staffId,
    "daily_hour[hours]": params.hours,
    "daily_hour[category]": categoryId(params.category),
    "daily_hour[description]": params.description,
    "daily_hour[in_home]": params.in_home ? "1" : "0",
    "daily_hour[extra_allocation]": params.extra_allocation ? "1" : "0",
    commit: "Guardar Horas Proyectos",
  };

  const res = await apiPost("/admin/daily_hours", body);

  if (res.status === 302 || res.status === 303) {
    return { success: true, message: `Hours created for ${params.date}` };
  }

  const responseBody = await res.text();
  const errorMatch = responseBody.match(/<li>([^<]+)<\/li>/g);
  const errors = errorMatch
    ? errorMatch.map((e) => e.replace(/<\/?li>/g, "")).join(", ")
    : `status ${res.status}`;

  return {
    success: false,
    message: `Failed to create hours for ${params.date}: ${errors}`,
  };
}

export async function deleteHour(
  id: string
): Promise<{ success: boolean; message: string }> {
  const res = await apiDelete(`/admin/daily_hours/${id}`);

  if (res.status === 302 || res.status === 303 || res.status === 200) {
    return { success: true, message: `Hour entry ${id} deleted` };
  }

  return {
    success: false,
    message: `Failed to delete (status ${res.status})`,
  };
}
