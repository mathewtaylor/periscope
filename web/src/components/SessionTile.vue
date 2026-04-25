<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type {
  ActiveSubagent,
  ActiveTool,
  LastTool,
  SessionRow,
} from "@/lib/types";
import { ageFromNow, formatDurationShort, formatStartTime } from "@/lib/time";
import BreathingDot from "./ui/BreathingDot.vue";
import Sparkline from "./Sparkline.vue";

interface Props {
  session: SessionRow;
  now: number;
}
const props = defineProps<Props>();

const s = computed(() => props.session);

const topEdgeClass = computed(() => {
  switch (s.value.state) {
    case "running":
      return "border-t-run";
    case "sub":
      return "border-t-sub";
    case "wait":
      return "border-t-attn";
    default:
      return "";
  }
});

const opacity = computed(() =>
  s.value.state === "idle" ? "opacity-[0.72]" : "",
);

const badgeClass = computed(() => {
  switch (s.value.state) {
    case "running":
      return "text-run";
    case "sub":
      return "text-sub";
    case "wait":
      return "text-attn";
    default:
      return "text-fg-2";
  }
});

const badgeText = computed(() => {
  const elapsed = (iso: string) =>
    formatDurationShort(props.now - new Date(iso).getTime());
  switch (s.value.state) {
    case "running":
      if (s.value.active_tool) {
        return `tool · ${elapsed(s.value.active_tool.started_at)}`;
      }
      return "tool";
    case "sub":
      return `${s.value.active_subagents.length} sub${
        s.value.active_subagents.length === 1 ? "" : "s"
      } · main idle`;
    case "wait":
      if (s.value.active_tool) {
        return `blocked · ${elapsed(s.value.active_tool.started_at)}`;
      }
      return "blocked";
    case "idle":
      return `idle · ${elapsed(s.value.last_event_at)}`;
    default:
      return s.value.state;
  }
});

interface ThreadRow {
  key: string;
  kind: "main" | "sub";
  label: string;
  labelTone: string;
  state: "running" | "wait" | "idle";
  tool: ActiveTool | LastTool | null;
  isLive: boolean;
  toolStartedAt: string | null;
  startedAt: string;
  dotTone: "run" | "sub" | "attn" | "fg-3";
  dotBreathing: boolean;
}

const mainTool = computed<ActiveTool | LastTool | null>(() => {
  switch (s.value.state) {
    case "running":
    case "wait":
      return s.value.active_tool ?? null;
    case "sub":
      // Main thread is dormant while subagents run — don't echo a stale
      // tool target; the subagent rows below carry the live activity.
      return null;
    case "idle":
    case "stopped":
    case "error":
      return s.value.last_tool ?? null;
    default:
      return s.value.active_tool ?? s.value.last_tool ?? null;
  }
});

const threads = computed<ThreadRow[]>(() => {
  const rows: ThreadRow[] = [];

  let mainState: ThreadRow["state"] = "idle";
  let dotTone: ThreadRow["dotTone"] = "fg-3";
  let dotBreathing = false;
  if (s.value.state === "running") {
    mainState = "running";
    dotTone = "run";
    dotBreathing = true;
  } else if (s.value.state === "wait") {
    mainState = "wait";
    dotTone = "attn";
    dotBreathing = true;
  }

  rows.push({
    key: "main",
    kind: "main",
    label: "main",
    labelTone: mainState === "idle" ? "text-fg-2" : "text-fg-1",
    state: mainState,
    tool: mainTool.value,
    isLive: s.value.active_tool != null,
    toolStartedAt: s.value.active_tool?.started_at ?? null,
    startedAt: s.value.started_at,
    dotTone,
    dotBreathing,
  });

  for (const sub of s.value.active_subagents) {
    rows.push(buildSubRow(sub));
  }
  return rows;
});

function buildSubRow(sub: ActiveSubagent): ThreadRow {
  const live = sub.active_tool != null;
  const tool = sub.active_tool ?? sub.last_tool ?? null;
  const label =
    sub.description ??
    sub.subagent_type ??
    sub.agent_type ??
    "subagent";
  return {
    key: sub.agent_id,
    kind: "sub",
    label,
    labelTone: "text-sub",
    state: live ? "running" : "idle",
    tool,
    isLive: live,
    toolStartedAt: sub.active_tool?.started_at ?? null,
    startedAt: sub.started_at,
    dotTone: live ? "sub" : "fg-3",
    dotBreathing: live,
  };
}

function rowAge(row: ThreadRow): string {
  const iso = row.toolStartedAt ?? row.startedAt;
  return ageFromNow(iso, props.now);
}

function rowToolNameTone(row: ThreadRow): string {
  if (row.kind === "main") {
    if (row.state === "running") return "text-run";
    if (row.state === "wait") return "text-attn";
    return "text-fg-2";
  }
  return row.state === "running" ? "text-sub" : "text-fg-2";
}

function rowToolTargetTone(row: ThreadRow): string {
  return row.state === "idle" ? "text-fg-2" : "text-fg-1";
}

function rowIdleLabel(row: ThreadRow): string {
  if (row.kind === "main") {
    if (s.value.state === "wait") return "awaiting approval";
    if (s.value.state === "sub") return "idle · subagents running";
    return "idle";
  }
  return "idle";
}

const duration = computed(() => formatDurationShort(s.value.duration_ms));
const eventsDisplay = computed(() => s.value.event_count.toLocaleString());

const waitGradient = computed(() =>
  s.value.state === "wait"
    ? "background: linear-gradient(180deg, rgba(227,177,85,0.06) 0%, #111317 40%);"
    : "",
);

const cwdDisplay = computed(() => {
  const c = s.value.cwd;
  if (!c) return "";
  const home = /^\/c?\/users\/([^/]+)\//i.exec(c);
  if (home) return `~/${c.slice(home[0].length)}`;
  return c;
});

const modelShort = computed(() => {
  const m = s.value.model;
  if (!m) return "";
  return m.startsWith("claude-") ? m.slice("claude-".length) : m;
});

const permissionModeTone = computed(() => {
  switch (s.value.permission_mode) {
    case "plan":
      return "text-sub";
    case "acceptEdits":
      return "text-run";
    case "auto":
    case "dontAsk":
    case "bypassPermissions":
      return "text-attn";
    default:
      return "text-fg-2";
  }
});

const startedTitle = computed(() => {
  const src = s.value.source;
  if (src && src !== "startup") return `started via ${src}`;
  return undefined;
});
</script>

<template>
  <RouterLink
    :to="`/sessions/${encodeURIComponent(s.session_id)}`"
    :class="[
      'group block rounded-tile border border-line bg-bg-1 p-4 transition-colors duration-150 hover:border-line-2 hover:bg-bg-2 focus:outline-none focus:ring-1 focus:ring-line-2',
      topEdgeClass,
      opacity,
    ]"
    :style="waitGradient"
    :data-state="s.state"
  >
    <header class="flex items-start justify-between gap-2">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h3
            :class="[
              'font-mono text-[13.5px] leading-none truncate',
              s.state === 'idle' ? 'text-fg-1' : 'text-fg',
            ]"
          >
            {{ s.project }}
          </h3>
          <span
            v-if="modelShort"
            class="font-mono text-[11px] text-fg-3 truncate"
          >
            {{ modelShort }}
          </span>
          <span
            v-if="s.git && s.git.branch"
            class="font-mono text-[10.5px] px-1.5 py-0.5 rounded-chip border border-line text-fg-2 whitespace-nowrap"
          >
            ⎇ {{ s.git.branch
            }}<span v-if="s.git.dirty" class="text-attn"> ●</span>
          </span>
        </div>
        <p class="mt-0.5 font-mono text-[11px] text-fg-3 truncate">
          {{ cwdDisplay }}
        </p>
      </div>
      <div class="flex flex-col items-end gap-0.5 shrink-0">
        <span
          v-if="s.permission_mode"
          :class="[
            'font-mono uppercase tracking-[0.12em] text-[10.5px] whitespace-nowrap',
            permissionModeTone,
          ]"
        >
          {{ s.permission_mode }}
        </span>
        <span
          :class="['font-mono text-[11px] whitespace-nowrap', badgeClass]"
        >
          {{ badgeText }}
        </span>
      </div>
    </header>

    <div
      class="mt-3 font-mono uppercase tracking-[0.12em] text-[10.5px] text-fg-3"
    >
      threads
    </div>
    <ul class="mt-1.5 space-y-1.5">
      <li
        v-for="row in threads"
        :key="row.key"
        class="flex items-start gap-2 text-[12.5px] leading-snug"
      >
        <span class="pt-[5px]">
          <BreathingDot
            :tone="row.dotTone"
            :breathing="row.dotBreathing"
            :size="6"
          />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <span
              :class="[
                'font-mono truncate',
                row.labelTone,
              ]"
              :title="row.label"
            >
              <span v-if="row.kind === 'sub'" class="text-fg-3">└─ </span>{{ row.label }}
            </span>
            <span class="font-mono text-[10.5px] text-fg-3 whitespace-nowrap">
              {{ rowAge(row) }}
            </span>
          </div>
          <div
            v-if="row.tool"
            class="mt-0.5 flex items-baseline gap-1.5 text-[12px]"
          >
            <span
              :class="['font-mono', rowToolNameTone(row)]"
            >
              {{ row.tool.name }}
            </span>
            <span
              :class="['font-mono truncate', rowToolTargetTone(row)]"
              :title="row.tool.target"
            >
              {{ row.tool.target || "—" }}
            </span>
          </div>
          <div v-else class="mt-0.5 font-mono text-[12px] text-fg-3">
            {{ rowIdleLabel(row) }}
          </div>
        </div>
      </li>
    </ul>

    <Sparkline class="mt-3" :bins="s.sparkline" />

    <footer
      class="mt-3 flex items-center justify-between font-mono text-[11px] text-fg-3"
    >
      <span :title="startedTitle"
        >started {{ formatStartTime(s.started_at) }} · {{ duration }}</span
      >
      <span>{{ eventsDisplay }} ev</span>
    </footer>
  </RouterLink>
</template>

<style scoped>
a {
  /* hover interactions animate fast; top-edge state transitions crossfade slowly */
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    border-top-color 300ms ease;
}
a[data-state="running"] {
  border-top-color: theme("colors.run");
}
a[data-state="sub"] {
  border-top-color: theme("colors.sub");
}
a[data-state="wait"] {
  border-top-color: theme("colors.attn");
}
</style>
