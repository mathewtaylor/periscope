<script setup lang="ts">
import { computed } from "vue";
import type { Lane, ToolCall } from "@/lib/correlate";
import LaneRow from "./Lane.vue";
import BreathingDot from "../ui/BreathingDot.vue";
import { formatDurationShort, formatStartTime } from "@/lib/time";

interface Props {
  lanes: readonly Lane[];
  startMs: number;
  endMs: number;
  live: boolean;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  barHover: [call: ToolCall | null];
  barClick: [call: ToolCall];
}>();

const TICK_COUNT = 7;

const ticks = computed(() => {
  const span = Math.max(1, props.endMs - props.startMs);
  const out: { label: string; isNow: boolean }[] = [];
  for (let i = 0; i < TICK_COUNT; i++) {
    const ms = props.startMs + (span * i) / (TICK_COUNT - 1);
    const isLast = i === TICK_COUNT - 1;
    out.push({
      label: isLast && props.live ? "now" : formatStartTime(new Date(ms).toISOString()),
      isNow: isLast && props.live,
    });
  }
  return out;
});

const windowLabel = computed(() => {
  const ms = Math.max(0, props.endMs - props.startMs);
  return `last ${formatDurationShort(ms)}`;
});

const mainLane = computed(() => props.lanes.find((l) => l.agentId === null));
const subLanes = computed(() => props.lanes.filter((l) => l.agentId !== null));

const spawnAndReturnByAgentId = computed(() => {
  const map = new Map<string, { spawnMs: number | null; returnMs: number | null }>();
  for (const lane of subLanes.value) {
    if (!lane.agentId) continue;
    map.set(lane.agentId, {
      spawnMs: lane.spawnTs ? Date.parse(lane.spawnTs) : null,
      returnMs: lane.returnTs ? Date.parse(lane.returnTs) : null,
    });
  }
  return map;
});

const mainSpawnMs = computed<number | null>(() => {
  // The main lane gets an overlay for each subagent it spawns
  return null;
});

function getLaneProps(lane: Lane) {
  const agent = lane.agentId ? spawnAndReturnByAgentId.value.get(lane.agentId) : null;
  return {
    spawnMs: agent?.spawnMs ?? null,
    returnMs: agent?.returnMs ?? null,
  };
}

// For rendering spawn markers on main lane, collect all SubagentStart ts
const mainSpawnMarkers = computed(() => {
  const span = Math.max(1, props.endMs - props.startMs);
  return subLanes.value
    .filter((l) => l.spawnTs)
    .map((l) => {
      const spawnMs = Date.parse(l.spawnTs!);
      const pct = ((spawnMs - props.startMs) / span) * 100;
      return { pct: Math.max(0, Math.min(100, pct)), agentId: l.agentId! };
    });
});
</script>

<template>
  <div class="overflow-hidden rounded-tile border border-line bg-bg-1">
    <div class="flex items-center justify-between border-b border-line px-4 py-2.5">
      <div class="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-3">
        timeline · {{ windowLabel }}
      </div>
      <div class="flex gap-3 font-mono text-[11px] text-fg-3">
        <span class="inline-flex items-center gap-1">
          <BreathingDot tone="fg-3" :breathing="false" />tool
        </span>
        <span class="inline-flex items-center gap-1">
          <BreathingDot tone="sub" :breathing="false" />subagent
        </span>
        <span class="inline-flex items-center gap-1">
          <BreathingDot tone="err" :breathing="false" />error
        </span>
        <span class="inline-flex items-center gap-1">
          <BreathingDot tone="ok" :breathing="false" />return
        </span>
      </div>
    </div>

    <div class="relative h-6 border-b border-line">
      <div class="absolute inset-0 flex px-2 font-mono text-[10px] text-fg-3">
        <div
          v-for="(t, idx) in ticks"
          :key="idx"
          :class="[
            'pt-1.5',
            idx === ticks.length - 1 ? 'flex-1 text-right pr-1' : 'flex-1',
            t.isNow ? 'text-run' : '',
          ]"
        >
          {{ t.label }}
        </div>
      </div>
    </div>

    <div class="p-2 pr-3">
      <div v-if="mainLane" class="relative">
        <LaneRow
          :lane="mainLane"
          :start-ms="startMs"
          :end-ms="endMs"
          @bar-hover="(c) => emit('barHover', c)"
          @bar-click="(c) => emit('barClick', c)"
        />
        <!-- Spawn markers hanging below main lane -->
        <span
          v-for="marker in mainSpawnMarkers"
          :key="marker.agentId"
          class="pointer-events-none absolute bg-sub"
          :style="{
            left: `calc(160px + ${marker.pct}% * ((100% - 160px) / 100))`,
            width: '2px',
            height: '8px',
            bottom: '4px',
          }"
          aria-hidden="true"
        />
      </div>
      <LaneRow
        v-for="lane in subLanes"
        :key="lane.agentId ?? 'main'"
        :lane="lane"
        :start-ms="startMs"
        :end-ms="endMs"
        v-bind="getLaneProps(lane)"
        @bar-hover="(c) => emit('barHover', c)"
        @bar-click="(c) => emit('barClick', c)"
      />
      <div
        v-if="lanes.length === 0"
        class="px-4 py-6 text-center font-mono text-[12px] text-fg-3"
      >
        no events yet
      </div>
    </div>
  </div>
</template>
