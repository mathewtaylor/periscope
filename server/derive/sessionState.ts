import type { EventRow } from "../types.ts";

export type SessionState =
  | "running"
  | "sub"
  | "wait"
  | "idle"
  | "stopped"
  | "error";

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function deriveSessionState(events: readonly EventRow[]): SessionState {
  let hasSessionEnd = false;
  let hasError = false;
  const mainOpenTools = new Set<string>();
  const openSubagents = new Set<string>();
  let pendingNotificationTs: string | null = null;

  for (const e of events) {
    const isMain = e.agent_id === null;

    if (e.event === "SessionEnd") hasSessionEnd = true;
    if (e.event === "PostToolUseFailure" || e.event === "StopFailure") {
      hasError = true;
    }

    if (isMain && e.event === "Notification") {
      const payload = parsePayload(e.payload);
      const notifType = payload?.notification_type;
      if (
        notifType === "permission_prompt" ||
        notifType === "elicitation_dialog"
      ) {
        pendingNotificationTs = e.ts;
      }
    }
    if (
      isMain &&
      pendingNotificationTs &&
      e.ts > pendingNotificationTs &&
      (e.event === "PreToolUse" ||
        e.event === "Stop" ||
        e.event === "UserPromptSubmit")
    ) {
      pendingNotificationTs = null;
    }

    if (isMain && e.event === "PreToolUse" && e.tool_use_id) {
      mainOpenTools.add(e.tool_use_id);
    }
    if (
      isMain &&
      (e.event === "PostToolUse" ||
        e.event === "PostToolUseFailure" ||
        e.event === "PermissionDenied") &&
      e.tool_use_id
    ) {
      mainOpenTools.delete(e.tool_use_id);
    }

    if (e.event === "SubagentStart" && e.agent_id) {
      openSubagents.add(e.agent_id);
    }
    if (e.event === "SubagentStop" && e.agent_id) {
      openSubagents.delete(e.agent_id);
    }
  }

  if (hasSessionEnd) return hasError ? "error" : "stopped";
  if (pendingNotificationTs) return "wait";
  if (mainOpenTools.size > 0) return "running";
  if (openSubagents.size > 0) return "sub";
  return "idle";
}
