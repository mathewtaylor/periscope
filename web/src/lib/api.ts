import type {
  EventQueryParams,
  EventRow,
  EventsResponse,
  PendingNotification,
  ProjectRow,
  SessionRow,
  SessionsResponse,
  Stats,
  WindowLabel,
} from "./types";

export interface SessionDetailResponse {
  session: SessionRow;
  prompt?: { body: string; ts: string };
  events: EventRow[];
}

export interface StopFailureSummary {
  error_type: string;
  message: string | null;
}

export interface TokenTotals {
  input: number;
  output: number;
  cached: number;
}

export interface ContextInfo {
  used: number;
  limit: number;
  remaining_pct: number;
}

export interface AgentContext {
  agent_id: string;
  agent_type: string;
  tokens: TokenTotals;
  context: ContextInfo | null;
}

export interface SessionSummary {
  tokens: TokenTotals | null;
  model: string | null;
  duration_ms: number;
  event_count: number;
  error_count: number;
  tool_mix: Array<{ name: string; count: number }>;
  stop_failure: StopFailureSummary | null;
  context: ContextInfo | null;
  agent_contexts: AgentContext[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function fetchSessions(window: WindowLabel): Promise<SessionsResponse> {
  return getJson<SessionsResponse>(`/api/sessions?window=${window}`);
}

export function fetchSession(
  id: string,
  window: WindowLabel,
): Promise<SessionDetailResponse> {
  return getJson<SessionDetailResponse>(
    `/api/sessions/${encodeURIComponent(id)}?window=${window}`,
  );
}

export function fetchSessionSummary(id: string): Promise<SessionSummary> {
  return getJson<SessionSummary>(
    `/api/sessions/${encodeURIComponent(id)}/summary`,
  );
}

export function fetchStats(): Promise<Stats> {
  return getJson<Stats>("/api/stats");
}

export function fetchPendingNotifications(): Promise<PendingNotification[]> {
  return getJson<PendingNotification[]>("/api/notifications/pending");
}

export async function clearAllEvents(): Promise<{ cleared: number }> {
  const res = await fetch("/api/admin/events", { method: "DELETE" });
  if (!res.ok) throw new Error(`clear: HTTP ${res.status}`);
  return (await res.json()) as { cleared: number };
}

export function fetchProjects(): Promise<ProjectRow[]> {
  return getJson<ProjectRow[]>("/api/projects");
}

export function fetchEventsPage(
  params: EventQueryParams = {},
): Promise<EventsResponse> {
  const qs = new URLSearchParams();
  if (params.eventTypes && params.eventTypes.length > 0) {
    qs.set("event", params.eventTypes.join(","));
  }
  if (params.q && params.q.length > 0) qs.set("q", params.q);
  if (params.sessionId) qs.set("session_id", params.sessionId);
  if (params.tool) qs.set("tool", params.tool);
  if (params.statusOnly) qs.set("status", params.statusOnly);
  if (params.before) qs.set("before", params.before);
  if (typeof params.limit === "number") {
    qs.set("limit", String(params.limit));
  }
  const search = qs.toString();
  return getJson<EventsResponse>(
    search.length > 0 ? `/api/events?${search}` : "/api/events",
  );
}
