# Periscope

A self-hosted observability dashboard for Claude Code sessions. Captures lifecycle events from the main agent thread and all spawned subagents in real time, persists them to SQLite, and renders a live dashboard so the developer can see what every concurrent Claude Code session is doing at a glance.

The name reflects the tool's purpose: a read-only instrument for looking into a running system from outside it. Periscope watches, it does not steer.

---

## 1. Problem & motivation

When Claude Code runs with multiple parallel subagents (spawned via the `Task` tool or team-based workflows), there is no single pane of glass to see:

- Which sessions are currently active across different projects / machines
- What tool each session is currently executing and how long it has been running
- The subagent tree inside a session (which subagents were spawned, for what purpose, whether they've completed)
- Which sessions are blocked waiting for user approval

Claude Code exposes all of this through its **hooks** system. This project wires those hooks into a lightweight collector and a live dashboard so the developer can monitor every session from one place without leaving their primary workflow.

---

## 2. Goals & non-goals

### Goals
- Capture every relevant lifecycle event from Claude Code sessions with zero risk of blocking or slowing down the agent
- Correlate events into sessions and subagent trees for clean visualization
- Support multiple concurrent sessions across multiple machines (via Tailscale or LAN)
- Package as a single Docker container for easy deployment on a home dev server
- Persist events durably to SQLite so historical sessions can be reviewed

### Non-goals
- **Not** a replacement for Claude Code's built-in transcript/logging — this complements it
- **Not** a control plane — the dashboard is read-only; it does not modify, block, or steer agent behavior
- **Not** multi-user or multi-tenant — designed for a single developer's personal infra
- **Not** cloud-hosted — self-hosted only, runs next to the user's other Docker services

---

## 3. Technology stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | **Bun** (latest stable) | Built-in TypeScript, SQLite, and WebSocket; small Docker image; fast cold start |
| HTTP framework | **Hono** | Minimal, fast, well-typed router on top of `Bun.serve` |
| Storage | **SQLite** via `bun:sqlite` | Zero-config, file-based, WAL mode for concurrent writes; no separate DB container |
| Live push | **Bun.serve native WebSocket** | No extra dependency; Hono handles HTTP, WebSocket attached alongside |
| Frontend | **Vue 3 + Vite + TypeScript** | Lightweight; component model fits timeline/lane UI; static build served by Bun |
| Styling | **Tailwind CSS** (standalone CLI build for the Vue app) | Fast iteration; keeps the image small |
| Container | **Docker** (multi-platform: linux/arm64, linux/amd64) | Deploys next to existing Docker services on the host |

### Explicit non-choices
- No ORM — raw SQL via prepared statements is sufficient for this schema
- No authentication in v1 — bind to localhost / Tailscale-only by default
- No message queue — direct write to SQLite is fast enough for single-developer load

---

## 4. System architecture

```
┌──────────────────────────┐        ┌──────────────────────────────┐
│  Claude Code (any host)  │        │   Claude Observatory         │
│                          │        │   (Docker container)         │
│  ┌────────────────────┐  │        │                              │
│  │ settings.json      │  │        │  ┌──────────────────────┐    │
│  │  hooks → http POST │──┼───────►│  │ Hono router          │    │
│  └────────────────────┘  │ HTTP   │  │  /hook/:event        │    │
│                          │        │  │  /api/sessions       │    │
└──────────────────────────┘        │  │  /api/events         │    │
                                    │  │  /ws (WebSocket)     │    │
                                    │  └─────────┬────────────┘    │
                                    │            │                 │
                                    │            ▼                 │
                                    │  ┌──────────────────────┐    │
                                    │  │ SQLite (WAL mode)    │    │
                                    │  │  /data/events.db     │    │
                                    │  └─────────┬────────────┘    │
                                    │            │                 │
                                    │            ▼                 │
                                    │  ┌──────────────────────┐    │
                                    │  │ Vue dashboard (SPA)  │    │
                                    │  │ served as static     │    │
                                    │  │ assets from Bun      │    │
                                    │  └──────────────────────┘    │
                                    └──────────────────────────────┘
```

### Request lifecycle
1. A Claude Code hook fires (e.g. `PreToolUse`)
2. The hook POSTs the event JSON to `http://<host>:5050/hook/PreToolUse`
3. The Hono handler returns `200 OK` **immediately**; persistence happens async
4. The event is written to SQLite and broadcast over WebSocket to any connected dashboards
5. Dashboard clients update their UI in real time

### Non-blocking contract (critical)
Per the Claude Code docs, HTTP hooks that return non-2xx, fail to connect, or time out produce **non-blocking errors** — the agent continues. The collector must:
- Return `200 OK` as fast as possible (defer SQLite write until after response if needed)
- Never return a `decision: "block"` body from a monitoring endpoint
- Tolerate being down without affecting agent behavior

---

## 5. Hook event model

### Events to capture

| Event | Purpose in dashboard |
|---|---|
| `SessionStart` | Register a new session; record cwd, source (startup/resume/clear) |
| `SessionEnd` | Mark session terminated; record reason |
| `UserPromptSubmit` | Record user prompts on the session timeline |
| `PreToolUse` | Start a "tool in flight" marker on the appropriate lane |
| `PostToolUse` | Close the tool marker; record outcome |
| `SubagentStart` | Create a new lane under the session for this subagent |
| `SubagentStop` | Close the subagent lane; mark complete |
| `Notification` | Surface in the "needs attention" strip |
| `Stop` | Main agent finished responding on this turn |
| `PreCompact` | Annotate timeline with context compaction event |

### Correlation fields

Every event includes:
- `session_id` — groups all events belonging to one Claude Code session (main + all subagents)
- `cwd` — working directory; used to infer project name
- `transcript_path` — path to JSONL transcript (not fetched in v1, stored for reference)

Subagent-scoped events (`PreToolUse`/`PostToolUse` fired from inside a subagent, plus `SubagentStart`/`SubagentStop`) additionally include:
- `agent_id` — identifies the specific subagent within the session
- `agent_type` — the subagent's defined type (e.g. `builder`, `validator`)
- `agent_transcript_path` — path to the subagent's own transcript

### The correlation rule
A session has one main thread and zero or more subagent threads. An event belongs to the main thread if `agent_id` is absent, otherwise it belongs to the subagent identified by `agent_id`. The dashboard must group events accordingly.

> **Verification step for the implementer:** Before implementation, open the official [Hooks reference](https://docs.claude.com/en/docs/claude-code/hooks) and confirm the full payload schema for each event listed above. The exact field set may vary by event type.

---

## 6. settings.json configuration

The user will install this into `~/.claude/settings.json` on each machine running Claude Code, pointing `<host>` at wherever the container is reachable (`localhost`, Tailscale hostname, etc.):

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "http", "url": "http://<host>:5050/hook/SessionStart" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "http", "url": "http://<host>:5050/hook/SessionEnd" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "http", "url": "http://<host>:5050/hook/UserPromptSubmit" }] }],
    "PreToolUse":       [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://<host>:5050/hook/PreToolUse" }] }],
    "PostToolUse":      [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://<host>:5050/hook/PostToolUse" }] }],
    "SubagentStart":    [{ "hooks": [{ "type": "http", "url": "http://<host>:5050/hook/SubagentStart" }] }],
    "SubagentStop":     [{ "hooks": [{ "type": "http", "url": "http://<host>:5050/hook/SubagentStop" }] }],
    "Notification":     [{ "hooks": [{ "type": "http", "url": "http://<host>:5050/hook/Notification" }] }],
    "Stop":             [{ "hooks": [{ "type": "http", "url": "http://<host>:5050/hook/Stop" }] }],
    "PreCompact":       [{ "hooks": [{ "type": "http", "url": "http://<host>:5050/hook/PreCompact" }] }]
  }
}
```

After editing `settings.json`, the user must run `/hooks` inside Claude Code once to approve — Claude Code requires review of hook config changes before they take effect.

The project should ship a sample `settings.claude.example.json` in the repo root.

---

## 7. HTTP API

### Collector endpoints (called by Claude Code hooks)
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/hook/:event` | Ingest a single hook event. Returns `200 {"ok": true}` as fast as possible. Body is the raw hook payload from Claude Code. |
| `GET` | `/health` | Liveness probe for Docker healthcheck. Returns `200` if process is up and DB is writable. |

### Dashboard API (called by the Vue frontend)
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/sessions` | List all sessions (active + historical), with counts and last-event timestamps |
| `GET` | `/api/sessions/:id` | Session detail: main-thread events + subagent events, ordered |
| `GET` | `/api/sessions/:id/agents` | List of subagents within a session |
| `GET` | `/api/events?since=<ts>&session_id=<id>` | Paginated event feed with filters |
| `GET` | `/api/notifications/pending` | Currently pending `Notification` events awaiting user action |

### WebSocket
| Path | Purpose |
|---|---|
| `/ws` | Live event stream. Server pushes one message per ingested event: `{ event, session_id, agent_id, ts, ... }` |

### Static assets
| Path | Purpose |
|---|---|
| `/` and `/assets/*` | Serve the built Vue SPA (the dashboard) |

---

## 8. Data model

Single append-only events table. Indexed for the two query patterns that matter: "all events for a session" and "recent events across sessions".

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS events (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts                     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  event                  TEXT    NOT NULL,                    -- e.g. 'PreToolUse'
  session_id             TEXT    NOT NULL,
  agent_id               TEXT,                                -- null = main thread
  agent_type             TEXT,
  tool_name              TEXT,                                -- for *ToolUse events
  tool_use_id            TEXT,                                -- correlates PreToolUse ↔ PostToolUse
  cwd                    TEXT,
  payload                TEXT    NOT NULL                     -- raw JSON payload from hook
);

CREATE INDEX idx_events_session_ts      ON events(session_id, ts);
CREATE INDEX idx_events_recent          ON events(ts DESC);
CREATE INDEX idx_events_tool_use_id     ON events(tool_use_id) WHERE tool_use_id IS NOT NULL;
```

### Derived views (computed, not persisted in v1)
- **Active sessions**: sessions with a `SessionStart` and no `SessionEnd` within the last N hours
- **Tool in flight**: a `PreToolUse` with no matching `PostToolUse` (correlated by `tool_use_id`)
- **Pending notifications**: `Notification` events not yet acknowledged (v1: all recent notifications)

If these views become expensive, promote them to materialized tables updated on ingest. Not needed for v1.

---

## 9. Dashboard (Vue SPA)

### v1 views (ordered by priority)

**1. Live sessions list (home)**
- One row per active session
- Columns: project (derived from cwd), session id (short), started, current state, active tool, # subagents
- State badges: `idle` / `tool-running` / `waiting-for-user` / `stopped`
- Clicking a row drills into session detail

**2. Session detail**
- Horizontal timeline, vertical lanes: one for the main thread, one per subagent
- Each event rendered as a labeled pill: tool name, duration (for completed tools), status
- Live updating via WebSocket — new events animate onto the correct lane
- Collapsible subagent lanes
- Side panel showing the current event's full payload on hover/click

**3. Alerts strip (global)**
- Persistent strip at the top of every view
- Shows any `Notification` events across all sessions that haven't been dismissed
- Clicking jumps to the source session

### Not in v1 (backlog)
- Historical search / filter by tool, date range, text
- Transcript viewer (open the JSONL file pointed to by `transcript_path`)
- Per-project aggregated stats
- Export to JSON / CSV

### Design constraints
- Dense, single-screen layout — the dashboard is meant to live on a secondary monitor
- No auth in v1 — bind to localhost / Tailscale by default
- Dark mode first; follow system preference for light mode

---

## 10. Docker packaging

### Multi-stage Dockerfile targets
- `build` stage: install deps, build Vue SPA with Vite, compile TypeScript if needed
- `runtime` stage: copy built assets + server source, run with `bun run server/index.ts`
- Base image: `oven/bun:1-alpine` (small, ARM64 and AMD64 available)

### Image requirements
- Expose port `5050`
- `VOLUME ["/data"]` for SQLite persistence
- `HEALTHCHECK` curling `/health`
- `ENV PORT=5050` and `ENV DB_PATH=/data/events.db` as defaults
- Target platforms: `linux/arm64` (primary — Apple Silicon host) and `linux/amd64`

### docker-compose.yml (shipped in repo)
```yaml
services:
  periscope:
    image: periscope:latest  # or build: .
    container_name: periscope
    restart: unless-stopped
    ports:
      - "5050:5050"
    volumes:
      - periscope-data:/data
volumes:
  periscope-data:
```

### Publishing
- Build with `docker buildx build --platform linux/arm64,linux/amd64`
- Push to GHCR under the user's namespace once stable

---

## 11. Project structure

```
periscope/
├── server/
│   ├── index.ts              # Bun.serve + Hono bootstrap + WebSocket
│   ├── db.ts                 # SQLite setup, schema migration, prepared statements
│   ├── routes/
│   │   ├── hooks.ts          # POST /hook/:event
│   │   ├── sessions.ts       # GET /api/sessions, /api/sessions/:id, etc.
│   │   └── health.ts         # GET /health
│   ├── ws.ts                 # WebSocket broadcast hub
│   └── types.ts              # Hook payload type definitions
├── web/                      # Vue 3 + Vite SPA
│   ├── src/
│   │   ├── App.vue
│   │   ├── views/
│   │   │   ├── SessionsList.vue
│   │   │   └── SessionDetail.vue
│   │   ├── components/
│   │   │   ├── TimelineLane.vue
│   │   │   ├── EventPill.vue
│   │   │   └── AlertsStrip.vue
│   │   ├── composables/
│   │   │   └── useEventStream.ts   # WebSocket + reactive state
│   │   └── api.ts
│   ├── index.html
│   └── vite.config.ts
├── settings.claude.example.json
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

---

## 12. Implementation phases

### Phase 1 — Collector + raw feed (day 1)
- Bun + Hono server running, listening on 5050
- SQLite schema + WAL mode + indexes
- `POST /hook/:event` persisting payloads
- `GET /api/events` returning recent events as JSON
- `GET /health`
- Dockerfile + docker-compose.yml
- Smoke test: configure one hook in `~/.claude/settings.json`, run Claude Code, verify events appear in `GET /api/events`

**Exit criteria:** every configured hook event from a real Claude Code session lands in SQLite and is readable via the API.

### Phase 2 — Live push + basic dashboard
- WebSocket endpoint broadcasting new events
- Vue SPA scaffold, served as static assets from Bun
- Sessions list view (polling + WebSocket updates)
- Session detail view with single main-thread lane (subagent lanes come next)

**Exit criteria:** a developer can leave the dashboard open on a second monitor and see events appear in real time as Claude Code works.

### Phase 3 — Subagent visualization
- Subagent lane rendering in session detail
- Correlation of `PreToolUse`/`PostToolUse` by `tool_use_id` for duration display
- `SubagentStart`/`SubagentStop` handling to open/close lanes

**Exit criteria:** spawning a parallel subagent via the `Task` tool produces a visible new lane in the dashboard with its own event stream.

### Phase 4 — Polish
- Alerts strip for pending notifications
- State badges on the sessions list
- Dark mode + basic styling pass
- README + install instructions

---

## 13. Open questions (decisions deferred)

- **Retention policy.** Do we prune events older than N days? v1 answer: no pruning; revisit if the DB grows inconveniently.
- **Multi-host identification.** `session_id` is unique but doesn't identify which machine the session came from. Options: derive from `cwd` hostname prefix, or have the user set `PERISCOPE_HOST` env var and forward it via `httpHookAllowedEnvVars`. Decide in Phase 2.
- **Transcript ingestion.** `transcript_path` points to a JSONL file on the host where Claude Code runs. If the collector is on a different host, it can't read it directly. v1 answer: store the path, don't fetch; cross-host transcript viewing is a Phase 5+ concern.
- **Auth.** None in v1. Before exposing beyond Tailscale, add a shared-secret header using `httpHookAllowedEnvVars` to pass the token to HTTP hooks.

---

## 14. Reference documentation

Always verify against the official docs before implementation — these are the authoritative sources:

- **Hooks reference** (payload schemas, event list, handler types): https://docs.claude.com/en/docs/claude-code/hooks
- **Automate workflows with hooks** (guide with examples): https://docs.claude.com/en/docs/claude-code/hooks-guide
- **Claude Code settings** (settings.json structure, `httpHookAllowedEnvVars`): https://docs.claude.com/en/docs/claude-code/settings
- **Agent SDK TypeScript hook types** (canonical HookInput type definitions): https://docs.claude.com/en/api/agent-sdk/typescript
- **Hono docs**: https://hono.dev
- **Bun docs** (`bun:sqlite`, `Bun.serve` WebSocket): https://bun.com/docs

---

## 15. Success criteria

The project is successful when the developer can:

1. Run `docker compose up -d` once and forget about the container
2. Add one block to `~/.claude/settings.json` on any machine and have its sessions appear in the dashboard
3. See at a glance, on a second monitor, exactly what each concurrent Claude Code instance is doing — main thread and subagents
4. Stop wondering "what is my background agent doing right now?"
