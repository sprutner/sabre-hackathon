// Tenant pipe A — consumes ANY tenant MCP implementing the 3-tool contract.
// Runtime consumption uses the same JSON-RPC mechanics as the Sabre pipe; when the brain
// runs via the Anthropic connector, this server rides as a second mcp_servers entry.

import { McpClient, toolText } from "./mcp-client.js";

export interface TenantPipe {
  name: "mcp" | "direct";
  lookupReservationByPhone(phone: string): Promise<any>;
  getTripContext(tripId: string): Promise<any>;
  getGroupState(tripId: string): Promise<any>;
}

function client(): McpClient {
  const url = process.env.TENANT_MCP_URL ?? `http://localhost:${process.env.AVOSQUADO_MCP_PORT ?? 8788}/mcp`;
  return new McpClient(url, process.env.TENANT_MCP_SHARED_SECRET!);
}

async function call(tool: string, args: Record<string, unknown>): Promise<any> {
  const r = await client().callTool(tool, args);
  return JSON.parse(toolText(r));
}

export const tenantMcp: TenantPipe = {
  name: "mcp",
  lookupReservationByPhone: (phone) => call("lookup_reservation_by_phone", { phone }),
  getTripContext: (tripId) => call("get_trip_context", { trip_id: tripId }),
  getGroupState: (tripId) => call("get_group_state", { trip_id: tripId }),
};
