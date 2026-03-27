import { apiGet, apiPost, apiDelete, fetchFormData } from "./client.js";
import { categoryId, parseFormErrors } from "./domain.js";
export { categoryName, categoryId } from "./domain.js";
export type { HourEntry, ProjectOption, GetHoursFilter } from "./domain.js";
import type { HourEntry, ProjectOption, GetHoursFilter } from "./domain.js";

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
  const errors = parseFormErrors(responseBody) ?? `status ${res.status}`;

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
    message: `Failed to delete entry ${id}: status ${res.status}`,
  };
}
