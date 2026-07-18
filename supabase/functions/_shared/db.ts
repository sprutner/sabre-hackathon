// Night Desk DB via PostgREST with the service role injected into every edge function.

const base = () => Deno.env.get("SUPABASE_URL")!;
const key = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function headers(extra: Record<string, string> = {}) {
  return { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...extra };
}

export async function select(q: string): Promise<any[]> {
  const res = await fetch(`${base()}/rest/v1/${q}`, { headers: headers() });
  if (!res.ok) throw new Error(`db GET ${q} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function insert(table: string, rows: unknown): Promise<any[]> {
  const res = await fetch(`${base()}/rest/v1/${table}`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`db INSERT ${table} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function update(table: string, filter: string, patch: unknown): Promise<any[]> {
  const res = await fetch(`${base()}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`db PATCH ${table} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export function requireBearer(req: Request): Response | null {
  const secret = Deno.env.get("TENANT_MCP_SHARED_SECRET");
  if (!secret) return null; // no secret configured -> open (spike only)
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  return null;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
