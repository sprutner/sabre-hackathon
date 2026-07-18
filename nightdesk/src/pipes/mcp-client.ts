// Minimal Streamable-HTTP MCP client (stateless JSON-RPC over POST).
// Sabre's ai-gateway-mcp-server answers plain JSON; SSE bodies are parsed just in case.

let nextId = 1;

export interface McpToolResult {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
}

export class McpClient {
  constructor(
    private url: string,
    private bearer: string,
  ) {}

  private async rpc(method: string, params: unknown): Promise<any> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.bearer}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    });
    if (!res.ok) {
      throw new Error(`MCP ${method} HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const ctype = res.headers.get("content-type") ?? "";
    let payload: any;
    if (ctype.includes("text/event-stream")) {
      const raw = await res.text();
      const dataLine = raw.split("\n").filter((l) => l.startsWith("data:")).pop();
      payload = JSON.parse(dataLine!.slice(5));
    } else {
      payload = await res.json();
    }
    if (payload.error) throw new Error(`MCP ${method} error: ${JSON.stringify(payload.error)}`);
    return payload.result;
  }

  async initialize(): Promise<any> {
    return this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "nightdesk-spike", version: "0.0.1" },
    });
  }

  async listTools(): Promise<{ tools: Array<{ name: string; description?: string; inputSchema?: unknown }> }> {
    return this.rpc("tools/list", {});
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    return this.rpc("tools/call", { name, arguments: args });
  }
}

export function toolText(r: McpToolResult): string {
  return r.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
}
