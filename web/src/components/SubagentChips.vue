<script setup lang="ts">
import type { ActiveSubagent } from "@/lib/types";
import { formatDurationShort } from "@/lib/time";

interface Props {
  subagents: readonly ActiveSubagent[];
  now: number;
}
const props = defineProps<Props>();

function age(sub: ActiveSubagent): string {
  return formatDurationShort(props.now - new Date(sub.started_at).getTime());
}
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <span
      v-for="sub in props.subagents"
      :key="sub.agent_id"
      class="rounded-full border px-[7px] py-[1px] text-[10.5px] font-mono text-sub"
      style="
        border-color: #3a3258;
        background: rgba(181, 156, 230, 0.06);
      "
    >
      {{ sub.agent_type || "subagent" }} · {{ age(sub) }}
    </span>
  </div>
</template>
