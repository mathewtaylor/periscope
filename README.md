# Periscope

[![docker](https://github.com/mathewtaylor/periscope/actions/workflows/docker.yml/badge.svg)](https://github.com/mathewtaylor/periscope/actions/workflows/docker.yml)

**A self-hosted, read-only observability dashboard for Claude Code sessions.**

Claude Code happily runs many sessions in parallel — a long-running refactor in one window, a Task-spawned investigator in another, something waiting on an approval prompt a third. Without a single pane of glass you tab between terminals trying to figure out which agents are busy, which are blocked, and which have gone quiet.

Periscope is that pane of glass. It collects [Claude Code hook events](https://code.claude.com/docs/en/hooks) over HTTP from every machine you're running Claude Code on, persists them to SQLite, and renders a live dashboard you can leave open on a second monitor.

> The name reflects the tool's purpose: a read-only instrument for looking into a running system from outside it. Periscope watches, it does not steer. Hooks are non-blocking by contract, so if the collector is down Claude Code continues normally.

---

## What you see

### Sessions home — `/`
One tile per active Claude Code session. Tile top-edge colour and breathing dot encode state at a glance:

- blue `run` — a tool is currently running on the main thread
- lavender `sub` — one or more subagents are active, main is idle
- amber `attn` — session is blocked awaiting a permission prompt
- dimmed grey — idle
- red border — stopped with an error

Each tile shows the project name, the current working directory, the model, the git branch (with a `●` if dirty), the current tool + target (`Bash docker compose up`, `Edit ClientList.tsx`), and a 25-bar sparkline of the last N minutes of activity. Below the grid, a compact "stopped" card lists sessions that ended in the last 24 hours.

An **alerts strip** under the top nav surfaces any session in `wait` state — "periscope needs approval for Bash(docker compose up) · 00:00:42" — with `Review` / `Mute 5m` buttons.

### Session detail — `/sessions/:id`
Click any tile to drill in.

- **Prompt card** — the latest `UserPromptSubmit` body.
- **Timeline** — one lane per thread: `main` first, then each active subagent, then `sub · done` lanes at the bottom. Tool calls render as proportional bars; spawn markers drop from main into sub at `SubagentStart`; `SubagentStop` plants a green return marker and greys out the rest of the lane. Click a bar to open a drawer with the raw `tool_input` JSON, error message, duration, and exit code.
- **Summary card** — state, event count, error count, tokens (cumulative input/output/cached), **context bar** (current window occupancy coloured green → amber → red), model, permission mode, duration. Per-subagent context bars underneath.
- **Recent list** — live event feed with `Auto-scroll ●` toggle.
- **Events tab** — flat filterable table of every event in this session.
- **Prompts tab** — every `UserPromptSubmit` body with timestamps.

### Events — `/events`
Cross-session event log. Filter by event kind, tool, error/denied status, session, or free-text search against the raw payload. Toggle `follow live` to stream; when paused, a `↑ N new` chip appears. Click any row to jump to that session.

### Projects — `/projects`
One row per distinct project (derived from `cwd`). Columns: active-now dot · sessions (24h / total) · events (24h) · errors · tool-mix bar · last activity. Click to filter sessions.

### Config — `/config`
Generates the hook-config JSON with your live collector URL. Two paths: the **enrichment relay** (recommended — enables tokens, context, git, hostname) or **direct HTTP hooks** (zero-install fallback, but those columns stay blank). Includes a danger-zone "clear database" button.

---

## Quick start — local (no Docker)

Requires [Bun](https://bun.sh) 1.2+.

### One command — API + dashboard with hot reload

```bash
./dev.sh
```

The launcher installs dependencies on first run, starts the Bun API/WS server on `:5050` and the Vite dev server on `:5173` in parallel, and tears both down on Ctrl+C. Open **http://localhost:5173**.

On Windows use Git Bash (ships with Git for Windows). PowerShell isn't POSIX — use the manual two-terminal recipe below if you're not using Git Bash.

### Seed demo data

Poking at an empty dashboard is less fun:

```bash
bun run seed   # inserts one of each tile variant: running / sub / wait / idle / stopped-ok / stopped-error
```

### Single-process run (prebuilt SPA on :5050)

If you don't need HMR and want a single port (e.g. to test what Docker will run):

```bash
bun install
cd web && bun install && cd ..
bun run build   # bundles the Vue SPA into web/dist
bun run start   # serves API + WS + SPA on http://localhost:5050
```

Data is written to `./data/events.db` in the repo (gitignored).

### Manual two-terminal run

```bash
# Terminal 1 — backend with --watch
bun run dev

# Terminal 2 — Vite dev server on :5173 with /api and /ws proxied to :5050
bun run dev:web
```

### Handy one-liners

| Command | What it does |
|---|---|
| `./dev.sh` | Both servers + HMR. First-run installs deps. Ctrl+C stops both. |
| `bun run start` | API + WS + prebuilt SPA on `:5050`. |
| `bun run dev` | Same, with `--watch` so server edits auto-restart. |
| `bun run build` | Rebuild the SPA into `web/dist`. |
| `bun run dev:web` | Vite dev server with HMR on `:5173`. Needs backend running. |
| `bun run seed` | Insert a full fixture set. Set `HOST=http://other-host:5050` to target a different collector. |
| `bun test` | Run the test suite (pure modules + route smokes). |
| `curl -X DELETE http://localhost:5050/api/admin/events` | Wipe the local DB. Same as the **Clear database** button on `/config`. |

### Local files

- `./data/events.db` — the SQLite file. Delete it to start fresh, or use the Config page's Clear button.
- `./web/dist/` — built SPA. Safe to delete; the server will run API-only until you rebuild.

---

## Quick start — Docker

Drop this on a Mac mini / home server / NAS that's always on, and point every Claude Code machine at it:

```bash
docker compose up -d
docker compose logs -f periscope
```

Dashboard: http://localhost:5050. Data persists in the `periscope-data` named volume at `/data/events.db` (survives container rebuilds).

---

## Run on another host (Mac mini etc.)

Once CI has published the image to GHCR, you don't need to clone the repo or install Bun on the host — Docker is the only dependency.

### One-liner bring-up

The source repo is private, so `raw.githubusercontent.com` won't serve files without auth. Instead, create the compose file inline on the host:

```bash
# On the Mac mini (or any always-on host):
mkdir -p ~/periscope && cd ~/periscope

cat > docker-compose.yml <<'EOF'
services:
  periscope:
    image: ghcr.io/mathewtaylor/periscope:latest
    container_name: periscope
    restart: unless-stopped
    ports:
      - "${PERISCOPE_HOST_PORT:-5050}:${PORT:-5050}"
    volumes:
      - periscope-data:/data
    environment:
      PORT: "${PORT:-5050}"
      DB_PATH: "/data/events.db"

volumes:
  periscope-data:
EOF

docker compose up -d
docker compose logs -f periscope
```

That pulls `ghcr.io/mathewtaylor/periscope:latest` (multi-arch: `linux/amd64` + `linux/arm64`, so Apple Silicon is native) and starts it on port `5050`. State persists in the `periscope-data` named volume.

### Image visibility

The container image has been flipped to **public** at [`ghcr.io/mathewtaylor/periscope`](https://github.com/users/mathewtaylor/packages/container/periscope) even though the source repo is private. `docker pull` works without auth.

If you re-private the package later, authenticate on the pulling host with a GitHub PAT that has `read:packages`:

```bash
echo "$CR_PAT" | docker login ghcr.io -u mathewtaylor --password-stdin
```

### Updating

CI republishes `:latest` on every push to `main`. Roll forward with:

```bash
docker compose pull && docker compose up -d
```

### Pointing Claude Code clients at it

On each machine running Claude Code, add the Mac mini's Tailscale hostname to your shell profile:

```bash
export PERISCOPE_URL=http://<mac-mini-tailnet-name>:5050
```

Then regenerate the hook config from the `/config` page and run `/hooks` in Claude Code to approve. See [Configuration](#configuration) below for port overrides if `5050` is busy on the host.

---

## Configuration

Copy `.env.example` to `.env` and override any value. All are optional.

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `5050` | Port the Bun server listens on (container-internal in Docker). |
| `PERISCOPE_HOST_PORT` | `5050` | Host-side port Docker Compose maps to the container. Change if 5050 is busy on the host. |
| `DB_PATH` | `./data/events.db` (local) · `/data/events.db` (Docker) | SQLite file. Directory is created if missing. |
| `WEB_DIST` | `./web/dist` (local) · `/app/web/dist` (Docker) | Built SPA. If missing, the server runs API-only. |
| `WEB_PORT` | `5173` | Dev-only. Port the Vite dev server binds to. |
| `API_URL` | `http://localhost:$PORT` | Dev-only. Backend URL Vite proxies `/api` and `/ws` to. |
| `PERISCOPE_URL` | `http://localhost:5050` | Client-side, set on every machine running Claude Code. The relay POSTs here. |

### Non-default ports, end-to-end

Example: run the collector on host port `8080`:

```bash
# Host
PERISCOPE_HOST_PORT=8080 docker compose up -d

# On each client machine
export PERISCOPE_URL=http://<collector-host>:8080
```

The container still listens internally on `$PORT` (default `5050`). The `PERISCOPE_HOST_PORT` knob only changes the host→container mapping.

---

## Configure Claude Code hooks

Two paths — pick based on whether you want tokens / git context / hostname on the dashboard:

### Recommended — install the enrichment relay

The relay is a small Bun script that runs on each Claude Code machine. It enriches every hook payload with local-only context — hostname, git branch/commit/dirty, cumulative token counts, and a current-turn context-window snapshot — then forwards to the collector. Without it those columns stay blank.

```bash
# On every machine running Claude Code:
git clone https://github.com/mathewtaylor/periscope && cd periscope
./install-relay.sh                        # → ~/.local/bin/periscope-relay.ts
#   (pass --path <dir> to override, --print to dry-run)

export PERISCOPE_URL=http://<host>:5050   # add to your shell profile
```

Then open the dashboard's `Config` tab → copy the `"type": "command"` JSON block (with your live host + relay path baked in) → paste into `~/.claude/settings.json` → run `/hooks` inside Claude Code to approve.

### Zero-install fallback — direct HTTP hooks

Claude Code POSTs straight to the collector. Works out of the box but leaves `tokens`, `context`, `git`, and `machine` columns empty.

Open the dashboard's `Config` tab → expand **alternative — direct HTTP hooks (no enrichment)** → copy the JSON → paste into `~/.claude/settings.json` → run `/hooks`.

### Exposing beyond localhost (Tailscale)

Periscope has no auth in v1. If you want other machines to reach it, put the host on your tailnet and point `PERISCOPE_URL` at the tailnet hostname. Don't port-forward to the public internet without a reverse proxy + shared-secret header (not wired in v1).

---

## How context-window math works

Your observation was correct: the old "sum every `usage` block in the transcript" approach would have been wrong after `/clear` or `/compact`. Periscope avoids this by tracking **two** numbers:

- **`tokens`** — cumulative across the whole transcript. Useful for "how much did this session cost?"
- **`context`** — derived from the **latest assistant message's** `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. Because Claude only includes what's actually in the active window in each request, that number *is* the current window occupancy at that turn. After `/clear` the next response's input drops to the new first prompt; after `/compact` it drops to the summary + new content. No clear-marker parsing required.

Model → context limit table lives in [`server/derive/contextLimits.ts`](./server/derive/contextLimits.ts). Opus 4.6 / 4.7 are 1 M; Sonnet and Haiku are 200 k. The `[1m]` suffix is stripped before lookup.

---

## Architecture

```
Claude Code (any host)                Periscope (single Bun process)
──────────────────────                ─────────────────────────────────────
 settings.json hooks ──command─►  periscope-relay.ts
                                   (enrich with host / git / tokens)
                                          │ HTTP POST
                                          ▼
                                  POST /hook/:event
                                    ├─► SQLite (WAL)
                                    └─► /ws broadcast
                                  GET  /api/*        ◄──── Vue dashboard
                                  GET  /             ◄──── built SPA
                                  WS   /ws           ◄──── live stream
```

- `server/db.ts` — SQLite (WAL), schema migrations, prepared statements.
- `server/ingest.ts` — payload validation + correlation field extraction.
- `server/ws.ts` — broadcast hub + 5 s stats ticker.
- `server/derive/*` — pure functions for session state, tool target display, sparkline bins, tool mix, stats, SessionRow assembly, context limits.
- `server/routes/*` — hooks / sessions / projects / stats / admin / health endpoints.
- `scripts/periscope-relay.ts` — client-side enrichment script.
- `web/src/stores/*` — Pinia stores (sessions, sessionDetail, events, stats, preferences w/ localStorage).
- `web/src/lib/correlate.ts` — pairs `PreToolUse` ↔ `Post*` by `tool_use_id`, builds lanes + spawn/return markers.

See [`docs/periscope-spec.md`](./docs/periscope-spec.md) for the full design brief, [`docs/designs/`](./docs/designs/) for the visual direction (Grid), and [`docs/plans/`](./docs/plans/) for the original implementation plan.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/hook/:event` | Ingest a hook event. Returns `200 {"ok":true}` immediately; persist + broadcast are async. |
| `GET` | `/health` | Liveness + DB ping. |
| `GET` | `/api/sessions?window=15m` | Active + stopped session rows with sparkline + active tool + active subagents. |
| `GET` | `/api/sessions/:id?window=15m` | Session detail: row + latest prompt + events (capped 5 000). |
| `GET` | `/api/sessions/:id/agents` | Per-subagent metadata for the session. |
| `GET` | `/api/sessions/:id/sparkline?window=15m&bins=25` | Binned activity counts + colours. |
| `GET` | `/api/sessions/:id/summary` | Tool mix + model + error count + cumulative tokens + current-window context + per-subagent contexts. |
| `GET` | `/api/projects` | Per-project rollup (sessions, events, errors, tool mix, last activity, active-now). |
| `GET` | `/api/notifications/pending` | Current `wait` sessions driving the alerts strip. |
| `GET` | `/api/stats` | `{active, ev_per_sec, uptime_ms}` — powers the header counters. |
| `GET` | `/api/events?since=&session_id=&event=&tool=&status=&q=&before=&limit=` | Filterable cross-session event feed. |
| `DELETE` | `/api/admin/events` | Wipe every event in the local SQLite DB. Broadcasts a WS `reset`. |
| WS | `/ws[?since=<iso>]` | Live event stream. Messages: `hello`, `event`, `stats` (every 5 s), `reset`. |

---

## What's deferred

- **Non-Bash exit codes** — timeline tooltips show exit code for Bash only. Other tools signal success via `PostToolUse` vs `PostToolUseFailure`.
- **Transcript viewer** — `transcript_path` is stored; the relay reads it locally for tokens, but Periscope itself doesn't render it.
- **Auth** — none. Bind to localhost / Tailscale.
- **Retention** — no automatic pruning. SQLite handles millions of rows fine, but add a `DELETE FROM events WHERE ts < datetime('now','-30 days')` cron if disk pressure becomes an issue.
- **Light mode** — explicitly out of scope; the dashboard is dark-only by design.

---

## Tests

```bash
bun test
```

Covers the pure derivation modules (state, tool target, sparkline bins, correlate, context limits), the ingest extractor, the relay transcript digest, and route-level smoke tests. No frontend test framework — the build itself is the frontend's type-check (`vue-tsc --noEmit`).

---

## License

MIT (TBC — add LICENSE before publishing the image).
