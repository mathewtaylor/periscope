<script setup lang="ts">
import { computed } from "vue";
import type { SparkBin } from "@/lib/types";

interface Props {
  bins: readonly SparkBin[];
}
const props = defineProps<Props>();

function logScaleHeight(count: number, max: number): number {
  if (count <= 0) return 4;
  if (max <= 1) return Math.max(4, count * 90);
  const pct = (Math.log10(count + 1) / Math.log10(max + 1)) * 92;
  return Math.max(4, Math.min(96, pct));
}

const colorClass: Record<SparkBin["color"], string> = {
  run: "bg-run",
  sub: "bg-sub",
  attn: "bg-attn",
  err: "bg-err",
  "fg-4": "bg-fg-4",
};

const maxCount = computed(() =>
  props.bins.reduce((m, b) => (b.count > m ? b.count : m), 0),
);
</script>

<template>
  <div
    class="flex h-[26px] items-end gap-[2px]"
    aria-hidden="true"
  >
    <span
      v-for="(bin, idx) in props.bins"
      :key="idx"
      :class="['block w-1 rounded-sm', colorClass[bin.color]]"
      :style="{ height: `${logScaleHeight(bin.count, maxCount)}%` }"
    />
  </div>
</template>
