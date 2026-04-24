<script setup lang="ts">
import { onMounted } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import AlertsStrip from "@/components/AlertsStrip.vue";
import { useSessionsStore } from "@/stores/sessions";
import { useStatsStore } from "@/stores/stats";

const sessions = useSessionsStore();
const stats = useStatsStore();

onMounted(() => {
  stats.start();
  sessions.start();
});
</script>

<template>
  <div class="min-h-full bg-bg text-fg">
    <AppHeader>
      <template #alerts>
        <AlertsStrip />
      </template>
    </AppHeader>
    <RouterView />
  </div>
</template>
