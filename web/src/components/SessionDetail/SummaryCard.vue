<script setup lang="ts">
import { computed } from "vue";
import type { SessionRow } from "@/lib/types";
import type { SessionSummary, ContextInfo } from "@/lib/api";
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

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

const tokens = computed(() => props.summary?.tokens ?? null);

const context = computed(() => props.summary?.context ?? null);

function contextTone(pct: number): string {
  if (pct >= 40) return "bg-run";
  if (pct >= 15) return "bg-attn";
  return "bg-err";
}

function contextLabel(c: ContextInfo): string {
  const usedK = Math.round(c.used / 1000);
  const limitK = Math.round(c.limit / 1000);
  return `${usedK.toLocaleString()}k / ${limitK.toLocaleString()}k · ${c.remaining_pct}% remaining`;
}

const agentContexts = computed(() => props.summary?.agent_contexts ?? []);

function agentPct(c: ContextInfo | null): number {
  return c ? c.remaining_pct : 0;
}
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

      <dt class="self-start text-fg-3">tokens</dt>
      <dd
        v-if="tokens"
        class="text-fg-1 leading-tight"
        :title="`cumulative for this session — input ${tokens.input.toLocaleString()} · output ${tokens.output.toLocaleString()} · cached ${tokens.cached.toLocaleString()}`"
      >
        <div class="flex justify-between gap-2">
          <span class="text-fg-3">input</span>
          <span class="tabular-nums">{{ formatTokens(tokens.input) }}</span>
        </div>
        <div class="flex justify-between gap-2">
          <span class="text-fg-3">output</span>
          <span class="tabular-nums">{{ formatTokens(tokens.output) }}</span>
        </div>
        <div class="flex justify-between gap-2">
          <span class="text-fg-3">cached</span>
          <span class="tabular-nums">{{ formatTokens(tokens.cached) }}</span>
        </div>
      </dd>
      <dd
        v-else
        class="text-fg-3"
        title="Install periscope-relay to populate this (see Config)"
      >
        —
      </dd>

      <dt class="text-fg-3">context</dt>
      <dd v-if="context">
        <div
          class="w-full rounded overflow-hidden bg-bg-3"
          style="height: 8px"
        >
          <div
            :class="contextTone(context.remaining_pct)"
            :style="{ width: `${context.remaining_pct}%`, height: '100%' }"
          />
        </div>
        <div class="mt-1 font-mono text-[11px] text-fg-2">
          {{ contextLabel(context) }}
        </div>
      </dd>
      <dd v-else class="text-fg-3">—</dd>

      <dt class="text-fg-3">model</dt>
      <dd class="text-fg-1 truncate">{{ props.summary?.model ?? "—" }}</dd>

      <template v-if="props.session.permission_mode">
        <dt class="text-fg-3">mode</dt>
        <dd class="font-mono">{{ props.session.permission_mode }}</dd>
      </template>

      <dt class="text-fg-3">duration</dt>
      <dd>{{ formatDurationShort(props.session.duration_ms) }}</dd>
    </dl>

    <div
      v-if="agentContexts.length > 0"
      class="mt-3 border-t border-line pt-3"
    >
      <div class="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-3">
        subagents context
      </div>
      <div
        class="mt-1.5 max-h-[6rem] overflow-y-auto space-y-1 font-mono text-[11.5px]"
      >
        <div
          v-for="ac in agentContexts"
          :key="ac.agent_id"
          class="flex items-center gap-2"
        >
          <span class="w-20 shrink-0 truncate text-fg-2">
            {{ ac.agent_type || "agent" }}
          </span>
          <div
            class="flex-1 rounded overflow-hidden bg-bg-3"
            style="height: 6px"
          >
            <div
              v-if="ac.context"
              :class="contextTone(ac.context.remaining_pct)"
              :style="{
                width: `${ac.context.remaining_pct}%`,
                height: '100%',
              }"
            />
          </div>
          <span class="w-10 shrink-0 text-right text-fg-3">
            {{ agentPct(ac.context) }}%
          </span>
        </div>
      </div>
    </div>

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
