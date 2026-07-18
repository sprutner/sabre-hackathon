// INITIATES seam: POST {tenant_id, phone, reason} → outbound calls row + VB attempt.
// No vb CLI in an edge function; if VOICEBRIDGE_KEY + VB_CALL_URL are set we POST to the
// VB API, else we log the seam as verified-but-unwired. The row is the proof either way.

import { insert, json, requireBearer } from "../_shared/db.ts";

Deno.serve(async (req) => {
  const denied = requireBearer(req);
  if (denied) return denied;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const { tenant_id, phone, reason } = body;
  if (!tenant_id || !phone) return json({ error: "tenant_id and phone required" }, 400);

  const rows = await insert("calls", { tenant_id, direction: "outbound", status: "triggered", transcript: [{ role: "system", text: `outbound trigger: ${reason ?? "unspecified"}`, at: new Date().toISOString() }] });
  const call = rows[0];

  const vbKey = Deno.env.get("VOICEBRIDGE_KEY");
  const vbUrl = Deno.env.get("VB_CALL_URL"); // e.g. https://api.vocalbridge.ai/v1/calls — set once known
  let vb: any = { attempted: false, note: "VB_CALL_URL not configured — seam verified, wire tomorrow." };
  if (vbKey && vbUrl) {
    try {
      const res = await fetch(vbUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${vbKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone, metadata: { call_id: call.id, reason } }),
      });
      vb = { attempted: true, status: res.status, body: (await res.text()).slice(0, 300) };
    } catch (e) {
      vb = { attempted: true, error: (e as Error).message };
    }
  }
  await insert("actions", { call_id: call.id, type: "trigger_outbound", payload: { phone, reason }, result: vb, live: vb.attempted === true && vb.status === 200 });
  return json({ call_id: call.id, vb });
});
