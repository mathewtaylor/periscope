#!/usr/bin/env bun
/**
 * Seed the Periscope collector with a synthetic multi-session workload so the
 * dashboard has something interesting to render without needing a live Claude
 * Code run.
 *
 * Usage:
 *   bun run scripts/seed.ts                     # hits http://localhost:5050
 *   HOST=http://192.168.1.5:5050 bun run scripts/seed.ts
 *
 * Flags:
 *   --reset   delete existing events before seeding (dev only)
 */

const HOST = process.env.HOST ?? "http://localhost:5050";

interface HookBody {
  session_id: string;
  hook_event_name: string;
  cwd: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  [key: string]: unknown;
}

async function post(event: string, body: HookBody): Promise<void> {
  const res = await fetch(`${HOST}/hook/${event}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /hook/${event} → ${res.status}: ${text}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

async function seedRunning(): Promise<void> {
  const sessionId = rid("luma-console");
  const cwd = "/home/mathe/work/luma/console";
  await post("SessionStart", {
    session_id: sessionId,
    hook_event_name: "SessionStart",
    cwd,
    source: "startup",
    model: "claude-sonnet-4-6",
  });
  await post("UserPromptSubmit", {
    session_id: sessionId,
    hook_event_name: "UserPromptSubmit",
    cwd,
    prompt: "refactor the ClientList to use the new query hook",
  });
  for (let i = 0; i < 8; i++) {
    const useId = rid("toolu");
    await post("PreToolUse", {
      session_id: sessionId,
      hook_event_name: "PreToolUse",
      cwd,
      tool_name: i % 2 === 0 ? "Read" : "Edit",
      tool_use_id: useId,
      tool_input: { file_path: `${cwd}/src/components/ClientList.tsx` },
    });
    await sleep(30);
    await post("PostToolUse", {
      session_id: sessionId,
      hook_event_name: "PostToolUse",
      cwd,
      tool_name: i % 2 === 0 ? "Read" : "Edit",
      tool_use_id: useId,
      tool_input: { file_path: `${cwd}/src/components/ClientList.tsx` },
      tool_response: {},
    });
  }
  // Leave one tool in flight for the "running" state
  await post("PreToolUse", {
    session_id: sessionId,
    hook_event_name: "PreToolUse",
    cwd,
    tool_name: "Edit",
    tool_use_id: rid("toolu"),
    tool_input: { file_path: `${cwd}/src/components/ClientList.tsx` },
  });
}

async function seedWait(): Promise<void> {
  const sessionId = rid("periscope");
  const cwd = "/home/mathe/work/periscope";
  await post("SessionStart", {
    session_id: sessionId,
    hook_event_name: "SessionStart",
    cwd,
    source: "startup",
    model: "claude-opus-4-7",
  });
  await post("UserPromptSubmit", {
    session_id: sessionId,
    hook_event_name: "UserPromptSubmit",
    cwd,
    prompt: "add WAL mode to the SQLite setup and rebuild the image",
  });
  const useId = rid("toolu");
  await post("PreToolUse", {
    session_id: sessionId,
    hook_event_name: "PreToolUse",
    cwd,
    tool_name: "Bash",
    tool_use_id: useId,
    tool_input: { command: "docker compose up" },
  });
  await post("Notification", {
    session_id: sessionId,
    hook_event_name: "Notification",
    cwd,
    notification_type: "permission_prompt",
    message: "approve Bash",
  });
}

async function seedSub(): Promise<void> {
  const sessionId = rid("blazor-blueprint");
  const cwd = "/home/mathe/work/blazor-blueprint";
  await post("SessionStart", {
    session_id: sessionId,
    hook_event_name: "SessionStart",
    cwd,
    source: "startup",
    model: "claude-sonnet-4-6",
  });
  await post("UserPromptSubmit", {
    session_id: sessionId,
    hook_event_name: "UserPromptSubmit",
    cwd,
    prompt:
      "investigate why the /hook/PreToolUse endpoint is returning 500s — check deploys, replay failing event, propose a fix",
  });
  const subs = [
    {
      id: rid("agt"),
      type: "builder",
      description: "Rebuild ingest route to handle 500s",
      prompt:
        "The /hook/PreToolUse endpoint started returning 500s after the rate-limit middleware change. Read server/routes/hooks.ts and propose a patch that preserves rate limiting but stops failing closed when the limiter rejects.",
    },
    {
      id: rid("agt"),
      type: "validator",
      description: "Replay failing event payloads in tests",
      prompt:
        "Take the failing payload captured in docs/incidents/2026-04-23.json and write a Bun test that reproduces the 500. Confirm the fix from the builder agent makes it green.",
    },
    {
      id: rid("agt"),
      type: "researcher",
      description: "Survey rate-limit middlewares for Hono",
      prompt:
        "Scan the Hono ecosystem for rate-limit middlewares that fail open instead of closed. Summarise tradeoffs in 6 bullets.",
    },
  ];
  // one done
  const doneId = rid("agt");
  await post("PreToolUse", {
    session_id: sessionId,
    hook_event_name: "PreToolUse",
    cwd,
    tool_name: "Task",
    tool_use_id: doneId,
    tool_input: {
      subagent_type: "test-writer",
      description: "Add regression test for ingest 500",
      prompt:
        "Add a Bun test under server/routes/hooks.test.ts that POSTs the broken payload and asserts a 200 response.",
    },
  });
  await post("SubagentStart", {
    session_id: sessionId,
    hook_event_name: "SubagentStart",
    cwd,
    agent_id: doneId,
    agent_type: "test-writer",
    tool_use_id: doneId,
  });
  for (let i = 0; i < 4; i++) {
    const t = rid("toolu");
    await post("PreToolUse", {
      session_id: sessionId,
      hook_event_name: "PreToolUse",
      cwd,
      agent_id: doneId,
      agent_type: "test-writer",
      tool_name: "Read",
      tool_use_id: t,
      tool_input: { file_path: `${cwd}/tests/Pre.cs` },
    });
    await post("PostToolUse", {
      session_id: sessionId,
      hook_event_name: "PostToolUse",
      cwd,
      agent_id: doneId,
      agent_type: "test-writer",
      tool_name: "Read",
      tool_use_id: t,
      tool_input: { file_path: `${cwd}/tests/Pre.cs` },
      tool_response: {},
    });
  }
  await post("SubagentStop", {
    session_id: sessionId,
    hook_event_name: "SubagentStop",
    cwd,
    agent_id: doneId,
    agent_type: "test-writer",
  });

  for (const sub of subs) {
    await post("PreToolUse", {
      session_id: sessionId,
      hook_event_name: "PreToolUse",
      cwd,
      tool_name: "Task",
      tool_use_id: sub.id,
      tool_input: {
        subagent_type: sub.type,
        description: sub.description,
        prompt: sub.prompt,
      },
    });
    await post("SubagentStart", {
      session_id: sessionId,
      hook_event_name: "SubagentStart",
      cwd,
      agent_id: sub.id,
      agent_type: sub.type,
      tool_use_id: sub.id,
    });
    for (let i = 0; i < 6; i++) {
      const t = rid("toolu");
      await post("PreToolUse", {
        session_id: sessionId,
        hook_event_name: "PreToolUse",
        cwd,
        agent_id: sub.id,
        agent_type: sub.type,
        tool_name: i === 3 && sub.type === "validator" ? "Bash" : "Read",
        tool_use_id: t,
        tool_input: { command: "dotnet test" },
      });
      if (i === 3 && sub.type === "validator") {
        await post("PostToolUseFailure", {
          session_id: sessionId,
          hook_event_name: "PostToolUseFailure",
          cwd,
          agent_id: sub.id,
          agent_type: sub.type,
          tool_name: "Bash",
          tool_use_id: t,
          tool_input: { command: "dotnet test" },
          error: "Command exited with non-zero status code 1",
        });
      } else {
        await post("PostToolUse", {
          session_id: sessionId,
          hook_event_name: "PostToolUse",
          cwd,
          agent_id: sub.id,
          agent_type: sub.type,
          tool_name: "Read",
          tool_use_id: t,
          tool_input: { command: "dotnet test" },
          tool_response: {},
        });
      }
    }
  }
}

async function seedIdle(): Promise<void> {
  const sessionId = rid("luma-api");
  const cwd = "/home/mathe/work/luma/api";
  await post("SessionStart", {
    session_id: sessionId,
    hook_event_name: "SessionStart",
    cwd,
    source: "startup",
    model: "claude-sonnet-4-6",
  });
  for (let i = 0; i < 20; i++) {
    const useId = rid("toolu");
    await post("PreToolUse", {
      session_id: sessionId,
      hook_event_name: "PreToolUse",
      cwd,
      tool_name: "Read",
      tool_use_id: useId,
      tool_input: { file_path: `${cwd}/package.json` },
    });
    await post("PostToolUse", {
      session_id: sessionId,
      hook_event_name: "PostToolUse",
      cwd,
      tool_name: "Read",
      tool_use_id: useId,
      tool_input: { file_path: `${cwd}/package.json` },
      tool_response: {},
    });
  }
}

async function seedStopped(): Promise<void> {
  const sessionId = rid("notes");
  const cwd = "/home/mathe/notes";
  await post("SessionStart", {
    session_id: sessionId,
    hook_event_name: "SessionStart",
    cwd,
    source: "startup",
    model: "claude-sonnet-4-6",
  });
  for (let i = 0; i < 5; i++) {
    const useId = rid("toolu");
    await post("PreToolUse", {
      session_id: sessionId,
      hook_event_name: "PreToolUse",
      cwd,
      tool_name: "Write",
      tool_use_id: useId,
      tool_input: { file_path: `${cwd}/daily/2026-04-24.md` },
    });
    await post("PostToolUse", {
      session_id: sessionId,
      hook_event_name: "PostToolUse",
      cwd,
      tool_name: "Write",
      tool_use_id: useId,
      tool_input: { file_path: `${cwd}/daily/2026-04-24.md` },
      tool_response: {},
    });
  }
  await post("SessionEnd", {
    session_id: sessionId,
    hook_event_name: "SessionEnd",
    cwd,
    reason: "other",
  });
}

async function seedStoppedError(): Promise<void> {
  const sessionId = rid("periscope-dead");
  const cwd = "/home/mathe/work/periscope";
  await post("SessionStart", {
    session_id: sessionId,
    hook_event_name: "SessionStart",
    cwd,
    source: "startup",
    model: "claude-sonnet-4-6",
  });
  const useId = rid("toolu");
  await post("PreToolUse", {
    session_id: sessionId,
    hook_event_name: "PreToolUse",
    cwd,
    tool_name: "Bash",
    tool_use_id: useId,
    tool_input: { command: "sqlite3 events.db '.tables'" },
  });
  await post("PostToolUseFailure", {
    session_id: sessionId,
    hook_event_name: "PostToolUseFailure",
    cwd,
    tool_name: "Bash",
    tool_use_id: useId,
    tool_input: { command: "sqlite3 events.db '.tables'" },
    error: "exit 1 — sqlite3: disk I/O error (code 10)",
  });
  await post("SessionEnd", {
    session_id: sessionId,
    hook_event_name: "SessionEnd",
    cwd,
    reason: "other",
  });
}

async function main(): Promise<void> {
  console.log(`[seed] target: ${HOST}`);
  try {
    await fetch(`${HOST}/health`);
  } catch (err) {
    console.error(`[seed] cannot reach ${HOST}: ${(err as Error).message}`);
    process.exit(1);
  }

  await seedIdle();
  await seedStopped();
  await seedStoppedError();
  await seedRunning();
  await seedSub();
  await seedWait();
  console.log("[seed] done — open the dashboard");
}

void main();
