import "dotenv/config";
import { writeFileSync } from "node:fs";
import { McpClient, toolText } from "../src/pipes/mcp-client.js";

const name = process.argv[2] ?? "FlightShopAPI_OpenAPISpec";
const out = process.argv[3];
const c = new McpClient(process.env.SABRE_MCP_URL!, process.env.SABRE_ACCESS_TOKEN!);
const r = await c.callTool(name, {});
const text = toolText(r);
if (out) {
  writeFileSync(out, text);
  console.log(`wrote ${text.length} bytes to ${out}`);
} else {
  console.log(text);
}
