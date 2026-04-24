import { Hono } from "hono";
import { clearEvents } from "../db.ts";
import { broadcastReset } from "../ws.ts";

const app = new Hono();

app.delete("/events", (c) => {
  const cleared = clearEvents();
  broadcastReset();
  return c.json({ ok: true, cleared });
});

export default app;
