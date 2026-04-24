<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchProjects } from "@/lib/api";
import type { ProjectRow } from "@/lib/types";
import { formatRelative } from "@/lib/time";

const router = useRouter();
const rows = ref<ProjectRow[]>([]);
const loading = ref(true);
const now = ref(Date.now());

let tickInterval: ReturnType<typeof setInterval> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

async function load(): Promise<void> {
  try {
    const next = await fetchProjects();
    rows.value = next;
  } catch (err) {
    // Swallow; empty state renders while errors persist. Log to console for dev.
    console.error("[projects] fetch failed", err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
  tickInterval = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  pollInterval = setInterval(() => {
    void load();
  }, 30_000);
});

onBeforeUnmount(() => {
  if (tickInterval) clearInterval(tickInterval);
  if (pollInterval) clearInterval(pollInterval);
});

const activeCount = computed(
  () => rows.value.filter((r) => r.active_now).length,
);

const subtitle = computed(() => {
  const n = rows.value.length;
  const m = activeCount.value;
  return `${n} ${n === 1 ? "project" : "projects"} · ${m} active now`;
});

// Tool mix color palette (matches SessionDetail/SummaryCard.vue)
const TOOL_MIX_COLORS: Record<string, string> = {
  Read: "#363c46",
  Edit: "#3a3258",
  Write: "#3a3258",
  Bash: "#2a4366",
  Grep: "#4a5162",
  Glob: "#4a5162",
  WebFetch: "#58431d",
  WebSearch: "#58431d",
  Task: "#58431d",
  other: "#2b3039",
};

function colorFor(name: string): string {
  return TOOL_MIX_COLORS[name] ?? "#363c46";
}

interface MixBar {
  name: string;
  count: number;
  pct: number;
  color: string;
}

function mixBars(mix: ProjectRow["tool_mix"]): MixBar[] {
  const total = mix.reduce((s, t) => s + t.count, 0);
  if (total === 0) return [];
  return mix.map((t) => ({
    name: t.name,
    count: t.count,
    pct: (t.count / total) * 100,
    color: colorFor(t.name),
  }));
}

function mixTitle(mix: ProjectRow["tool_mix"]): string {
  if (mix.length === 0) return "no tool calls in the last 24h";
  return mix.map((t) => `${t.name} ${t.count}`).join(" · ");
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function go(project: string): void {
  void router.push({ path: "/", query: { project } });
}
</script>

<template>
  <section class="px-6 pt-7">
    <div class="mb-4">
      <h1 class="text-[24px] font-medium tracking-tight">Projects</h1>
      <p class="mt-0.5 text-[12.5px] text-fg-2">{{ subtitle }}</p>
    </div>

    <div
      class="rounded-tile border border-line bg-bg-1 text-[12.5px]"
    >
      <div
        class="grid grid-cols-[1fr_48px_120px_100px_80px_180px_120px] items-center border-b border-line px-4 py-2 font-mono uppercase tracking-[0.12em] text-[10.5px] text-fg-3"
      >
        <span>project</span>
        <span class="text-center">active</span>
        <span>sessions 24h/total</span>
        <span>events 24h</span>
        <span>errors</span>
        <span>tool mix 24h</span>
        <span class="text-right">last activity</span>
      </div>

      <div
        v-if="loading"
        class="px-4 py-10 text-center font-mono text-fg-3"
      >
        loading…
      </div>
      <div
        v-else-if="rows.length === 0"
        class="px-4 py-10 text-center font-mono text-fg-3"
      >
        no projects yet — events ingested with a cwd will appear here
      </div>
      <button
        v-else
        v-for="(r, idx) in rows"
        :key="r.project"
        type="button"
        :class="[
          'grid w-full grid-cols-[1fr_48px_120px_100px_80px_180px_120px] items-center px-4 py-2.5 text-left transition-colors hover:bg-bg-2',
          idx === 0 ? '' : 'border-t border-line',
        ]"
        :title="r.cwd_sample"
        @click="go(r.project)"
      >
        <span class="truncate font-mono text-fg-1">{{ r.project }}</span>
        <span class="flex items-center justify-center">
          <span
            :class="[
              'inline-block h-1.5 w-1.5 rounded-full',
              r.active_now ? 'bg-run' : 'bg-fg-3',
            ]"
            :title="r.active_now ? 'active in the last 30 min' : 'idle'"
            aria-hidden="true"
          />
        </span>
        <span class="font-mono tabular-nums text-fg-2">
          {{ r.session_count_24h }} /
          <span class="text-fg-3">{{ r.session_count_total }}</span>
        </span>
        <span class="font-mono tabular-nums text-fg-2">
          {{ formatCount(r.event_count_24h) }}
        </span>
        <span
          :class="[
            'font-mono tabular-nums',
            r.error_count_24h > 0 ? 'text-err' : 'text-fg-3',
          ]"
        >
          {{ r.error_count_24h }}
        </span>
        <span class="pr-4" :title="mixTitle(r.tool_mix)">
          <span
            v-if="mixBars(r.tool_mix).length === 0"
            class="font-mono text-fg-3"
            >—</span
          >
          <span
            v-else
            class="flex h-2 gap-0.5 overflow-hidden rounded"
          >
            <span
              v-for="bar in mixBars(r.tool_mix)"
              :key="bar.name"
              :style="{ width: `${bar.pct}%`, background: bar.color }"
            />
          </span>
        </span>
        <span class="text-right font-mono text-fg-3">
          {{ formatRelative(r.last_event_at, now) }}
        </span>
      </button>
    </div>
  </section>
</template>
