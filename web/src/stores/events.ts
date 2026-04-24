import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { fetchEventsPage } from "@/lib/api";
import { ensureEventStream, onMessage } from "@/composables/useEventStream";
import type {
  EventFilter,
  EventQueryParams,
  EventRow,
  EventStatusFilter,
} from "@/lib/types";

const FETCH_LIMIT = 200;
const MAX_ROWS = 400;

function makeDefaultFilter(): EventFilter {
  return {
    eventTypes: new Set<string>(),
    q: "",
    sessionId: null,
    tool: null,
    statusOnly: null,
  };
}

function filterToParams(
  f: EventFilter,
  extras: Partial<EventQueryParams> = {},
): EventQueryParams {
  return {
    eventTypes: [...f.eventTypes],
    q: f.q,
    sessionId: f.sessionId,
    tool: f.tool,
    statusOnly: f.statusOnly,
    limit: FETCH_LIMIT,
    ...extras,
  };
}

function matchesFilter(row: EventRow, f: EventFilter): boolean {
  if (f.eventTypes.size > 0 && !f.eventTypes.has(row.event)) return false;
  if (f.sessionId && row.session_id !== f.sessionId) return false;
  if (f.tool && row.tool_name !== f.tool) return false;
  if (f.statusOnly === "error") {
    if (row.event !== "PostToolUseFailure" && row.event !== "StopFailure") {
      return false;
    }
  } else if (f.statusOnly === "denied") {
    if (row.event !== "PermissionDenied") return false;
  }
  if (f.q) {
    const needle = f.q.toLowerCase();
    if (!row.payload.toLowerCase().includes(needle)) return false;
  }
  return true;
}

export const useEventsStore = defineStore("events", () => {
  const items = ref<EventRow[]>([]);
  const filter = ref<EventFilter>(makeDefaultFilter());
  const followLive = ref(true);
  const pending = ref<EventRow[]>([]);
  const hasMore = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Track ids that should animate on entry (freshly arrived via WS).
  const freshIds = ref<Set<number>>(new Set());
  let freshTimer: ReturnType<typeof setTimeout> | null = null;
  function markFresh(id: number): void {
    freshIds.value.add(id);
    if (freshTimer) return;
    freshTimer = setTimeout(() => {
      freshIds.value = new Set();
      freshTimer = null;
    }, 600);
  }

  function capItems(): void {
    if (items.value.length > MAX_ROWS) {
      items.value = items.value.slice(0, MAX_ROWS);
    }
  }

  async function refetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetchEventsPage(filterToParams(filter.value));
      items.value = res.events;
      hasMore.value = res.events.length >= FETCH_LIMIT;
      pending.value = [];
      capItems();
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (!hasMore.value || loading.value) return;
    const oldest = items.value[items.value.length - 1];
    if (!oldest) return;
    loading.value = true;
    try {
      const res = await fetchEventsPage(
        filterToParams(filter.value, { before: oldest.ts }),
      );
      if (res.events.length === 0) {
        hasMore.value = false;
        return;
      }
      // Dedupe by id (paranoia around ts ties).
      const seen = new Set(items.value.map((e) => e.id));
      const fresh = res.events.filter((e) => !seen.has(e.id));
      items.value = [...items.value, ...fresh];
      hasMore.value = res.events.length >= FETCH_LIMIT;
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  function applyWsEvent(row: EventRow): void {
    if (!matchesFilter(row, filter.value)) return;
    if (followLive.value) {
      items.value = [row, ...items.value];
      markFresh(row.id);
      capItems();
    } else {
      pending.value = [row, ...pending.value];
    }
  }

  function flushPending(): void {
    if (pending.value.length === 0) return;
    const merged = [...pending.value, ...items.value];
    for (const r of pending.value) markFresh(r.id);
    pending.value = [];
    items.value = merged;
    capItems();
  }

  function setFollowLive(on: boolean): void {
    followLive.value = on;
    if (on) flushPending();
  }

  function setEventType(name: string, on: boolean): void {
    const next = new Set(filter.value.eventTypes);
    if (on) next.add(name);
    else next.delete(name);
    filter.value = { ...filter.value, eventTypes: next };
  }

  function clearFilters(): void {
    filter.value = makeDefaultFilter();
  }

  let subscribed = false;
  function start(): void {
    if (subscribed) return;
    subscribed = true;
    ensureEventStream();
    void refetch();
    onMessage((msg) => {
      if (msg.type === "event") applyWsEvent(msg.row);
      if (msg.type === "reset") {
        items.value = [];
        pending.value = [];
        void refetch();
      }
    });
  }

  const pendingCount = computed(() => pending.value.length);

  return {
    items,
    filter,
    followLive,
    pending,
    pendingCount,
    hasMore,
    loading,
    error,
    freshIds,
    refetch,
    loadMore,
    flushPending,
    applyWsEvent,
    setFollowLive,
    setEventType,
    clearFilters,
    start,
  };
});

export type { EventFilter, EventStatusFilter };
