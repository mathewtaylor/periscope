import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import { openDb, closeDb, recentEvents } from "../db.ts";
import hooksRoute from "./hooks.ts";

function makeApp(): Hono {
  const app = new Hono();
  app.route("/hook", hooksRoute);
  return app;
}

describe("POST /hook/:event", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
  });

  test("accepts valid payload and returns 200 immediately", async () => {
    const app = makeApp();
    const res = await app.request("/hook/SessionStart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "s1", cwd: "/tmp" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("persists asynchronously after the response", async () => {
    const app = makeApp();
    await app.request("/hook/PreToolUse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "s1",
        cwd: "/tmp",
        tool_name: "Edit",
        tool_use_id: "u1",
        tool_input: { file_path: "/tmp/x.ts" },
      }),
    });
    // Wait a tick for the queued microtask to run.
    await new Promise((r) => setTimeout(r, 10));
    const rows = recentEvents({ sessionId: "s1" });
    expect(rows.length).toBe(1);
    expect(rows[0]!.event).toBe("PreToolUse");
    expect(rows[0]!.tool_use_id).toBe("u1");
  });

  test("rejects invalid event name with 400", async () => {
    const app = makeApp();
    const res = await app.request("/hook/bad%20name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "s1" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects missing session_id with 400", async () => {
    const app = makeApp();
    const res = await app.request("/hook/SessionStart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
    expect(res.status).toBe(400);
  });
});
