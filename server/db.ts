import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { EventRow, InsertRow } from "./types.ts";

const SCHEMA_VERSION = 1;

let db: Database | null = null;

export function openDb(path: string): Database {
  if (db) return db;

  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  migrate(db);
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error("Database not opened. Call openDb() first.");
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  const currentRow = database
    .query<{ version: number }, []>("SELECT MAX(version) AS version FROM schema_version")
    .get();
  const current = currentRow?.version ?? 0;

  if (current < 1) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          ts           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          event        TEXT    NOT NULL,
          session_id   TEXT    NOT NULL,
          agent_id     TEXT,
          agent_type   TEXT,
          tool_name    TEXT,
          tool_use_id  TEXT,
          cwd          TEXT,
          payload      TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_events_session_ts       ON events(session_id, ts);
        CREATE INDEX IF NOT EXISTS idx_events_recent           ON events(ts DESC);
        CREATE INDEX IF NOT EXISTS idx_events_tool_use_id      ON events(tool_use_id) WHERE tool_use_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_events_session_agent_ts ON events(session_id, agent_id, ts);
      `);
      database.run("INSERT INTO schema_version(version) VALUES (?)", [1]);
    })();
  }

  // Future migrations append here, gated on SCHEMA_VERSION.
  void SCHEMA_VERSION;
}

export function insertEvent(row: InsertRow): EventRow {
  const stmt = getDb().query<EventRow, [string, string, string | null, string | null, string | null, string | null, string | null, string]>(
    `INSERT INTO events (event, session_id, agent_id, agent_type, tool_name, tool_use_id, cwd, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
  );
  const result = stmt.get(
    row.event,
    row.session_id,
    row.agent_id,
    row.agent_type,
    row.tool_name,
    row.tool_use_id,
    row.cwd,
    row.payload,
  );
  if (!result) throw new Error("insertEvent: RETURNING produced no row");
  return result;
}

export interface RecentEventsFilter {
  since?: string;
  sessionId?: string;
  limit?: number;
}

export function recentEvents(filter: RecentEventsFilter = {}): EventRow[] {
  const limit = Math.max(1, Math.min(filter.limit ?? 100, 1000));
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filter.since) {
    clauses.push("ts > ?");
    params.push(filter.since);
  }
  if (filter.sessionId) {
    clauses.push("session_id = ?");
    params.push(filter.sessionId);
  }
  params.push(limit);

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `SELECT * FROM events ${where} ORDER BY ts DESC, id DESC LIMIT ?`;
  return getDb()
    .query<EventRow, (string | number)[]>(sql)
    .all(...params);
}

export function pingDb(): boolean {
  try {
    getDb().query<{ one: number }, []>("SELECT 1 AS one").get();
    return true;
  } catch {
    return false;
  }
}

export function clearEvents(): number {
  const database = getDb();
  const countRow = database
    .query<{ n: number }, []>("SELECT COUNT(*) AS n FROM events")
    .get();
  const before = countRow?.n ?? 0;
  database.run("DELETE FROM events");
  database.run("DELETE FROM sqlite_sequence WHERE name = 'events'");
  database.exec("VACUUM");
  return before;
}
