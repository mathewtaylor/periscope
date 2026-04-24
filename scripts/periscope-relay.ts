#!/usr/bin/env bun
/**
 * Periscope client-side enrichment relay.
 *
 * Claude Code invokes this as a local `command` hook. It reads the raw hook
 * payload from stdin, enriches it with local-only context (machine info, git
 * metadata, token totals from the transcript), and POSTs the enriched JSON
 * to the Periscope collector.
 *
 * Contract:
 *   - Never blocks Claude Code: always exits 0, nothing written to stdout
 *     except optionally `{}`. Diagnostics go to stderr with a
 *     `[periscope-relay]` prefix.
 *   - Enrichment is purely additive — original payload fields are untouched.
 *   - POST target: `${PERISCOPE_URL ?? "http://localhost:5050"}/hook/<event>`.
 *   - POST is capped at 3 s via AbortSignal.timeout.
 *
 * Usage (in ~/.claude/settings.json):
 *   { "type": "command", "command": "bun /abs/path/periscope-relay.ts" }
 */

import os from "node:os";

type Json = Record<string, unknown>;

interface TokenTotals {
  input: number;
  output: number;
  cached: number;
}

// Snapshot of the latest assistant message's usage. The sum of these three
// is the actual context-window occupancy at that turn, because Claude only
// includes what's in the active window in each request. This handles
// /clear and /compact naturally — the next message will report a small
// value without needing to parse clear markers.
interface ContextTokens {
  input: number;
  cache_read: number;
  cache_creation: number;
}

interface TranscriptDigest {
  tokens: TokenTotals | null;         // cumulative across the whole transcript
  context_tokens: ContextTokens | null; // latest assistant message only
  model: string | null;                  // most recent assistant-message model
}

const RELAY_TAG = "[periscope-relay]";

function logErr(msg: string): void {
  try {
    process.stderr.write(`${RELAY_TAG} ${msg}\n`);
  } catch {
    // If even stderr is unavailable, there's nothing we can do. Stay silent.
  }
}

async function readStdin(): Promise<string> {
  try {
    return await Bun.stdin.text();
  } catch (err) {
    logErr(`failed to read stdin: ${(err as Error).message}`);
    return "";
  }
}

function parsePayload(raw: string): Json | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Json;
    }
    logErr("stdin payload is not a JSON object");
    return null;
  } catch (err) {
    logErr(`invalid JSON on stdin: ${(err as Error).message}`);
    return null;
  }
}

function getMachineInfo(): Json {
  const user =
    process.env["USER"] ??
    process.env["USERNAME"] ??
    process.env["LOGNAME"] ??
    "";
  return {
    host: os.hostname(),
    platform: process.platform,
    user,
  };
}

/**
 * Run `git` with `-C <cwd>` using Bun.spawn so we never pass `cwd` through a
 * shell. Returns the trimmed stdout on success, or null on any error / timeout.
 */
async function gitCmd(
  cwd: string,
  args: string[],
  timeoutMs: number,
): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "-C", cwd, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    const exitCode = await proc.exited;
    clearTimeout(timer);

    if (timedOut) return null;
    if (exitCode !== 0) return null;

    const out = await new Response(proc.stdout).text();
    return out;
  } catch {
    return null;
  }
}

async function getGitInfo(cwd: unknown): Promise<Json | null> {
  if (typeof cwd !== "string" || !cwd) return null;

  // Hard cap: all git calls for this event must finish in under ~500ms total.
  const started = Date.now();
  const remaining = () => Math.max(0, 500 - (Date.now() - started));

  // First, confirm we're actually inside a work tree.
  const inside = await gitCmd(
    cwd,
    ["rev-parse", "--is-inside-work-tree"],
    remaining(),
  );
  if (!inside || inside.trim() !== "true") return null;

  if (remaining() <= 0) return null;
  const branchRaw = await gitCmd(
    cwd,
    ["rev-parse", "--abbrev-ref", "HEAD"],
    remaining(),
  );
  if (branchRaw === null) return null;

  if (remaining() <= 0) return null;
  const commitRaw = await gitCmd(cwd, ["rev-parse", "HEAD"], remaining());
  if (commitRaw === null) return null;

  if (remaining() <= 0) return null;
  const statusRaw = await gitCmd(
    cwd,
    ["status", "--porcelain"],
    remaining(),
  );
  if (statusRaw === null) return null;

  const branch = branchRaw.trim();
  const commit = commitRaw.trim().slice(0, 7);
  if (!commit) return null;

  return {
    branch,
    commit,
    dirty: statusRaw.trim().length > 0,
  };
}

/**
 * Parse a JSONL transcript and digest it: sum usage across all lines and
 * return the most recently seen assistant-message `model`. Supports both
 * Anthropic-style (`line.message.usage` / `line.message.model`) and flat
 * (`line.usage` / `line.model`) layouts. Missing pieces surface as null so
 * callers can compose (model without tokens, tokens without model, both).
 */
async function digestTranscript(path: unknown): Promise<TranscriptDigest> {
  const empty: TranscriptDigest = {
    tokens: null,
    context_tokens: null,
    model: null,
  };
  if (typeof path !== "string" || !path) return empty;

  let file: ReturnType<typeof Bun.file>;
  try {
    file = Bun.file(path);
    if (!(await file.exists())) return empty;
  } catch {
    return empty;
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return empty;
  }

  let input = 0;
  let output = 0;
  let cached = 0;
  let foundUsage = false;
  let latestModel: string | null = null;
  let latestAssistantUsage: ContextTokens | null = null;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== "object") continue;

    const root = obj as Json;
    const msg = root["message"];
    const msgObj = msg && typeof msg === "object" ? (msg as Json) : null;

    // model — assistant messages carry it; scan every line, keep the latest.
    const modelCandidate = msgObj?.["model"] ?? root["model"];
    if (typeof modelCandidate === "string" && modelCandidate.length > 0) {
      latestModel = modelCandidate;
    }

    // usage — may be nested under message.usage or at the root.
    const messageUsage = msgObj ? (msgObj["usage"] as unknown) : undefined;
    const rootUsage = root["usage"] as unknown;
    const usage = messageUsage ?? rootUsage;
    if (!usage || typeof usage !== "object") continue;

    const u = usage as Json;
    const inTok = Number(u["input_tokens"] ?? 0);
    const outTok = Number(u["output_tokens"] ?? 0);
    const cacheRead = Number(u["cache_read_input_tokens"] ?? 0);
    const cacheCreate = Number(u["cache_creation_input_tokens"] ?? 0);

    if (Number.isFinite(inTok)) input += inTok;
    if (Number.isFinite(outTok)) output += outTok;
    if (Number.isFinite(cacheRead)) cached += cacheRead;
    if (Number.isFinite(cacheCreate)) cached += cacheCreate;
    foundUsage = true;

    // Track only assistant-message usage for context-window occupancy.
    // Claude's API includes the whole active window in each request, so the
    // latest assistant turn's input + cache_* is the current occupancy.
    const role =
      typeof msgObj?.["role"] === "string" ? (msgObj["role"] as string) : null;
    const isAssistant = role === "assistant" || root["type"] === "assistant";
    if (isAssistant) {
      latestAssistantUsage = {
        input: Number.isFinite(inTok) ? inTok : 0,
        cache_read: Number.isFinite(cacheRead) ? cacheRead : 0,
        cache_creation: Number.isFinite(cacheCreate) ? cacheCreate : 0,
      };
    }
  }

  return {
    tokens: foundUsage ? { input, output, cached } : null,
    context_tokens: latestAssistantUsage,
    model: latestModel,
  };
}

async function postEnriched(
  baseUrl: string,
  event: string,
  body: Json,
): Promise<void> {
  const url = `${baseUrl.replace(/\/+$/, "")}/hook/${encodeURIComponent(
    event,
  )}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      logErr(`collector responded ${res.status} for ${event}`);
    }
    // Drain response body to free the socket.
    try {
      await res.text();
    } catch {
      /* ignore */
    }
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "TimeoutError" || name === "AbortError") {
      logErr(`POST timed out after 3s (${event})`);
    } else {
      logErr(`POST failed (${event}): ${(err as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const payload = parsePayload(raw);
  if (!payload) {
    // Nothing to relay. Still exit 0 so we never block Claude.
    process.exit(0);
  }

  const eventRaw = payload["hook_event_name"];
  const event =
    typeof eventRaw === "string" && eventRaw.length > 0 ? eventRaw : "Unknown";

  // Kick off enrichment concurrently; each resolves to null/undefined on miss.
  const [gitInfo, mainDigest, agentDigest] = await Promise.all([
    getGitInfo(payload["cwd"]),
    digestTranscript(payload["transcript_path"]),
    digestTranscript(payload["agent_transcript_path"]),
  ]);

  const enriched: Json = {
    ...payload,
    machine: getMachineInfo(),
    enriched_by: "periscope-relay",
    enriched_at: new Date().toISOString(),
  };

  if (mainDigest.tokens) enriched["tokens"] = mainDigest.tokens;
  if (mainDigest.context_tokens)
    enriched["context_tokens"] = mainDigest.context_tokens;
  if (agentDigest.tokens) enriched["agent_tokens"] = agentDigest.tokens;
  if (agentDigest.context_tokens)
    enriched["agent_context_tokens"] = agentDigest.context_tokens;
  if (gitInfo) enriched["git"] = gitInfo;

  // Surface `model` at the payload root if Claude Code didn't include it
  // (e.g. SessionStart on `source: resume` often omits it). Do not overwrite
  // a model the hook provided — that's always authoritative.
  if (
    mainDigest.model &&
    (typeof enriched["model"] !== "string" || enriched["model"].length === 0)
  ) {
    enriched["model"] = mainDigest.model;
  }

  const baseUrl = process.env["PERISCOPE_URL"] ?? "http://localhost:5050";
  await postEnriched(baseUrl, event, enriched);

  // Output contract: nothing on stdout. Claude Code treats empty stdout as
  // "no opinion", which is exactly what we want.
  process.exit(0);
}

try {
  await main();
} catch (err) {
  logErr(`unhandled: ${(err as Error).message}`);
  process.exit(0);
}
