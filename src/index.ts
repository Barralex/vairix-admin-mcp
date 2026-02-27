#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { authenticate, loadSession, isSessionValid, clearSession } from "./auth.js";
import {
  getHours,
  getPendingDays,
  getProjects,
  createHour,
  deleteHour,
  categoryName,
  type HourEntry,
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
        `[${h.id}] ${h.initial_date} | ${h.hours}h | ${categoryName(h.category)} | ${h.description}${h.extra_allocation ? " (Extra)" : ""}`
    )
    .join("\n");
}

// ---- Tools ----

server.tool(
  "auth",
  "Opens Chrome so you can login to Vairix Admin manually. Captures session cookies after login.",
  {},
  async () => {
    try {
      const session = await authenticate();
      return {
        content: [{
          type: "text",
          text: `Authenticated as ${session.email}. Session saved.`,
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

server.tool("auth_status", "Check if authenticated.", {}, async () => {
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
  "Clear saved session from keychain.",
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
  "get_pending_days",
  "Get days that are missing hour entries.",
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
  "Get logged hours. Defaults to current month.",
  {
    scope: z
      .enum(["current_month", "all", "today", "yesterday"])
      .default("current_month")
      .describe("Time scope to filter hours"),
  },
  async ({ scope }) => {
    try {
      const hours = await getHours(scope);
      return {
        content: [{
          type: "text",
          text: `Hours (${scope}, ${hours.length} entries):\n${formatHours(hours)}`,
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }] };
    }
  }
);

server.tool(
  "get_projects",
  "List available projects you can log hours to.",
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
  "create_hours",
  "Log hours for one or more dates.",
  {
    dates: z
      .array(z.string())
      .describe('Dates in YYYY-MM-DD format. Example: ["2026-02-26"]'),
    project_id: z
      .string()
      .describe("Project ID from get_projects"),
    hours: z
      .string()
      .default("8")
      .describe("Hours to log (default 8)"),
    category: z
      .string()
      .default("desarrollador")
      .describe("Category: desarrollador, pm, testing, arquitecto, otro"),
    description: z
      .string()
      .describe("What you worked on"),
    extra_allocation: z
      .boolean()
      .default(false)
      .describe("Extra allocation (secondary projects)"),
    in_home: z
      .boolean()
      .default(false)
      .describe("Working from home"),
  },
  async ({ dates, project_id, hours, category, description, extra_allocation, in_home }) => {
    try {
      const results: string[] = [];
      for (const date of dates) {
        const res = await createHour({
          date,
          project_id,
          hours,
          category,
          description,
          extra_allocation,
          in_home,
        });
        results.push(`${date}: ${res.success ? "OK" : res.message}`);
      }
      return { content: [{ type: "text", text: `Results:\n${results.join("\n")}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : e}` }] };
    }
  }
);

server.tool(
  "delete_hours",
  "Delete an hour entry by its ID.",
  {
    id: z.string().describe("Hour entry ID (from get_hours)"),
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
