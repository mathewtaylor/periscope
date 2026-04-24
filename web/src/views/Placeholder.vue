<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <section class="px-6 pt-7">
    <h1 class="text-[24px] font-medium tracking-tight">{{ title }}</h1>
    <div
      class="mt-6 rounded-tile border border-dashed border-line p-10 text-center font-mono text-[12.5px] text-fg-3"
    >
      coming in a later version
    </div>
  </section>
</template>
