<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import type { SessionRow } from "@/lib/types";
import {
  formatDurationShort,
  formatRelative,
} from "@/lib/time";

interface Props {
  sessions: readonly SessionRow[];
  now: number;
}
const props = defineProps<Props>();
const router = useRouter();

const rows = computed(() =>
  props.sessions.map((s) => ({
    ...s,
    durationStr: formatDurationShort(s.duration_ms),
    relative: formatRelative(s.stopped_at ?? s.last_event_at, props.now),
    summary: summarize(s),
  })),
);

function summarize(s: SessionRow): string {
  if (s.state === "error") {
    return s.error_summary ?? `${s.event_count} events`;
  }
  const parts: string[] = [];
  parts.push(`${s.event_count} events`);
  parts.push(`${s.distinct_tool_count} tools`);
  parts.push(formatDurationShort(s.duration_ms));
  if (s.last_tool) {
    parts.push(`last ${s.last_tool.name} "${s.last_tool.target}"`);
  }
  return parts.join(" · ");
}

function go(sessionId: string) {
  router.push(`/sessions/${encodeURIComponent(sessionId)}`);
}
</script>

<template>
  <section v-if="rows.length > 0" class="mt-8">
    <div class="mb-2 flex items-baseline gap-3">
      <h2
        class="font-mono text-[13px] uppercase tracking-[0.12em] text-fg-3"
      >
        stopped
      </h2>
      <div class="h-px flex-1 bg-line" />
      <span class="font-mono text-[11px] text-fg-3">
        {{ rows.length }} in last 24h
      </span>
    </div>
    <div class="rounded-tile border border-line bg-bg-1 text-[12.5px]">
      <button
        v-for="(r, idx) in rows"
        :key="r.session_id"
        type="button"
        :class="[
          'grid w-full grid-cols-[1fr_120px_1fr_140px] items-center px-4 py-2.5 text-left transition-colors hover:bg-bg-2',
          idx === 0 ? '' : 'border-t border-line',
        ]"
        @click="go(r.session_id)"
      >
        <span class="font-mono text-fg-1 truncate">{{ r.project }}</span>
        <span
          :class="[
            'font-mono',
            r.state === 'error' ? 'text-err' : 'text-fg-3',
          ]"
        >
          stopped · {{ r.state === "error" ? "error" : "ok" }}
        </span>
        <span class="font-mono text-fg-3 truncate">
          <span v-if="r.state === 'error'" class="text-err">
            {{ r.error_summary ?? "error" }}
          </span>
          <span v-else>{{ r.summary }}</span>
        </span>
        <span class="font-mono text-fg-3 text-right">{{ r.relative }}</span>
      </button>
    </div>
  </section>
</template>
