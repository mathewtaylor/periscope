<script setup lang="ts">
import { computed } from "vue";
import type { SessionRow } from "@/lib/types";
import type { SessionSummary } from "@/lib/api";
import { formatDurationShort } from "@/lib/time";

interface Props {
  session: SessionRow;
  summary: SessionSummary | null;
}
const props = defineProps<Props>();

const stateLabel = computed(() => {
  const s = props.session;
  if (s.state === "sub") return `${s.active_subagents.length} subagents`;
  return s.state;
});

const stateTone = computed(() => {
  switch (props.session.state) {
    case "running":
      return "text-run";
    case "sub":
      return "text-sub";
    case "wait":
      return "text-attn";
    case "error":
      return "text-err";
    case "stopped":
      return "text-fg-2";
    default:
      return "text-fg-1";
  }
});

const errorsDisplay = computed(() => props.summary?.error_count ?? 0);

const stopFailure = computed(() => props.summary?.stop_failure ?? null);

const TOTAL_MIX = computed(() =>
  (props.summary?.tool_mix ?? []).reduce((s, t) => s + t.count, 0),
);

const TOOL_MIX_COLORS: Record<string, string> = {
  Read: "#363c46",
  Edit: "#3a3258",
  Write: "#3a3258",
  Bash: "#2a4366",
  Grep: "#4a5162",
  Glob: "#4a5162",
  WebFetch: "#58431d",
  WebSearch: "#58431d",
  Task: "#58431d",
};

function colorFor(tool: string): string {
  return TOOL_MIX_COLORS[tool] ?? "#363c46";
}

const mixBars = computed(() => {
  const total = TOTAL_MIX.value;
  if (total === 0) return [];
  return (props.summary?.tool_mix ?? []).map((t) => ({
    name: t.name,
    count: t.count,
    pct: (t.count / total) * 100,
    color: colorFor(t.name),
  }));
});
</script>

<template>
  <div class="rounded-tile border border-line bg-bg-1 p-4">
    <div
      class="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-fg-3"
    >
      summary
    </div>
    <dl class="grid grid-cols-2 gap-y-1.5 font-mono text-[12.5px]">
      <dt class="text-fg-3">state</dt>
      <dd :class="stateTone">{{ stateLabel }}</dd>

      <dt class="text-fg-3">events</dt>
      <dd>{{ props.summary?.event_count ?? props.session.event_count }}</dd>

      <dt class="text-fg-3">errors</dt>
      <dd>
        <span v-if="errorsDisplay > 0" class="text-err">
          {{ errorsDisplay }}
        </span>
        <span v-else class="text-fg-1">0</span>
      </dd>

      <template v-if="stopFailure">
        <dt class="text-fg-3">api error</dt>
        <dd class="text-err truncate" :title="stopFailure.message ?? undefined">
          {{ stopFailure.error_type }}
        </dd>
      </template>

      <dt class="text-fg-3">tokens</dt>
      <dd
        class="text-fg-3"
        title="Token counts are not emitted by Claude Code hooks in v1. Will appear if a TokensUsed event is added upstream."
      >
        —
      </dd>

      <dt class="text-fg-3">model</dt>
      <dd class="text-fg-1 truncate">{{ props.summary?.model ?? "—" }}</dd>

      <template v-if="props.session.permission_mode">
        <dt class="text-fg-3">mode</dt>
        <dd class="font-mono">{{ props.session.permission_mode }}</dd>
      </template>

      <dt class="text-fg-3">duration</dt>
      <dd>{{ formatDurationShort(props.session.duration_ms) }}</dd>
    </dl>

    <div class="mt-3 border-t border-line pt-3">
      <div class="font-mono text-[11px] text-fg-3">tool mix</div>
      <div v-if="mixBars.length === 0" class="mt-1.5 text-[12px] text-fg-3">
        no tool calls yet
      </div>
      <template v-else>
        <div
          class="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded"
        >
          <div
            v-for="bar in mixBars"
            :key="bar.name"
            :style="{
              width: `${bar.pct}%`,
              background: bar.color,
            }"
            :title="`${bar.name} ${bar.count}`"
          />
        </div>
        <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-2">
          <span
            v-for="bar in mixBars"
            :key="bar.name"
            class="font-mono"
          >
            {{ bar.name }} {{ bar.count }}
          </span>
        </div>
      </template>
    </div>
  </div>
</template>
