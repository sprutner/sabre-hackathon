// avosquado-mcp — Streamable HTTP MCP server (stateless JSON-RPC over POST), bearer-authed.
// Zero framework: node:http is plenty for three tools.

import "dotenv/config";
import { createServer } from "node:http";
import { TOOL_DEFS } from "./contract.js";

const PORT = Number(process.env.AVOSQUADO_MCP_PORT ?? 8788);
const SECRET = process.env.TENANT_MCP_SHARED_SECRET!;

const server = createServer(async (req, res) => {
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method !== "POST" || !(req.url ?? "").startsWith("/mcp")) return json(404, { error: "POST /mcp only" });
  if (req.headers.authorization !== `Bearer ${SECRET}`) return json(401, { error: "bad bearer" });

  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  let rpc: any;
  try {
    rpc = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
  }

  const reply = (result: unknown) => json(200, { jsonrpc: "2.0", id: rpc.id, result });

  try {
    switch (rpc.method) {
      case "initialize":
        return reply({
          protocolVersion: "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "avosquado-mcp", version: "0.0.1" },
        });
      case "notifications/initialized":
        res.writeHead(202).end();
        return;
      case "tools/list":
        return reply({ tools: TOOL_DEFS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case "tools/call": {
        const tool = TOOL_DEFS.find((t) => t.name === rpc.params?.name);
        if (!tool) return json(200, { jsonrpc: "2.0", id: rpc.id, error: { code: -32602, message: `unknown tool ${rpc.params?.name}` } });
        const result = await tool.handler(rpc.params?.arguments ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(result) }], isError: false });
      }
      default:
        return json(200, { jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: `method ${rpc.method} not supported` } });
    }
  } catch (e: any) {
    return json(200, { jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: e.message } });
  }
});

server.listen(PORT, () => console.log(`avosquado-mcp listening on :${PORT}/mcp (bearer required)`));
