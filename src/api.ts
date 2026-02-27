import { loadSession, isSessionValid, type SessionData } from "./auth.js";

const BASE_URL = "https://admin.vairix.com";

let cachedSession: SessionData | null = null;

async function session(): Promise<SessionData> {
  if (cachedSession && (await isSessionValid(cachedSession))) {
    return cachedSession;
  }

  const saved = await loadSession();
  if (!saved) throw new Error("Not authenticated. Use the `auth` tool first.");

  const valid = await isSessionValid(saved);
  if (!valid) throw new Error("Session expired. Use the `auth` tool to login again.");

  cachedSession = saved;
  return saved;
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

  // Get fresh CSRF token from the new form page
  const formRes = await fetch(`${BASE_URL}${path}/new`, {
    headers: { Cookie: s.cookies },
    redirect: "follow",
  });
  const formHtml = await formRes.text();
  const csrfMatch = formHtml.match(
    /name="authenticity_token"[^>]*value="([^"]+)"/
  );
  const csrf = csrfMatch ? csrfMatch[1] : s.csrfToken;

  const params = new URLSearchParams({
    authenticity_token: csrf,
    ...body,
  });

  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: s.cookies,
    },
    body: params.toString(),
    redirect: "manual",
  });
}

async function apiDelete(path: string): Promise<Response> {
  const s = await session();

  // Need CSRF for delete
  const pageRes = await fetch(`${BASE_URL}/admin/daily_hours`, {
    headers: { Cookie: s.cookies },
    redirect: "follow",
  });
  const pageHtml = await pageRes.text();
  const csrfMatch = pageHtml.match(
    /meta name="csrf-token" content="([^"]+)"/
  );
  const csrf = csrfMatch ? csrfMatch[1] : s.csrfToken;

  return fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: {
      Cookie: s.cookies,
      "X-CSRF-Token": csrf,
    },
    redirect: "manual",
  });
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

export interface ProjectOption {
  id: string;
  name: string;
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

export async function getHours(
  scope: string = "current_month"
): Promise<HourEntry[]> {
  const res = await apiGet(`/admin/daily_hours.json?scope=${scope}`);
  if (res.status !== 200) throw new Error(`Failed to get hours: ${res.status}`);
  return res.json();
}

export async function getPendingDays(): Promise<string[]> {
  const hours = await getHours("current_month");
  const loggedDates = new Set(hours.map((h) => h.initial_date));

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const pending: string[] = [];
  for (let day = 1; day <= today; day++) {
    const d = new Date(year, month, day);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!loggedDates.has(dateStr)) pending.push(dateStr);
  }

  return pending;
}

export async function getProjects(): Promise<ProjectOption[]> {
  const res = await apiGet("/admin/daily_hours/new");
  if (res.status !== 200)
    throw new Error(`Failed to get projects: ${res.status}`);
  const html = await res.text();

  const projects: ProjectOption[] = [];
  const projectSelectMatch = html.match(
    /name="daily_hour\[project_id\]"[^>]*>([\s\S]*?)<\/select>/
  );
  if (!projectSelectMatch) return projects;

  const regex = /<option value="(\d+)">([^<]+)<\/option>/g;
  let m;
  while ((m = regex.exec(projectSelectMatch[1])) !== null) {
    projects.push({ id: m[1], name: m[2] });
  }
  return projects;
}

async function getStaffId(): Promise<string> {
  const res = await apiGet("/admin/daily_hours/new");
  if (res.status !== 200) throw new Error(`Failed to get staff id: ${res.status}`);
  const html = await res.text();

  const match = html.match(
    /name="daily_hour\[staff_id\]"[\s\S]*?option[^>]*value="(\d+)"[^>]*selected/
  );
  if (match) return match[1];

  const alt = html.match(/name="daily_hour\[staff_id\]"[\s\S]*?selected[^>]*value="(\d+)"/);
  if (alt) return alt[1];

  throw new Error("Could not find staff_id");
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
  const staffId = await getStaffId();

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

  // If 200, Active Admin re-rendered the form with errors
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
