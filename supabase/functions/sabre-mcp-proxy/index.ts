// MCP proxy for VB's background AI: forwards JSON-RPC to the Sabre CERT MCP server,
// injecting our bearer. VB authenticates to us with ?key=<VOICE_TOOL_SECRET>.

import { json, voiceAuth } from "../_shared/voice.ts";

Deno.serve(async (req) => {
  const denied = voiceAuth(req);
  if (denied) return denied;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const upstream = await fetch(Deno.env.get("SABRE_MCP_URL") ?? "https://mcp.cert.sabre.com/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SABRE_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: await req.text(),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
});
