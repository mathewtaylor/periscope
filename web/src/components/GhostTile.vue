<script setup lang="ts">
defineProps<{ label?: string }>();
</script>

<template>
  <div
    class="flex min-h-[176px] items-center justify-center rounded-tile border border-dashed border-line px-4 text-center font-mono text-[11.5px] text-fg-3"
  >
    <span v-if="label">{{ label }}</span>
  </div>
</template>
