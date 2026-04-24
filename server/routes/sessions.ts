import { Hono } from "hono";
import { getDb } from "../db.ts";
import type { EventRow } from "../types.ts";
import {
  buildSessionRow,
  parseWindow,
  type SessionRow,
} from "../derive/sessionRow.ts";
import {
  deriveSparkline,
  windowMs,
  parseWindow as parseWindowLabel,
} from "../derive/sparkline.ts";
import { deriveToolMix } from "../derive/toolMix.ts";
import { contextLimit } from "../derive/contextLimits.ts";

interface Tokens {
  input: number;
  output: number;
  cached: number;
}

interface ContextInfo {
  used: number;
  limit: number;
  remaining_pct: number;
}

interface AgentContext {
  agent_id: string;
  agent_type: string;
  tokens: Tokens;
  context: ContextInfo | null;
}

interface ContextTokens {
  input: number;
  cache_read: number;
  cache_creation: number;
}

function parseTokens(value: unknown): Tokens | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const input = obj.input;
  const output = obj.output;
  const cached = obj.cached;
  if (
    typeof input !== "number" ||
    typeof output !== "number" ||
    typeof cached !== "number"
  ) {
    return null;
  }
  return { input, output, cached };
}

function parseContextTokens(value: unknown): ContextTokens | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const input = obj.input;
  const cacheRead = obj.cache_read;
  const cacheCreation = obj.cache_creation;
  if (
    typeof input !== "number" ||
    typeof cacheRead !== "number" ||
    typeof cacheCreation !== "number"
  ) {
    return null;
  }
  return { input, cache_read: cacheRead, cache_creation: cacheCreation };
}

// Compute context occupancy from the LATEST assistant message's usage, not
// cumulative totals. Summing `input_tokens` across the whole transcript
// double-counts every retained turn and breaks immediately after /clear or
// /compact. The per-turn input already reflects the active window because
// the API only includes what's currently in it.
function computeContext(
  ctx: ContextTokens | null,
  model: string | null,
): ContextInfo | null {
  if (!ctx) return null;
  const limit = contextLimit(model);
  if (!limit || limit <= 0) return null;
  const used = ctx.input + ctx.cache_read + ctx.cache_creation;
  const remaining = Math.max(0, limit - used);
  const remainingPct = Math.max(0, Math.min(100, (remaining / limit) * 100));
  return {
    used,
    limit,
    remaining_pct: Math.round(remainingPct),
  };
}

const app = new Hono();

interface SessionMeta {
  session_id: string;
  last_ts: string;
}

function listSessionIds(limit = 500): SessionMeta[] {
  return getDb()
    .query<SessionMeta, [number]>(
      `SELECT session_id, MAX(ts) AS last_ts
       FROM events
       GROUP BY session_id
       ORDER BY last_ts DESC
       LIMIT ?`,
    )
    .all(limit);
}

function eventsFor(sessionId: string): EventRow[] {
  return getDb()
    .query<EventRow, [string]>(
      `SELECT * FROM events WHERE session_id = ? ORDER BY ts ASC, id ASC`,
    )
    .all(sessionId);
}

function partitionActiveStopped(
  rows: SessionRow[],
  stoppedCutoffMs: number,
): { active: SessionRow[]; stopped: SessionRow[] } {
  const active: SessionRow[] = [];
  const stopped: SessionRow[] = [];
  const cutoff = Date.now() - stoppedCutoffMs;
  for (const r of rows) {
    if (r.state === "stopped" || r.state === "error") {
      const stoppedAt = r.stopped_at ? Date.parse(r.stopped_at) : 0;
      if (stoppedAt >= cutoff) stopped.push(r);
    } else {
      active.push(r);
    }
  }
  active.sort((a, b) => b.last_event_at.localeCompare(a.last_event_at));
  stopped.sort((a, b) =>
    (b.stopped_at ?? b.last_event_at).localeCompare(
      a.stopped_at ?? a.last_event_at,
    ),
  );
  return { active, stopped };
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

app.get("/sessions", (c) => {
  const window = parseWindow(c.req.query("window"));
  const metas = listSessionIds();
  const rows: SessionRow[] = [];
  for (const m of metas) {
    const events = eventsFor(m.session_id);
    if (events.length === 0) continue;
    rows.push(buildSessionRow(m.session_id, events, window));
  }
  const { active, stopped } = partitionActiveStopped(rows, TWENTY_FOUR_HOURS);
  return c.json({ active, stopped, window });
});

app.get("/sessions/:id", (c) => {
  const sessionId = c.req.param("id");
  const window = parseWindow(c.req.query("window"));
  const events = eventsFor(sessionId);
  if (events.length === 0) return c.json({ error: "not found" }, 404);

  const session = buildSessionRow(sessionId, events, window);

  let prompt: { body: string; ts: string } | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.event === "UserPromptSubmit") {
      try {
        const parsed = JSON.parse(e.payload) as { prompt?: unknown };
        if (typeof parsed.prompt === "string") {
          prompt = { body: parsed.prompt, ts: e.ts };
        }
      } catch {
        // ignore malformed payload
      }
      break;
    }
  }

  const capped =
    events.length > 5000 ? events.slice(events.length - 5000) : events;

  return c.json({ session, prompt, events: capped });
});

app.get("/sessions/:id/agents", (c) => {
  const sessionId = c.req.param("id");
  const events = eventsFor(sessionId);
  if (events.length === 0) return c.json({ error: "not found" }, 404);

  interface Agent {
    agent_id: string;
    agent_type: string;
    started_at: string;
    ended_at?: string;
    event_count: number;
  }
  const agents = new Map<string, Agent>();
  for (const e of events) {
    if (!e.agent_id) continue;
    let agent = agents.get(e.agent_id);
    if (!agent) {
      agent = {
        agent_id: e.agent_id,
        agent_type: e.agent_type ?? "",
        started_at: e.ts,
        event_count: 0,
      };
      agents.set(e.agent_id, agent);
    }
    agent.event_count++;
    if (e.event === "SubagentStart") agent.started_at = e.ts;
    if (e.event === "SubagentStop") agent.ended_at = e.ts;
    if (e.agent_type) agent.agent_type = e.agent_type;
  }
  return c.json([...agents.values()]);
});

app.get("/sessions/:id/sparkline", (c) => {
  const sessionId = c.req.param("id");
  const window = parseWindowLabel(c.req.query("window"));
  const binsRaw = Number.parseInt(c.req.query("bins") ?? "25", 10);
  const bins = Number.isFinite(binsRaw)
    ? Math.max(1, Math.min(binsRaw, 120))
    : 25;

  const events = eventsFor(sessionId);
  if (events.length === 0) return c.json({ error: "not found" }, 404);

  const last = events[events.length - 1]!;
  const state = events.some((e) => e.event === "SessionEnd")
    ? "stopped"
    : "active";
  const endTs = state === "stopped" ? new Date(last.ts) : new Date();
  const spark = deriveSparkline(events, endTs, windowMs(window), bins);
  return c.json({ window, bins, sparkline: spark });
});

app.get("/sessions/:id/summary", (c) => {
  const sessionId = c.req.param("id");
  const events = eventsFor(sessionId);
  if (events.length === 0) return c.json({ error: "not found" }, 404);

  const session = buildSessionRow(sessionId, events);
  const toolMix = deriveToolMix(events);
  const errorCount = events.filter(
    (e) => e.event === "PostToolUseFailure" || e.event === "StopFailure",
  ).length;

  // Most recent StopFailure — surface error_type + human message.
  let stopFailure: { error_type: string; message: string | null } | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.event !== "StopFailure") continue;
    try {
      const parsed = JSON.parse(e.payload) as {
        error_type?: unknown;
        error?: unknown;
      };
      const errorType =
        typeof parsed.error_type === "string" ? parsed.error_type : "unknown";
      const message = typeof parsed.error === "string" ? parsed.error : null;
      stopFailure = { error_type: errorType, message };
    } catch {
      stopFailure = { error_type: "unknown", message: null };
    }
    break;
  }

  // Latest main-thread enrichment — walk newest→oldest once and capture both
  // the cumulative `tokens` block and the current-window `context_tokens`
  // block. Either may be missing if the relay isn't installed or the
  // transcript has no usage data yet.
  let tokens: Tokens | null = null;
  let contextTokens: ContextTokens | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    try {
      const parsed = JSON.parse(e.payload) as {
        tokens?: unknown;
        context_tokens?: unknown;
      };
      if (!tokens) {
        const t = parseTokens(parsed.tokens);
        if (t) tokens = t;
      }
      if (!contextTokens) {
        const c = parseContextTokens(parsed.context_tokens);
        if (c) contextTokens = c;
      }
      if (tokens && contextTokens) break;
    } catch {
      // ignore malformed payload
    }
  }
  const model = session.model ?? null;
  const context = computeContext(contextTokens, model);

  // Per-agent latest tokens + context, grouped by agent_id.
  const agentLatest = new Map<
    string,
    { agent_type: string; tokens: Tokens; context_tokens: ContextTokens | null }
  >();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (!e.agent_id) continue;
    const existing = agentLatest.get(e.agent_id);
    if (existing && existing.context_tokens) continue;
    try {
      const parsed = JSON.parse(e.payload) as {
        agent_tokens?: unknown;
        agent_context_tokens?: unknown;
      };
      const t = parseTokens(parsed.agent_tokens);
      const ct = parseContextTokens(parsed.agent_context_tokens);
      if (!existing && t) {
        agentLatest.set(e.agent_id, {
          agent_type: e.agent_type ?? "",
          tokens: t,
          context_tokens: ct,
        });
      } else if (existing && !existing.context_tokens && ct) {
        existing.context_tokens = ct;
      }
    } catch {
      // ignore malformed payload
    }
  }
  const agentContexts: AgentContext[] = [...agentLatest.entries()].map(
    ([agent_id, v]) => ({
      agent_id,
      agent_type: v.agent_type,
      tokens: v.tokens,
      context: computeContext(v.context_tokens, model),
    }),
  );

  return c.json({
    tokens,
    model,
    duration_ms: session.duration_ms,
    event_count: session.event_count,
    error_count: errorCount,
    tool_mix: toolMix,
    stop_failure: stopFailure,
    context,
    agent_contexts: agentContexts,
  });
});

app.get("/notifications/pending", (c) => {
  const events = getDb()
    .query<EventRow, []>(
      `SELECT * FROM events WHERE event = 'Notification' ORDER BY ts DESC LIMIT 50`,
    )
    .all();

  interface Pending {
    session_id: string;
    project: string;
    tool_name: string | null;
    tool_target: string | null;
    waiting_since: string;
  }

  const pending: Pending[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.session_id)) continue;
    let notifType: string | undefined;
    try {
      const parsed = JSON.parse(e.payload) as {
        notification_type?: string;
      };
      notifType = parsed.notification_type;
    } catch {
      // skip
    }
    if (
      notifType !== "permission_prompt" &&
      notifType !== "elicitation_dialog"
    ) {
      continue;
    }

    const sessionEvents = eventsFor(e.session_id);
    const notifTs = e.ts;
    const cleared = sessionEvents.some(
      (se) =>
        se.agent_id === null &&
        se.ts > notifTs &&
        (se.event === "PreToolUse" ||
          se.event === "Stop" ||
          se.event === "UserPromptSubmit"),
    );
    if (cleared) continue;

    seen.add(e.session_id);
    const row = buildSessionRow(e.session_id, sessionEvents);
    pending.push({
      session_id: e.session_id,
      project: row.project,
      tool_name: row.active_tool?.name ?? null,
      tool_target: row.active_tool?.target ?? null,
      waiting_since: notifTs,
    });
  }

  return c.json(pending);
});

app.get("/events", (c) => {
  const since = c.req.query("since");
  const sessionId = c.req.query("session_id");
  const before = c.req.query("before");
  const eventParam = c.req.query("event");
  const tool = c.req.query("tool");
  const status = c.req.query("status");
  const q = c.req.query("q");
  const limitRaw = c.req.query("limit");
  const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : 100;
  const limit = Math.max(
    1,
    Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 100, 500),
  );

  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (since) {
    clauses.push("ts > ?");
    params.push(since);
  }
  if (before) {
    clauses.push("ts < ?");
    params.push(before);
  }
  if (sessionId) {
    clauses.push("session_id = ?");
    params.push(sessionId);
  }
  if (eventParam) {
    const kinds = eventParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (kinds.length > 0) {
      clauses.push(`event IN (${kinds.map(() => "?").join(",")})`);
      params.push(...kinds);
    }
  }
  if (tool) {
    clauses.push("tool_name = ?");
    params.push(tool);
  }
  if (status === "error") {
    clauses.push("event IN ('PostToolUseFailure','StopFailure')");
  } else if (status === "denied") {
    clauses.push("event = 'PermissionDenied'");
  }
  if (q) {
    clauses.push("payload LIKE '%' || ? || '%' COLLATE NOCASE");
    params.push(q);
  }
  params.push(limit);

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `SELECT * FROM events ${where} ORDER BY ts DESC, id DESC LIMIT ?`;
  const rows = getDb()
    .query<EventRow, (string | number)[]>(sql)
    .all(...params);
  return c.json({ events: rows });
});

export default app;
