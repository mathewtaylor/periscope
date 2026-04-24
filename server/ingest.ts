import type { InsertRow, HookPayload } from "./types.ts";

const EVENT_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export class IngestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isValidEventName(name: string): boolean {
  return EVENT_NAME_RE.test(name);
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function extractColumns(eventName: string, rawBody: string): InsertRow {
  if (!isValidEventName(eventName)) {
    throw new IngestError(400, `invalid event name: ${eventName}`);
  }

  let parsed: HookPayload;
  try {
    parsed = JSON.parse(rawBody) as HookPayload;
  } catch {
    throw new IngestError(400, "invalid JSON body");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new IngestError(400, "payload must be an object");
  }

  const sessionId = asString(parsed.session_id);
  if (!sessionId) {
    throw new IngestError(400, "session_id is required");
  }

  if (parsed.hook_event_name && parsed.hook_event_name !== eventName) {
    console.warn(
      `[ingest] url event=${eventName} but payload.hook_event_name=${parsed.hook_event_name}; using url`,
    );
  }

  return {
    event: eventName,
    session_id: sessionId,
    agent_id: asString(parsed.agent_id),
    agent_type: asString(parsed.agent_type),
    tool_name: asString(parsed.tool_name),
    tool_use_id: asString(parsed.tool_use_id),
    cwd: asString(parsed.cwd),
    payload: rawBody,
  };
}
