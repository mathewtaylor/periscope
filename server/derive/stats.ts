import { getDb } from "../db.ts";

export interface Stats {
  active: number;
  ev_per_sec: number;
  uptime_ms: number;
}

const SERVER_STARTED_AT = Date.now();

export function computeStats(): Stats {
  const db = getDb();

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const activeRow = db
    .query<{ n: number }, [string]>(
      `SELECT COUNT(*) AS n FROM (
         SELECT session_id, MAX(ts) AS last_ts
         FROM events
         GROUP BY session_id
       ) s
       WHERE s.last_ts > ?
         AND NOT EXISTS (
           SELECT 1 FROM events e
           WHERE e.session_id = s.session_id AND e.event = 'SessionEnd'
         )`,
    )
    .get(thirtyMinAgo);

  const sixtySecAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const recentRow = db
    .query<{ n: number }, [string]>(
      `SELECT COUNT(*) AS n FROM events WHERE ts > ?`,
    )
    .get(sixtySecAgo);

  return {
    active: activeRow?.n ?? 0,
    ev_per_sec: (recentRow?.n ?? 0) / 60,
    uptime_ms: Date.now() - SERVER_STARTED_AT,
  };
}
