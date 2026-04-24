<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useStatsStore } from "@/stores/stats";
import { formatDurationShort } from "@/lib/time";
import BreathingDot from "./ui/BreathingDot.vue";
import VSep from "./ui/VSep.vue";

const stats = useStatsStore();
const route = useRoute();

onMounted(() => stats.start());

const tabs = [
  { label: "Sessions", to: "/" },
  { label: "Events", to: "/events" },
  { label: "Projects", to: "/projects" },
  { label: "Config", to: "/config" },
] as const;

const activeTab = computed(() => {
  const p = route.path;
  if (p.startsWith("/sessions") || p === "/") return "/";
  if (p.startsWith("/events")) return "/events";
  if (p.startsWith("/projects")) return "/projects";
  if (p.startsWith("/config")) return "/config";
  return "/";
});

const evPerSec = computed(() => stats.evPerSec.toFixed(1));
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-line backdrop-blur"
    style="background: rgba(12, 13, 16, 0.92)"
  >
    <div class="flex h-12 items-center gap-6 px-6 text-[13px]">
      <RouterLink to="/" class="flex items-center gap-2.5">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-fg-1"
          aria-hidden="true"
        >
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
        <span class="font-medium tracking-tight">Periscope</span>
      </RouterLink>

      <nav class="flex items-center gap-1 text-[12.5px] text-fg-2">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          :class="[
            'rounded-chip px-2.5 py-1 transition-colors',
            tab.to === activeTab
              ? 'bg-bg-2 text-fg-1'
              : 'hover:text-fg-1',
          ]"
        >
          {{ tab.label }}
        </RouterLink>
      </nav>

      <div class="ml-auto flex items-center gap-5 text-[12px] text-fg-2">
        <span class="font-mono">
          <BreathingDot tone="run" class="mr-1.5" />{{ stats.active }} active
        </span>
        <VSep />
        <span class="font-mono">{{ evPerSec }} ev/s</span>
        <VSep />
        <span
          class="font-mono"
          title="Periscope server uptime (resets when the process restarts)"
        >{{ formatDurationShort(stats.uptimeMs) }}</span>
      </div>
    </div>
    <slot name="alerts" />
  </header>
</template>
