import type { EventRow } from "./types";

export interface ToolCall {
  toolUseId: string;
  agentId: string | null;
  toolName: string;
  startTs: string;
  endTs: string | null;
  durationMs: number;
  status: "running" | "ok" | "error" | "denied";
  toolInput: unknown;
  errorMessage?: string;
  exitCode?: number;
}

export interface Lane {
  agentId: string | null;
  agentType: string;
  label: string;
  startTs: string;
  endTs: string | null;
  done: boolean;
  calls: ToolCall[];
  spawnTs?: string;
  returnTs?: string;
}

function tryParse(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractExitCode(resp: unknown): number | undefined {
  if (!resp || typeof resp !== "object") return undefined;
  const r = resp as Record<string, unknown>;
  const code = r.exit_code ?? r.exitCode;
  return typeof code === "number" ? code : undefined;
}

export function correlateToolCalls(
  events: readonly EventRow[],
  now = Date.now(),
): ToolCall[] {
  const open = new Map<string, { event: EventRow; payload: Record<string, unknown> | null }>();
  const calls: ToolCall[] = [];

  let syntheticCounter = 0;

  for (const e of events) {
    const payload = tryParse(e.payload);

    // Handle PermissionDenied: may or may not carry tool_use_id.
    if (e.event === "PermissionDenied") {
      const errorMessage =
        typeof payload?.reason === "string"
          ? (payload.reason as string)
          : typeof payload?.error === "string"
            ? (payload.error as string)
            : undefined;
      if (e.tool_use_id && open.has(e.tool_use_id)) {
        const pre = open.get(e.tool_use_id)!;
        open.delete(e.tool_use_id);
        const startMs = Date.parse(pre.event.ts);
        const endMs = Date.parse(e.ts);
        calls.push({
          toolUseId: pre.event.tool_use_id!,
          agentId: pre.event.agent_id,
          toolName: pre.event.tool_name ?? e.tool_name ?? "",
          startTs: pre.event.ts,
          endTs: e.ts,
          durationMs: Math.max(0, endMs - startMs),
          status: "denied",
          toolInput: pre.payload?.tool_input,
          errorMessage,
        });
      } else {
        // No open PreToolUse — synthesise a zero-duration call.
        syntheticCounter++;
        const syntheticId =
          e.tool_use_id ?? `denied-${e.id}-${syntheticCounter}`;
        calls.push({
          toolUseId: syntheticId,
          agentId: e.agent_id,
          toolName: e.tool_name ?? "",
          startTs: e.ts,
          endTs: e.ts,
          durationMs: 0,
          status: "denied",
          toolInput: payload?.tool_input,
          errorMessage,
        });
      }
      continue;
    }

    if (!e.tool_use_id) continue;

    if (e.event === "PreToolUse") {
      open.set(e.tool_use_id, { event: e, payload });
      continue;
    }
    if (e.event !== "PostToolUse" && e.event !== "PostToolUseFailure") continue;

    const pre = open.get(e.tool_use_id);
    const isError = e.event === "PostToolUseFailure";
    const errorMessage =
      isError && typeof payload?.error === "string"
        ? (payload.error as string)
        : undefined;
    const exitCode = extractExitCode(payload?.tool_response);

    if (!pre) {
      calls.push({
        toolUseId: e.tool_use_id,
        agentId: e.agent_id,
        toolName: e.tool_name ?? "",
        startTs: e.ts,
        endTs: e.ts,
        durationMs: 0,
        status: isError ? "error" : "ok",
        toolInput: payload?.tool_input,
        errorMessage,
        exitCode,
      });
      continue;
    }
    open.delete(e.tool_use_id);
    const startMs = Date.parse(pre.event.ts);
    const endMs = Date.parse(e.ts);
    calls.push({
      toolUseId: pre.event.tool_use_id!,
      agentId: pre.event.agent_id,
      toolName: pre.event.tool_name ?? e.tool_name ?? "",
      startTs: pre.event.ts,
      endTs: e.ts,
      durationMs: Math.max(0, endMs - startMs),
      status: isError ? "error" : "ok",
      toolInput: pre.payload?.tool_input,
      errorMessage,
      exitCode,
    });
  }

  for (const { event, payload } of open.values()) {
    if (!event.tool_use_id) continue;
    const startMs = Date.parse(event.ts);
    calls.push({
      toolUseId: event.tool_use_id,
      agentId: event.agent_id,
      toolName: event.tool_name ?? "",
      startTs: event.ts,
      endTs: null,
      durationMs: Math.max(0, now - startMs),
      status: "running",
      toolInput: payload?.tool_input,
    });
  }

  calls.sort((a, b) => {
    const cmp = a.startTs.localeCompare(b.startTs);
    return cmp !== 0 ? cmp : a.toolUseId.localeCompare(b.toolUseId);
  });
  return calls;
}

export function buildLanes(events: readonly EventRow[], now = Date.now()): Lane[] {
  const calls = correlateToolCalls(events, now);

  const firstTs = events[0]?.ts ?? new Date(now).toISOString();
  const main: Lane = {
    agentId: null,
    agentType: "agent",
    label: "main",
    startTs: firstTs,
    endTs: null,
    done: false,
    calls: calls.filter((c) => c.agentId === null),
  };

  const byAgent = new Map<string, Lane>();
  for (const e of events) {
    if (!e.agent_id) continue;
    let lane = byAgent.get(e.agent_id);
    if (!lane) {
      lane = {
        agentId: e.agent_id,
        agentType: e.agent_type ?? "subagent",
        label: "sub",
        startTs: e.ts,
        endTs: null,
        done: false,
        calls: [],
      };
      byAgent.set(e.agent_id, lane);
    }
    if (e.event === "SubagentStart") {
      lane.startTs = e.ts;
      lane.spawnTs = e.ts;
    }
    if (e.event === "SubagentStop") {
      lane.endTs = e.ts;
      lane.returnTs = e.ts;
      lane.done = true;
    }
    if (e.agent_type) lane.agentType = e.agent_type;
  }

  for (const call of calls) {
    if (call.agentId === null) continue;
    const lane = byAgent.get(call.agentId);
    if (lane) lane.calls.push(call);
  }

  const subs = [...byAgent.values()];
  subs.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.startTs.localeCompare(b.startTs);
  });
  for (const lane of subs) {
    if (lane.done) lane.label = "sub · done";
  }

  return [main, ...subs];
}

export function windowBounds(
  events: readonly EventRow[],
  state: string,
  now = Date.now(),
): { startMs: number; endMs: number } {
  const first = events[0];
  const last = events[events.length - 1];
  const startMs = first ? Date.parse(first.ts) : now - 60_000;
  const endMs =
    state === "stopped" || state === "error"
      ? last
        ? Date.parse(last.ts)
        : now
      : now;
  return { startMs, endMs: Math.max(endMs, startMs + 60_000) };
}
