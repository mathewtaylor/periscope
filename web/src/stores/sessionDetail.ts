import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  fetchSession,
  fetchSessionSummary,
  type SessionSummary,
} from "@/lib/api";
import { ensureEventStream, onMessage } from "@/composables/useEventStream";
import { usePreferencesStore } from "./preferences";
import type { EventRow, SessionRow } from "@/lib/types";
import { buildLanes, windowBounds, type Lane } from "@/lib/correlate";

export const useSessionDetailStore = defineStore("sessionDetail", () => {
  const prefs = usePreferencesStore();
  const currentId = ref<string | null>(null);
  const session = ref<SessionRow | null>(null);
  const prompt = ref<{ body: string; ts: string } | undefined>(undefined);
  const events = ref<EventRow[]>([]);
  const summary = ref<SessionSummary | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const now = ref(Date.now());

  const lanes = computed<Lane[]>(() => buildLanes(events.value, now.value));
  const bounds = computed(() =>
    windowBounds(events.value, session.value?.state ?? "idle", now.value),
  );

  async function load(sessionId: string): Promise<void> {
    currentId.value = sessionId;
    loading.value = true;
    error.value = null;
    try {
      const [detail, sum] = await Promise.all([
        fetchSession(sessionId, prefs.window),
        fetchSessionSummary(sessionId),
      ]);
      session.value = detail.session;
      prompt.value = detail.prompt;
      events.value = detail.events ?? [];
      summary.value = sum;
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  let stopListening: (() => void) | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let nowTimer: ReturnType<typeof setInterval> | null = null;

  function scheduleRefresh(): void {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (currentId.value) void load(currentId.value);
    }, 300);
  }

  function start(sessionId: string): void {
    void load(sessionId);

    if (!stopListening) {
      ensureEventStream();
      stopListening = onMessage((msg) => {
        if (msg.type === "event" && msg.row.session_id === currentId.value) {
          events.value = [...events.value, msg.row];
          scheduleRefresh();
        }
        if (msg.type === "reset") {
          events.value = [];
          session.value = null;
          prompt.value = undefined;
          summary.value = null;
          // No point loading — the session is gone. The user will be redirected
          // by the sessions list refresh.
        }
      });
    }

    if (!nowTimer) {
      nowTimer = setInterval(() => {
        now.value = Date.now();
      }, 1000);
    }
  }

  function stop(): void {
    stopListening?.();
    stopListening = null;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    if (nowTimer) clearInterval(nowTimer);
    nowTimer = null;
    currentId.value = null;
    session.value = null;
    prompt.value = undefined;
    events.value = [];
    summary.value = null;
    error.value = null;
  }

  return {
    currentId,
    session,
    prompt,
    events,
    summary,
    loading,
    error,
    now,
    lanes,
    bounds,
    load,
    start,
    stop,
  };
});
