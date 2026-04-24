import { describe, expect, test } from "bun:test";
import { buildLanes, correlateToolCalls } from "./correlate";
import type { EventRow } from "./types";

let idCounter = 0;
function ev(
  tsMs: number,
  partial: Partial<EventRow> & { event: string },
): EventRow {
  idCounter++;
  return {
    id: idCounter,
    ts: new Date(tsMs).toISOString(),
    event: partial.event,
    session_id: partial.session_id ?? "s1",
    agent_id: partial.agent_id ?? null,
    agent_type: partial.agent_type ?? null,
    tool_name: partial.tool_name ?? null,
    tool_use_id: partial.tool_use_id ?? null,
    cwd: null,
    payload: partial.payload ?? "{}",
  };
}

describe("correlateToolCalls", () => {
  const base = Date.UTC(2026, 0, 1, 12, 0, 0);

  test("pairs PreToolUse with PostToolUse by tool_use_id", () => {
    const events = [
      ev(base, {
        event: "PreToolUse",
        tool_name: "Edit",
        tool_use_id: "u1",
        payload: JSON.stringify({ tool_input: { file_path: "/x.ts" } }),
      }),
      ev(base + 500, {
        event: "PostToolUse",
        tool_name: "Edit",
        tool_use_id: "u1",
      }),
    ];
    const calls = correlateToolCalls(events, base + 1000);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.status).toBe("ok");
    expect(calls[0]!.durationMs).toBe(500);
    expect(calls[0]!.toolInput).toEqual({ file_path: "/x.ts" });
  });

  test("PostToolUseFailure marks error with message", () => {
    const events = [
      ev(base, { event: "PreToolUse", tool_name: "Bash", tool_use_id: "u1" }),
      ev(base + 100, {
        event: "PostToolUseFailure",
        tool_name: "Bash",
        tool_use_id: "u1",
        payload: JSON.stringify({ error: "exit 1" }),
      }),
    ];
    const calls = correlateToolCalls(events, base + 200);
    expect(calls[0]!.status).toBe("error");
    expect(calls[0]!.errorMessage).toBe("exit 1");
  });

  test("unmatched PreToolUse reports running with elapsed duration", () => {
    const events = [
      ev(base, { event: "PreToolUse", tool_name: "Bash", tool_use_id: "u1" }),
    ];
    const calls = correlateToolCalls(events, base + 3000);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.status).toBe("running");
    expect(calls[0]!.durationMs).toBe(3000);
    expect(calls[0]!.endTs).toBeNull();
  });

  test("PermissionDenied with matching tool_use_id closes PreToolUse as denied", () => {
    const events = [
      ev(base, { event: "PreToolUse", tool_name: "Bash", tool_use_id: "u1" }),
      ev(base + 50, {
        event: "PermissionDenied",
        tool_name: "Bash",
        tool_use_id: "u1",
        payload: JSON.stringify({ reason: "not allowed" }),
      }),
    ];
    const calls = correlateToolCalls(events, base + 100);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.status).toBe("denied");
    expect(calls[0]!.durationMs).toBe(50);
    expect(calls[0]!.errorMessage).toBe("not allowed");
  });

  test("PermissionDenied without tool_use_id synthesises a zero-duration denied call", () => {
    const events = [
      ev(base, {
        event: "PermissionDenied",
        tool_name: "Bash",
        payload: JSON.stringify({ tool_input: { command: "rm -rf /" } }),
      }),
    ];
    const calls = correlateToolCalls(events, base + 10);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.status).toBe("denied");
    expect(calls[0]!.durationMs).toBe(0);
    expect(calls[0]!.toolName).toBe("Bash");
  });
});

describe("buildLanes", () => {
  const base = Date.UTC(2026, 0, 1, 12, 0, 0);

  test("puts main first, active subs next, done subs last", () => {
    const events = [
      ev(base, {
        event: "PreToolUse",
        tool_name: "Edit",
        tool_use_id: "u1",
      }),
      ev(base + 1, {
        event: "PostToolUse",
        tool_name: "Edit",
        tool_use_id: "u1",
      }),
      ev(base + 100, {
        event: "SubagentStart",
        agent_id: "done1",
        agent_type: "test-writer",
      }),
      ev(base + 200, {
        event: "SubagentStop",
        agent_id: "done1",
        agent_type: "test-writer",
      }),
      ev(base + 300, {
        event: "SubagentStart",
        agent_id: "active1",
        agent_type: "builder",
      }),
    ];
    const lanes = buildLanes(events, base + 1000);
    expect(lanes).toHaveLength(3);
    expect(lanes[0]!.agentId).toBeNull();
    expect(lanes[0]!.label).toBe("main");
    expect(lanes[1]!.agentId).toBe("active1");
    expect(lanes[1]!.done).toBe(false);
    expect(lanes[2]!.agentId).toBe("done1");
    expect(lanes[2]!.done).toBe(true);
    expect(lanes[2]!.label).toBe("sub · done");
    expect(lanes[2]!.returnTs).toBeDefined();
  });
});
