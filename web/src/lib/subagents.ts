import type { EventRow } from "./types";

export interface SubagentSummary {
  agentId: string;
  agentType: string;
  description: string | null;
  prompt: string | null;
  subagentType: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  eventCount: number;
  toolCount: number;
  errorCount: number;
  status: "running" | "stopped" | "errored";
  activeToolName: string | null;
  activeToolTarget: string | null;
  lastToolName: string | null;
  lastToolTarget: string | null;
  finalResponse: string | null;
}

interface TaskSpawn {
  ts: string;
  toolUseId: string | null;
  description: string | null;
  prompt: string | null;
  subagentType: string | null;
  consumed: boolean;
}

function tryParse(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function deriveTarget(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const i = input as Record<string, unknown>;
  switch (toolName) {
    case "Bash":
      return asStr(i.command);
    case "Edit":
    case "Write":
    case "Read":
      return basename(asStr(i.file_path));
    case "Grep": {
      const pattern = asStr(i.pattern);
      const path = asStr(i.path);
      return path ? `"${pattern}" ${path}` : `"${pattern}"`;
    }
    case "Glob":
      return asStr(i.pattern);
    case "WebSearch":
      return asStr(i.query);
    case "WebFetch":
      return asStr(i.url);
    default:
      return "";
  }
}

function findSpawn(
  spawns: TaskSpawn[],
  toolUseId: string | null,
  subagentType: string | null,
  before: string,
): TaskSpawn | null {
  if (toolUseId) {
    for (const s of spawns) {
      if (!s.consumed && s.toolUseId === toolUseId) return s;
    }
  }
  for (const s of spawns) {
    if (s.consumed) continue;
    if (s.ts > before) continue;
    if (subagentType && s.subagentType && s.subagentType !== subagentType) {
      continue;
    }
    return s;
  }
  return null;
}

export function buildSubagentSummaries(
  events: readonly EventRow[],
  now = Date.now(),
): SubagentSummary[] {
  const spawns: TaskSpawn[] = [];

  interface Entry {
    s: SubagentSummary;
    openTools: Map<string, { name: string; input: unknown }>;
  }
  const byId = new Map<string, Entry>();

  function ensure(agentId: string, ts: string, type: string): Entry {
    let e = byId.get(agentId);
    if (!e) {
      e = {
        s: {
          agentId,
          agentType: type,
          description: null,
          prompt: null,
          subagentType: null,
          startedAt: ts,
          endedAt: null,
          durationMs: 0,
          eventCount: 0,
          toolCount: 0,
          errorCount: 0,
          status: "running",
          activeToolName: null,
          activeToolTarget: null,
          lastToolName: null,
          lastToolTarget: null,
          finalResponse: null,
        },
        openTools: new Map(),
      };
      byId.set(agentId, e);
    }
    if (type) e.s.agentType = type;
    return e;
  }

  for (const e of events) {
    if (
      e.agent_id === null &&
      e.event === "PreToolUse" &&
      e.tool_name === "Task"
    ) {
      const payload = tryParse(e.payload);
      const input = (payload?.tool_input ?? {}) as Record<string, unknown>;
      spawns.push({
        ts: e.ts,
        toolUseId: e.tool_use_id ?? null,
        description: typeof input.description === "string"
          ? input.description
          : null,
        prompt: typeof input.prompt === "string" ? input.prompt : null,
        subagentType: typeof input.subagent_type === "string"
          ? input.subagent_type
          : null,
        consumed: false,
      });
      continue;
    }

    if (!e.agent_id) continue;

    const entry = ensure(e.agent_id, e.ts, e.agent_type ?? "");
    entry.s.eventCount++;

    if (e.event === "SubagentStart") {
      entry.s.startedAt = e.ts;
      const spawn = findSpawn(
        spawns,
        e.tool_use_id,
        e.agent_type ?? null,
        e.ts,
      );
      if (spawn) {
        spawn.consumed = true;
        entry.s.description = spawn.description;
        entry.s.prompt = spawn.prompt;
        entry.s.subagentType = spawn.subagentType ?? entry.s.agentType;
      }
      continue;
    }

    if (e.event === "SubagentStop") {
      entry.s.endedAt = e.ts;
      entry.s.status = entry.s.errorCount > 0 ? "errored" : "stopped";
      const payload = tryParse(e.payload);
      const response =
        typeof payload?.response === "string"
          ? payload.response
          : typeof payload?.final_response === "string"
            ? (payload.final_response as string)
            : typeof payload?.result === "string"
              ? (payload.result as string)
              : null;
      entry.s.finalResponse = response;
      continue;
    }

    if (e.event === "PreToolUse" && e.tool_use_id) {
      entry.s.toolCount++;
      const payload = tryParse(e.payload);
      entry.openTools.set(e.tool_use_id, {
        name: e.tool_name ?? "",
        input: payload?.tool_input,
      });
      continue;
    }

    if (
      (e.event === "PostToolUse" ||
        e.event === "PostToolUseFailure" ||
        e.event === "PermissionDenied") &&
      e.tool_use_id
    ) {
      entry.openTools.delete(e.tool_use_id);
      if (e.event === "PostToolUseFailure") entry.s.errorCount++;
      if (e.event === "PostToolUse" && e.tool_name) {
        const payload = tryParse(e.payload);
        entry.s.lastToolName = e.tool_name;
        entry.s.lastToolTarget = deriveTarget(e.tool_name, payload?.tool_input);
      }
      continue;
    }
  }

  const out: SubagentSummary[] = [];
  for (const { s, openTools } of byId.values()) {
    if (openTools.size > 0) {
      const values = [...openTools.values()];
      const open = values[values.length - 1]!;
      s.activeToolName = open.name;
      s.activeToolTarget = deriveTarget(open.name, open.input);
    }
    const endMs = s.endedAt ? Date.parse(s.endedAt) : now;
    s.durationMs = Math.max(0, endMs - Date.parse(s.startedAt));
    out.push(s);
  }
  // Active first (running before stopped/errored), then most recent first within group.
  out.sort((a, b) => {
    const aRunning = a.status === "running" ? 0 : 1;
    const bRunning = b.status === "running" ? 0 : 1;
    if (aRunning !== bRunning) return aRunning - bRunning;
    return b.startedAt.localeCompare(a.startedAt);
  });
  return out;
}
