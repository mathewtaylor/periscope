import { Hono } from "hono";
import { pingDb } from "../db.ts";

const app = new Hono();

app.get("/", (c) => {
  const ok = pingDb();
  return c.json({ ok, db: ok ? "ok" : "error" }, ok ? 200 : 503);
});

export default app;
