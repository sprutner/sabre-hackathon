// Shared bits for the VB-facing voice tools (these deploy to skitrip-dev, matching the
// URLs already configured in the VB agent). Auth = X-Voice-Tool-Secret header (or ?key=).
// The ledger ALWAYS writes to the NIGHTDESK db via explicit env — never the injected
// project env (on skitrip-dev that would be the tenant's DB).

export function voiceAuth(req: Request): Response | null {
  const secret = Deno.env.get("VOICE_TOOL_SECRET");
  if (!secret) return null; // unset -> open (never in demo config)
  const url = new URL(req.url);
  if (req.headers.get("x-voice-tool-secret") === secret || url.searchParams.get("key") === secret) return null;
  return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ACCOUNTS proof: every voice tool dispatch lands in the nightdesk actions ledger.
export async function ledger(type: string, payload: unknown, result: unknown, live: boolean, callId?: string) {
  const base = Deno.env.get("NIGHTDESK_URL");
  const key = Deno.env.get("NIGHTDESK_SERVICE_KEY");
  if (!base || !key) return; // ledger unavailable — don't break the call
  try {
    await fetch(`${base}/rest/v1/actions`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: callId ?? null, type, payload, result, live }),
    });
  } catch (e) {
    console.error("ledger write failed:", (e as Error).message);
  }
}
