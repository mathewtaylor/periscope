<script setup lang="ts">
import { formatStartTimeSeconds } from "@/lib/time";

interface Props {
  body: string;
  ts: string;
}
defineProps<Props>();
</script>

<template>
  <div
    class="flex items-start gap-4 rounded-tile border border-line bg-bg-1 p-4"
  >
    <span
      class="mt-0.5 whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3"
    >
      user prompt
    </span>
    <p class="flex-1 text-[14px] leading-snug text-fg">{{ body }}</p>
    <span class="whitespace-nowrap font-mono text-[11px] text-fg-3">
      {{ formatStartTimeSeconds(ts) }}
    </span>
  </div>
</template>
