export type SessionState =
  | "running"
  | "sub"
  | "wait"
  | "idle"
  | "stopped"
  | "error";

export type SparkColor = "run" | "sub" | "attn" | "err" | "fg-4";

export interface SparkBin {
  count: number;
  color: SparkColor;
}

export interface ActiveTool {
  name: string;
  target: string;
  started_at: string;
}

export interface ActiveSubagent {
  agent_id: string;
  agent_type: string;
  started_at: string;
}

export interface LastTool {
  name: string;
  target: string;
}

export interface SessionRow {
  session_id: string;
  project: string;
  cwd: string;
  state: SessionState;
  started_at: string;
  last_event_at: string;
  stopped_at?: string;
  duration_ms: number;
  event_count: number;
  distinct_tool_count: number;
  active_tool?: ActiveTool;
  active_subagents: ActiveSubagent[];
  last_tool?: LastTool;
  sparkline: SparkBin[];
  error_summary?: string;
  model?: string;
  permission_mode: string | null;
  source: string | null;
}

export interface SessionsResponse {
  active: SessionRow[];
  stopped: SessionRow[];
  window: WindowLabel;
}

export interface PendingNotification {
  session_id: string;
  project: string;
  tool_name: string | null;
  tool_target: string | null;
  waiting_since: string;
}

export interface EventRow {
  id: number;
  ts: string;
  event: string;
  session_id: string;
  agent_id: string | null;
  agent_type: string | null;
  tool_name: string | null;
  tool_use_id: string | null;
  cwd: string | null;
  payload: string;
}

export interface Stats {
  active: number;
  ev_per_sec: number;
  uptime_ms: number;
}

export type WindowLabel = "5m" | "15m" | "1h" | "24h";

export type ViewMode = "tiles" | "list";

export type WsMessage =
  | { type: "hello"; server_ts: string }
  | { type: "event"; row: EventRow }
  | { type: "reset" }
  | ({ type: "stats" } & Stats);

export interface ProjectRow {
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

export type EventStatusFilter = "error" | "denied" | null;

export interface EventFilter {
  eventTypes: Set<string>;
  q: string;
  sessionId: string | null;
  tool: string | null;
  statusOnly: EventStatusFilter;
}

export interface EventQueryParams {
  eventTypes?: readonly string[];
  q?: string;
  sessionId?: string | null;
  tool?: string | null;
  statusOnly?: EventStatusFilter;
  before?: string | null;
  limit?: number;
}

export interface EventsResponse {
  events: EventRow[];
}
