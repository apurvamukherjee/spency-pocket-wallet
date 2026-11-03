import { createMcpHandler } from "mcp-handler";
import { expect, it } from "vitest";
import { INSTRUCTIONS, registerTools } from "./tools";

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const handler = createMcpHandler(registerTools, { serverInfo: { name: "spency", version: "test" }, instructions: INSTRUCTIONS });
  const res = await handler(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const body = await res.text();
  // Streamable HTTP may answer as SSE ("data: {...}") or plain JSON.
  const json = body.startsWith("{") ? body : body.split("\n").find((l) => l.startsWith("data: "))?.slice(6);
  return JSON.parse(json ?? "null");
}

it("advertises every Spency tool with a JSON input schema", async () => {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  const { result } = await rpc("tools/list");
  const tools: { name: string; inputSchema: { type: string } }[] = result.tools;
  expect(tools.map((t) => t.name).sort()).toEqual([
    "add_commitment",
    "add_transactions",
    "get_summary",
    "list_transactions",
    "log_cash",
    "reconcile",
    "remove_commitment",
    "remove_envelope",
    "remove_transaction",
    "update_commitment",
    "update_envelope",
    "update_plan",
    "update_transaction",
  ]);
  for (const t of tools) expect(t.inputSchema.type).toBe("object");
});

it("refuses tool calls without an authenticated user", async () => {
  const { result } = await rpc("tools/call", { name: "get_summary", arguments: {} });
  expect(result.isError).toBe(true);
});
