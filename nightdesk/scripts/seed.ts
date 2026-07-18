// Idempotent seed: two tenants, Dana + Marcus, one reservation each.
import "dotenv/config";

const base = process.env.NIGHTDESK_SUPABASE_URL!;
const key = process.env.NIGHTDESK_SUPABASE_SERVICE_KEY!;
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };

async function req(method: string, path: string, body?: unknown): Promise<any[]> {
  const res = await fetch(`${base}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function ensureTenant(name: string, patch: any): Promise<any> {
  const existing = await req("GET", `tenants?select=*&name=eq.${encodeURIComponent(name)}&limit=1`);
  if (existing.length) return existing[0];
  return (await req("POST", "tenants", { name, ...patch }))[0];
}

async function ensureClient(tenant_id: string, name: string, phone: string): Promise<any> {
  const existing = await req("GET", `clients?select=*&phone=eq.${phone}&limit=1`);
  if (existing.length) return existing[0];
  return (await req("POST", "clients", { tenant_id, name, phone }))[0];
}

async function ensureReservation(tenant_id: string, client_id: string, adapter_ref: string, summary: any, group_size = 1): Promise<any> {
  const existing = await req("GET", `reservations?select=*&client_id=eq.${client_id}&limit=1`);
  if (existing.length) return existing[0];
  return (await req("POST", "reservations", { tenant_id, client_id, adapter_ref, summary, group_size }))[0];
}

const sethco = await ensureTenant("Seth's Travel Co", {
  greeting: "Seth's Travel Co after-hours desk, this is Avi.",
  adapter: "sabre",
  policy: { rebook_ceiling_usd: 500, refunds: "escalate" },
});
const avosquado = await ensureTenant("AvoSquado", {
  greeting: "AvoSquado trip line, this is Avi.",
  adapter: "avosquado",
  policy: { rebook_ceiling_usd: 400, refunds: "escalate" },
  config: { integration: { type: "mcp", url: "https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/avosquado-mcp" } },
});

const dana = await ensureClient(sethco.id, "Dana Whitfield", "4155550101");
const marcus = await ensureClient(avosquado.id, "Marcus Reyes", "4155550102");

await ensureReservation(sethco.id, dana.id, "SABRE-DEMO-PNR", {
  say: "Round trip San Francisco to Los Cabos, outbound tonight 11pm — CANCELLED by the airline. Return Jul 26.",
  origin: "SFO", dest: "SJD", outbound_date: "2026-07-19", status_note: "outbound cancelled (IRROPS)",
}, 2);
await ensureReservation(avosquado.id, marcus.id, "72f91718-8e52-476c-9b7e-43750ffaf6b0", {
  say: "VB demo trip to San Diego via the AvoSquado app — context comes live from the tenant MCP.",
  source: "avosquado-mcp",
}, 1);

console.log(JSON.stringify({ tenants: { sethco: sethco.id, avosquado: avosquado.id }, clients: { dana: dana.id, marcus: marcus.id } }, null, 2));
