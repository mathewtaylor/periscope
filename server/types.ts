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

export interface InsertRow {
  event: string;
  session_id: string;
  agent_id: string | null;
  agent_type: string | null;
  tool_name: string | null;
  tool_use_id: string | null;
  cwd: string | null;
  payload: string;
}

export type HookPayload = Record<string, unknown> & {
  session_id?: string;
  hook_event_name?: string;
  cwd?: string;
  transcript_path?: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
};
