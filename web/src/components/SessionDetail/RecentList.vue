<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { EventRow } from "@/lib/types";
import { formatMmSs } from "@/lib/time";
import BreathingDot from "../ui/BreathingDot.vue";

interface Props {
  events: readonly EventRow[];
  follow: boolean;
}
const props = defineProps<Props>();

interface DisplayRow {
  id: number;
  ts: string;
  laneLabel: string;
  laneTone: string;
  verb: string;
  verbTone: string;
}

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function displayFor(e: EventRow): DisplayRow | null {
  const lane = e.agent_id
    ? { label: e.agent_type || "sub", tone: "text-sub" }
    : { label: "main", tone: "text-fg-2" };
  const payload = parsePayload(e.payload);
  const input = payload?.tool_input as Record<string, unknown> | undefined;

  let verb = "";
  let verbTone = "text-fg-1";

  switch (e.event) {
    case "PreToolUse": {
      const target = toolTargetShort(e.tool_name, input);
      verb = `${e.tool_name ?? ""} ${target}`.trim();
      verbTone = "text-run";
      break;
    }
    case "PostToolUse":
      return null; // suppress — covered by PreToolUse
    case "PostToolUseFailure": {
      const err = typeof payload?.error === "string" ? payload.error : "error";
      verb = `${e.tool_name ?? "tool"} — ${err}`;
      verbTone = "text-err";
      break;
    }
    case "SubagentStart":
      verb = `spawn → ${e.agent_type ?? "sub"}`;
      verbTone = "text-sub";
      break;
    case "SubagentStop":
      verb = `${e.agent_type ?? "sub"} returned`;
      verbTone = "text-ok";
      break;
    case "Notification": {
      const t = typeof payload?.notification_type === "string" ? payload.notification_type : "notify";
      verb = t;
      verbTone = "text-attn";
      break;
    }
    case "UserPromptSubmit":
      verb = "user prompt";
      verbTone = "text-fg-1";
      break;
    case "SessionStart":
      verb = "session start";
      verbTone = "text-fg-2";
      break;
    case "SessionEnd":
      verb = "session end";
      verbTone = "text-fg-2";
      break;
    case "Stop": {
      const reason =
        typeof payload?.stop_reason === "string" ? payload.stop_reason : "";
      if (reason === "tool_use") return null; // too noisy
      if (reason === "max_tokens") {
        verb = "turn ended · context limit";
        verbTone = "text-attn";
      } else {
        verb = `turn ended${reason ? ` · ${reason}` : ""}`;
        verbTone = "text-fg-2";
      }
      break;
    }
    case "PermissionDenied": {
      verb = `${e.tool_name ?? "tool"} denied by policy`;
      verbTone = "text-attn";
      break;
    }
    default:
      verb = e.event;
      verbTone = "text-fg-3";
  }

  return {
    id: e.id,
    ts: e.ts,
    laneLabel: lane.label,
    laneTone: lane.tone,
    verb,
    verbTone,
  };
}

function toolTargetShort(
  toolName: string | null,
  input: Record<string, unknown> | undefined,
): string {
  if (!toolName || !input) return "";
  const t = input as Record<string, unknown>;
  switch (toolName) {
    case "Bash":
      return String(t.command ?? "");
    case "Edit":
    case "Write":
    case "Read": {
      const p = String(t.file_path ?? "");
      const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
      return idx >= 0 ? p.slice(idx + 1) : p;
    }
    case "Grep":
      return `"${String(t.pattern ?? "")}"`;
    case "WebFetch":
      try {
        return new URL(String(t.url ?? "")).hostname;
      } catch {
        return String(t.url ?? "");
      }
    default:
      return "";
  }
}

const rows = computed<DisplayRow[]>(() => {
  const out: DisplayRow[] = [];
  for (let i = props.events.length - 1; i >= 0 && out.length < 40; i--) {
    const e = props.events[i];
    if (!e) continue;
    const row = displayFor(e);
    if (row) out.push(row);
  }
  return out;
});

const scroller = ref<HTMLElement | null>(null);

watch(
  () => props.events.length,
  async () => {
    if (!props.follow) return;
    await nextTick();
    if (scroller.value) scroller.value.scrollTop = 0;
  },
);
</script>

<template>
  <div class="rounded-tile border border-line bg-bg-1">
    <div class="flex items-center justify-between border-b border-line px-4 py-2.5">
      <div class="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-3">
        recent
      </div>
      <span class="inline-flex items-center gap-1 font-mono text-[11px] text-run">
        <BreathingDot tone="run" />live
      </span>
    </div>
    <ul
      ref="scroller"
      class="max-h-[320px] divide-y divide-line overflow-auto font-mono text-[12px]"
    >
      <li
        v-for="r in rows"
        :key="r.id"
        class="flex animate-slide-up gap-2 px-3 py-1.5"
      >
        <span class="text-fg-3 tabular-nums">{{ formatMmSs(r.ts) }}</span>
        <span :class="['w-16 truncate', r.laneTone]">{{ r.laneLabel }}</span>
        <span :class="['truncate', r.verbTone]">{{ r.verb }}</span>
      </li>
      <li
        v-if="rows.length === 0"
        class="px-3 py-6 text-center text-fg-3"
      >
        waiting for events…
      </li>
    </ul>
  </div>
</template>
