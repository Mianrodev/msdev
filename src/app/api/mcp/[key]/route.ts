/**
 * "Connect your AI": a Model Context Protocol endpoint (streamable HTTP,
 * stateless JSON responses) that the owner adds to Claude as a custom
 * connector. The private key in the address is checked on every request; the
 * tools themselves are in src/services/ai-tools.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { aiKeyWorkspace } from "@/lib/ai-key";
import { AI_TOOLS, runAiTool } from "@/services/ai-tools";
import type { Ctx } from "@/services/context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS =
  "This is the user's personal job-search tracker. Call about_this_app first to learn how it works and what you may do. " +
  "You help research and prepare; the user always applies and decides themselves.";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(ctx: Ctx, m: Rpc) {
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return reply(m.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "prospect-crm", title: "My job tracker", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply(m.id, {});
    case "tools/list":
      return reply(m.id, {
        tools: AI_TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
      const { text, isError } = await runAiTool(ctx, name, args);
      return reply(m.id, { content: [{ type: "text", text }], isError });
    }
    case "resources/list":
      return reply(m.id, { resources: [] });
    case "prompts/list":
      return reply(m.id, { prompts: [] });
    default:
      return fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = await getDb();
  const workspaceId = await aiKeyWorkspace(db, key);
  if (!workspaceId) {
    return NextResponse.json(fail(null, -32001, "This AI link is switched off or was replaced. Make a new one in the app (Your AI page)."), {
      status: 401,
    });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400 });
  }
  // The link opens exactly one person's space.
  const ctx: Ctx = { db, workspaceId, actor: { kind: "system", process: "your-ai" } };
  if (!body || typeof body !== "object" || (Array.isArray(body) && (!body.length || body.length > 20))) {
    return NextResponse.json(fail(null, -32600, "Invalid request"), { status: 400 });
  }
  const messages = (Array.isArray(body) ? body : [body]) as Rpc[];
  const out = [];
  for (const m of messages) {
    if (!m || typeof m !== "object" || m.id === undefined || m.id === null) continue; // notifications need no answer
    out.push(await handle(ctx, m));
  }
  if (!out.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? out : out[0]);
}

export async function GET() {
  // No server-to-client stream: every answer comes back directly on POST.
  return new NextResponse("Method not allowed", { status: 405, headers: { allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
