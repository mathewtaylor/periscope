# Periscope

A self-hosted, read-only observability dashboard for Claude Code sessions.

Periscope collects hook events from Claude Code over HTTP, persists them to SQLite, and renders a live dashboard that shows every concurrent session — main thread and subagents — at a glance from a secondary monitor.

> The name reflects the tool's purpose: a read-only instrument for looking into a running system from outside it. Periscope watches, it does not steer.

---

## Quick start — local (no Docker)

The fastest way to poke at Periscope. Requires [Bun](https://bun.sh) 1.2+.

### One command — API + dashboard with hot reload

```bash
./dev.sh
```

The launcher installs deps on first run, starts the Bun server on `:5050` and the Vite dev server on `:5173` in parallel, and tears both down on Ctrl+C. Open **http://localhost:5173** — edits to `web/src/` or `server/` hot-reload automatically.

On Windows use Git Bash (ships with Git for Windows). PowerShell is not supported; run the two commands manually there (see below).

### Seed demo data

In a second terminal (while `dev.sh` is running):

```bash
bun run seed               # one of each tile variant: running / sub / wait / idle / stopped-ok / stopped-error
```

### Single-process run (prebuilt SPA on :5050)

If you don't need HMR and want a single port (e.g. to test the built output the way Docker runs it):

```bash
bun install
cd web && bun install && cd ..
bun run build              # bundles the Vue SPA into web/dist
bun run start              # serves API + WS + SPA on http://localhost:5050
```

Data is written to `./data/events.db` in the repo (gitignored).

### Manual two-terminal run (if `dev.sh` won't run on your shell)

```bash
# Terminal 1 — backend
bun run dev                # --watch auto-restarts on server edits

# Terminal 2 — Vite dev server on :5173 with /api and /ws proxied to :5050
bun run dev:web
```

Then open **http://localhost:5173**.

### Handy one-liners

| Command | What it does |
|---|---|
| `./dev.sh` | Both servers + HMR. First-run installs deps. Ctrl+C stops both. |
| `bun run start` | API + WS + prebuilt SPA on `:5050`. |
| `bun run dev` | Same, with `--watch` so server source changes auto-restart. |
| `bun run build` | Rebuild the SPA into `web/dist` (needed after `web/src` changes if you use `start`, not needed with `dev:web`). |
| `bun run dev:web` | Vite dev server with HMR on `:5173`. Needs the backend also running. |
| `bun run seed` | Insert a full fixture set. Set `HOST=http://other-host:5050` to target a different collector. |
| `bun test` | Run the 47-test suite (pure modules + route smokes). |
| `curl -X DELETE http://localhost:5050/api/admin/events` | Wipe the local DB. Same as the **Clear database** button on `/config`. |

### Local files

- `./data/events.db` — the SQLite file. Delete it to start fresh, or use the `/config` page's Clear button.
- `./web/dist/` — built SPA. Safe to delete; the server will run API-only until you rebuild.

## Quick start — Docker

For leaving it running on a home server next to your other containers:

```bash
docker compose up -d
docker compose logs -f periscope
```

Dashboard: http://localhost:5050. Data persists in the `periscope-data` named volume at `/data/events.db` (survives container rebuilds).

## Configure Claude Code hooks

Copy the `hooks` block from [`settings.claude.example.json`](./settings.claude.example.json) into `~/.claude/settings.json` on every machine you want to observe. Replace `<host>` with the hostname or IP where Periscope is reachable (`localhost`, a Tailscale hostname, `192.168.x.y`, etc.).

After saving, run `/hooks` inside Claude Code once to approve the new HTTP hooks — Claude Code requires review of hook configuration changes before they take effect.

Hooks are non-blocking: if Periscope is down, Claude Code continues normally. The collector returns `200 {"ok":true}` as fast as possible and persists + broadcasts asynchronously.

## The dashboard

**Sessions home** (`/`)
- One tile per active session. Tile top-edge color and breathing dot encode state:
  - blue `run` — a tool is currently running on the main thread
  - lavender `sub` — one or more subagents are active, main is idle
  - amber `attn` — the session is blocked awaiting a permission prompt
  - grey (dimmed) — idle
- Each tile shows a 25-bar sparkline of activity in the selected window (5m / 15m / 1h / 24h, persisted in localStorage). Bar color encodes the dominant activity kind per bucket.
- Subagent tiles show a chip row of active subagents with live ages.
- Below the grid, a compact "stopped" card lists sessions that ended in the last 24 hours, with `ok` / `error` state and a summary line.

**Session detail** (`/sessions/:id`)
- Prompt card with the most recent `UserPromptSubmit`.
- Timeline with one lane per thread — main first, then active subagents, then `sub · done`.
  - Tool calls render as proportional bars; spawn markers (2 px sub) descend from the main lane at each `SubagentStart`; return markers (3 px ok) mark `SubagentStop`, and the sub lane greys after that.
  - Click a bar to open a right-side drawer with the raw `tool_input` JSON, error message (if any), duration, and exit code (Bash only).
- Summary card with state, event count, error count, tokens (see caveats below), model, duration, and a stacked tool-mix bar.
- Recent list: last ~40 events as `MM:SS · lane · verb+target`, newest at top, with `slideUp` on new rows. `Follow now` toggles pinned scroll.

**Alerts strip**
- A persistent band under the top nav whenever any session is in `wait`.
- Shows project name, blocking tool + args, elapsed time. `Review` jumps to the session; `Mute 5m` suppresses the strip for that session (localStorage-backed).
- `role="status" aria-live="polite"` so screen readers announce new awaiting sessions.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/hook/:event` | Ingest a hook event. Returns `200 {"ok":true}` immediately; persist + broadcast are async. |
| `GET` | `/health` | Liveness + DB ping. |
| `GET` | `/api/sessions?window=15m` | Active + stopped session rows with sparkline + active tool + active subagents. |
| `GET` | `/api/sessions/:id?window=15m` | Session detail: row + latest prompt + events (capped 5000). |
| `GET` | `/api/sessions/:id/agents` | Per-subagent metadata for the session. |
| `GET` | `/api/sessions/:id/sparkline?window=15m&bins=25` | Binned activity counts + colors. |
| `GET` | `/api/sessions/:id/summary` | Tool mix + model + error count; `tokens: null` (see caveats). |
| `GET` | `/api/notifications/pending` | Current `wait` sessions driving the alerts strip. |
| `GET` | `/api/stats` | `{active, ev_per_sec, uptime_ms}` — powers the header counters. |
| `GET` | `/api/events?since=&session_id=&limit=` | Flat recent-events feed. |
| `DELETE` | `/api/admin/events` | Wipe every event in the local SQLite DB. Broadcasts a WS `reset` to any connected dashboards. Exposed through the `Config` tab in the UI. |
| WS | `/ws[?since=<iso>]` | Live event stream. Messages: `hello`, `event`, `stats` (every 5 s), `reset` (after admin clear). |

## Configuration

| Env var | Default | Description |
|---|---|---|
| `PORT` | `5050` | HTTP port. |
| `DB_PATH` | `./data/events.db` (local) · `/data/events.db` (Docker) | SQLite file. Directory is created if missing. |
| `WEB_DIST` | `./web/dist` (local) · `/app/web/dist` (Docker) | Built SPA. If missing, the server runs API-only. |
| `HOST` | `http://localhost:5050` | Only used by `scripts/seed.ts` — the target collector URL. |

## Exposing beyond localhost (Tailscale)

Bind the container to your Tailnet rather than your LAN when you can — Periscope has no auth in v1. A typical setup:

1. Run Docker on a home server that's on your tailnet.
2. Point your Claude Code hooks at the tailnet hostname: `http://home-server:5050/hook/<event>`.
3. Keep the port off any port-forward / public exposure.

If you must expose it further, put a reverse proxy in front with basic auth and add a shared-secret header via `httpHookAllowedEnvVars` (not wired in v1 — see "What's deferred").

## Retention

v1 does not prune events. Each hook event is small (usually < 1 KB) and SQLite handles millions of rows easily, but long-running setups will want pruning eventually. Add something like:

```sql
DELETE FROM events WHERE ts < datetime('now', '-30 days');
```

on a cron, if disk pressure becomes an issue.

## What's deferred in v1

These are intentional scope limits, called out so expectations are set:

- **Tokens in the SummaryCard** — hook payloads don't include token counts. Renders as `—`. Revisit if Claude Code adds a TokensUsed-style event.
- **Tool exit codes for non-Bash tools** — timeline tooltips show exit code for Bash only. Others signal success via `PostToolUse` vs `PostToolUseFailure`.
- **Cross-host machine identity** — `session_id` is unique but doesn't identify the machine. Project name is derived from `cwd`.
- **Transcript ingestion** — `transcript_path` is stored but never fetched (the file may live on a different host).
- **Auth** — none. Bind to localhost / Tailscale.
- **Events / Projects / Config nav tabs** — visual placeholders only; routes render a "later version" panel.
- **`⌘K` command palette** — visual hint only.
- **List-view mode on sessions home** — ships as a flat table fallback.
- **Light mode** — explicitly out of v1.

## Architecture

```
Claude Code (any host)                Periscope (single Bun process)
──────────────────────                ─────────────────────────────────────
 settings.json hooks ───HTTP POST──►  POST /hook/:event
                                        └─► SQLite (WAL)
                                        └─► /ws broadcast
                                      GET  /api/*          ◄─── Vue dashboard
                                      GET  /               ◄─── built SPA
                                      WS   /ws             ◄─── live stream
```

Key modules:

- `server/db.ts` — SQLite (WAL), schema migrations, prepared statements.
- `server/ingest.ts` — payload validation + correlation field extraction.
- `server/ws.ts` — broadcast hub + 5 s stats ticker.
- `server/derive/*` — pure functions for session state, tool target display, sparkline bins, tool mix, stats, SessionRow assembly.
- `web/src/stores/*` — Pinia stores (sessions, sessionDetail, stats, preferences w/ localStorage).
- `web/src/lib/correlate.ts` — pairs `PreToolUse` ↔ `Post*` by `tool_use_id`, builds lanes + spawn/return markers.

See [`docs/periscope-spec.md`](./docs/periscope-spec.md) for the full design brief, [`docs/designs/`](./docs/designs/) for the visual direction, and [`docs/plans/`](./docs/plans/) for the implementation plan.

## Non-blocking contract

Per the Claude Code hooks contract, HTTP hooks that return non-2xx, fail to connect, or time out produce non-blocking errors — the agent continues. Periscope always returns `200 {"ok":true}` as fast as possible; SQLite persistence and WebSocket broadcast happen after the response is on the wire.

## Tests

```bash
bun test
```

v1 covers the pure derivation modules (state, tool target, sparkline bins, correlate), the ingest extractor, and a route-level smoke test. No frontend test framework in v1.

## License

MIT (TBC — add LICENSE before publishing the image).
