import { Hono } from "hono";
import { extractColumns, IngestError } from "../ingest.ts";
import { insertEvent } from "../db.ts";
import { broadcastEvent, broadcastStats } from "../ws.ts";

const app = new Hono();

app.post("/:event", async (c) => {
  const event = c.req.param("event");
  const rawBody = await c.req.text();

  let row;
  try {
    row = extractColumns(event, rawBody);
  } catch (err) {
    if (err instanceof IngestError) {
      return c.json({ ok: false, error: err.message }, err.status as 400);
    }
    throw err;
  }

  // Return 200 immediately — non-blocking contract with Claude Code hooks.
  // Persistence and broadcast happen after the response is on the wire.
  queueMicrotask(() => {
    try {
      const inserted = insertEvent(row);
      broadcastEvent(inserted);
      broadcastStats();
    } catch (err) {
      console.error("[hooks] async persist failed", err);
    }
  });

  return c.json({ ok: true });
});

export default app;
