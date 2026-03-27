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

export interface GetHoursFilter {
  scope?: string;
  date_from?: string;
  date_to?: string;
  project_id?: string;
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

export function parseFormErrors(html: string): string | null {
  const errorMatch = html.match(/<li>([^<]+)<\/li>/g);
  if (!errorMatch) return null;
  return errorMatch.map((e) => e.replace(/<\/?li>/g, "")).join(", ");
}
