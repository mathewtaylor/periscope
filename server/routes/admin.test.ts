import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import { closeDb, openDb, insertEvent, recentEvents } from "../db.ts";
import hooksRoute from "./hooks.ts";
import adminRoute from "./admin.ts";

function makeApp(): Hono {
  const app = new Hono();
  app.route("/hook", hooksRoute);
  app.route("/api/admin", adminRoute);
  return app;
}

describe("DELETE /api/admin/events", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
  });

  test("clears all events and reports count", async () => {
    for (let i = 0; i < 3; i++) {
      insertEvent({
        event: "SessionStart",
        session_id: "s1",
        agent_id: null,
        agent_type: null,
        tool_name: null,
        tool_use_id: null,
        cwd: null,
        payload: JSON.stringify({ session_id: "s1" }),
      });
    }
    expect(recentEvents({}).length).toBe(3);

    const res = await makeApp().request("/api/admin/events", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cleared: number };
    expect(body.cleared).toBe(3);
    expect(recentEvents({}).length).toBe(0);
  });

  test("is safe on empty database", async () => {
    const res = await makeApp().request("/api/admin/events", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cleared: number };
    expect(body.cleared).toBe(0);
  });
});
