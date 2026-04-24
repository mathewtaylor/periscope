import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import { contextLimit } from "./contextLimits.ts";
import { buildSessionRow } from "./sessionRow.ts";
import type { EventRow } from "../types.ts";
import { closeDb, openDb, insertEvent } from "../db.ts";
import sessionsRoute from "../routes/sessions.ts";

let idCounter = 0;
let tsCounter = 0;

function resetCounters(): void {
  idCounter = 0;
  tsCounter = 0;
}

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

describe("contextLimit", () => {
  test("sonnet and haiku resolve to 200k", () => {
    expect(contextLimit("claude-sonnet-4-5")).toBe(200_000);
    expect(contextLimit("claude-sonnet-4-6")).toBe(200_000);
    expect(contextLimit("claude-haiku-4-5")).toBe(200_000);
  });

  test("opus 4.6 and 4.7 resolve to 1M", () => {
    expect(contextLimit("claude-opus-4-6")).toBe(1_000_000);
    expect(contextLimit("claude-opus-4-7")).toBe(1_000_000);
  });

  test("unknown model returns null", () => {
    expect(contextLimit("gpt-4")).toBeNull();
    expect(contextLimit("claude-unknown")).toBeNull();
  });

  test("strips [1m] suffix before lookup", () => {
    expect(contextLimit("claude-opus-4-7[1m]")).toBe(1_000_000);
    expect(contextLimit("claude-sonnet-4-5[anything]")).toBe(200_000);
  });

  test("null/undefined/empty model returns null", () => {
    expect(contextLimit(null)).toBeNull();
    expect(contextLimit(undefined)).toBeNull();
    expect(contextLimit("")).toBeNull();
  });
});

describe("buildSessionRow — enrichment fields", () => {
  beforeEach(() => {
    resetCounters();
  });

  test("surfaces machine_host from latest event that carries it", () => {
    const events = [
      mkEvent({ event: "SessionStart" }),
      mkEvent({
        event: "UserPromptSubmit",
        payload: JSON.stringify({
          machine: { host: "galaxy", platform: "darwin", user: "alice" },
        }),
      }),
      mkEvent({ event: "PreToolUse", tool_name: "Edit", tool_use_id: "u1" }),
    ];
    const row = buildSessionRow("s1", events);
    expect(row.machine_host).toBe("galaxy");
  });

  test("surfaces git block when present, null when absent", () => {
    const events = [
      mkEvent({ event: "SessionStart" }),
      mkEvent({
        event: "UserPromptSubmit",
        payload: JSON.stringify({
          git: { branch: "main", commit: "deadbeef", dirty: true },
        }),
      }),
    ];
    const row = buildSessionRow("s1", events);
    expect(row.git).toEqual({
      branch: "main",
      commit: "deadbeef",
      dirty: true,
    });

    resetCounters();
    const plain = [
      mkEvent({ event: "SessionStart" }),
      mkEvent({ event: "PreToolUse", tool_name: "Edit", tool_use_id: "u1" }),
    ];
    const row2 = buildSessionRow("s1", plain);
    expect(row2.git).toBeNull();
    expect(row2.machine_host).toBeNull();
  });
});

function makeApp(): Hono {
  const app = new Hono();
  app.route("/api", sessionsRoute);
  return app;
}

describe("GET /api/sessions/:id/summary — tokens + context", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
  });

  test("returns cumulative tokens + current-window context from context_tokens", async () => {
    insertEvent({
      event: "SessionStart",
      session_id: "s1",
      agent_id: null,
      agent_type: null,
      tool_name: null,
      tool_use_id: null,
      cwd: "/tmp",
      payload: JSON.stringify({
        session_id: "s1",
        model: "claude-opus-4-7",
      }),
    });
    insertEvent({
      event: "PreToolUse",
      session_id: "s1",
      agent_id: null,
      agent_type: null,
      tool_name: "Edit",
      tool_use_id: "u1",
      cwd: "/tmp",
      payload: JSON.stringify({
        session_id: "s1",
        tokens: { input: 50_000, output: 1_000, cached: 10_000 },
        // Latest assistant turn had 40k fresh + 160k cached in the window.
        // 200k / 1M → 80% remaining on Opus 4.7.
        context_tokens: {
          input: 40_000,
          cache_read: 120_000,
          cache_creation: 40_000,
        },
      }),
    });

    const res = await makeApp().request("/api/sessions/s1/summary");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tokens: { input: number; output: number; cached: number } | null;
      context: { used: number; limit: number; remaining_pct: number } | null;
      model: string | null;
    };
    expect(body.tokens).toEqual({
      input: 50_000,
      output: 1_000,
      cached: 10_000,
    });
    expect(body.context).not.toBeNull();
    expect(body.context!.used).toBe(200_000);
    expect(body.context!.limit).toBe(1_000_000);
    // 800k remaining of 1M → 80%
    expect(body.context!.remaining_pct).toBe(80);
  });

  test("context is null when only cumulative tokens are present (no context_tokens)", async () => {
    insertEvent({
      event: "SessionStart",
      session_id: "s1b",
      agent_id: null,
      agent_type: null,
      tool_name: null,
      tool_use_id: null,
      cwd: "/tmp",
      payload: JSON.stringify({
        session_id: "s1b",
        model: "claude-opus-4-7",
      }),
    });
    insertEvent({
      event: "PreToolUse",
      session_id: "s1b",
      agent_id: null,
      agent_type: null,
      tool_name: "Edit",
      tool_use_id: "u1",
      cwd: "/tmp",
      payload: JSON.stringify({
        session_id: "s1b",
        tokens: { input: 50_000, output: 1_000, cached: 10_000 },
      }),
    });

    const res = await makeApp().request("/api/sessions/s1b/summary");
    const body = (await res.json()) as {
      context: unknown;
      tokens: unknown;
    };
    expect(body.tokens).not.toBeNull();
    expect(body.context).toBeNull();
  });

  test("returns null tokens + null context when events carry no tokens", async () => {
    insertEvent({
      event: "SessionStart",
      session_id: "s2",
      agent_id: null,
      agent_type: null,
      tool_name: null,
      tool_use_id: null,
      cwd: "/tmp",
      payload: JSON.stringify({
        session_id: "s2",
        model: "claude-opus-4-7",
      }),
    });
    insertEvent({
      event: "PreToolUse",
      session_id: "s2",
      agent_id: null,
      agent_type: null,
      tool_name: "Edit",
      tool_use_id: "u2",
      cwd: "/tmp",
      payload: JSON.stringify({ session_id: "s2" }),
    });

    const res = await makeApp().request("/api/sessions/s2/summary");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tokens: unknown;
      context: unknown;
    };
    expect(body.tokens).toBeNull();
    expect(body.context).toBeNull();
  });
});
