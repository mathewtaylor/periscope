<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useSessionsStore } from "@/stores/sessions";
import { usePreferencesStore } from "@/stores/preferences";
import type { SessionRow, WindowLabel, ViewMode } from "@/lib/types";
import SessionTile from "@/components/SessionTile.vue";
import GhostTile from "@/components/GhostTile.vue";
import StoppedSessions from "@/components/StoppedSessions.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import VSep from "@/components/ui/VSep.vue";

const sessions = useSessionsStore();
const prefs = usePreferencesStore();
const now = ref(Date.now());

const windowOptions = [
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
] as const satisfies readonly { label: string; value: WindowLabel }[];

const viewOptions = [
  { label: "tiles", value: "tiles" },
  { label: "list", value: "list" },
] as const satisfies readonly { label: string; value: ViewMode }[];

const STOP_HOLD_MS = 1000;
const STOP_FADE_MS = 300;

// Session ids currently fading out after stopping. Map -> {row, addedAt}.
const exiting = ref<Map<string, { row: SessionRow; addedAt: number }>>(
  new Map(),
);

// Merge active sessions with lingering "exiting" tiles so the UI holds them
// briefly before the backend-ordered stopped card takes over.
const displayActive = computed<SessionRow[]>(() => {
  const activeIds = new Set(sessions.active.map((s) => s.session_id));
  const out: SessionRow[] = [...sessions.active];
  for (const [id, record] of exiting.value) {
    if (activeIds.has(id)) continue;
    out.push(record.row);
  }
  return out;
});

watch(
  () => sessions.active.map((s) => s.session_id).join(","),
  (_after, _before) => {
    // This fires every refresh; we compare against previous active ids by
    // scanning `stopped` for freshly-stopped sessions that were in activelast tick.
    // Simpler: when a session appears in `stopped` with a recent stopped_at,
    // treat it as just-stopped and animate if we don't already know about it.
    const nowMs = Date.now();
    const nextExit = new Map(exiting.value);
    for (const s of sessions.stopped) {
      const stoppedAt = s.stopped_at ? Date.parse(s.stopped_at) : 0;
      if (!stoppedAt) continue;
      if (nowMs - stoppedAt > STOP_HOLD_MS + STOP_FADE_MS + 500) continue;
      if (nextExit.has(s.session_id)) continue;
      nextExit.set(s.session_id, { row: s, addedAt: nowMs });
      setTimeout(() => {
        exiting.value.delete(s.session_id);
        exiting.value = new Map(exiting.value);
      }, STOP_HOLD_MS + STOP_FADE_MS);
    }
    exiting.value = nextExit;
  },
);

let tickInterval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  sessions.start();
  prefs.pruneExpiredMutes();
  tickInterval = setInterval(() => {
    now.value = Date.now();
    prefs.pruneExpiredMutes(now.value);
  }, 1000);
});
onBeforeUnmount(() => {
  if (tickInterval) clearInterval(tickInterval);
});

const subtitle = computed(() => {
  const a = sessions.active.length;
  const s = sessions.stopped.length;
  return `${a} active · ${s} stopped in the last 24 hours`;
});

const GRID_COLS = 4;

const ghostCount = computed(() => {
  if (prefs.viewMode !== "tiles") return 0;
  const count = displayActive.value.length;
  if (count === 0) return GRID_COLS;
  const trailing = GRID_COLS - (count % GRID_COLS);
  return trailing === GRID_COLS ? 0 : trailing;
});

function isExiting(sessionId: string): boolean {
  return exiting.value.has(sessionId);
}
</script>

<template>
  <section class="px-6 pt-7">
    <div class="mb-4 flex items-end justify-between">
      <div>
        <h1 class="text-[24px] font-medium tracking-tight">Sessions</h1>
        <p class="mt-0.5 text-[12.5px] text-fg-2">{{ subtitle }}</p>
      </div>
      <div class="flex items-center gap-3 text-[12px]">
        <SegmentedControl
          :model-value="prefs.window"
          :options="windowOptions"
          mono
          @update:model-value="(v: WindowLabel) => (prefs.window = v)"
        />
        <VSep />
        <SegmentedControl
          :model-value="prefs.viewMode"
          :options="viewOptions"
          @update:model-value="(v: ViewMode) => (prefs.viewMode = v)"
        />
      </div>
    </div>

    <div
      v-if="prefs.viewMode === 'tiles'"
      class="grid gap-3"
      style="grid-template-columns: repeat(auto-fill, minmax(max(280px, calc((100% - 36px) / 4)), 1fr))"
    >
      <SessionTile
        v-for="s in displayActive"
        :key="s.session_id"
        :session="s"
        :now="now"
        :class="[
          'animate-slide-up',
          isExiting(s.session_id) ? 'tile-exiting' : '',
        ]"
      />
      <GhostTile
        v-for="idx in ghostCount"
        :key="`ghost-${idx}`"
      />
      <div
        v-if="displayActive.length === 0 && ghostCount === 0"
        class="col-span-full rounded-tile border border-dashed border-line py-10 text-center font-mono text-[12.5px] text-fg-3"
      >
        no active sessions — configure a hook on any Claude Code instance and it
        will appear here
      </div>
    </div>

    <div
      v-else
      class="rounded-tile border border-line bg-bg-1 text-[12.5px]"
    >
      <div
        class="grid grid-cols-[1fr_120px_1fr_140px] items-center border-b border-line px-4 py-2 font-mono uppercase tracking-[0.12em] text-[10.5px] text-fg-3"
      >
        <span>project</span><span>state</span><span>current</span
        ><span class="text-right">last event</span>
      </div>
      <div
        v-for="s in sessions.active"
        :key="s.session_id"
        class="grid grid-cols-[1fr_120px_1fr_140px] items-center border-b border-line px-4 py-2.5 last:border-0 hover:bg-bg-2"
      >
        <span class="font-mono text-fg-1 truncate">{{ s.project }}</span>
        <span class="font-mono text-fg-2">{{ s.state }}</span>
        <span class="font-mono text-fg-3 truncate">
          <template v-if="s.active_tool"
            >{{ s.active_tool.name }} {{ s.active_tool.target }}</template
          >
          <template v-else-if="s.last_tool"
            >{{ s.last_tool.name }} {{ s.last_tool.target }}</template
          >
          <template v-else>—</template>
        </span>
        <span class="text-right font-mono text-fg-3">{{
          new Date(s.last_event_at).toLocaleTimeString()
        }}</span>
      </div>
      <div
        v-if="sessions.active.length === 0"
        class="px-4 py-6 text-center text-fg-3"
      >
        no active sessions
      </div>
    </div>

    <StoppedSessions :sessions="sessions.stopped" :now="now" />
  </section>
</template>

<style scoped>
.tile-exiting {
  animation: tileFadeOut 300ms ease-out 1000ms forwards;
}
@keyframes tileFadeOut {
  to {
    opacity: 0;
    transform: translateY(-2px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tile-exiting {
    animation: none;
  }
}
</style>
