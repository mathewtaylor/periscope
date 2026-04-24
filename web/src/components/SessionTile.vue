<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type { SessionRow } from "@/lib/types";
import {
  formatDurationShort,
  formatStartTime,
} from "@/lib/time";
import BreathingDot from "./ui/BreathingDot.vue";
import Sparkline from "./Sparkline.vue";
import SubagentChips from "./SubagentChips.vue";

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

const opacity = computed(() => (s.value.state === "idle" ? "opacity-[0.72]" : ""));

const dotTone = computed<"run" | "sub" | "attn" | "fg-3">(() => {
  switch (s.value.state) {
    case "running":
      return "run";
    case "sub":
      return "sub";
    case "wait":
      return "attn";
    default:
      return "fg-3";
  }
});

const dotBreathing = computed(
  () =>
    s.value.state === "running" ||
    s.value.state === "sub" ||
    s.value.state === "wait",
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
      return `${s.value.active_subagents.length} sub${s.value.active_subagents.length === 1 ? "" : "s"} · main idle`;
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

const bodyLabel = computed(() => {
  switch (s.value.state) {
    case "running":
      return "in flight";
    case "sub":
      return "subagents";
    case "wait":
      return "awaiting approval";
    default:
      return "last action";
  }
});

const bodyLabelTone = computed(() =>
  s.value.state === "wait" ? "text-attn" : "text-fg-3",
);

const toolNameClass = computed(() => {
  switch (s.value.state) {
    case "running":
      return "text-run";
    case "wait":
      return "text-attn";
    default:
      return "text-fg-2";
  }
});

const targetClass = computed(() =>
  s.value.state === "idle" ? "text-fg-2" : "text-fg-1",
);

const displayTool = computed(() => {
  if (s.value.state === "idle" || s.value.state === "stopped" || s.value.state === "error") {
    return s.value.last_tool ?? null;
  }
  return s.value.active_tool ?? null;
});

const duration = computed(() =>
  formatDurationShort(s.value.duration_ms),
);

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
      's.state === \'running\' ? \'border-t\' : \'\'',
    ]"
    :style="waitGradient"
    :data-state="s.state"
  >
    <header class="flex items-start justify-between gap-2">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <BreathingDot :tone="dotTone" :breathing="dotBreathing" />
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
          :class="[
            'font-mono text-[11px] whitespace-nowrap',
            badgeClass,
          ]"
        >
          {{ badgeText }}
        </span>
      </div>
    </header>

    <div class="mt-3 min-h-[42px]">
      <div
        :class="[
          'font-mono uppercase tracking-[0.12em] text-[11px]',
          bodyLabelTone,
        ]"
      >
        {{ bodyLabel }}
      </div>
      <div v-if="s.state === 'sub'" class="mt-1.5">
        <SubagentChips :subagents="s.active_subagents" :now="props.now" />
      </div>
      <div
        v-else-if="displayTool"
        class="mt-1 flex items-center gap-2 text-[13px]"
      >
        <span :class="['font-mono', toolNameClass]">{{ displayTool.name }}</span>
        <span :class="['font-mono truncate', targetClass]">
          {{ displayTool.target }}
        </span>
      </div>
      <div v-else class="mt-1 text-[13px] text-fg-3">—</div>
    </div>

    <Sparkline class="mt-3" :bins="s.sparkline" />

    <footer class="mt-3 flex items-center justify-between font-mono text-[11px] text-fg-3">
      <span :title="startedTitle">started {{ formatStartTime(s.started_at) }} · {{ duration }}</span>
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
