<script setup lang="ts">
import { computed } from "vue";
import type { ToolCall } from "@/lib/correlate";
import { formatStartTimeSeconds } from "@/lib/time";

interface Props {
  call: ToolCall | null;
}
const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

const inputJson = computed(() =>
  props.call ? JSON.stringify(props.call.toolInput, null, 2) : "",
);

const durationLabel = computed(() => {
  if (!props.call) return "";
  if (props.call.status === "running") {
    return `${Math.round(props.call.durationMs / 100) / 10}s (in flight)`;
  }
  return `${Math.round(props.call.durationMs / 100) / 10}s`;
});
</script>

<template>
  <aside
    v-if="props.call"
    class="fixed right-0 top-0 z-40 flex h-full w-[420px] flex-col border-l border-line bg-bg-1"
    style="backdrop-filter: blur(6px)"
  >
    <header
      class="flex items-start justify-between gap-4 border-b border-line p-4"
    >
      <div>
        <div
          class="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3"
        >
          tool call
        </div>
        <h3 class="mt-1 font-mono text-[15px] text-fg">
          {{ props.call.toolName }}
          <span
            :class="[
              'ml-2 text-[11px]',
              props.call.status === 'error'
                ? 'text-err'
                : props.call.status === 'denied'
                  ? 'text-attn'
                  : props.call.status === 'running'
                    ? 'text-run'
                    : 'text-ok',
            ]"
          >
            {{ props.call.status }}
          </span>
        </h3>
        <p class="mt-1 font-mono text-[11px] text-fg-3">
          started {{ formatStartTimeSeconds(props.call.startTs) }} ·
          {{ durationLabel }}
          <template v-if="props.call.exitCode !== undefined">
            · exit {{ props.call.exitCode }}
          </template>
        </p>
      </div>
      <button
        type="button"
        class="rounded-chip border border-line px-2 py-1 font-mono text-[11px] text-fg-2 hover:text-fg-1"
        @click="emit('close')"
      >
        close
      </button>
    </header>
    <div class="flex-1 overflow-auto p-4">
      <div
        class="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3"
      >
        input
      </div>
      <pre
        class="mt-2 max-h-[240px] overflow-auto rounded-chip border border-line bg-bg p-3 font-mono text-[11.5px] text-fg-1"
      >{{ inputJson }}</pre>

      <div
        v-if="props.call.errorMessage"
        class="mt-4"
      >
        <div
          class="font-mono text-[10.5px] uppercase tracking-[0.14em] text-err"
        >
          error
        </div>
        <p class="mt-2 whitespace-pre-wrap text-[12.5px] text-err">
          {{ props.call.errorMessage }}
        </p>
      </div>
    </div>
  </aside>
</template>
