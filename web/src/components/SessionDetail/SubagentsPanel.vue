<script setup lang="ts">
import { computed, ref } from "vue";
import type { SubagentSummary } from "@/lib/subagents";
import { formatDurationShort, formatStartTime } from "@/lib/time";
import BreathingDot from "../ui/BreathingDot.vue";

interface Props {
  subagents: readonly SubagentSummary[];
}
const props = defineProps<Props>();

const expanded = ref<Set<string>>(new Set());

function toggle(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

const counts = computed(() => {
  let running = 0;
  let stopped = 0;
  let errored = 0;
  for (const s of props.subagents) {
    if (s.status === "running") running++;
    else if (s.status === "errored") errored++;
    else stopped++;
  }
  return { running, stopped, errored };
});

function dotTone(s: SubagentSummary): "sub" | "ok" | "err" {
  if (s.status === "errored") return "err";
  if (s.status === "running") return "sub";
  return "ok";
}

function statusLabel(s: SubagentSummary): string {
  if (s.status === "running") return "running";
  if (s.status === "errored") return "errored";
  return "done";
}

function statusTone(s: SubagentSummary): string {
  if (s.status === "running") return "text-sub";
  if (s.status === "errored") return "text-err";
  return "text-fg-2";
}

function currentToolDisplay(s: SubagentSummary): string {
  if (s.activeToolName) {
    return `${s.activeToolName}${s.activeToolTarget ? ` ${s.activeToolTarget}` : ""}`;
  }
  if (s.lastToolName) {
    return `${s.lastToolName}${s.lastToolTarget ? ` ${s.lastToolTarget}` : ""}`;
  }
  return "";
}

function shortAgentId(id: string): string {
  return id.length > 10 ? id.slice(0, 8) : id;
}
</script>

<template>
  <div class="rounded-tile border border-line bg-bg-1">
    <div
      class="flex items-center justify-between border-b border-line px-4 py-2.5"
    >
      <div class="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-3">
        subagents · {{ props.subagents.length }}
      </div>
      <div class="flex gap-3 font-mono text-[11px] text-fg-3">
        <span v-if="counts.running > 0" class="inline-flex items-center gap-1">
          <BreathingDot tone="sub" :breathing="false" />{{ counts.running }} running
        </span>
        <span v-if="counts.stopped > 0" class="inline-flex items-center gap-1">
          <BreathingDot tone="ok" :breathing="false" />{{ counts.stopped }} done
        </span>
        <span v-if="counts.errored > 0" class="inline-flex items-center gap-1">
          <BreathingDot tone="err" :breathing="false" />{{ counts.errored }} errored
        </span>
      </div>
    </div>

    <ul class="divide-y divide-line">
      <li
        v-for="sub in props.subagents"
        :key="sub.agentId"
        class="px-4 py-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <BreathingDot
                :tone="dotTone(sub)"
                :breathing="sub.status === 'running'"
                :size="6"
              />
              <span
                class="font-mono text-[13px] text-fg-1 truncate"
                :title="sub.description ?? ''"
              >
                {{ sub.description ?? sub.subagentType ?? sub.agentType ?? "subagent" }}
              </span>
              <span
                v-if="sub.subagentType"
                class="rounded-chip border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-fg-3"
              >
                {{ sub.subagentType }}
              </span>
            </div>
            <div
              class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[11.5px] text-fg-3"
            >
              <span :class="statusTone(sub)">{{ statusLabel(sub) }}</span>
              <span>started {{ formatStartTime(sub.startedAt) }}</span>
              <span>· {{ formatDurationShort(sub.durationMs) }}</span>
              <span>· {{ sub.toolCount }} tools</span>
              <span v-if="sub.errorCount > 0" class="text-err"
                >· {{ sub.errorCount }} err</span
              >
              <span class="text-fg-3 truncate">· {{ shortAgentId(sub.agentId) }}</span>
            </div>
            <div
              v-if="currentToolDisplay(sub)"
              class="mt-1 font-mono text-[12px] text-fg-2 truncate"
              :title="currentToolDisplay(sub)"
            >
              <span class="text-fg-3"
                >{{ sub.activeToolName ? "doing" : "last" }}:</span
              >
              {{ currentToolDisplay(sub) }}
            </div>
          </div>
          <button
            v-if="sub.prompt || sub.finalResponse"
            type="button"
            class="shrink-0 rounded-chip border border-line px-2 py-0.5 font-mono text-[11px] text-fg-2 transition-colors hover:text-fg-1"
            @click="toggle(sub.agentId)"
          >
            {{ expanded.has(sub.agentId) ? "hide" : "details" }}
          </button>
        </div>

        <div
          v-if="expanded.has(sub.agentId)"
          class="mt-2 space-y-2"
        >
          <div v-if="sub.prompt">
            <div
              class="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-3"
            >
              prompt
            </div>
            <pre
              class="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-bg-2 p-2 font-mono text-[11.5px] text-fg-1"
              >{{ sub.prompt }}</pre>
          </div>
          <div v-if="sub.finalResponse">
            <div
              class="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-3"
            >
              final response
            </div>
            <pre
              class="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-bg-2 p-2 font-mono text-[11.5px] text-fg-1"
              >{{ sub.finalResponse }}</pre>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
