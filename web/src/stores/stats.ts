import { defineStore } from "pinia";
import { ref } from "vue";
import { fetchStats } from "@/lib/api";
import { onMessage, ensureEventStream } from "@/composables/useEventStream";
import type { Stats } from "@/lib/types";

export const useStatsStore = defineStore("stats", () => {
  const active = ref(0);
  const evPerSec = ref(0);
  const uptimeMs = ref(0);

  function apply(s: Stats): void {
    active.value = s.active;
    evPerSec.value = s.ev_per_sec;
    uptimeMs.value = s.uptime_ms;
  }

  async function refresh(): Promise<void> {
    try {
      apply(await fetchStats());
    } catch (err) {
      console.error("[stats] refresh failed", err);
    }
  }

  let subscribed = false;
  function start(): void {
    if (subscribed) return;
    subscribed = true;
    ensureEventStream();
    void refresh();
    onMessage((msg) => {
      if (msg.type === "stats") {
        apply({
          active: msg.active,
          ev_per_sec: msg.ev_per_sec,
          uptime_ms: msg.uptime_ms,
        });
      }
      if (msg.type === "reset") void refresh();
    });
  }

  return { active, evPerSec, uptimeMs, start, refresh };
});
