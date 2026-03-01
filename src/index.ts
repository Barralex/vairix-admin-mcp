#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { authenticate, loadSession, isSessionValid, clearSession, saveMainProject, loadMainProject } from "./auth.js";
import {
  getHours,
  getPendingDays,
  getProjects,
  createHour,
  deleteHour,
  categoryName,
  type HourEntry,
  type GetHoursFilter,
} from "./api.js";

const server = new McpServer({
  name: "vairix-admin",
  version: "1.0.0",
});

function formatHours(hours: HourEntry[]): string {
  if (hours.length === 0) return "No hours found.";
  return hours
    .map(
      (h) =>
        `[${h.id}] ${h.initial_date} | ${h.hours}h | project:${h.project_id} | ${categoryName(h.category)} | ${h.description}${h.extra_allocation ? " (Extra)" : ""}`
    )
    .join("\n");
}

// ---- Tools ----

server.tool(
  "auth",
  "Opens Chrome so the user can login to Vairix Admin manually. Required before using any other tool. Captures session cookies and stores them in the OS keychain. The user will see a Chrome window — do not call this without telling them first.",
  {},
  async () => {
    try {
      const session = await authenticate();
      const projects = await getProjects();
      const mainProject = await loadMainProject();
      const projectList = projects.map((p) => `- [${p.id}] ${p.name}`).join("\n");
      const mainInfo = mainProject
        ? `Current main project: [${mainProject.id}] ${mainProject.name}`
        : "No main project set. Use `set_main_project` to set one.";
      return {
        content: [{
          type: "text",
          text: `Authenticated as ${session.email}. Session saved.\n\nAvailable projects:\n${projectList}\n\n${mainInfo}\n\nIMPORTANT: If no main project is set, you MUST ask the user to pick their main project from the list above using a selection UI (e.g. AskUserQuestion with the project names as options). Then call \`set_main_project\` with the chosen project_id and project_name.`,
        }],
      };
    } catch (e) {
      return {
        content: [{
          type: "text",
          text: `Auth failed: ${e instanceof Error ? e.message : e}`,
        }],
      };
    }
  }
);

server.tool("auth_status", "Check if the user has a valid session. Call this before other tools if unsure whether the user is authenticated. Returns the user's email and session age if valid.", {}, async () => {
  const session = await loadSession();
  if (!session) {
    return {
      content: [{
        type: "text",
        text: "Not authenticated. Use `auth` tool to open Chrome and login.",
      }],
    };
  }

  const valid = await isSessionValid(session);
  if (!valid) {
    return {
      content: [{
        type: "text",
        text: `Session expired (was ${session.email}, saved ${session.savedAt}). Use \`auth\` to login again.`,
      }],
    };
  }

  return {
    content: [{
      type: "text",
      text: `Authenticated as ${session.email}. Session from ${session.savedAt}.`,
    }],
  };
});

server.tool(
  "logout",
  "Clear the saved session from the OS keychain. The user will need to call `auth` again to re-authenticate.",
  {},
  async () => {
    try {
      await clearSession();
    } catch {}
    return {
      content: [{ type: "text", text: "Session cleared. Use `auth` to login again." }],
    };
  }
);

server.tool(
  "set_main_project",
  "Set the user's main project for logging hours. Call `get_projects` first to see available projects. The main project is saved in the OS keychain and used as default for `create_hours`. IMPORTANT: When the user mentions a project by name (e.g. 'cargame horas en Seekr', 'log hours to ProjectX'), call `get_projects` to find the matching project_id, then call this tool to switch before creating hours.",
  {
    project_id: z.string().describe("The project ID from `get_projects`"),
    project_name: z.string().describe("The project name (for display)"),
  },
  async ({ project_id, project_name }) => {
    try {
      await saveMainProject(project_id, project_name);
      return {
        content: [{ type: "text", text: `Main project set to [${project_id}] ${project_name}.` }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }] };
    }
  }
);

server.tool(
  "get_pending_days",
  "Get workdays that are missing hour entries for the current month. Use this to find out which days the user still needs to log hours for.",
  {},
  async () => {
    try {
      const days = await getPendingDays();
      if (days.length === 0) {
        return { content: [{ type: "text", text: "All hours are up to date! No pending days." }] };
      }
      return {
        content: [{
          type: "text",
          text: `Pending days (missing hours):\n${days.map((d) => `- ${d}`).join("\n")}`,
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }] };
    }
  }
);

server.tool(
  "get_hours",
  "Get the user's logged hour entries. Returns ID, date, hours, project_id, category, and description for each entry. Use the ID from results to delete entries with `delete_hours`. For totals and aggregation, use `get_hours_summary` instead.",
  {
    scope: z
      .enum(["current_month", "all", "today", "yesterday"])
      .default("current_month")
      .describe("Time scope: current_month (default), today, yesterday, or all"),
    project_id: z
      .string()
      .optional()
      .describe("Filter by project ID (from `get_projects`)"),
    date_from: z
      .string()
      .optional()
      .describe("Filter start date (YYYY-MM-DD). Auto-sets scope to 'all'."),
    date_to: z
      .string()
      .optional()
      .describe("Filter end date (YYYY-MM-DD). Auto-sets scope to 'all'."),
  },
  async ({ scope, project_id, date_from, date_to }) => {
    try {
      const filter: GetHoursFilter = { scope };
      if (project_id) filter.project_id = project_id;
      if (date_from) { filter.date_from = date_from; filter.scope = "all"; }
      if (date_to) { filter.date_to = date_to; filter.scope = "all"; }

      let hours = await getHours(filter);

      if (filter.scope === "current_month") {
        const now = new Date();
        const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        if (!hours.some((h) => h.initial_date.startsWith(monthPrefix))) {
          filter.scope = "all";
          filter.date_from = `${monthPrefix}-01`;
          filter.date_to = `${monthPrefix}-${String(now.getDate()).padStart(2, "0")}`;
          hours = await getHours(filter);
        }
      }

      return {
        content: [{
          type: "text",
          text: `Hours (${filter.scope}, ${hours.length} entries):\n${formatHours(hours)}`,
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }] };
    }
  }
);

server.tool(
  "get_projects",
  "List projects the user can log hours to. Returns project ID and name. You MUST call this before `create_hours` to get a valid project_id.",
  {},
  async () => {
    try {
      const projects = await getProjects();
      if (projects.length === 0) {
        return { content: [{ type: "text", text: "No projects found." }] };
      }
      return {
        content: [{
          type: "text",
          text: `Available projects:\n${projects.map((p) => `- [${p.id}] ${p.name}`).join("\n")}`,
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }] };
    }
  }
);

server.tool(
  "get_hours_summary",
  "Get aggregated hour totals with breakdown. Use this for questions like 'how many hours on project X?' or 'hours by category this month'. Defaults to current month.",
  {
    project_id: z
      .string()
      .optional()
      .describe("Filter by project ID (from `get_projects`)"),
    date_from: z
      .string()
      .optional()
      .describe("Start date (YYYY-MM-DD). Defaults to first day of current month."),
    date_to: z
      .string()
      .optional()
      .describe("End date (YYYY-MM-DD). Defaults to today."),
    group_by: z
      .enum(["project", "category", "date"])
      .default("project")
      .describe("How to group the breakdown: project, category, or date"),
  },
  async ({ project_id, date_from, date_to, group_by }) => {
    try {
      const now = new Date();
      const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const effectiveFrom = date_from ?? `${monthPrefix}-01`;
      const effectiveTo = date_to ?? `${monthPrefix}-${String(now.getDate()).padStart(2, "0")}`;

      const filter: GetHoursFilter = {
        scope: "all",
        date_from: effectiveFrom,
        date_to: effectiveTo,
      };
      if (project_id) filter.project_id = project_id;

      const hours = await getHours(filter);
      const totalHours = hours.reduce((sum, h) => sum + h.hours, 0);

      const projectMap = new Map<string, string>();
      if (group_by === "project") {
        const projects = await getProjects();
        for (const p of projects) projectMap.set(p.id, p.name);
      }

      const groups = new Map<string, number>();
      for (const h of hours) {
        let key: string;
        if (group_by === "project") {
          key = projectMap.get(String(h.project_id)) ?? `Project ${h.project_id}`;
        } else if (group_by === "category") {
          key = categoryName(h.category);
        } else {
          key = h.initial_date;
        }
        groups.set(key, (groups.get(key) ?? 0) + h.hours);
      }

      const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
      const breakdown = sorted
        .map(([key, hrs]) => {
          const pct = totalHours > 0 ? ((hrs / totalHours) * 100).toFixed(1) : "0.0";
          return `- ${key}: ${hrs}h (${pct}%)`;
        })
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `Summary (${effectiveFrom} to ${effectiveTo}, ${hours.length} entries):\nTotal: ${totalHours}h\n\nBreakdown by ${group_by}:\n${breakdown}`,
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }] };
    }
  }
);

server.tool(
  "create_hours",
  "Log hours for one or more dates. Uses the main project if project_id is omitted — if the user mentions a different project by name, call `set_main_project` first to switch. Cannot log future dates. To update an existing entry, delete it first with `delete_hours` then recreate.",
  {
    dates: z
      .array(z.string())
      .describe('One or more dates in YYYY-MM-DD format. Example: ["2026-02-24", "2026-02-25"]'),
    project_id: z
      .string()
      .optional()
      .describe("Project ID — get valid IDs from `get_projects`. If omitted, uses the main project set via `set_main_project`."),
    hours: z
      .string()
      .default("8")
      .refine((v) => { const n = Number(v); return !isNaN(n) && n > 0 && n <= 24; }, "Hours must be a number between 1 and 24")
      .describe("Hours to log per day (default: 8)"),
    category: z
      .string()
      .default("desarrollador")
      .describe("One of: desarrollador, pm, testing, arquitecto, otro (default: desarrollador)"),
    description: z
      .string()
      .describe("Work description for the time entry"),
    extra_allocation: z
      .boolean()
      .default(false)
      .describe("Set true only for secondary/extra project allocations"),
    in_home: z
      .boolean()
      .default(false)
      .describe("Set true if working from home"),
  },
  async ({ dates, project_id, hours, category, description, extra_allocation, in_home }) => {
    try {
      let pid = project_id;
      if (!pid) {
        const mainProject = await loadMainProject();
        if (!mainProject) {
          return { content: [{ type: "text", text: "No project_id provided and no main project set. Use `set_main_project` first or pass a project_id." }] };
        }
        pid = mainProject.id;
      }
      const today = new Date().toISOString().slice(0, 10);
      const futureDates = dates.filter((d) => d > today);
      if (futureDates.length > 0) {
        return { content: [{ type: "text", text: `Cannot log future dates: ${futureDates.join(", ")}` }] };
      }

      const BATCH_SIZE = 3;
      const results: string[] = [];
      for (let i = 0; i < dates.length; i += BATCH_SIZE) {
        const batch = dates.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map((date) =>
            createHour({ date, project_id: pid, hours, category, description, extra_allocation, in_home })
          )
        );
        for (let j = 0; j < batch.length; j++) {
          const res = batchResults[j];
          results.push(`${batch[j]}: ${res.success ? "OK" : res.message}`);
        }
      }
      return { content: [{ type: "text", text: `Results:\n${results.join("\n")}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }] };
    }
  }
);

server.tool(
  "delete_hours",
  "Delete an hour entry by its ID. Get the ID from `get_hours` results. This action is irreversible — confirm with the user before deleting.",
  {
    id: z.string().describe("The numeric entry ID returned by `get_hours` (e.g. \"181608\")"),
  },
  async ({ id }) => {
    try {
      const res = await deleteHour(id);
      return { content: [{ type: "text", text: res.message }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("vairix-admin MCP running");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
