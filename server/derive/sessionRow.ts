import type { EventRow } from "../types.ts";
import { deriveSessionState, type SessionState } from "./sessionState.ts";
import { deriveToolTarget } from "./toolTarget.ts";
import {
  deriveSparkline,
  parseWindow,
  windowMs,
  type SparkBin,
  type WindowLabel,
} from "./sparkline.ts";

export interface ActiveTool {
  name: string;
  target: string;
  started_at: string;
}

export interface ActiveSubagent {
  agent_id: string;
  agent_type: string;
  started_at: string;
}

export interface LastTool {
  name: string;
  target: string;
}

export interface GitInfo {
  branch: string;
  commit: string;
  dirty: boolean;
}

export interface SessionRow {
  session_id: string;
  project: string;
  cwd: string;
  state: SessionState;
  started_at: string;
  last_event_at: string;
  stopped_at?: string;
  duration_ms: number;
  event_count: number;
  distinct_tool_count: number;
  active_tool?: ActiveTool;
  active_subagents: ActiveSubagent[];
  last_tool?: LastTool;
  sparkline: SparkBin[];
  error_summary?: string;
  model?: string;
  permission_mode: string | null;
  source: string | null;
  machine_host: string | null;
  git: GitInfo | null;
}

const GENERIC_LEAF_NAMES = new Set([
  "api",
  "app",
  "backend",
  "client",
  "cli",
  "console",
  "core",
  "docs",
  "frontend",
  "lib",
  "server",
  "src",
  "ui",
  "web",
  "www",
]);

function splitPath(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p.length > 0 && p !== "~");
}

export function projectName(path: string): string {
  const parts = splitPath(path);
  if (parts.length === 0) return "unknown";
  const leaf = parts[parts.length - 1]!;
  if (parts.length >= 2 && GENERIC_LEAF_NAMES.has(leaf.toLowerCase())) {
    const parent = parts[parts.length - 2]!;
    return `${parent}-${leaf}`;
  }
  return leaf;
}

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function latestCwd(events: readonly EventRow[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.cwd) return e.cwd;
  }
  return null;
}

export function buildSessionRow(
  sessionId: string,
  events: readonly EventRow[],
  windowLabel: WindowLabel = "15m",
): SessionRow {
  if (events.length === 0) {
    throw new Error(`buildSessionRow: no events for session ${sessionId}`);
  }

  const first = events[0]!;
  const last = events[events.length - 1]!;
  const state = deriveSessionState(events);
  const cwd = latestCwd(events);
  const project = cwd ? projectName(cwd) : "unknown";

  const toolSet = new Set<string>();
  for (const e of events) {
    if (e.tool_name && e.event === "PreToolUse") toolSet.add(e.tool_name);
  }

  // Active tool — latest unmatched PreToolUse on main
  const mainOpen = new Map<string, EventRow>();
  for (const e of events) {
    if (e.agent_id !== null) continue;
    if (e.event === "PreToolUse" && e.tool_use_id) {
      mainOpen.set(e.tool_use_id, e);
    }
    if (
      (e.event === "PostToolUse" ||
        e.event === "PostToolUseFailure" ||
        e.event === "PermissionDenied") &&
      e.tool_use_id
    ) {
      mainOpen.delete(e.tool_use_id);
    }
  }
  let activeTool: ActiveTool | undefined;
  if (mainOpen.size > 0) {
    const values = [...mainOpen.values()];
    const openEvt = values[values.length - 1]!;
    const payload = parsePayload(openEvt.payload);
    activeTool = {
      name: openEvt.tool_name ?? "",
      target: deriveToolTarget(openEvt.tool_name, payload?.tool_input),
      started_at: openEvt.ts,
    };
  }

  // Active subagents
  const openAgents = new Map<string, { type: string; startedAt: string }>();
  for (const e of events) {
    if (e.event === "SubagentStart" && e.agent_id) {
      openAgents.set(e.agent_id, {
        type: e.agent_type ?? "",
        startedAt: e.ts,
      });
    }
    if (e.event === "SubagentStop" && e.agent_id) {
      openAgents.delete(e.agent_id);
    }
  }
  const activeSubagents: ActiveSubagent[] = [...openAgents.entries()].map(
    ([id, v]) => ({
      agent_id: id,
      agent_type: v.type,
      started_at: v.startedAt,
    }),
  );

  // Last tool — latest PostToolUse on main (for idle / stopped tiles)
  let lastTool: LastTool | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.event === "PostToolUse" && e.tool_name && e.agent_id === null) {
      const payload = parsePayload(e.payload);
      lastTool = {
        name: e.tool_name,
        target: deriveToolTarget(e.tool_name, payload?.tool_input),
      };
      break;
    }
  }

  // Source comes from SessionStart only (it's a lifecycle field).
  let source: string | null = null;
  const sessionStart = events.find((e) => e.event === "SessionStart");
  if (sessionStart) {
    const payload = parsePayload(sessionStart.payload);
    const src = payload?.source;
    if (typeof src === "string") source = src;
  }

  // Model — latest-wins across any event that carries it. Claude Code's
  // SessionStart sometimes omits `model` (notably on `source: resume`);
  // the enrichment relay backfills `model` at the payload root from the
  // transcript's latest assistant message, so we scan every event.
  let model: string | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    const payload = parsePayload(e.payload);
    const m = payload?.model;
    if (typeof m === "string" && m.length > 0) {
      model = m;
      break;
    }
  }

  // permission_mode from the latest event payload that carries one (non-default).
  let permissionMode: string | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    const payload = parsePayload(e.payload);
    const pm = payload?.permission_mode;
    if (typeof pm === "string" && pm.length > 0) {
      if (pm !== "default") permissionMode = pm;
      break;
    }
  }

  // machine_host from the latest event that carries a machine block.
  let machineHost: string | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    const payload = parsePayload(e.payload);
    const machine = payload?.machine;
    if (machine && typeof machine === "object") {
      const host = (machine as Record<string, unknown>).host;
      if (typeof host === "string" && host.length > 0) {
        machineHost = host;
        break;
      }
    }
  }

  // git from the latest event that carries a git block (optional per event).
  let git: GitInfo | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    const payload = parsePayload(e.payload);
    const g = payload?.git;
    if (g && typeof g === "object") {
      const obj = g as Record<string, unknown>;
      const branch = typeof obj.branch === "string" ? obj.branch : null;
      const commit = typeof obj.commit === "string" ? obj.commit : null;
      const dirty = typeof obj.dirty === "boolean" ? obj.dirty : null;
      if (branch !== null && commit !== null && dirty !== null) {
        git = { branch, commit, dirty };
        break;
      }
    }
  }

  // Stopped / error summary
  let stoppedAt: string | undefined;
  let errorSummary: string | undefined;
  if (state === "stopped" || state === "error") {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e.event === "SessionEnd") {
        stoppedAt = e.ts;
        break;
      }
    }
    if (!stoppedAt) stoppedAt = last.ts;
    if (state === "error") {
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i]!;
        if (e.event === "PostToolUseFailure" || e.event === "StopFailure") {
          const payload = parsePayload(e.payload);
          const err =
            typeof payload?.error === "string" ? payload.error : undefined;
          if (e.tool_name) {
            errorSummary = err
              ? `${e.tool_name}: ${err}`
              : `${e.tool_name} failed`;
          } else {
            errorSummary = err ?? "error";
          }
          break;
        }
      }
    }
  }

  const endTs =
    state === "stopped" || state === "error"
      ? new Date(last.ts)
      : new Date();
  const sparkline = deriveSparkline(
    events,
    endTs,
    windowMs(windowLabel),
    25,
  );

  return {
    session_id: sessionId,
    project,
    cwd: cwd ?? "",
    state,
    started_at: first.ts,
    last_event_at: last.ts,
    stopped_at: stoppedAt,
    duration_ms: Math.max(
      0,
      Date.parse(last.ts) - Date.parse(first.ts),
    ),
    event_count: events.length,
    distinct_tool_count: toolSet.size,
    active_tool: activeTool,
    active_subagents: activeSubagents,
    last_tool: lastTool,
    sparkline,
    error_summary: errorSummary,
    model,
    permission_mode: permissionMode,
    source,
    machine_host: machineHost,
    git,
  };
}

export { parseWindow };
