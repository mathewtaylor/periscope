<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useSessionDetailStore } from "@/stores/sessionDetail";
import { usePreferencesStore } from "@/stores/preferences";
import type { ToolCall } from "@/lib/correlate";
import {
  formatDurationShort,
  formatStartTimeSeconds,
} from "@/lib/time";
import PromptCard from "@/components/SessionDetail/PromptCard.vue";
import Timeline from "@/components/SessionDetail/Timeline.vue";
import SummaryCard from "@/components/SessionDetail/SummaryCard.vue";
import RecentList from "@/components/SessionDetail/RecentList.vue";
import EventDrawer from "@/components/SessionDetail/EventDrawer.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";

const route = useRoute();
const store = useSessionDetailStore();
const prefs = usePreferencesStore();

const sessionId = computed(() => String(route.params.id ?? ""));

type Tab = "timeline" | "events" | "prompts";
const tab = ref<Tab>("timeline");
const tabOptions = [
  { label: "timeline", value: "timeline" },
  { label: "events", value: "events" },
  { label: "prompts", value: "prompts" },
] as const satisfies readonly { label: string; value: Tab }[];

const selectedCall = ref<ToolCall | null>(null);

watch(
  sessionId,
  (id) => {
    if (id) store.start(id);
  },
  { immediate: true },
);
watch(
  () => prefs.window,
  () => {
    if (sessionId.value) void store.load(sessionId.value);
  },
);

onBeforeUnmount(() => store.stop());

const subtitle = computed(() => {
  const s = store.session;
  if (!s) return "";
  const parts = [
    `started ${formatStartTimeSeconds(s.started_at)}`,
    formatDurationShort(s.duration_ms),
    `${s.event_count} events`,
  ];
  if (s.model) parts.push(s.model);
  return parts.join(" · ");
});

const isLive = computed(() => {
  const s = store.session;
  if (!s) return false;
  return s.state !== "stopped" && s.state !== "error";
});

const followNow = computed({
  get: () => prefs.followNow,
  set: (v) => {
    prefs.followNow = v;
  },
});

function onBarHover(_call: ToolCall | null) {
  // reserved for future tooltip component
}
function onBarClick(call: ToolCall) {
  selectedCall.value = call;
}
</script>

<template>
  <section class="px-6 pt-7 pb-10">
    <div v-if="store.error" class="text-err">error: {{ store.error }}</div>
    <div v-else-if="!store.session" class="text-fg-3">loading…</div>
    <template v-else>
      <div class="mb-4 flex items-end justify-between gap-4">
        <div>
          <RouterLink
            to="/"
            class="mb-2 inline-flex items-center gap-1 font-mono text-[11.5px] text-fg-2 transition-colors hover:text-fg-1"
          >
            <span aria-hidden="true">←</span>
            <span>Sessions</span>
          </RouterLink>
          <h2
            class="mt-1 flex items-center gap-3 text-[24px] font-medium tracking-tight"
          >
            <span class="font-mono">{{ store.session.project }}</span>
            <span
              v-if="store.session.active_subagents.length > 0"
              class="font-mono text-[12px] font-normal text-sub"
            >
              {{ store.session.active_subagents.length }} subagents active
            </span>
          </h2>
          <p class="mt-0.5 flex items-center gap-2 font-mono text-[12.5px] text-fg-2">
            <span>{{ subtitle }}</span>
            <span
              v-if="store.session.source && store.session.source !== 'startup'"
              class="rounded-chip border border-line px-1.5 py-0.5 text-[11px] text-fg-3"
            >
              {{ store.session.source }}
            </span>
          </p>
        </div>
        <div class="flex items-center gap-2 text-[12px]">
          <SegmentedControl
            :model-value="tab"
            :options="tabOptions"
            @update:model-value="(v: Tab) => (tab = v)"
          />
          <button
            type="button"
            :class="[
              'rounded-chip border px-2.5 py-1 font-mono text-[11.5px] transition-colors',
              followNow
                ? 'border-run text-run'
                : 'border-line text-fg-2 hover:text-fg-1',
            ]"
            :aria-pressed="followNow"
            @click="followNow = !followNow"
          >
            Follow now →
          </button>
        </div>
      </div>

      <PromptCard
        v-if="store.prompt"
        :body="store.prompt.body"
        :ts="store.prompt.ts"
        class="mb-4"
      />

      <div
        v-if="tab === 'timeline'"
        class="grid grid-cols-[1fr_340px] gap-4"
      >
        <Timeline
          :lanes="store.lanes"
          :start-ms="store.bounds.startMs"
          :end-ms="store.bounds.endMs"
          :live="isLive"
          @bar-hover="onBarHover"
          @bar-click="onBarClick"
        />
        <div class="space-y-3">
          <SummaryCard :session="store.session" :summary="store.summary" />
          <RecentList :events="store.events" :follow="followNow" />
        </div>
      </div>

      <div
        v-else-if="tab === 'events'"
        class="rounded-tile border border-line bg-bg-1 p-6 font-mono text-[12px] text-fg-3"
      >
        <div class="uppercase tracking-[0.12em]">events — coming in a later version</div>
        <p class="mt-2">This tab will render the raw event stream as a searchable table.</p>
      </div>

      <div
        v-else
        class="rounded-tile border border-line bg-bg-1 p-6 font-mono text-[12px] text-fg-3"
      >
        <div class="uppercase tracking-[0.12em]">prompts — coming in a later version</div>
        <p class="mt-2">This tab will collect every user prompt submitted in this session.</p>
      </div>
    </template>

    <EventDrawer :call="selectedCall" @close="selectedCall = null" />
  </section>
</template>
