<script setup lang="ts">
import { computed } from "vue";
import type { Lane, ToolCall } from "@/lib/correlate";

interface Props {
  lane: Lane;
  startMs: number;
  endMs: number;
  spawnMs?: number | null;
  returnMs?: number | null;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  barHover: [call: ToolCall | null];
  barClick: [call: ToolCall];
}>();

const isMain = computed(() => props.lane.agentId === null);
const trackHeight = computed(() => (isMain.value ? 20 : 16));

const span = computed(() => Math.max(1, props.endMs - props.startMs));

function pctFromMs(ms: number): number {
  return ((ms - props.startMs) / span.value) * 100;
}

function barStyle(call: ToolCall) {
  const startMs = Date.parse(call.startTs);
  const endMs = call.endTs ? Date.parse(call.endTs) : props.endMs;
  const left = Math.max(0, pctFromMs(startMs));
  const rawWidth = pctFromMs(endMs) - pctFromMs(startMs);
  const width = Math.max(0.25, rawWidth);
  return {
    left: `${left}%`,
    width: `${width}%`,
    height: `${trackHeight.value}px`,
  };
}

const laneLabelTone = computed<string>(() => {
  if (props.lane.done) return "text-fg-3";
  if (isMain.value) return "text-fg-3";
  return "text-sub";
});

const agentNameTone = computed<string>(() => {
  if (props.lane.done) return "text-fg-2";
  return "text-fg-1";
});

function barColor(call: ToolCall): string {
  if (call.status === "error") return "bg-err";
  if (call.status === "denied") return "bg-attn";
  if (isMain.value) {
    return call.status === "running" ? "bg-run" : "bg-fg-4";
  }
  if (props.lane.done) return "bg-fg-4";
  return call.status === "running" ? "bg-sub" : "bg-sub opacity-80";
}

function barGreyedAfterReturn(call: ToolCall): boolean {
  if (!props.returnMs) return false;
  const startMs = Date.parse(call.startTs);
  return startMs >= props.returnMs;
}

const spawnLeft = computed(() => {
  if (props.spawnMs == null) return null;
  if (!isMain.value) return null;
  return Math.max(0, Math.min(100, pctFromMs(props.spawnMs)));
});

const returnLeft = computed(() => {
  if (props.returnMs == null) return null;
  return Math.max(0, Math.min(100, pctFromMs(props.returnMs)));
});
</script>

<template>
  <div class="grid grid-cols-[160px_1fr] items-center py-1">
    <div :class="[isMain ? 'px-2' : 'px-2 pl-4']">
      <div
        :class="[
          'font-mono text-[10px] uppercase tracking-[0.14em] whitespace-nowrap',
          laneLabelTone,
        ]"
      >
        {{ lane.label }}
      </div>
      <div :class="['mt-0.5 font-mono text-[12px] truncate', agentNameTone]">
        {{ isMain ? lane.agentType : lane.agentType || lane.agentId }}
      </div>
    </div>
    <div
      :class="['relative rounded-sm', isMain ? 'h-5' : 'h-4']"
      style="background: #0f1317"
    >
      <button
        v-for="call in lane.calls"
        :key="call.toolUseId"
        type="button"
        :class="[
          'absolute rounded-sm transition-opacity focus:outline-none focus:ring-1 focus:ring-line-2',
          barColor(call),
          barGreyedAfterReturn(call) ? 'bg-fg-4 opacity-60' : '',
        ]"
        :style="barStyle(call)"
        :title="`${call.toolName} · ${Math.round(call.durationMs / 100) / 10}s`"
        @mouseenter="emit('barHover', call)"
        @mouseleave="emit('barHover', null)"
        @focus="emit('barHover', call)"
        @blur="emit('barHover', null)"
        @click="emit('barClick', call)"
      />
      <span
        v-if="spawnLeft !== null"
        class="absolute bg-sub pointer-events-none"
        :style="{
          left: `${spawnLeft}%`,
          width: '2px',
          height: '8px',
          top: `${trackHeight}px`,
        }"
        aria-hidden="true"
      />
      <span
        v-if="returnLeft !== null && !isMain && lane.done"
        class="absolute bg-ok rounded-sm pointer-events-none"
        :style="{
          left: `calc(${returnLeft}% - 1.5px)`,
          width: '3px',
          height: '22px',
          top: '-3px',
        }"
        aria-hidden="true"
      />
    </div>
  </div>
</template>
