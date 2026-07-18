// avosquado-mcp as an edge function — the tenant-side MCP connector (Streamable HTTP,
// stateless JSON-RPC, bearer-authed). Same contract as /avosquado-mcp/src/server.ts.
// SELECT-only against AvoSquado DEV by construction (see _shared/tenant.ts).

import { json, requireBearer } from "../_shared/db.ts";
import { getGroupState, getTripContext, lookupReservationByPhone } from "../_shared/tenant.ts";

const TOOL_DEFS = [
  {
    name: "lookup_reservation_by_phone",
    description: "Find the caller's active reservation by phone. Returns trip id, name, destination, dates, group size, member first names, organizer.",
    inputSchema: { type: "object", properties: { phone: { type: "string" } }, required: ["phone"] },
    handler: (a: any) => lookupReservationByPhone(a.phone),
  },
  {
    name: "get_trip_context",
    description: "Full speakable summary of a trip including lodging status.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" } }, required: ["trip_id"] },
    handler: (a: any) => getTripContext(a.trip_id),
  },
  {
    name: "get_group_state",
    description: "Confirmed/unconfirmed members and room configuration if derivable.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" } }, required: ["trip_id"] },
    handler: (a: any) => getGroupState(a.trip_id),
  },
];

Deno.serve(async (req) => {
  const denied = requireBearer(req);
  if (denied) return denied;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let rpc: any;
  try {
    rpc = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
  }
  const reply = (result: unknown) => json({ jsonrpc: "2.0", id: rpc.id, result });

  try {
    switch (rpc.method) {
      case "initialize":
        return reply({ protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "avosquado-mcp", version: "0.0.2-edge" } });
      case "notifications/initialized":
        return new Response(null, { status: 202 });
      case "tools/list":
        return reply({ tools: TOOL_DEFS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case "tools/call": {
        const tool = TOOL_DEFS.find((t) => t.name === rpc.params?.name);
        if (!tool) return json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32602, message: `unknown tool ${rpc.params?.name}` } });
        const result = await tool.handler(rpc.params?.arguments ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(result) }], isError: false });
      }
      default:
        return json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: `method ${rpc.method} not supported` } });
    }
  } catch (e) {
    return json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: (e as Error).message } });
  }
});
