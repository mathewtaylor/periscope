<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useSessionsStore } from "@/stores/sessions";
import { usePreferencesStore } from "@/stores/preferences";
import { formatDurationShort } from "@/lib/time";
import BreathingDot from "./ui/BreathingDot.vue";

const sessions = useSessionsStore();
const prefs = usePreferencesStore();
const router = useRouter();

const visible = computed(() => sessions.visiblePending);

const oldest = computed(() => {
  if (visible.value.length === 0) return null;
  return [...visible.value].sort((a, b) =>
    a.waiting_since.localeCompare(b.waiting_since),
  )[0]!;
});

const extras = computed(() => Math.max(0, visible.value.length - 1));

const elapsed = computed(() => {
  if (!oldest.value) return "";
  return formatDurationShort(
    Date.now() - new Date(oldest.value.waiting_since).getTime(),
  );
});

function review() {
  if (!oldest.value) return;
  router.push(`/sessions/${encodeURIComponent(oldest.value.session_id)}`);
}

function mute() {
  if (!oldest.value) return;
  prefs.muteSession(oldest.value.session_id);
}
</script>

<template>
  <div
    v-if="oldest"
    role="status"
    aria-live="polite"
    class="flex h-10 items-center gap-4 border-t border-line-2 px-6 text-[12.5px]"
    style="background: #15130c; box-shadow: inset 2px 0 0 #e3b155"
  >
    <span
      class="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-attn font-mono"
    >
      <BreathingDot tone="attn" />awaiting you
    </span>
    <span class="text-fg-1">{{ oldest.project }}</span>
    <span class="text-fg-3">needs approval for</span>
    <span class="font-mono text-fg-1 truncate max-w-[40%]">
      <template v-if="oldest.tool_name">{{ oldest.tool_name }}</template>
      <template v-if="oldest.tool_target"
        >({{ oldest.tool_target }})</template
      >
      <template v-else-if="!oldest.tool_name">permission prompt</template>
    </span>
    <span class="font-mono text-fg-3">· {{ elapsed }}</span>
    <span
      v-if="extras > 0"
      class="ml-2 rounded-full border border-line-2 px-2 py-0.5 text-[11px] font-mono text-fg-2"
    >
      +{{ extras }} more
    </span>
    <div class="ml-auto flex items-center gap-2 text-[11.5px] font-mono">
      <button
        type="button"
        class="rounded-chip border px-2.5 py-1 text-attn transition-colors hover:bg-[rgba(227,177,85,0.08)]"
        style="border-color: #58431d"
        @click="review"
      >
        Review
      </button>
      <button
        type="button"
        class="rounded-chip px-2 py-1 text-fg-2 hover:text-fg-1"
        @click="mute"
      >
        Mute 5m
      </button>
    </div>
  </div>
</template>
