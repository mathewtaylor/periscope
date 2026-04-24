<script setup lang="ts">
import { computed, ref } from "vue";
import type { EventRow } from "@/lib/types";
import { formatStartTimeSeconds } from "@/lib/time";

interface Props {
  events: readonly EventRow[];
}
const props = defineProps<Props>();

const EVENT_KINDS = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionDenied",
  "SubagentStart",
  "SubagentStop",
  "Notification",
  "Stop",
  "StopFailure",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
] as const;

const selected = ref<Set<string>>(new Set());

function toggle(kind: string): void {
  const next = new Set(selected.value);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  selected.value = next;
}

const searchInput = ref("");

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toolTargetShort(
  toolName: string | null,
  input: Record<string, unknown> | undefined,
): string {
  if (!toolName || !input) return "";
  switch (toolName) {
    case "Bash":
      return String(input.command ?? "");
    case "Edit":
    case "Write":
    case "Read": {
      const p = String(input.file_path ?? "");
      const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
      return idx >= 0 ? p.slice(idx + 1) : p;
    }
    case "Grep":
      return `"${String(input.pattern ?? "")}"`;
    case "WebFetch":
      try {
        return new URL(String(input.url ?? "")).hostname;
      } catch {
        return String(input.url ?? "");
      }
    default:
      return "";
  }
}

interface DisplayRow {
  id: number;
  ts: string;
  hhmmss: string;
  lane: string;
  laneTone: string;
  event: string;
  eventTone: string;
  verb: string;
  verbTone: string;
}

function displayFor(e: EventRow): DisplayRow {
  const lane = e.agent_id
    ? { label: e.agent_type || "sub", tone: "text-sub" }
    : { label: "main", tone: "text-fg-2" };
  const payload = parsePayload(e.payload);
  const input = payload?.tool_input as Record<string, unknown> | undefined;

  let verb = "";
  let verbTone = "text-fg-1";
  let eventTone = "text-fg-3";

  switch (e.event) {
    case "PreToolUse": {
      const target = toolTargetShort(e.tool_name, input);
      verb = `${e.tool_name ?? ""}${target ? " " + target : ""}`.trim();
      verbTone = "text-run";
      eventTone = "text-run";
      break;
    }
    case "PostToolUse":
      verb = `${e.tool_name ?? "tool"} done`;
      verbTone = "text-fg-2";
      break;
    case "PostToolUseFailure": {
      const err = typeof payload?.error === "string" ? payload.error : "error";
      verb = `${e.tool_name ?? "tool"} — ${err}`;
      verbTone = "text-err";
      eventTone = "text-err";
      break;
    }
    case "PermissionDenied":
      verb = `${e.tool_name ?? "tool"} denied by policy`;
      verbTone = "text-attn";
      eventTone = "text-attn";
      break;
    case "SubagentStart":
      verb = `spawn → ${e.agent_type ?? "sub"}`;
      verbTone = "text-sub";
      eventTone = "text-sub";
      break;
    case "SubagentStop":
      verb = `${e.agent_type ?? "sub"} returned`;
      verbTone = "text-ok";
      eventTone = "text-ok";
      break;
    case "Notification": {
      const t = typeof payload?.notification_type === "string"
        ? payload.notification_type : "notify";
      verb = t;
      verbTone = "text-attn";
      eventTone = "text-attn";
      break;
    }
    case "Stop": {
      const reason = typeof payload?.stop_reason === "string" ? payload.stop_reason : "";
      verb = reason ? `turn ended · ${reason}` : "turn ended";
      verbTone = "text-fg-2";
      break;
    }
    case "StopFailure": {
      const errType = typeof payload?.error_type === "string" ? payload.error_type : "error";
      verb = `stop failure · ${errType}`;
      verbTone = "text-err";
      eventTone = "text-err";
      break;
    }
    case "UserPromptSubmit":
      verb = typeof payload?.prompt === "string" ? payload.prompt : "user prompt";
      verbTone = "text-fg-1";
      break;
    case "SessionStart":
      verb = `session start · ${typeof payload?.source === "string" ? payload.source : "?"}`;
      verbTone = "text-fg-2";
      break;
    case "SessionEnd":
      verb = `session end · ${typeof payload?.reason === "string" ? payload.reason : "?"}`;
      verbTone = "text-fg-2";
      break;
    default:
      verb = e.event;
      verbTone = "text-fg-3";
  }

  return {
    id: e.id,
    ts: e.ts,
    hhmmss: formatStartTimeSeconds(e.ts),
    lane: lane.label,
    laneTone: lane.tone,
    event: e.event,
    eventTone,
    verb,
    verbTone,
  };
}

const rows = computed<DisplayRow[]>(() => {
  const q = searchInput.value.trim().toLowerCase();
  const active = selected.value;
  const list: DisplayRow[] = [];
  // Walk newest→oldest so the most recent row renders first.
  for (let i = props.events.length - 1; i >= 0; i--) {
    const e = props.events[i]!;
    if (active.size > 0 && !active.has(e.event)) continue;
    if (q && !e.payload.toLowerCase().includes(q)) continue;
    list.push(displayFor(e));
  }
  return list;
});

const summary = computed(
  () => `${rows.value.length} of ${props.events.length} events shown`,
);
</script>

<template>
  <div class="rounded-tile border border-line bg-bg-1">
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="kind in EVENT_KINDS"
          :key="kind"
          type="button"
          :class="[
            'rounded-full border px-2 py-0.5 font-mono text-[10.5px] transition-colors',
            selected.has(kind)
              ? 'border-line-2 bg-bg-2 text-fg'
              : 'border-line text-fg-2 hover:text-fg-1',
          ]"
          @click="toggle(kind)"
        >
          {{ kind }}
        </button>
      </div>
      <input
        v-model="searchInput"
        placeholder="search payload…"
        type="text"
        class="ml-auto w-[220px] rounded-chip border border-line bg-bg-2 px-2.5 py-1 font-mono text-[12px] text-fg focus:border-line-2 focus:outline-none"
        spellcheck="false"
      />
      <button
        v-if="selected.size > 0 || searchInput"
        type="button"
        class="rounded-chip px-2 py-1 font-mono text-[11.5px] text-fg-2 hover:text-fg-1"
        @click="selected = new Set(); searchInput = ''"
      >
        clear
      </button>
    </div>

    <div
      class="grid grid-cols-[80px_110px_80px_1fr] items-center border-b border-line px-4 py-2 font-mono uppercase tracking-[0.12em] text-[10.5px] text-fg-3"
    >
      <span>time</span>
      <span>event</span>
      <span>lane</span>
      <span>verb</span>
    </div>

    <ul class="max-h-[520px] divide-y divide-line overflow-auto font-mono text-[12px]">
      <li
        v-for="r in rows"
        :key="r.id"
        class="grid grid-cols-[80px_110px_80px_1fr] items-center px-4 py-1.5"
      >
        <span class="text-fg-3 tabular-nums">{{ r.hhmmss }}</span>
        <span :class="['truncate', r.eventTone]">{{ r.event }}</span>
        <span :class="['truncate', r.laneTone]">{{ r.lane }}</span>
        <span :class="['truncate', r.verbTone]">{{ r.verb }}</span>
      </li>
      <li
        v-if="rows.length === 0"
        class="px-4 py-10 text-center text-fg-3"
      >
        no events match the current filters
      </li>
    </ul>

    <div class="border-t border-line px-4 py-2 font-mono text-[11px] text-fg-3">
      {{ summary }}
    </div>
  </div>
</template>
