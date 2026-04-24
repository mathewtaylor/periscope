---
title: Periscope — Implementation Plan
date: 2026-04-24
branch: main
status: proposed
author: Mathew
tags: [observability, claude-code, bun, hono, vue, vue-pinia, tailwind, sqlite, docker]
estimated_tasks: 44
---

# Periscope — Implementation Plan

## 1. Context & intent

Periscope is a self-hosted, read-only observability dashboard for Claude Code sessions. It ingests hook events over HTTP from any Claude Code instance on the network, persists them to SQLite, and renders a live Vue dashboard. This plan is aligned against two inputs:

- `docs/periscope-spec.md` — the engineering spec (tech stack, data model, phases).
- `docs/designs/README.md` + `docs/designs/03 Grid.html` — the high-fidelity **Grid** visual direction (colors, typography, tile anatomy, timeline, alerts strip).

### Verification against live docs (2026-04-24)

All spec-listed events exist in the live hooks reference; every payload carries `session_id`, `transcript_path`, `cwd`, `hook_event_name`. `agent_id` / `agent_type` appear only on subagent-scoped events. `SessionStart` includes `model`. HTTP hooks are non-blocking by default: any 2xx (including empty body) is fine; non-2xx / timeout / connection failure produces a *non-blocking* warning in the transcript — the contract the collector wants.

**Events from spec still valid:** `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `Notification`, `Stop`, `PreCompact`.

**Events the live docs add that the spec omits:** `UserPromptExpansion`, `PostToolUseFailure`, `StopFailure`, `PostToolBatch`, `PostCompact`, `PermissionRequest`, `PermissionDenied`, plus `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `InstructionsLoaded`, `ConfigChange`.

**Decision:** the ingest endpoint accepts any event name the URL param supplies and stores the full JSON payload. Correlation columns (`session_id`, `agent_id`, `tool_name`, `tool_use_id`) are extracted defensively when present. Adding events later requires zero migrations. `PostToolUseFailure` is treated as a closing event for its `tool_use_id` with `error`; `StopFailure` drives `error` state.

> **Note — fields hook events do NOT provide:**
> - **Token counts.** No hook payload carries input/output token counts. The Summary card's `tokens` field will render as `"—"` in v1 with an explanatory tooltip. Revisit if Claude Code adds a TokensUsed event or similar.
> - **Tool exit codes for non-Bash tools.** Only Bash gives a numeric exit code; other tools signal success/failure via presence of `PostToolUse` (success) vs `PostToolUseFailure` (error). Timeline tooltips show exit code only for Bash.
> - **Cross-host machine identity.** `session_id` is unique per session but doesn't identify the machine. The `cwd` basename is used for "project"; machine disambiguation is deferred (spec §13 open question).

## 2. Architecture summary

One Bun process serves three roles:

1. **Ingest** — `POST /hook/:event` writes the full JSON payload to SQLite, returns `200 {"ok":true}` ASAP, then fans out via WebSocket.
2. **API** — `GET /api/sessions`, `GET /api/sessions/:id`, `GET /api/sessions/:id/agents`, `GET /api/sessions/:id/sparkline`, `GET /api/events`, `GET /api/notifications/pending`, `GET /api/stats`, `GET /health`.
3. **Static + WS** — `/` serves the built Vue SPA; `/ws` streams live events and periodic stats pushes.

Persistence: single `events` append-only table (spec §8), WAL + `synchronous=NORMAL`. Derived views (active sessions, tool-in-flight, sparkline bins, tool mix, pending notifications, global stats) are SQL queries at read time. No materialized tables in v1.

Non-blocking contract: the ingest handler returns `200` first, then schedules the DB write + WS fanout via `queueMicrotask`. Even a synchronous SQLite write under WAL is <1 ms for this payload size, but we still want the response off the wire first.

## 3. Repo layout

```
periscope/
├── server/
│   ├── index.ts                # Bun.serve + Hono + WebSocket wiring
│   ├── db.ts                   # SQLite open, PRAGMAs, migrate(), prepared stmts
│   ├── ingest.ts               # extract correlation fields from raw payload
│   ├── ws.ts                   # broadcast hub (events + stats ticks)
│   ├── derive/
│   │   ├── sessionState.ts     # compute session state enum
│   │   ├── toolTarget.ts       # extract display target from tool_input
│   │   ├── sparkline.ts        # bin events into 25 buckets × dominant color
│   │   ├── toolMix.ts          # tool_name counts per session
│   │   └── stats.ts            # active count, ev/s (60s rolling), uptime
│   ├── routes/
│   │   ├── hooks.ts            # POST /hook/:event
│   │   ├── sessions.ts         # GET /api/sessions*, /api/events, /api/notifications/pending
│   │   ├── stats.ts            # GET /api/stats
│   │   └── health.ts           # GET /health
│   └── types.ts                # HookPayload + narrowed per-event types
├── web/                        # Vue 3 + Vite + TS + Tailwind + Pinia
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.ts
│   │   ├── router.ts
│   │   ├── stores/
│   │   │   ├── sessions.ts     # Pinia: Map<sessionId, Session>, ingestEvent reducer
│   │   │   ├── sessionDetail.ts
│   │   │   ├── stats.ts        # header live counters
│   │   │   └── preferences.ts  # localStorage: window, view-mode, mutes
│   │   ├── views/
│   │   │   ├── SessionsHome.vue
│   │   │   └── SessionDetail.vue
│   │   ├── components/
│   │   │   ├── AppHeader.vue
│   │   │   ├── AlertsStrip.vue
│   │   │   ├── SessionTile.vue
│   │   │   ├── SessionTile/Sparkline.vue
│   │   │   ├── SessionTile/SubagentChips.vue
│   │   │   ├── GhostTile.vue
│   │   │   ├── StoppedSessions.vue
│   │   │   ├── SessionDetail/PromptCard.vue
│   │   │   ├── SessionDetail/Timeline.vue
│   │   │   ├── SessionDetail/Lane.vue
│   │   │   ├── SessionDetail/SummaryCard.vue
│   │   │   ├── SessionDetail/RecentList.vue
│   │   │   └── ui/
│   │   │       ├── MicroLabel.vue
│   │   │       ├── BreathingDot.vue
│   │   │       ├── SegmentedControl.vue
│   │   │       └── Kbd.vue
│   │   ├── composables/
│   │   │   └── useEventStream.ts  # singleton WS, backoff reconnect
│   │   └── lib/
│   │       ├── api.ts
│   │       ├── time.ts
│   │       ├── correlate.ts     # tool_use_id Pre↔Post pairing, duration calc
│   │       └── tokens.ts        # IBM Plex setup + font-feature-settings
│   ├── index.html
│   ├── vite.config.ts
│   └── tailwind.config.ts
├── scripts/
│   └── seed.ts                 # synthesize a fake session for dashboard dev
├── settings.claude.example.json
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json (base)
├── tsconfig.server.json
├── web/tsconfig.json
└── README.md
```

## 4. Data model

Spec §8 verbatim, with two small additions:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  event          TEXT    NOT NULL,
  session_id     TEXT    NOT NULL,
  agent_id       TEXT,
  agent_type     TEXT,
  tool_name      TEXT,
  tool_use_id    TEXT,
  cwd            TEXT,
  payload        TEXT    NOT NULL
);
CREATE INDEX idx_events_session_ts       ON events(session_id, ts);
CREATE INDEX idx_events_recent           ON events(ts DESC);
CREATE INDEX idx_events_tool_use_id      ON events(tool_use_id) WHERE tool_use_id IS NOT NULL;
CREATE INDEX idx_events_session_agent_ts ON events(session_id, agent_id, ts);  -- lane query
```

A tiny `schema_version` table drives `db.ts`'s `migrate()` so later additions stay safe.

`model`, `tool_input`, `tool_response`, `prompt`, `notification_type`, `stop_reason` etc. are all **inside `payload`** (JSON); we extract them at read time via SQLite's `json_extract()` rather than promoting columns. This keeps the schema unchanged as Claude Code evolves its hook shape.

## 5. Ingest extraction rules

`ingest.ts` normalises each payload into insert columns:

| Column | Source |
|---|---|
| `event` | URL path param (e.g. `/hook/PreToolUse` → `PreToolUse`). Also sanity-checked against `payload.hook_event_name`; mismatch logged, URL wins. |
| `session_id` | `payload.session_id` — reject `400` if missing (hard requirement). |
| `agent_id` | `payload.agent_id` or null |
| `agent_type` | `payload.agent_type` or null |
| `tool_name` | `payload.tool_name` or null |
| `tool_use_id` | `payload.tool_use_id` or null |
| `cwd` | `payload.cwd` or null |
| `payload` | raw request body (as text, to preserve formatting) |

URL `:event` is restricted to `[A-Za-z][A-Za-z0-9_]{0,63}` so we don't let the URL turn into a storage key injection vector.

## 6. Derived data (read-time)

### 6.1 Session state enum (five values — matches design)

In priority order, for each session:

| State | Condition |
|---|---|
| `stopped` | A `SessionEnd` event exists (or `Stop` without follow-on activity in N minutes). |
| `error` | `PostToolUseFailure`, `StopFailure`, or `SessionEnd` with error reason seen. Also the final state for stopped-error rows. |
| `wait` | A `Notification` event exists with `notification_type ∈ {permission_prompt, elicitation_dialog}` with no clearing `PreToolUse` / `Stop` after it. |
| `sub` | One or more active subagents (SubagentStart without SubagentStop) AND no `PreToolUse` on the main thread currently in-flight. |
| `running` | An unmatched `PreToolUse` (no `PostToolUse`/`PostToolUseFailure` by `tool_use_id`) on main thread. |
| `idle` | None of the above. |

Implemented in `derive/sessionState.ts`; also used client-side in `stores/sessions.ts` reducer so live state flips without a round-trip.

### 6.2 Tool target extraction (for tile display)

`derive/toolTarget.ts` produces a short display string from `tool_input`:

| `tool_name` | Display target |
|---|---|
| `Bash` | `tool_input.command` (truncated) |
| `Edit` / `Write` / `Read` | `basename(tool_input.file_path)` |
| `Grep` | `"{pattern}" {path}` |
| `Glob` | `tool_input.pattern` |
| `WebFetch` | `new URL(tool_input.url).hostname` |
| `WebSearch` | `tool_input.query` |
| `Agent` / `Task` | `→ {tool_input.subagent_type}` |
| default | empty string |

### 6.3 Sparkline bins

`GET /api/sessions/:id/sparkline?window=15m&bins=25`:
- Window ∈ `5m | 15m | 1h | 24h` (default 15m).
- Divide window into `bins` buckets.
- Per bucket: `{count, color}` where color is picked by precedence `err > attn > sub > run > fg-4`:
  - `err` if any `PostToolUseFailure` in bucket.
  - `attn` if any `Notification` in bucket still pending.
  - `sub` if more than half of bucket's events are subagent-scoped.
  - `run` if there are PreToolUse events on main.
  - else `fg-4`.

### 6.4 Tool mix (summary card)

`SELECT tool_name, COUNT(*) FROM events WHERE session_id=? AND tool_name IS NOT NULL GROUP BY tool_name`. Returned as `[{name, count}]`; client renders stacked bar.

### 6.5 Global stats (`/api/stats`)

- `active`: sessions whose latest event is within 30 min and state ≠ `stopped`.
- `evPerSec`: `COUNT(*) FROM events WHERE ts > now()-60s` / 60.
- `uptime`: `process.uptime()` formatted `Xd Yh`.
- Also pushed on the WS every 5 s as `{type:"stats", …}`.

## 7. HTTP API shapes

### Session row (home tiles + stopped list)
```ts
{
  session_id: string,
  project: string,               // basename(cwd)
  cwd: string,
  state: 'running'|'sub'|'wait'|'idle'|'stopped'|'error',
  started_at: string,            // ISO
  last_event_at: string,         // ISO
  stopped_at?: string,           // set if state == stopped|error
  duration_ms: number,
  event_count: number,
  distinct_tool_count: number,
  active_tool?: { name: string, target: string, started_at: string }, // for running/wait
  active_subagents: Array<{ agent_id: string, agent_type: string, started_at: string }>,
  last_tool?: { name: string, target: string },                        // for idle/stopped
  sparkline: Array<{ count: number, color: 'run'|'sub'|'attn'|'err'|'fg-4' }>,
  error_summary?: string,                                              // for stopped-error rows
  model?: string,                                                       // from SessionStart payload
}
```

### Endpoints

- `GET /api/sessions?window=15m` → `{active: SessionRow[], stopped: SessionRow[]}`. Sparkline uses the supplied window.
- `GET /api/sessions/:id` → `{ session: SessionRow, prompt?: {body, ts}, events: Event[] }` (events ordered by `ts, id`, capped at 5 000 with oldest trimmed).
- `GET /api/sessions/:id/agents` → `[{ agent_id, agent_type, started_at, ended_at, event_count }]`.
- `GET /api/sessions/:id/sparkline?window=15m&bins=25` → `SparkBin[]` (client refetches on window toggle without refetching full session).
- `GET /api/sessions/:id/summary` → `{ tokens: null, model, duration_ms, event_count, error_count, tool_mix: Array<{name,count}> }`. `tokens` is always `null` in v1 (see §1 note).
- `GET /api/events?since=<iso>&session_id=<id>&limit=500` → fallback polling feed.
- `GET /api/notifications/pending` → `[{ session_id, project, tool_name, tool_target, waiting_since }]`.
- `GET /api/stats` → `{ active, ev_per_sec, uptime_ms }`.
- `GET /health` → `200 {"ok":true,"db":"ok"}` after a no-op `SELECT 1`.

## 8. WebSocket protocol

`/ws` upgrades via Hono + `Bun.serve`. On connect, optional `?since=<iso>` replays events from SQLite before switching to live. Server messages:

```ts
{ type: "hello", server_ts: string }
{ type: "event", row: EventRow }           // one per ingested hook
{ type: "stats", active, ev_per_sec, uptime_ms }  // every 5 s
```

Clients never send anything; the socket is one-way in v1.

## 9. Frontend

### 9.1 Design tokens → Tailwind config

`tailwind.config.ts` extends theme with:

```ts
colors: {
  bg: '#0c0d10', 'bg-1': '#111317', 'bg-2': '#171a1f', 'bg-3': '#1e2229',
  line: '#23272f', 'line-2': '#2b3039',
  fg: '#e5e8ee', 'fg-1': '#b4b9c2', 'fg-2': '#7b8290', 'fg-3': '#525a66', 'fg-4': '#363c46',
  run: '#7fb3f0', 'run-dim': '#2a4366',
  sub: '#b59ce6', 'sub-dim': '#3a3258',
  attn: '#e3b155', 'attn-dim': '#58431d',
  err: '#e27a72', ok: '#86c49a',
},
fontFamily: {
  sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
},
```

Global CSS:
- `@fontsource/ibm-plex-sans` (400, 500, 600) and `@fontsource/ibm-plex-mono` (400, 500) imported in `main.ts` — self-hosted, works offline.
- `.mono { font-feature-settings: "zero"; }` so zeros are slashed.
- Scrollbar: `#262a33`, 10 px, rounded.
- Base radii: `tile=10px`, `chip=6px`, `pill=9999px`.

### 9.2 Routing & navigation

`vue-router` with routes:
- `/` → `SessionsHome`
- `/sessions/:id` → `SessionDetail`
- **Nav scaffolding only** for `/events`, `/projects`, `/config` — the `AppHeader` tabs render for visual fidelity but the three non-v1 tabs are wrapped in a placeholder route that renders a "coming in a later version" panel. No backend work for them.
- `⌘K` kbd hint is **visual-only** in v1 (no command palette).

### 9.3 Pinia stores

- **`useSessionsStore`** — `sessions: Map<sessionId, Session>`; `active` / `stopped` / `activeAwaiting` getters. Action `ingestEvent(event)` dispatches to the right session and recomputes its state using the same `sessionState` logic as the server. Initial hydration via `/api/sessions`; incremental via WS `event` messages.
- **`useSessionDetailStore(sessionId)`** — per-session events, lanes (`main`, `subs[agent_id]`), `summary`, `prompt`. Subscribes to WS, filters by `session_id`.
- **`useStatsStore`** — header counters; updated by WS `stats` ticks.
- **`usePreferencesStore`** — localStorage-backed: `window` (`5m|15m|1h|24h`), `viewMode` (`tiles|list`), per-session mutes (`{[sessionId]: expiresAt}`), `followNow` (bool).

### 9.4 Motion

- Hover: `150ms ease` on `border-color`, `background`, `transform`.
- `slideUp`: `opacity 0→1`, `translateY 4px→0`, `400ms ease-out`, play once.
- `breathe`: opacity `0.55 ↔ 1`, `2200ms ease-in-out infinite`, applied to **only one dot** per session/lane.
- Top-edge color change: `300ms` crossfade; DOM element kept stable across state transitions.
- `prefers-reduced-motion: reduce` → swap `breathe` and `slideUp` for instant full-opacity render.

### 9.5 Views

**`SessionsHome`** (`/`)
- Header row: `h1 "Sessions"`, subtitle `N active · M stopped in the last 24 hours`.
- Time-window segmented (`5m|15m|1h|24h`, default `15m`); view-mode toggle (`tiles|list`, default `tiles`). Both persisted.
- **Tile grid** `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`, gap `12px`, min tile height `176px`. Tiles ordered by `last_event_at desc`.
- Ghost tiles: two dashed placeholders after the last active tile (`"slots free — N more fit on this row"`, `"+ launch session via hook"`).
- **Stopped sessions card** below grid — 4-column grid `1fr 120px 1fr 140px` — only sessions stopped in the last 24 h, ordered by `stopped_at desc`.
- List-mode v1 fallback: flat table with the same columns as the stopped card. No separate design, acceptable placeholder.

**`SessionTile`** — reacts to `data-state`:
| State | Top edge | Dot | Badge | Body | Spark bar colors |
|---|---|---|---|---|---|
| `running` | `run` | `run` breathing | `c-run "tool · Ns"` | `in flight` + `{tool} {target}` in run | recent bars `run` |
| `sub` | `sub` | `sub` breathing | `c-sub "N subs · main idle"` | `subagents` + chip row of active subagents | recent bars `sub` |
| `wait` | `attn` + 6% amber top→transparent gradient | `attn` breathing | `c-attn "blocked · Ns"` | `awaiting approval` + `{tool} {target}` | recent bars `attn` |
| `idle` | none, whole tile opacity `0.72` | `fg-3` static | `text-fg-2 "idle · Ns"` | `last action` + `{tool} {target}` in `fg-2` | no signal colors |
| `error` | (shown in stopped card only) | — | `c-err` | error summary line | — |

Header shows mono project name + `cwd` truncated below in `fg-3 11px`. Footer: `started HH:MM · dur`, `N ev`.

**`Sparkline`** — 25 bars, 4 px wide, 2 px gap, 26 px tall. Height = log-scaled count with 4% floor; color per bin from API.

**`SubagentChips`** — one chip per `active_subagents[]` entry: `{agent_type} · {age}`, `sub` color, `sub-dim` border, `rgba(181,156,230,0.06)` bg, rounded-full.

**`AlertsStrip`** (rendered only when any `wait` session is unmuted)
- Fixed row B under nav. Inset left border `2px solid attn`, bg `#15130c`.
- Uppercase micro-label `awaiting you` + breathing dot, project name, `needs approval for`, `{tool}({target})`, blocked duration mono.
- Right: `Review` button (bordered `attn-dim`, text `attn`) → navigate to session; `Mute 5m` (ghost) → write `{sessionId: now+5m}` to `usePreferencesStore.mutes`.
- Multiple pending: show oldest + `+N more` chip → popover lists them.
- `role="status" aria-live="polite"`.

**`AppHeader`**
- Row A: logo (inline bar-chart SVG), wordmark `Periscope · grid`, nav tabs (`Sessions` active), right-aligned mono live counters (`● N active`, `X.X ev/s`, `Dd Hh`, `⌘K` kbd), separated by 1 × 12 px vertical dividers.
- Row B: `AlertsStrip` (conditional).
- Sticky, `backdrop-blur` on `rgba(12,13,16,0.92)` bg.

**`SessionDetail`** (`/sessions/:id`)
- Header block: micro-label `session`, h2 `{project} · {N subagents active}` (if sub), mono subtitle `started HH:MM:SS · duration · event count · model`.
- View-mode tabs `timeline | events | prompts` (v1: timeline only live, others stubs) + `Follow now →` toggle button (default on).
- **`PromptCard`** — full-width, latest `UserPromptSubmit` body. Micro-label `user prompt`, body 14px `fg`, right timestamp mono.
- Two-column body: left = `Timeline`, right 340 px fixed = `SummaryCard` then `RecentList`.
- **`Timeline`** — card with:
  - Header: `timeline · last N min` + color-legend (tool/sub/err/return).
  - Ruler row 24 px with 7 tick labels; last tick `now` in `c-run`.
  - Lanes grid `120px | 1fr`: left label (micro `main`/`sub`/`sub · done` + mono agent name), right a `0f1317`-bg track with absolutely positioned bars.
  - Main lane bars: tool call rectangles colored `fg-4` (completed).
  - Subagent lane bars: `sub` color with opacity 0.7/0.8; `err` color for failed tool calls.
  - **Spawn markers** — 2 px × 8 px `sub` vertical dropping from main lane boundary into subagent lane at spawn x-position.
  - **Return markers** — 3 px × 22 px `ok` vertical at return x-position; lane bars after this position greyed to `fg-4`.
  - Tooltip on bar hover: full tool name, args (Edit/Write: file path; Bash: command; Grep: pattern), duration, start time, exit code (Bash only — see §1 note).
  - Click bar → opens event drawer (drawer itself is future work; v1 shows the raw payload in a side panel).
  - Follow-now: while on, pin right edge to current time; auto-scroll `RecentList` to top.
- **`SummaryCard`** — micro-label `summary`, two-col `<dl>` mono 12.5 px: `state`, `events`, `errors`, `tokens` (renders `"—"` with tooltip "token counts not emitted by hooks in v1"), `model`, `duration`. Divider. Then `tool mix`: micro-label, 8 px stacked bar (colors from run-dim / sub-dim / attn-dim / fg-4 / brightened fg-4 per tool category), legend row below.
- **`RecentList`** — micro-label `recent` + `● live` breathing indicator. Up to 7 visible rows: `MM:SS · lane (colored) · truncated verb+target`. New rows slide in; scroll for older.

### 9.6 Accessibility

- Every state has a textual badge + distinct micro-label body; color is reinforcing, never sole signal.
- Tile hit target = whole tile (>176 px).
- `AlertsStrip` is `role="status" aria-live="polite"`.
- `prefers-reduced-motion: reduce` disables `breathe` and `slideUp`.
- Light mode explicitly out of v1 scope (per design README).

### 9.7 Static serving

In prod, `bun build` output in `web/dist` is served by Hono via `serveStatic`. In dev, Vite dev server proxies `/api` and `/ws` to the Bun process.

## 10. Docker packaging

Multi-stage Dockerfile:

1. `builder` (`oven/bun:1`): `bun install`, `bun run build:web` (vite build), no server bundling — Bun runs TS directly.
2. `runtime` (`oven/bun:1-alpine`): copy `server/`, `web/dist/`, `package.json`, `bun.lockb`; `bun install --production --frozen-lockfile`; `EXPOSE 5050`; `VOLUME /data`; `ENV PORT=5050 DB_PATH=/data/events.db`; `HEALTHCHECK` curling `/health`; `CMD ["bun","run","server/index.ts"]`.

`docker-compose.yml` per spec §10. Multi-arch build via `docker buildx` (documented in README, not wired into CI in v1).

## 11. Phased delivery

### Phase 1 — Collector + raw feed *(exit: real events land in SQLite and are readable)*

1. **P1-1** Init Bun project: `package.json`, `tsconfig.json`, install `hono`. One root + one `web/` workspace.
2. **P1-2** `server/db.ts` — open SQLite at `DB_PATH`, apply PRAGMAs, run `migrate()` with the schema from §4. Prepared insert + common selects.
3. **P1-3** `server/ingest.ts` — `extractColumns(eventName, rawBody) → InsertRow`, with the 400-on-missing-`session_id` rule and URL-event regex guard.
4. **P1-4** `server/routes/hooks.ts` — `POST /hook/:event` reads raw text, returns `200 {"ok":true}` immediately, schedules insert + (stub) broadcast on next microtask.
5. **P1-5** `server/routes/health.ts` — `GET /health`.
6. **P1-6** `server/routes/sessions.ts` — stub `GET /api/events?since=&session_id=&limit=` returning recent rows. Enough for Phase 1 smoke test.
7. **P1-7** `server/index.ts` — Hono app, mount routes, start `Bun.serve` on `PORT`. Graceful shutdown (close DB on SIGTERM).
8. **P1-8** `Dockerfile` + `docker-compose.yml` + volume for `/data`.
9. **P1-9** `settings.claude.example.json` with the spec §6 config, `<host>` placeholder.
10. **P1-10** README bootstrap: run locally, run in Docker, configure `~/.claude/settings.json`, `/hooks` approval step, smoke-test via `curl http://localhost:5050/api/events`.

### Phase 2 — Derived APIs + live push + dashboard shell *(exit: dashboard reflects live events with full tile fidelity on a second monitor)*

11. **P2-1** `server/ws.ts` — event broadcast hub; wire Phase 1's stub to real broadcast; add 5 s stats tick.
12. **P2-2** `/ws` upgrade in `index.ts` using Bun's native WebSocket through Hono. Optional `?since=` replay.
13. **P2-3** `derive/sessionState.ts` — the 6-value state enum from §6.1, shared between server response and client reducer (pure TS module).
14. **P2-4** `derive/toolTarget.ts` — display target extraction per §6.2.
15. **P2-5** `derive/sparkline.ts` — window/bins aggregation per §6.3. Add `/api/sessions/:id/sparkline`.
16. **P2-6** `derive/stats.ts` + `server/routes/stats.ts` — `/api/stats` and WS stats ticks.
17. **P2-7** Implement real `/api/sessions` and `/api/sessions/:id` returning the SessionRow shape from §7, including `active_subagents`, `active_tool`, `last_tool`, `sparkline`, `model` (via `json_extract`).
18. **P2-8** Scaffold `web/`: Vite + Vue 3 + TS + Tailwind + `vue-router` + Pinia + `@fontsource/ibm-plex-sans` + `@fontsource/ibm-plex-mono`. Port design tokens into `tailwind.config.ts` (§9.1).
19. **P2-9** `vite.config.ts` proxies `/api` and `/ws` to `:5050`. Global CSS: font-feature `"zero"`, scrollbar, dark root.
20. **P2-10** `stores/sessions.ts`, `stores/stats.ts`, `stores/preferences.ts` + `composables/useEventStream.ts` (singleton WS, backoff reconnect, per-message type dispatch).
21. **P2-11** `ui/MicroLabel`, `ui/BreathingDot`, `ui/SegmentedControl`, `ui/Kbd` primitives.
22. **P2-12** `AppHeader.vue` — logo SVG, nav tabs (Sessions active; Events/Projects/Config visual placeholders), live counters bound to `useStatsStore`.
23. **P2-13** `AlertsStrip.vue` — driven by `activeAwaiting` getter; Review/Mute buttons; `role=status`; respect `preferences.mutes`.
24. **P2-14** `SessionTile.vue` + `Sparkline.vue` + `SubagentChips.vue` — all five variants from §9.5 wired against static fixtures first, then live store.
25. **P2-15** `SessionsHome.vue` — header, segmented controls (window + view-mode persistence), tile grid with ghost tiles, `StoppedSessions.vue` compact rows list.
26. **P2-16** Wire `bun build` for SPA, serve `web/dist` statically from Hono; end-to-end single-container deploy works.
27. **P2-17** `scripts/seed.ts` — synthetic session generator (all five states) for dashboard dev without a live Claude Code run. Includes subagent events + a pending Notification.

### Phase 3 — Session detail *(exit: clicking a tile shows the timeline with subagent lanes, spawn/return markers, live-updating recent list)*

28. **P3-1** `lib/correlate.ts` — pair `PreToolUse` with `PostToolUse` / `PostToolUseFailure` by `tool_use_id`; compute durations; surface still-open ("in flight") as `now - started_at`.
29. **P3-2** Backend: `/api/sessions/:id/summary` (tool mix + model + durations + error count; `tokens: null`).
30. **P3-3** `stores/sessionDetail.ts` — per-session events + lanes + summary; subscribe to WS filtered by `session_id`.
31. **P3-4** `SessionDetail.vue` layout — header block, tab strip, Follow-now button.
32. **P3-5** `PromptCard.vue` — latest `UserPromptSubmit` body + timestamp.
33. **P3-6** `Timeline.vue` — ruler (7 ticks + `now` in `c-run`), grid layout, empty track.
34. **P3-7** `Lane.vue` — one lane per thread (main + per `agent_id`, plus `sub · done` label for ended subagents); main first, active subs next, done subs last.
35. **P3-8** Bar placement math — left% / width% from `(start - window_start) / window_duration` and `duration / window_duration`, clamped. Error bars use `err` color; completed main bars `fg-4`; active sub bars `sub` at 0.8 opacity.
36. **P3-9** Spawn markers (2 px × 8 px sub vertical) from main boundary into sub lane at `SubagentStart.ts`. Return markers (3 px × 22 px ok vertical) at `SubagentStop.ts`; lane greyed after return.
37. **P3-10** Tooltip on bar hover: tool name, args (Edit/Write file path; Bash command; Grep pattern), duration, start time, Bash exit code. Payload side-panel on click.
38. **P3-11** `SummaryCard.vue` — dl grid, tool-mix stacked bar, legend. `tokens` = `"—"` with a tooltip stating the hook-payload limitation (§1 note).
39. **P3-12** `RecentList.vue` — latest ~7 events, `slideUp` on new rows, Follow-now behaviour; scrollable overflow.

### Phase 4 — Polish *(exit: ready for daily use on a second monitor)*

40. **P4-1** Motion pass: `breathe` 2200 ms on single dots only; `slideUp` 400 ms on new tiles / recent rows; 300 ms top-edge crossfade on state transition (DOM element stable). Honour `prefers-reduced-motion`.
41. **P4-2** Stopped-session transition: 1 s idle hold → 300 ms fade-out → move into stopped card.
42. **P4-3** Ghost tiles ("slots free — N more fit on this row", "+ launch session via hook"). Informational only.
43. **P4-4** README finalised: install, hook config, Tailscale note, retention expectations, multi-host caveat, screenshot.
44. **P4-5** Minimal test pass: `bun test` covering `extractColumns`, `sessionState`, `toolTarget`, `sparkline` bin math, tool-use correlation, plus one route-level ingest smoke test. No frontend test framework in v1.

## 12. Risks & mitigations

- **Blocking the agent.** *Mitigation:* return `200` before any DB touch; HTTP hooks are non-blocking on failure anyway.
- **SQLite contention across many concurrent sessions.** *Mitigation:* WAL mode, single-writer pattern in Bun (no worker), prepared statements, short transactions.
- **Schema drift** if Claude Code adds a new event field. *Mitigation:* full raw JSON kept in `payload`; derived fields via `json_extract`; new events need no migration.
- **Dashboard memory growth** with long sessions. *Mitigation:* SessionDetail caps events at 5 000 and paginates by time-window; `useEventStream` caps the live buffer.
- **WebSocket disconnect on sleep / Tailscale churn.** *Mitigation:* backoff reconnect + `?since=` replay; stats recomputed fresh on reconnect.
- **Injection via payload content.** *Mitigation:* no payload content is ever interpolated into SQL (always parameterised), nor rendered as HTML (Vue escapes by default; no `v-html`).
- **Design-fidelity regressions** as the app grows. *Mitigation:* tokens live only in `tailwind.config.ts`; components consume named colors (`bg-run`, `c-sub`) — no hex literals in component files.

## 13. Features deferred or unavailable in v1

These are limitations or scope deferrals called out so expectations are set:

- **`tokens` in the SummaryCard** — renders `"—"`. Hook payloads do not include token counts; revisit if/when Claude Code adds a TokensUsed-style event.
- **Tool exit codes for non-Bash tools** — timeline tooltips show exit code for Bash only; other tools surface success via `PostToolUse` vs `PostToolUseFailure` only.
- **Cross-host machine identification** — `session_id` is unique but machine identity isn't captured. "Project" is `basename(cwd)`. Deferred per spec §13.
- **Transcript ingestion / JSONL viewer** — `transcript_path` is stored but not fetched (may live on a different host).
- **Auth** — none in v1; bind to localhost / Tailscale.
- **Retention** — no pruning in v1.
- **List-view mode on sessions home** — ships as a basic flat table fallback (same columns as stopped list); the rich list design is future work.
- **Events / Projects / Config top-nav tabs** — visual scaffolding only; route to a "later version" placeholder panel.
- **`⌘K` command palette** — visual hint only, not wired.
- **Event drawer on timeline bar click** — v1 shows raw payload in a side panel; proper drawer is post-v1.
- **Lane collapse** — future work.
- **Light mode** — explicitly out of v1 per design README.

## 14. Open questions

All four from spec §13 — retention, multi-host identification, transcript ingestion, auth. None block Phase 1–4.

## 15. Done = success criteria

1. `docker compose up -d` once, forget it.
2. One snippet into `~/.claude/settings.json`.
3. Second-monitor dashboard shows every concurrent session — main + subagents — with design-accurate tiles, sparklines, alerts strip, and a drill-down timeline.
4. No more "what is my background agent doing?".
