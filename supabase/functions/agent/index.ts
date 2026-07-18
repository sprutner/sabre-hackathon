// The brain. POST {tenant_id, phone, utterance, call_id?, model?} → runs a streaming Claude
// tool loop (7 tools), writes transcript + an actions row per dispatch, returns the reply
// plus honest timing (ttft_ms = first token of first model turn).

import { insert, json, requireBearer, select, update } from "../_shared/db.ts";
import { bookOffer, searchFlights } from "../_shared/sabre.ts";
import { getGroupState, getTripContext, lookupReservationByPhone } from "../_shared/tenant.ts";

const TOOLS = [
  { name: "lookup_reservation", description: "Find the caller's reservation/trip context by phone number. Use FIRST on every call.", input_schema: { type: "object", properties: { phone: { type: "string" } }, required: ["phone"] } },
  { name: "search_flights", description: "Search live flights. origin/dest IATA codes, date YYYY-MM-DD.", input_schema: { type: "object", properties: { origin: { type: "string" }, dest: { type: "string" }, date: { type: "string" }, pax: { type: "number" } }, required: ["origin", "dest", "date"] } },
  { name: "rebook_flight", description: "Book/exchange to a previously offered flight. ONLY after reading the offer back and hearing an explicit yes. offer_ref = offerId from search_flights.", input_schema: { type: "object", properties: { offer_ref: { type: "string" }, traveler_first_name: { type: "string" }, traveler_last_name: { type: "string" }, phone: { type: "string" } }, required: ["offer_ref"] } },
  { name: "search_hotels", description: "Search hotel availability. Quote only — never book; offer a hold instead.", input_schema: { type: "object", properties: { location: { type: "string" }, check_in: { type: "string" }, check_out: { type: "string" } }, required: ["location", "check_in"] } },
  { name: "place_hold", description: "Place a hold (hotel option, callback promise, seat) with an expiry.", input_schema: { type: "object", properties: { kind: { type: "string" }, details: { type: "object" }, expires_in_hours: { type: "number" } }, required: ["kind"] } },
  { name: "escalate", description: "Escalate to the human agent queue with a callback promise. ALWAYS for refunds, payments, or anything outside policy.", input_schema: { type: "object", properties: { reason: { type: "string" }, context: { type: "object" }, promised_by: { type: "string" } }, required: ["reason"] } },
  { name: "send_sms", description: "Send the caller a confirmation SMS (stub).", input_schema: { type: "object", properties: { to: { type: "string" }, message: { type: "string" } }, required: ["to", "message"] } },
];

function systemPrompt(tenant: any, callerPhone?: string, knownOffers: any[] = []): string {
  const policy = tenant.policy ?? {};
  return [
    callerPhone ? `Caller ID (use this for lookup_reservation — do NOT ask for their number): ${callerPhone}` : "",
    knownOffers.length
      ? `Offers already quoted on this call (use these EXACT offer_ref values for rebook_flight — never invent one):\n` +
        knownOffers.map((o, i) => `  option ${i + 1}: offer_ref=${o.ref} — ${o.speakable}`).join("\n")
      : "",
    `You are Avi, the after-hours desk for ${tenant.name}. You are on a PHONE CALL — answers must be short, speakable sentences. No lists, no markdown.`,
    `Greeting style: ${tenant.greeting ?? "warm, calm, competent"}.`,
    `Policy: rebooking ceiling $${policy.rebook_ceiling_usd ?? 500} per traveler — above it, escalate. Refunds ALWAYS escalate (never promise money back yourself). No payment card handling ever.`,
    `Before ANY booking tool: read the full offer back to the caller and get an explicit yes.`,
    `Always start by looking up the caller's reservation from their phone number. Use first names only.`,
    `Escalation is a feature: promise a callback window and queue it — never say "I can't help". If you tell the caller you will escalate or have someone call back, you MUST call the escalate tool in the SAME turn — saying it without the tool call is a failure.`,
    `offer_ref values are exact ids returned by search_flights — copy them verbatim, never invent or abbreviate one. If you don't have the exact id in context, search again first.`,
  ].join("\n");
}

// In-request offer cache + durable offers rows; read-back needs the exact object.
async function dispatch(callId: string, tenant: any, offerCache: Map<string, any>, name: string, input: any) {
  let result: any;
  let live = false;
  try {
    switch (name) {
      case "lookup_reservation": {
        if (tenant.adapter === "avosquado") {
          // Consume the tenant's MCP endpoint from config — the drop-in contract path.
          const mcpUrl = tenant.config?.integration?.url;
          if (mcpUrl) {
            const res = await fetch(mcpUrl, {
              method: "POST",
              headers: { Authorization: `Bearer ${Deno.env.get("TENANT_MCP_SHARED_SECRET")}`, "Content-Type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "lookup_reservation_by_phone", arguments: { phone: input.phone } } }),
            });
            const rpc = await res.json();
            if (rpc.error) throw new Error(`tenant mcp: ${rpc.error.message}`);
            result = JSON.parse(rpc.result.content[0].text);
          } else {
            result = await lookupReservationByPhone(input.phone);
          }
          live = true;
        } else {
          const last10 = String(input.phone).replace(/\D/g, "").slice(-10);
          const clients = await select(`clients?select=id,name,phone&phone=like.*${last10}&tenant_id=eq.${tenant.id}&limit=1`);
          if (!clients.length) result = { found: false, reason: "no client for that phone" };
          else {
            const res = await select(`reservations?select=*&client_id=eq.${clients[0].id}&status=eq.active&limit=1`);
            result = res.length ? { found: true, client_first_name: clients[0].name?.split(" ")[0], ...res[0] } : { found: false, reason: "no active reservation" };
          }
          live = true;
        }
        break;
      }
      case "search_flights": {
        const r = await searchFlights(input.origin, input.dest, input.date, input.pax ?? 1);
        const top = r.offers.slice(0, 3);
        for (const o of top) offerCache.set(o.offerId, o);
        await insert("offers", top.map((o: any) => ({ call_id: callId, kind: "flight", ref: o.offerId, speakable: o.speakable, payload: o, valid_until: o.validUntil ?? null })));
        result = { offers: top.map((o: any) => ({ offer_ref: o.offerId, speakable: o.speakable })), search_ms: r.ms };
        live = true;
        break;
      }
      case "rebook_flight": {
        let offer = offerCache.get(input.offer_ref);
        if (!offer) {
          const rows = await select(`offers?select=payload&ref=eq.${input.offer_ref}&limit=1`);
          offer = rows[0]?.payload;
        }
        if (!offer) result = { error: "unknown offer_ref — search first" };
        else if (Deno.env.get("SABRE_BOOKING_ARMED") === "yes") {
          result = await bookOffer(offer, { firstName: input.traveler_first_name ?? "Test", lastName: input.traveler_last_name ?? "Traveler", phone: input.phone ?? "4155550100" });
          live = true;
        } else {
          result = { simulated: true, confirmationId: "SIM-" + String(input.offer_ref).slice(0, 6).toUpperCase(), status: "simulated (booking not armed)", offer_speakable: offer.speakable };
        }
        break;
      }
      case "search_hotels": {
        result = {
          simulated: true,
          options: [
            { name: `Marriott near ${input.location}`, nightly: "$189", speakable: `The Marriott near ${input.location} has rooms at one eighty-nine a night.` },
            { name: `Holiday Inn Express ${input.location}`, nightly: "$139", speakable: `Holiday Inn Express at one thirty-nine a night.` },
          ],
        };
        break;
      }
      case "place_hold": {
        const rows = await insert("holds", { kind: input.kind, details: input.details ?? {}, expires_at: new Date(Date.now() + (input.expires_in_hours ?? 24) * 3600_000).toISOString() });
        result = { hold_id: rows[0].id, expires_at: rows[0].expires_at };
        live = true;
        break;
      }
      case "escalate": {
        const rows = await insert("queue", { tenant_id: tenant.id, call_id: callId, reason: input.reason, context: input.context ?? {}, promised_by: input.promised_by ?? "first thing tomorrow morning" });
        result = { queued: true, queue_id: rows[0].id, promised_by: rows[0].promised_by };
        live = true;
        break;
      }
      case "send_sms":
        result = { simulated: true, to: input.to, message: input.message };
        break;
      default:
        result = { error: `unknown tool ${name}` };
    }
  } catch (e) {
    result = { error: (e as Error).message };
  }
  await insert("actions", { call_id: callId, type: name, payload: input, result, live });
  return result;
}

// Streaming Messages call; returns full assistant content blocks + ttft of this turn.
async function claudeTurn(model: string, system: string, messages: any[]) {
  const t0 = performance.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1000, system, tools: TOOLS, messages, stream: true }),
  });
  if (!res.ok) throw new Error(`anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);

  let ttft: number | null = null;
  const content: any[] = [];
  let stopReason = "";
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body!) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const ev = JSON.parse(line.slice(5));
      if (ev.type === "content_block_start") content[ev.index] = ev.content_block.type === "tool_use" ? { ...ev.content_block, _json: "" } : { ...ev.content_block };
      else if (ev.type === "content_block_delta") {
        if (ttft === null) ttft = Math.round(performance.now() - t0);
        const b = content[ev.index];
        if (ev.delta.type === "text_delta") b.text = (b.text ?? "") + ev.delta.text;
        else if (ev.delta.type === "input_json_delta") b._json += ev.delta.partial_json;
      } else if (ev.type === "message_delta" && ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
    }
  }
  for (const b of content) {
    if (b?._json !== undefined) {
      b.input = b._json ? JSON.parse(b._json) : {};
      delete b._json;
    }
  }
  return { content: content.filter(Boolean), stopReason, ttft: ttft ?? Math.round(performance.now() - t0) };
}

Deno.serve(async (req) => {
  const denied = requireBearer(req);
  if (denied) return denied;
  const t0 = performance.now();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const { tenant_id, phone, utterance, call_id, model } = body;
  if (!tenant_id || !utterance) return json({ error: "tenant_id and utterance required" }, 400);

  const tenants = await select(`tenants?select=*&id=eq.${tenant_id}&limit=1`);
  if (!tenants.length) return json({ error: "unknown tenant" }, 404);
  const tenant = tenants[0];

  let call: any;
  if (call_id) {
    const calls = await select(`calls?select=*&id=eq.${call_id}&limit=1`);
    call = calls[0];
  }
  if (!call) {
    const rows = await insert("calls", { tenant_id, direction: "inbound", transcript: [] });
    call = rows[0];
  }

  const transcript: any[] = Array.isArray(call.transcript) ? call.transcript : [];
  transcript.push({ role: "caller", text: utterance, at: new Date().toISOString() });

  // Rebuild model messages from transcript (caller/avi turns only; tool detail lives in actions).
  const messages: any[] = transcript.map((t) => ({ role: t.role === "caller" ? "user" : "assistant", content: t.text }));

  const offerCache = new Map<string, any>();
  // Offers quoted earlier on this call survive turn-to-turn via the offers table + system prompt.
  let knownOffers: any[] = [];
  try {
    knownOffers = await select(`offers?select=ref,speakable,payload&call_id=eq.${call.id}&order=created_at.asc`);
    for (const o of knownOffers) offerCache.set(o.ref, o.payload);
  } catch { /* offers table optional on first boot */ }
  const usedModel = model ?? Deno.env.get("MODEL_FAST") ?? "claude-haiku-4-5-20251001";
  let ttftFirstTurn: number | null = null;
  let toolErrors = 0;
  const toolCalls: string[] = [];

  try {
    for (let turn = 0; turn < 8; turn++) {
      const { content, stopReason, ttft } = await claudeTurn(usedModel, systemPrompt(tenant, phone, knownOffers), messages);
      if (ttftFirstTurn === null) ttftFirstTurn = ttft;
      messages.push({ role: "assistant", content });
      if (stopReason !== "tool_use") {
        const reply = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();
        transcript.push({ role: "avi", text: reply, at: new Date().toISOString() });
        await update("calls", `id=eq.${call.id}`, { transcript });
        return json({
          call_id: call.id,
          reply,
          model: usedModel,
          ttft_ms: ttftFirstTurn,
          total_ms: Math.round(performance.now() - t0),
          tool_calls: toolCalls,
          tool_errors: toolErrors,
        });
      }
      const results: any[] = [];
      for (const block of content.filter((b: any) => b.type === "tool_use")) {
        toolCalls.push(block.name);
        const result = await dispatch(call.id, tenant, offerCache, block.name, block.input);
        if (result?.error) toolErrors++;
        if (block.name === "search_flights" && Array.isArray(result?.offers)) {
          for (const o of result.offers) knownOffers.push({ ref: o.offer_ref, speakable: o.speakable });
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: "user", content: results });
    }
    return json({ error: "tool loop exceeded 8 turns", call_id: call.id }, 500);
  } catch (e) {
    await update("calls", `id=eq.${call.id}`, { transcript, status: "error" });
    return json({ error: (e as Error).message, call_id: call.id, tool_calls: toolCalls }, 502);
  }
});
