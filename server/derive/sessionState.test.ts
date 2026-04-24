import { describe, expect, test } from "bun:test";
import { deriveSessionState } from "./sessionState.ts";
import type { EventRow } from "../types.ts";

let idCounter = 0;
let tsCounter = 0;

function mkEvent(partial: Partial<EventRow> & { event: string }): EventRow {
  idCounter++;
  tsCounter++;
  return {
    id: idCounter,
    ts: new Date(Date.UTC(2026, 0, 1, 0, 0, tsCounter)).toISOString(),
    event: partial.event,
    session_id: partial.session_id ?? "s1",
    agent_id: partial.agent_id ?? null,
    agent_type: partial.agent_type ?? null,
    tool_name: partial.tool_name ?? null,
    tool_use_id: partial.tool_use_id ?? null,
    cwd: partial.cwd ?? "/tmp",
    payload: partial.payload ?? JSON.stringify({}),
  };
}

describe("deriveSessionState", () => {
  test("empty → idle", () => {
    expect(deriveSessionState([])).toBe("idle");
  });

  test("unmatched main PreToolUse → running", () => {
    const events = [
      mkEvent({ event: "SessionStart" }),
      mkEvent({ event: "PreToolUse", tool_name: "Edit", tool_use_id: "u1" }),
    ];
    expect(deriveSessionState(events)).toBe("running");
  });

  test("matched PreToolUse → idle", () => {
    const events = [
      mkEvent({ event: "PreToolUse", tool_name: "Edit", tool_use_id: "u1" }),
      mkEvent({ event: "PostToolUse", tool_name: "Edit", tool_use_id: "u1" }),
    ];
    expect(deriveSessionState(events)).toBe("idle");
  });

  test("PostToolUseFailure closes running state", () => {
    const events = [
      mkEvent({ event: "PreToolUse", tool_name: "Bash", tool_use_id: "u1" }),
      mkEvent({
        event: "PostToolUseFailure",
        tool_name: "Bash",
        tool_use_id: "u1",
      }),
    ];
    // Still alive, just failed — state falls back to idle. error is reserved
    // for stopped-error in the final state table.
    expect(deriveSessionState(events)).toBe("idle");
  });

  test("PermissionDenied closes an open PreToolUse (unblocks running)", () => {
    const events = [
      mkEvent({ event: "PreToolUse", tool_name: "Bash", tool_use_id: "u1" }),
      mkEvent({
        event: "PermissionDenied",
        tool_name: "Bash",
        tool_use_id: "u1",
      }),
    ];
    // Tool call never ran — session flips back to idle.
    expect(deriveSessionState(events)).toBe("idle");
  });

  test("active subagent + idle main → sub", () => {
    const events = [
      mkEvent({ event: "SubagentStart", agent_id: "a1", agent_type: "builder" }),
    ];
    expect(deriveSessionState(events)).toBe("sub");
  });

  test("running main wins over active subagent", () => {
    const events = [
      mkEvent({ event: "SubagentStart", agent_id: "a1" }),
      mkEvent({ event: "PreToolUse", tool_name: "Edit", tool_use_id: "u1" }),
    ];
    expect(deriveSessionState(events)).toBe("running");
  });

  test("pending Notification permission_prompt → wait", () => {
    const events = [
      mkEvent({
        event: "Notification",
        payload: JSON.stringify({ notification_type: "permission_prompt" }),
      }),
    ];
    expect(deriveSessionState(events)).toBe("wait");
  });

  test("Notification cleared by later PreToolUse", () => {
    const events = [
      mkEvent({
        event: "Notification",
        payload: JSON.stringify({ notification_type: "permission_prompt" }),
      }),
      mkEvent({ event: "PreToolUse", tool_name: "Bash", tool_use_id: "u1" }),
    ];
    // Pre fires; session is now running, not wait.
    expect(deriveSessionState(events)).toBe("running");
  });

  test("SessionEnd alone → stopped", () => {
    expect(deriveSessionState([mkEvent({ event: "SessionEnd" })])).toBe(
      "stopped",
    );
  });

  test("SessionEnd with prior failure → error", () => {
    const events = [
      mkEvent({ event: "PreToolUse", tool_name: "Bash", tool_use_id: "u1" }),
      mkEvent({
        event: "PostToolUseFailure",
        tool_name: "Bash",
        tool_use_id: "u1",
      }),
      mkEvent({ event: "SessionEnd" }),
    ];
    expect(deriveSessionState(events)).toBe("error");
  });
});
