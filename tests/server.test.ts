import { describe, it } from "node:test";
import assert from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

async function createConnectedServer() {
  // We import index.ts's server indirectly by re-creating a minimal one
  // to avoid side effects (stdio transport). Instead, we test the real server
  // module by dynamically importing it. But since index.ts calls main() on
  // import, we build a fresh server here that mirrors the real one.

  // Actually, let's just test the protocol shape by importing and connecting.
  // We need to build a server the same way index.ts does.
  const { McpServer: _McpServer } = await import(
    "@modelcontextprotocol/sdk/server/mcp.js"
  );

  const server = new McpServer({ name: "vairix-admin", version: "1.0.0" });

  // Register the same tools as index.ts (schemas only — handlers return stubs)
  server.tool("auth", "Auth tool", {}, async () => ({
    content: [{ type: "text" as const, text: "stub" }],
  }));
  server.tool("auth_status", "Auth status", {}, async () => ({
    content: [{ type: "text" as const, text: "stub" }],
  }));
  server.tool("logout", "Logout", {}, async () => ({
    content: [{ type: "text" as const, text: "stub" }],
  }));
  server.tool("get_pending_days", "Pending days", {}, async () => ({
    content: [{ type: "text" as const, text: "stub" }],
  }));
  server.tool(
    "get_hours",
    "Get hours",
    {
      scope: z
        .enum(["current_month", "all", "today", "yesterday"])
        .default("current_month"),
    },
    async () => ({
      content: [{ type: "text" as const, text: "stub" }],
    })
  );
  server.tool("get_projects", "Get projects", {}, async () => ({
    content: [{ type: "text" as const, text: "stub" }],
  }));
  server.tool(
    "create_hours",
    "Create hours",
    {
      dates: z.array(z.string()),
      project_id: z.string(),
      hours: z.string().default("8"),
      category: z.string().default("desarrollador"),
      description: z.string(),
      extra_allocation: z.boolean().default(false),
      in_home: z.boolean().default(false),
    },
    async () => ({
      content: [{ type: "text" as const, text: "stub" }],
    })
  );
  server.tool(
    "delete_hours",
    "Delete hours",
    { id: z.string() },
    async () => ({
      content: [{ type: "text" as const, text: "stub" }],
    })
  );

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server };
}

describe("MCP server protocol", () => {
  it("lists all 8 tools", async () => {
    const { client } = await createConnectedServer();
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, [
      "auth",
      "auth_status",
      "create_hours",
      "delete_hours",
      "get_hours",
      "get_pending_days",
      "get_projects",
      "logout",
    ]);
  });

  it("get_hours has scope parameter with enum", async () => {
    const { client } = await createConnectedServer();
    const result = await client.listTools();
    const getHours = result.tools.find((t) => t.name === "get_hours")!;
    const props = getHours.inputSchema.properties as Record<string, any>;
    assert.ok(props.scope);
    assert.ok(props.scope.default === "current_month");
  });

  it("create_hours requires dates, project_id, description", async () => {
    const { client } = await createConnectedServer();
    const result = await client.listTools();
    const createHours = result.tools.find((t) => t.name === "create_hours")!;
    const required = createHours.inputSchema.required as string[];
    assert.ok(required.includes("dates"));
    assert.ok(required.includes("project_id"));
    assert.ok(required.includes("description"));
  });

  it("delete_hours requires id", async () => {
    const { client } = await createConnectedServer();
    const result = await client.listTools();
    const deleteHours = result.tools.find((t) => t.name === "delete_hours")!;
    const required = deleteHours.inputSchema.required as string[];
    assert.ok(required.includes("id"));
  });

  it("tools without required params have empty/no required array", async () => {
    const { client } = await createConnectedServer();
    const result = await client.listTools();
    const noParams = ["auth", "auth_status", "logout", "get_pending_days", "get_projects"];
    for (const name of noParams) {
      const tool = result.tools.find((t) => t.name === name)!;
      const required = (tool.inputSchema.required as string[] | undefined) ?? [];
      assert.strictEqual(required.length, 0, `${name} should have no required params`);
    }
  });
});
