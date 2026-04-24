# Handoff: Periscope — Grid direction

## Overview
Periscope is a self-hosted, read-only observability dashboard for Claude Code sessions. It receives Claude Code hook events (tool calls, subagent lifecycle, prompts, notifications) via HTTP POST, persists them to SQLite, and renders a live dashboard that the developer glances at from a secondary monitor while they work.

This handoff covers the **Grid** visual direction: a small-multiples tile wall where each active Claude Code session is a self-contained, compact tile with a 15-minute activity sparkline, plus a detail view built around a lane-per-agent timeline, plus a persistent top-of-page alerts strip.

Three views ship here, all sharing one visual language:
1. **Sessions home** — the glance view. Active sessions as tiles, stopped sessions as compact rows below.
2. **Session detail** — one session drilled into. Timeline of main agent + subagent lanes, plus summary and recent-events rail.
3. **Alerts strip** — a persistent header band that surfaces whenever a `Notification` event means Claude Code is waiting for the user.

## About the Design Files
The file in this bundle (`03 Grid.html`) is a **design reference created in HTML + Tailwind via CDN**. It is a prototype of intended look and behavior, not production code to copy directly.

The task is to recreate this design in the target codebase's environment. The brief specifies **Vue 3 + Tailwind CSS** as the eventual stack — use Tailwind's configured theme rather than inline `style=""` attributes or the `arbitrary-value-in-brackets` patterns you'll see in the mock. Extract the CSS custom properties at the top of the `<style>` block into your `tailwind.config.js` theme.

## Fidelity
**High-fidelity.** Colors, typography, spacing, type scale, and micro-interactions are intentional. Reproduce them pixel-close. The one place where low-fi guidance suffices is the sparkline data — in production it should be a real binned event-count-per-minute series from SQLite, not the hand-drawn heights in the mock.

## Target environment
- **Framework:** Vue 3 (composition API, `<script setup>`)
- **Styling:** Tailwind CSS, configured with the tokens below
- **Real-time:** sessions list and session detail should stream live. A single SSE or WebSocket endpoint pushing normalized events is the simplest fit; Pinia store merges events into session state; Vue re-renders. No polling for the live views.
- **Fonts:** IBM Plex Sans (UI) + IBM Plex Mono (data). Self-host with `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` so the dashboard works offline on the home server.

---

## Design tokens

Drop these into `tailwind.config.js` under `theme.extend.colors` (group as `bg`, `fg`, and named signals). They are the source of truth — every color in the mock is one of these.

### Color

| Token             | Hex       | Meaning                                        |
|-------------------|-----------|------------------------------------------------|
| `bg`              | `#0c0d10` | Canvas / page background                       |
| `bg-1`            | `#111317` | Tile / card surface                            |
| `bg-2`            | `#171a1f` | Hover surface, active tab fill                 |
| `bg-3`            | `#1e2229` | Elevated chip / input background               |
| `line`            | `#23272f` | Default border                                 |
| `line-2`          | `#2b3039` | Hover border, stronger divider                 |
| `fg`              | `#e5e8ee` | Primary text                                   |
| `fg-1`            | `#b4b9c2` | Secondary text                                 |
| `fg-2`            | `#7b8290` | Tertiary text / labels                         |
| `fg-3`            | `#525a66` | Muted text / timestamps                        |
| `fg-4`            | `#363c46` | History bars in timeline (completed activity)  |
| `run`             | `#7fb3f0` | Cool blue — a tool is currently running        |
| `run-dim`         | `#2a4366` | Dim variant for run (backgrounds / mix bars)   |
| `sub`             | `#b59ce6` | Lavender — subagent(s) active                  |
| `sub-dim`         | `#3a3258` | Dim variant for sub                            |
| `attn`            | `#e3b155` | Amber — session awaiting user (unmissable, not alarming) |
| `attn-dim`        | `#58431d` | Dim variant for attn                           |
| `err`             | `#e27a72` | Coral — errored tool call / stopped-error      |
| `ok`              | `#86c49a` | Moss — returned cleanly / stopped-ok           |

**Rules of color use (important — the brief was strict about this):**
- Most of the UI is near-monochrome (bg / fg / line). Color appears only to mean something.
- If a session is idle, its tile should **not** use any of the signal colors — use `fg-3` for the dot and drop opacity on the whole tile to `0.72`.
- Never stack multiple signal colors in the same tile. A session is exactly one of: `running`, `sub`, `wait`, `idle`, `error`.

### Typography

| Role                  | Font              | Size   | Weight | Line-height | Letter-spacing | Notes |
|-----------------------|-------------------|--------|--------|-------------|----------------|-------|
| Page title (h1)       | IBM Plex Sans     | 24 px  | 500    | tight       | `-0.01em`      | "Sessions", "blazor-blueprint" |
| Section title (h2/h3) | IBM Plex Sans     | 22 px  | 500    | tight       | `-0.01em`      | Session detail heading |
| Tile title            | IBM Plex Mono     | 13.5 px| 500    | 1.2         | 0              | `luma-console`, project name — always mono |
| Body / primary        | IBM Plex Sans     | 14 px  | 400    | 1.4         | 0              | Prompt body |
| UI meta / secondary   | IBM Plex Sans     | 12.5 px| 400    | 1.4         | 0              | Page subtitles |
| Data / chrome         | IBM Plex Mono     | 12 px  | 400    | 1.4         | 0              | Timestamps, event rows, IDs |
| Micro label           | IBM Plex Mono     | 10.5–11 px | 500 | 1.3         | `0.12em` uppercase | Section dividers, column headers |
| Numeric tabular       | IBM Plex Mono     | 12 px  | 500    | 1           | 0              | Token counts, ev/s |

All numeric data uses `font-feature-settings: "zero"` so zeros read as slashed-zero (disambiguates 0 from O).

### Spacing / layout

- Base unit: **4 px** (Tailwind default).
- Page horizontal padding: **24 px** (`px-6`).
- Tile internal padding: **16 px** (`p-4`).
- Grid gap between tiles: **12 px** (`gap-3`).
- Tile grid on 1440: **4 columns**; on 1920/4K: **5–6 columns**. Use `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`.
- Tile minimum height: **176 px**. Don't let tiles shrink below this even when content is sparse.
- Section vertical rhythm: **48 px** between major sections (`pt-12`).

### Radius / border

- Tiles, cards, side panels: `10px` border-radius.
- Chips, buttons: `6px`.
- Small tags / pills: `999px` (fully round).
- Borders are always **1 px**. Never use shadows — elevation is communicated with border color (`line` → `line-2` on hover).

### Motion

- Hover transitions: `150ms ease` on `border-color`, `background`, `transform`.
- New-tile / new-event enter: `slideUp` (4 px from below + opacity), `400ms ease-out`, **play once, never repeat**.
- Live dot: `breathe` keyframes, opacity 0.55 → 1 → 0.55, `2200ms ease-in-out infinite`. Apply **only to the one status dot of each active session/lane**, never to multiple elements simultaneously on the same row.
- Never add success animations, celebrations, bouncing, or flashing. The aesthetic is calm observation.

---

## Screens / Views

### 1 · Top chrome (shared across all views)

**Layout:** two stacked 40–48 px rows, sticky to top, `backdrop-blur` on translucent bg.

**Row A — product/nav bar (48 px tall):**
- Left: Periscope mark (small bar-chart SVG) + wordmark `Periscope` + `·` + mono tag (`grid`).
- Center-ish: nav (`Sessions` active / `Events` / `Projects` / `Config`). Active tab = `bg-2` fill, `fg-1` text, `6px` radius.
- Right: live counters in mono — `● 5 active` (breathing dot), `3.4 ev/s`, `12d 04h`, `⌘K` kbd hint. Separated by 1 px × 12 px vertical line elements.

**Row B — alerts strip (40 px tall):** rendered only when at least one session has a pending `Notification` hook event.
- Background `#15130c` (warm near-black — barely warmer than the rest of the UI).
- Inset left border: `2px solid attn`. This is the one place in the UI where color bleeds to an edge.
- Content: uppercase micro-label `awaiting you` (attn color, breathing dot), then session name (`fg-1`), `needs approval for`, tool call as `mono fg-1`, blocked duration in mono `fg-3`.
- Right side: `Review` button (bordered with `attn-dim`, text `attn`) + `Mute 5m` (ghost button, `fg-2`).
- Multiple pending sessions: stack horizontally as chips, comma-separated, or expand the strip to 2 rows. Never queue them behind each other.

### 2 · Sessions home

**Layout:**
- `24 px` top padding.
- Header row: `h1 "Sessions"` (24 px, 500) + subtitle (`5 active · 7 stopped in the last 24 hours`) on the left; on the right: time-window segmented control (`5m | 15m | 1h | 24h` — 15m default), separator, view-mode toggle (`tiles | list`).
- **Tile grid:** `grid-template-columns: repeat(4, minmax(0, 1fr))` at 1440. Gap `12 px`.
- Below the grid: **stopped sessions** — a compact single card with divider-separated rows, 4-column grid (`1fr 120px 1fr 140px`): name, stopped/status, summary, relative time.

**Tile anatomy** — all five variants share this:
- Tile root: `10 px` radius, `1 px line` border, `p-4`.
- **Top edge tint** communicates state: `border-top: 1px solid {run|sub|attn}`. Idle tiles don't get a top edge and their whole tile drops to 0.72 opacity.
- Header row (flex space-between):
  - Left cluster: 6 px breathing dot (state color) + mono project name + micro working-directory path below it (`~/work/luma/console`) in `fg-3 11px`.
  - Right: mono 11 px state badge (`tool · 12s`, `blocked · 42s`, `3 subs · main idle`, `idle · 4m 12s`).
- Body block (12 px top margin):
  - Uppercase micro-label (`in flight`, `awaiting approval`, `subagents`, `last action`).
  - One line summarizing: tool name (state color, mono) + truncated target (mono `fg-1`).
  - For subagent tile: replace the line with a row of chips — one chip per subagent, `sub` color, rounded-full, border `sub-dim`, background `rgba(181,156,230,0.06)`.
- **Sparkline:** 26 px tall, 25 bars, each 4 px wide with 2 px gap. Height = event-count in that one-minute bucket (log-scale looks best — clamp floor at 4%). Color per bar:
  - Past / idle bucket → `fg-4`
  - Running in that bucket → `run`
  - Subagent-dominated bucket → `sub`
  - Awaiting-user bucket → `attn`
  - Error occurred in that bucket → `err`
- Footer row: mono 11 px `fg-3` — left: `started 14:31 · 18m`, right: `1,284 ev`.

**Ghost tiles:** at the end of the active grid, show up to 2 dashed-border placeholder tiles with messages like `slots free — 8 more fit on this row` and `+ launch session via hook`. These are informational only, not interactive.

**Tile variants** (match these exactly):
| Variant | Top edge | Dot | State badge | Body |
|---------|----------|-----|-------------|------|
| `running` | `run` | `bg-run` breathing | `c-run` "tool · Ns" | "in flight" + tool verb in run color |
| `sub` | `sub` | `bg-sub` breathing | `c-sub` "N subs · main idle" | "subagents" + chips |
| `wait` | `attn` + 6% attn bg gradient top→transparent | `bg-attn` breathing | `c-attn` "blocked · Ns" | "awaiting approval" + tool call |
| `idle` | none, `opacity: 0.72` | `bg-fg-3` static | `text-fg-2` "idle · N" | "last action" + tool in `fg-2` |
| `error` (stopped only, appears in lower rows card, not as tile) | — | — | `c-err` | error message |

### 3 · Session detail

Reached by clicking a tile.

**Layout:**
- Header block: uppercase micro-label `session`, then h2 (project name in mono + subagent count in `sub` mono), then subtitle with start time, duration, event count, model.
- View-mode tabs (`timeline | events | prompts`) and `Follow now →` button on the right.
- **Prompt card:** full-width, `10 px` radius, padded row: left label `user prompt` (micro), prompt body (14 px `fg`), right timestamp mono. Prompt is always shown above the timeline — it's the "why" for everything below.
- **Two-column layout below prompt:**
  - Left (flex-1): **timeline** card.
  - Right (340 px fixed): **summary** card, then **recent** events card stacked below.

**Timeline card:**
- Header row: micro-label `timeline · last 45 min` left; color legend right (4 dots: tool `fg-4`, subagent `sub`, error `err`, return `ok`).
- Ruler row, 24 px tall, with 7 evenly spaced timestamps; the last one is `now` in `run` color.
- Lane rows, each a 2-column grid (`120 px | 1fr`):
  - Left: micro-label (`main`, `sub`, `sub · done`) + mono agent name.
  - Right: a 20 px (main) or 16 px (sub) track with a `#0f1317` background and colored bars absolutely positioned (`left: N%; width: M%`) for each tool call, proportional to duration.
- **Subagent spawn markers:** from main-lane row, drop a 2 px vertical line of `sub` color down into the sub's lane at the spawn x-position. 8 px tall so it straddles the lane boundary.
- **Return markers:** 3 px × 22 px vertical `ok`-colored rectangle at the return x-position. Lane below this marker goes `fg-4` (greyed out).
- Error bars: use `err` color instead of `sub`/`fg-4` for that one bar.

**Summary card (right rail, top):**
- Micro-label `summary`.
- Two-column `<dl>`, 12.5 px mono: state / events / errors / tokens / model / duration.
- Below a 1 px divider: `tool mix` micro-label, then a single 8 px tall stacked bar showing proportion of each tool type, then a small legend row underneath.

**Recent card (right rail, bottom):**
- Micro-label `recent` + `● live` indicator on the right with breathing dot.
- Vertical list of compact rows: timestamp (short MM:SS form, `fg-3`) · lane name (colored) · truncated verb+target. Max ~7 visible — scrollable for more. New events slide in from top with the `slideUp` animation, existing rows shift down.

---

## Interactions & Behavior

### Home view
- **Tile click** → navigate to session detail (`/sessions/:sessionId`). Whole tile is the hit target.
- **Tile hover** → border goes `line` → `line-2`, background `bg-1` → `bg-2`. No transform, no shadow.
- **Time window toggle** → re-query sparklines with the new window; tile layout and state are unchanged.
- **Tiles / list toggle** → persistable in localStorage. List view is not designed in this handoff — treat it as a follow-up; for now, flat table with same columns as the stopped-sessions list is acceptable.
- **Live updates:**
  - Incoming event for an existing active session: update the tile in place. Update the in-flight line, advance the last sparkline bar's height. Do **not** re-mount the tile.
  - Session transitions state (e.g., `running` → `sub` because a Task was just spawned): animate the top-edge color change with a 300 ms crossfade.
  - New session appears: insert at the end of the active grid with `slideUp`.
  - Session stops: after a 1 s delay with the tile visibly idle, fade it out (300 ms), then move it into the stopped card below.

### Alerts strip
- Rendered only when `sessions.some(s => s.state === 'wait')`.
- **Review** → navigate to the waiting session's detail view.
- **Mute 5m** → client-side suppression of the strip for that session for 5 minutes. Persist per-session mute in localStorage.
- If multiple sessions are waiting, show the oldest in the strip and append `+N more` chip to its right; clicking opens a popover listing them.

### Session detail
- **Timeline bar hover** → show a tooltip with full tool name, args (if Edit/Write: file path; if Bash: command; if Grep: pattern), duration, start time, exit code.
- **Timeline bar click** → open event drawer (not designed in this bundle; treat as future work).
- **Follow now** button → toggles auto-scroll on the Recent list + keeps the timeline's right edge pinned to `now`. Default: on when page loads.
- **Lane collapse** (future): clicking the lane label should collapse it. Not required v1.

### State transitions to render
```
idle        → running    (tool in flight)
running     → idle       (tool returned, no followup)
running     → sub        (main fired Task)
sub         → running    (last subagent returned)
running     → wait       (Notification hook fired)
wait        → running    (user approved / denied; new tool in flight)
*           → stopped    (SessionStop hook)
*           → error      (any hook reported exit ≠ 0)
```

All transitions re-render the tile's top-edge color, dot color, and state badge. Keep the tile's DOM element stable across transitions so CSS color transitions fire cleanly.

---

## State management

Suggested Pinia stores:

**`useSessionsStore`**
- `sessions: Map<sessionId, Session>` — `{ id, project, cwd, state, startedAt, lastEventAt, currentTool?, subagents: Subagent[], eventCount, tokens, errors, sparkline: number[] }`
- `active` computed: filter `state !== 'stopped'`, sort by `lastEventAt desc`.
- `stopped` computed: filter `state === 'stopped'`, sort by `stoppedAt desc`, limit to 24 h.
- `activeAwaiting` computed: filter `state === 'wait'`. Drives the alerts strip visibility.
- Actions: `ingestEvent(event)` — dispatches to the right session, mutates the right fields based on hook type.

**`useSessionDetailStore(sessionId)`**
- Pulls all events for one session, streams updates.
- `lanes: { main: Event[], subs: Record<subagentId, Event[]> }`
- `summary: { tokens, tools: Record<toolName, number>, errors, duration }`

### Deriving state from hook events
Periscope receives these hook kinds per Claude Code's hook spec:
- `PreToolUse` → set session `state = 'running'`, `currentTool = {name, args, startedAt: now}`.
- `PostToolUse` → clear `currentTool`, push event onto the lane, recompute state: if any subagent is still running → `'sub'`; else `'idle'`.
- `UserPromptSubmit` → new prompt, may flip state from `idle`.
- `Notification` → set `state = 'wait'`. The tool args on `currentTool` are the thing awaiting approval.
- `SubagentStart` / `SubagentStop` → add/remove entries from `subagents[]`, update lane set.
- `SessionStart` / `SessionStop` → lifecycle.

---

## Components to extract

Recommended Vue component breakdown. Names use PascalCase to match typical Vue convention.

| Component | Purpose |
|-----------|---------|
| `AppHeader.vue` | Product nav + live counters (row A) |
| `AlertsStrip.vue` | Row B — awaiting-user band |
| `SessionsHome.vue` | Page: header, tile grid, stopped list |
| `SessionTile.vue` | Single tile. Props: `session`. Internally renders the right variant via `data-state`. |
| `SessionTile/Sparkline.vue` | 25-bar sparkline. Props: `bins: number[]`, `color` per bin |
| `SessionTile/SubagentChips.vue` | Chip row for subagent variant |
| `StoppedSessions.vue` | Compact row list below the grid |
| `SessionDetail.vue` | Page: header, prompt, two-column body |
| `SessionDetail/PromptCard.vue` | Full-width prompt block |
| `SessionDetail/Timeline.vue` | Timeline card with ruler + lanes |
| `SessionDetail/Lane.vue` | One row (main or subagent) |
| `SessionDetail/SummaryCard.vue` | Right-rail summary with tool-mix bar |
| `SessionDetail/RecentList.vue` | Right-rail live list |
| `ui/MicroLabel.vue` | Uppercase mono label used everywhere |
| `ui/BreathingDot.vue` | The live-indicator dot — one component, color prop |
| `ui/SegmentedControl.vue` | Time-window + view-mode toggles |
| `ui/Kbd.vue` | Keyboard hint chip |

---

## Accessibility

- Color is the primary state signal, but **never the only one**. Each state also has: a distinct status badge text ("tool", "blocked", "3 subs · main idle", "idle"), a distinct micro-label body ("in flight" vs "awaiting approval" vs "subagents" vs "last action"), and a position (waiting sessions appear at the top of the alerts strip regardless of grid position).
- All breathing/pulsing animations must respect `prefers-reduced-motion: reduce` — swap to a static full-opacity dot.
- Tile hit targets are the whole tile (>176 px tall) — well above 44 px minimum.
- Live regions: the alerts strip should be `role="status" aria-live="polite"` so screen readers announce new awaiting sessions.

---

## Assets
No bitmap assets. Two SVG marks are hand-drawn inline:
- Periscope logo mark in `AppHeader` — three stacked bars (bar-chart motif).
- No icon library used. If you need icons for the event drawer later, use **Lucide** sparingly — functional only, never decorative.

Fonts:
- IBM Plex Sans (400, 500, 600) — via `@fontsource/ibm-plex-sans`
- IBM Plex Mono (400, 500) — via `@fontsource/ibm-plex-mono`

---

## Mock data used in the prototype
Drop the same names/strings into your local fixtures so the look matches review screenshots:

Active sessions: `luma-console` (running `Edit src/components/ClientList.tsx`), `periscope` (wait on `Bash docker compose up`), `blazor-blueprint` (3 subs: builder / validator / researcher; test-writer done), `notes` (running `Grep "TODO" src/`), `luma-api` (idle 4m 12s), `dotfiles` (idle 1m 48s).

Stopped: `luma-keycloak-theme` (ok, 2h ago), `luma-api` (ok, 3h ago), `periscope` (error: `Bash exit 1 — sqlite3: disk I/O error (code 10)`), `notes` (ok).

Prompts: "investigate why the /hook/PreToolUse endpoint is returning 500s — check recent deploys, replay the last failing event, and propose a fix", "add WAL mode to the SQLite setup", "refactor the sessions list query to use indexes".

Tools: `Read`, `Edit`, `Write`, `Bash`, `Grep`, `Glob`, `WebFetch`, `Task`.
Subagent types: `builder`, `validator`, `researcher`, `test-writer`.

---

## Files in this bundle
- `03 Grid.html` — the design reference. Open it in a browser at ≥1440 px wide to see the intended layout. The `<style>` block at the top defines all CSS custom properties you need to port into Tailwind config.
- `README.md` — this document.

---

## What I'd build first (suggested order)
1. Tailwind config with the token table above. Font imports. Global styles for scrollbar + `font-feature-settings`.
2. `AppHeader` + `AlertsStrip` with static data. Get the top-of-page chrome locked in.
3. `SessionTile` — build all five variants against static fixtures before wiring live data.
4. `SessionsHome` page wiring the grid + stopped list.
5. Live data: Pinia store, SSE/WebSocket client, hook-event → session-state reducer.
6. `SessionDetail` page — prompt + timeline + right rail.
7. Event drawer (click-through from timeline bar) — not in this handoff; design later.
8. Light mode — not in this handoff; dark mode is explicitly the primary.
