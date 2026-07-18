// Scripted 4-turn conversation against the deployed agent function, per model.
// Prints per-turn TTFT/total/tool trail, then the actions ledger for the call.

import "dotenv/config";

const BASE = "https://ppapponwxvfnmpcatyju.supabase.co/functions/v1";
const H = { Authorization: `Bearer ${process.env.TENANT_MCP_SHARED_SECRET}`, "Content-Type": "application/json" };
const TENANT = process.argv[2] ?? "760651bf-d739-4c1b-ad2b-93249848cf49"; // Seth's Travel Co
const MODEL = process.argv[3] ?? process.env.MODEL_FAST!;

const TURNS = [
  "Hi, my flight tonight to Cabo got cancelled and I need to get there tomorrow.",
  "The earlier one sounds better. What is it again?",
  "Yes, book it please. I'm Dana Whitfield, this number is fine.",
  "Great. Also, can I get a refund on tonight's hotel in Cabo since we lost a night?",
];

let callId: string | undefined;
const rows: any[] = [];
for (const utterance of TURNS) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/agent`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ tenant_id: TENANT, phone: "4155550101", utterance, call_id: callId, model: MODEL }),
  });
  const data: any = await res.json();
  callId = data.call_id ?? callId;
  rows.push({ utterance, ...data });
  console.log(`\nCALLER: ${utterance}`);
  if (!res.ok) {
    console.log(`  ERROR ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    break;
  }
  console.log(`AVI:    ${data.reply}`);
  console.log(`  [model=${data.model} ttft=${data.ttft_ms}ms total=${data.total_ms}ms wall=${Math.round(performance.now() - t0)}ms tools=${data.tool_calls.join(",") || "-"} errors=${data.tool_errors}]`);
}

if (callId) {
  const actions = await (await fetch(`${BASE}/desk-data?resource=actions`, { headers: H })).json();
  console.log(`\n=== ACTIONS TRAIL (call ${callId}) ===`);
  for (const a of (actions as any[]).filter((a) => a.call_id === callId).reverse()) {
    console.log(`  ${a.live ? "LIVE" : "SIM "} ${a.type} ← ${JSON.stringify(a.payload).slice(0, 90)} → ${JSON.stringify(a.result).slice(0, 110)}`);
  }
  const queue = await (await fetch(`${BASE}/desk-data?resource=queue`, { headers: H })).json();
  console.log(`\n=== QUEUE ===`);
  for (const q of (queue as any[]).filter((q) => q.call_id === callId)) console.log(`  ${q.status} · ${q.reason} · promised by ${q.promised_by}`);
}

const ok = rows.filter((r) => r.reply);
console.log(`\nSUMMARY model=${MODEL} turns=${ok.length}/${TURNS.length} avg_ttft=${Math.round(ok.reduce((s, r) => s + r.ttft_ms, 0) / ok.length)}ms avg_total=${Math.round(ok.reduce((s, r) => s + r.total_ms, 0) / ok.length)}ms tool_errors=${ok.reduce((s, r) => s + r.tool_errors, 0)}`);
