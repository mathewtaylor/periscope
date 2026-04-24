import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import {
  fetchPendingNotifications,
  fetchSessions,
} from "@/lib/api";
import { ensureEventStream, onMessage } from "@/composables/useEventStream";
import { usePreferencesStore } from "./preferences";
import type {
  PendingNotification,
  SessionRow,
  WindowLabel,
} from "@/lib/types";

export const useSessionsStore = defineStore("sessions", () => {
  const prefs = usePreferencesStore();
  const active = ref<SessionRow[]>([]);
  const stopped = ref<SessionRow[]>([]);
  const pending = ref<PendingNotification[]>([]);
  const loading = ref(false);
  const lastRefreshAt = ref<number>(0);

  async function refresh(window: WindowLabel = prefs.window): Promise<void> {
    loading.value = true;
    try {
      const [sessions, notifs] = await Promise.all([
        fetchSessions(window),
        fetchPendingNotifications(),
      ]);
      active.value = sessions.active;
      stopped.value = sessions.stopped;
      pending.value = notifs;
      lastRefreshAt.value = Date.now();
    } catch (err) {
      console.error("[sessions] refresh failed", err);
    } finally {
      loading.value = false;
    }
  }

  let subscribed = false;
  function start(): void {
    if (subscribed) return;
    subscribed = true;
    ensureEventStream();
    void refresh();

    // Throttled re-fetch on every event — we rely on server-derived state
    // rather than client-side reduction for correctness in v1.
    let pendingFetch: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (pendingFetch) return;
      pendingFetch = setTimeout(() => {
        pendingFetch = null;
        void refresh();
      }, 250);
    };

    onMessage((msg) => {
      if (msg.type === "event") scheduleRefetch();
      if (msg.type === "reset") {
        active.value = [];
        stopped.value = [];
        pending.value = [];
        void refresh();
      }
    });

    watch(
      () => prefs.window,
      (w) => {
        void refresh(w);
      },
    );
  }

  const activeAwaiting = computed(() =>
    active.value.filter(
      (s) => s.state === "wait" && !prefs.isMuted(s.session_id),
    ),
  );

  const visiblePending = computed(() =>
    pending.value.filter((p) => !prefs.isMuted(p.session_id)),
  );

  const bySessionId = computed(
    () => new Map(active.value.concat(stopped.value).map((s) => [s.session_id, s])),
  );

  return {
    active,
    stopped,
    pending,
    loading,
    lastRefreshAt,
    activeAwaiting,
    visiblePending,
    bySessionId,
    refresh,
    start,
  };
});
