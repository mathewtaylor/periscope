import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { existsSync } from "node:fs";
import { openDb, closeDb } from "./db.ts";
import hooks from "./routes/hooks.ts";
import health from "./routes/health.ts";
import sessions from "./routes/sessions.ts";
import stats from "./routes/stats.ts";
import admin from "./routes/admin.ts";
import projects from "./routes/projects.ts";
import {
  registerSocket,
  unregisterSocket,
  startStatsTicker,
  stopStatsTicker,
  type WsData,
} from "./ws.ts";

const PORT = Number.parseInt(process.env.PORT ?? "5050", 10);
const DB_PATH = process.env.DB_PATH ?? "./data/events.db";

openDb(DB_PATH);

const app = new Hono();

app.route("/hook", hooks);
app.route("/health", health);
app.route("/api/stats", stats);
app.route("/api/admin", admin);
app.route("/api/projects", projects);
app.route("/api", sessions);

const WEB_DIST = process.env.WEB_DIST ?? "./web/dist";
const staticEnabled = existsSync(WEB_DIST);

if (staticEnabled) {
  app.use("/assets/*", serveStatic({ root: WEB_DIST }));
  app.get("/favicon.ico", serveStatic({ path: `${WEB_DIST}/favicon.ico` }));
  // SPA fallback — any unmatched GET returns index.html so the Vue router handles it.
  app.get("*", serveStatic({ path: `${WEB_DIST}/index.html` }));
  console.log(`[periscope] serving SPA from ${WEB_DIST}`);
} else {
  app.get("/", (c) =>
    c.json({
      name: "periscope",
      status: "ok",
      hint: "SPA not built — run `cd web && bun run build`. Dev: `cd web && bun run dev` (:5173).",
    }),
  );
  console.log(`[periscope] SPA not built (${WEB_DIST} missing) — API-only mode`);
}

app.onError((err, c) => {
  console.error("[server] unhandled", err);
  return c.json({ ok: false, error: "internal error" }, 500);
});

const server = Bun.serve<WsData, never>({
  port: PORT,
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const since = url.searchParams.get("since") ?? undefined;
      const upgraded = srv.upgrade(req, {
        data: { since } satisfies WsData,
      });
      if (upgraded) return undefined;
      return new Response("websocket upgrade required", { status: 400 });
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      registerSocket(ws);
    },
    close(ws) {
      unregisterSocket(ws);
    },
    message(_ws, _msg) {
      // v1: clients don't send anything
    },
  },
});

const stopTicker = startStatsTicker(5000);

console.log(`[periscope] listening on http://localhost:${server.port}`);
console.log(`[periscope] db: ${DB_PATH}`);

function shutdown(signal: string): void {
  console.log(`[periscope] ${signal} received, shutting down`);
  stopTicker();
  stopStatsTicker();
  server.stop(true);
  closeDb();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
