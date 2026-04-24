import { describe, expect, test } from "bun:test";
import {
  deriveSparkline,
  parseWindow,
  windowMs,
} from "./sparkline.ts";
import type { EventRow } from "../types.ts";

function ev(
  tsMs: number,
  partial: Partial<EventRow> & { event: string },
): EventRow {
  return {
    id: tsMs,
    ts: new Date(tsMs).toISOString(),
    event: partial.event,
    session_id: "s1",
    agent_id: partial.agent_id ?? null,
    agent_type: null,
    tool_name: partial.tool_name ?? null,
    tool_use_id: partial.tool_use_id ?? null,
    cwd: null,
    payload: partial.payload ?? "{}",
  };
}

describe("parseWindow", () => {
  test("accepts valid labels", () => {
    expect(parseWindow("5m")).toBe("5m");
    expect(parseWindow("15m")).toBe("15m");
    expect(parseWindow("1h")).toBe("1h");
    expect(parseWindow("24h")).toBe("24h");
  });
  test("defaults to 15m", () => {
    expect(parseWindow(undefined)).toBe("15m");
    expect(parseWindow("nonsense")).toBe("15m");
  });
});

describe("deriveSparkline", () => {
  const endMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const end = new Date(endMs);

  test("produces exactly `bins` bins", () => {
    const bins = deriveSparkline([], end, windowMs("15m"), 25);
    expect(bins).toHaveLength(25);
    expect(bins.every((b) => b.count === 0)).toBe(true);
    expect(bins.every((b) => b.color === "fg-4")).toBe(true);
  });

  test("places events in the right bucket", () => {
    const events = [
      ev(endMs - 10 * 60_000, { event: "PreToolUse", tool_name: "Bash" }),
      ev(endMs - 10 * 60_000 + 1, { event: "PreToolUse", tool_name: "Bash" }),
    ];
    const bins = deriveSparkline(events, end, windowMs("15m"), 15);
    const nonZero = bins.filter((b) => b.count > 0);
    expect(nonZero.length).toBe(1);
    expect(nonZero[0]!.color).toBe("run");
  });

  test("color precedence: err > attn > sub > run", () => {
    const events = [
      ev(endMs - 60_000, { event: "PreToolUse", tool_name: "Bash" }),
      ev(endMs - 60_000 + 500, { event: "PostToolUseFailure" }),
      ev(endMs - 60_000 + 1000, { event: "Notification" }),
    ];
    const bins = deriveSparkline(events, end, windowMs("5m"), 5);
    const errBin = bins.find((b) => b.color === "err");
    expect(errBin).toBeDefined();
  });

  test("subagent-dominated bucket picks sub", () => {
    const events = [
      ev(endMs - 60_000, { event: "PreToolUse", agent_id: "a1" }),
      ev(endMs - 60_000 + 10, { event: "PreToolUse", agent_id: "a1" }),
      ev(endMs - 60_000 + 20, { event: "PreToolUse", agent_id: "a1" }),
    ];
    const bins = deriveSparkline(events, end, windowMs("5m"), 5);
    expect(bins.some((b) => b.color === "sub")).toBe(true);
  });

  test("out-of-window events are ignored", () => {
    const events = [
      ev(endMs - 30 * 60_000, { event: "PreToolUse", tool_name: "Bash" }),
    ];
    const bins = deriveSparkline(events, end, windowMs("15m"), 15);
    expect(bins.every((b) => b.count === 0)).toBe(true);
  });
});
