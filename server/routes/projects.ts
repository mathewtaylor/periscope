import { Hono } from "hono";
import { getDb } from "../db.ts";
import { projectName } from "../derive/sessionRow.ts";

const app = new Hono();

interface ProjectRow {
  project: string;
  cwd_sample: string;
  session_count_24h: number;
  session_count_total: number;
  event_count_24h: number;
  event_count_total: number;
  error_count_24h: number;
  active_now: boolean;
  last_event_at: string;
  tool_mix: Array<{ name: string; count: number }>;
}

interface ScanRow {
  session_id: string;
  cwd: string | null;
  event: string;
  tool_name: string | null;
  ts: string;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const TOOL_MIX_LIMIT = 6;

interface SessionAgg {
  project: string;
  cwd_sample: string;
  cwd_sample_ts: string;
  session_has_cwd: boolean;
  event_count_total: number;
  event_count_24h: number;
  error_count_24h: number;
  last_event_at: string;
  has_session_end: boolean;
}

interface ProjectAgg {
  project: string;
  cwd_sample: string;
  cwd_sample_ts: string;
  session_ids_total: Set<string>;
  session_ids_24h: Set<string>;
  event_count_total: number;
  event_count_24h: number;
  error_count_24h: number;
  last_event_at: string;
  tool_mix_24h: Map<string, number>;
  active_now: boolean;
}

app.get("/", (c) => {
  const rows = getDb()
    .query<ScanRow, []>(
      `SELECT session_id, cwd, event, tool_name, ts
       FROM events
       ORDER BY ts ASC, id ASC`,
    )
    .all();

  const nowMs = Date.now();
  const cutoff24hMs = nowMs - TWENTY_FOUR_HOURS_MS;
  const activeCutoffMs = nowMs - ACTIVE_WINDOW_MS;

  // First pass: build per-session aggregates (we need latest cwd per session
  // and to know whether a session was ever SessionEnd'd before projecting).
  const sessions = new Map<string, SessionAgg>();
  for (const row of rows) {
    const tsMs = Date.parse(row.ts);
    const within24h = tsMs >= cutoff24hMs;

    let sa = sessions.get(row.session_id);
    if (!sa) {
      sa = {
        project: "",
        cwd_sample: "",
        cwd_sample_ts: "",
        session_has_cwd: false,
        event_count_total: 0,
        event_count_24h: 0,
        error_count_24h: 0,
        last_event_at: row.ts,
        has_session_end: false,
      };
      sessions.set(row.session_id, sa);
    }

    if (row.cwd) {
      // latest cwd wins (rows iterated in ts ASC)
      sa.cwd_sample = row.cwd;
      sa.cwd_sample_ts = row.ts;
      sa.session_has_cwd = true;
      sa.project = projectName(row.cwd);
    }
    sa.event_count_total += 1;
    if (within24h) sa.event_count_24h += 1;
    if (
      within24h &&
      (row.event === "PostToolUseFailure" || row.event === "StopFailure")
    ) {
      sa.error_count_24h += 1;
    }
    if (row.ts > sa.last_event_at) sa.last_event_at = row.ts;
    if (row.event === "SessionEnd") sa.has_session_end = true;
  }

  // Second pass: roll sessions into projects + compute tool_mix_24h from a
  // second scan over the same rows (cheap, small data) so tool_mix can map
  // tool_name→project via the session's derived project.
  const projects = new Map<string, ProjectAgg>();

  for (const [sessionId, sa] of sessions) {
    if (!sa.session_has_cwd) continue; // no project derivable
    let pa = projects.get(sa.project);
    if (!pa) {
      pa = {
        project: sa.project,
        cwd_sample: sa.cwd_sample,
        cwd_sample_ts: sa.cwd_sample_ts,
        session_ids_total: new Set<string>(),
        session_ids_24h: new Set<string>(),
        event_count_total: 0,
        event_count_24h: 0,
        error_count_24h: 0,
        last_event_at: "",
        tool_mix_24h: new Map<string, number>(),
        active_now: false,
      };
      projects.set(sa.project, pa);
    }

    pa.session_ids_total.add(sessionId);
    // Session counts toward "24h" if its latest event is within 24h.
    if (Date.parse(sa.last_event_at) >= cutoff24hMs) {
      pa.session_ids_24h.add(sessionId);
    }
    pa.event_count_total += sa.event_count_total;
    pa.event_count_24h += sa.event_count_24h;
    pa.error_count_24h += sa.error_count_24h;
    if (sa.last_event_at > pa.last_event_at) {
      pa.last_event_at = sa.last_event_at;
    }
    if (sa.cwd_sample_ts > pa.cwd_sample_ts) {
      pa.cwd_sample = sa.cwd_sample;
      pa.cwd_sample_ts = sa.cwd_sample_ts;
    }

    // active_now: any session whose latest event is within 30 min AND has no
    // SessionEnd.
    if (
      !sa.has_session_end &&
      Date.parse(sa.last_event_at) >= activeCutoffMs
    ) {
      pa.active_now = true;
    }
  }

  // tool_mix_24h: PreToolUse events in last 24h, grouped by tool_name, per
  // session→project. Walk rows once more.
  for (const row of rows) {
    if (row.event !== "PreToolUse" || !row.tool_name) continue;
    if (Date.parse(row.ts) < cutoff24hMs) continue;
    const sa = sessions.get(row.session_id);
    if (!sa || !sa.session_has_cwd) continue;
    const pa = projects.get(sa.project);
    if (!pa) continue;
    pa.tool_mix_24h.set(
      row.tool_name,
      (pa.tool_mix_24h.get(row.tool_name) ?? 0) + 1,
    );
  }

  const result: ProjectRow[] = [];
  for (const pa of projects.values()) {
    const mixEntries = [...pa.tool_mix_24h.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    let toolMix: Array<{ name: string; count: number }>;
    if (mixEntries.length > TOOL_MIX_LIMIT) {
      const top = mixEntries.slice(0, TOOL_MIX_LIMIT);
      const rest = mixEntries.slice(TOOL_MIX_LIMIT);
      const otherCount = rest.reduce((s, e) => s + e.count, 0);
      toolMix = [...top, { name: "other", count: otherCount }];
    } else {
      toolMix = mixEntries;
    }

    result.push({
      project: pa.project,
      cwd_sample: pa.cwd_sample,
      session_count_24h: pa.session_ids_24h.size,
      session_count_total: pa.session_ids_total.size,
      event_count_24h: pa.event_count_24h,
      event_count_total: pa.event_count_total,
      error_count_24h: pa.error_count_24h,
      active_now: pa.active_now,
      last_event_at: pa.last_event_at,
      tool_mix: toolMix,
    });
  }

  result.sort((a, b) => b.last_event_at.localeCompare(a.last_event_at));
  return c.json(result);
});

export default app;
