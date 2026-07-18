// Pipe A — Sabre via the Anthropic MCP connector: one Messages call; the model drives
// SearchAndBookFlightWorkflow → callSabreAPI chain server-side. Parse blocks by TYPE, never position.

import type { BookResult, SabrePipe, SearchResult, SpeakableOffer } from "./types.js";

const BETAS = ["mcp-client-2025-11-20", "mcp-client-2025-04-04"];

interface McpCallStats {
  toolCalls: Array<{ name: string; ms?: number }>;
  text: string;
  raw: unknown;
}

async function messagesWithSabreMcp(prompt: string, model: string, maxTokens = 3000): Promise<McpCallStats> {
  let lastErr: Error | null = null;
  for (const beta of BETAS) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": beta,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        mcp_servers: [
          {
            type: "url",
            url: process.env.SABRE_MCP_URL,
            name: "sabre",
            authorization_token: process.env.SABRE_ACCESS_TOKEN,
          },
        ],
        ...(beta === "mcp-client-2025-11-20"
          ? { tools: [{ type: "mcp_toolset", mcp_server_name: "sabre" }] }
          : {}),
      }),
    });
    const data: any = await res.json();
    if (!res.ok) {
      lastErr = new Error(`Anthropic (${beta}) HTTP ${res.status}: ${JSON.stringify(data).slice(0, 600)}`);
      continue; // try fallback beta
    }
    const toolCalls = (data.content ?? [])
      .filter((b: any) => b.type === "mcp_tool_use")
      .map((b: any) => ({ name: b.name }));
    const text = (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    return { toolCalls, text, raw: data };
  }
  throw lastErr ?? new Error("both MCP beta headers failed");
}

function extractJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON in model output: ${text.slice(0, 300)}`);
  return JSON.parse(match[0]);
}

export const sabreMcp: SabrePipe = {
  name: "mcp",

  async searchFlights(origin, dest, date, pax): Promise<SearchResult> {
    const t0 = performance.now();
    const { toolCalls, text, raw } = await messagesWithSabreMcp(
      `Search one-way flights ${origin} to ${dest} on ${date} for ${pax} adult(s) using the sabre tools (start with SearchAndBookFlightWorkflow, follow its instructions, use callSabreAPI for /v1/offers/flightShop). Do NOT book anything. Then output ONLY strict JSON, no prose: {"offers":[{"offerId":"...","price":"...","currency":"...","speakable":"<one sentence a phone agent can read aloud: airline, flight number, depart/arrive times, stops, total price>"}]} with the top 2 cheapest offers.`,
      process.env.MODEL_FAST!,
    );
    const parsed = extractJson(text);
    const offers: SpeakableOffer[] = (parsed.offers ?? []).map((o: any) => ({
      offerId: o.offerId,
      price: String(o.price),
      currency: o.currency ?? "USD",
      speakable: o.speakable,
      segments: [],
    }));
    return { offers, totalOffers: offers.length, ms: Math.round(performance.now() - t0), live: true, raw: { toolCalls, text } };
  },

  // The MCP booking path follows workflow instructions. DO NOT CALL without Seth's explicit yes.
  async bookOrExchange(offer, traveler): Promise<BookResult> {
    const t0 = performance.now();
    const { text, raw } = await messagesWithSabreMcp(
      `Book flight offer ${offer.offerId} (${offer.speakable}) for traveler ${traveler.firstName} ${traveler.lastName}, phone ${traveler.phone}, using the sabre tools per SearchAndBookFlightWorkflow instructions. When done output ONLY strict JSON: {"confirmationId":"...","status":"..."}.`,
      process.env.MODEL_FAST!,
      4000,
    );
    const parsed = extractJson(text);
    return { confirmationId: parsed.confirmationId, status: parsed.status ?? "unknown", ms: Math.round(performance.now() - t0), live: true, raw };
  },
};
