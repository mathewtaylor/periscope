<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useEventsStore } from "@/stores/events";
import { useSessionsStore } from "@/stores/sessions";
import { formatStartTimeSeconds } from "@/lib/time";
import type { EventRow } from "@/lib/types";
import BreathingDot from "@/components/ui/BreathingDot.vue";

const router = useRouter();
const events = useEventsStore();
const sessions = useSessionsStore();

// Event-kind chips shown in the filter bar.
const EVENT_KINDS: readonly string[] = [
  "PreToolUse",
  "PostToolUseFailure",
  "PermissionDenied",
  "SubagentStart",
  "SubagentStop",
  "Notification",
  "Stop",
  "StopFailure",
  "SessionStart",
  "SessionEnd",
];

// Free-text search — local ref wired to store with a debounce.
const searchInput = ref("");
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchInput, (v) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    events.filter.q = v;
  }, 300);
});

// Every time the server-side filter changes, refetch.
watch(
  () => {
    const f = events.filter;
    return [
      [...f.eventTypes].sort().join("|"),
      f.q,
      f.sessionId ?? "",
      f.tool ?? "",
      f.statusOnly ?? "",
    ].join("::");
  },
  () => {
    void events.refetch();
  },
);

onMounted(() => {
  events.start();
  sessions.start();
});

function isKindSelected(kind: string): boolean {
  return events.filter.eventTypes.has(kind);
}
function toggleKind(kind: string): void {
  events.setEventType(kind, !isKindSelected(kind));
}

function clearAll(): void {
  searchInput.value = "";
  events.clearFilters();
}

function hasAnyFilter(): boolean {
  const f = events.filter;
  return (
    f.eventTypes.size > 0 ||
    f.q.length > 0 ||
    f.sessionId !== null ||
    f.tool !== null ||
    f.statusOnly !== null
  );
}

// Project lookup — from the sessions store we know.
function projectFor(sessionId: string): string {
  return sessions.bySessionId.get(sessionId)?.project ?? "—";
}

// Row rendering helpers — mirror RecentList.vue's displayFor/toolTargetShort,
// adapted for a denser cross-session table.
interface DisplayRow {
  id: number;
  ts: string;
  hhmmss: string;
  sessionId: string;
  project: string;
  laneLabel: string;
  laneTone: string;
  verb: string;
  verbTone: string;
  status: "ok" | "err" | "attn" | "none";
  fresh: boolean;
}

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toolTargetShort(
  toolName: string | null,
  input: Record<string, unknown> | undefined,
): string {
  if (!toolName || !input) return "";
  const t = input;
  switch (toolName) {
    case "Bash":
      return String(t.command ?? "");
    case "Edit":
    case "Write":
    case "Read": {
      const p = String(t.file_path ?? "");
      const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
      return idx >= 0 ? p.slice(idx + 1) : p;
    }
    case "Grep":
      return `"${String(t.pattern ?? "")}"`;
    case "WebFetch":
      try {
        return new URL(String(t.url ?? "")).hostname;
      } catch {
        return String(t.url ?? "");
      }
    default:
      return "";
  }
}

function displayFor(e: EventRow): DisplayRow {
  const lane = e.agent_id
    ? { label: e.agent_type || "sub", tone: "text-sub" }
    : { label: "main", tone: "text-fg-2" };
  const payload = parsePayload(e.payload);
  const input = payload?.tool_input as Record<string, unknown> | undefined;

  let verb = e.event;
  let verbTone = "text-fg-1";
  let status: DisplayRow["status"] = "none";

  switch (e.event) {
    case "PreToolUse": {
      const target = toolTargetShort(e.tool_name, input);
      verb = `${e.tool_name ?? ""}${target ? " " + target : ""}`.trim();
      verbTone = "text-run";
      status = "ok";
      break;
    }
    case "PostToolUse": {
      verb = `${e.tool_name ?? "tool"} done`;
      verbTone = "text-fg-2";
      status = "ok";
      break;
    }
    case "PostToolUseFailure": {
      const err =
        typeof payload?.error === "string" ? payload.error : "error";
      verb = `${e.tool_name ?? "tool"} — ${err}`;
      verbTone = "text-err";
      status = "err";
      break;
    }
    case "PermissionDenied":
      verb = `${e.tool_name ?? "tool"} denied by policy`;
      verbTone = "text-attn";
      status = "attn";
      break;
    case "SubagentStart":
      verb = `spawn → ${e.agent_type ?? "sub"}`;
      verbTone = "text-sub";
      break;
    case "SubagentStop":
      verb = `${e.agent_type ?? "sub"} returned`;
      verbTone = "text-ok";
      status = "ok";
      break;
    case "Notification": {
      const t =
        typeof payload?.notification_type === "string"
          ? payload.notification_type
          : "notify";
      verb = t;
      verbTone = "text-attn";
      status = "attn";
      break;
    }
    case "UserPromptSubmit":
      verb = "user prompt";
      verbTone = "text-fg-1";
      break;
    case "Stop": {
      const reason =
        typeof payload?.stop_reason === "string" ? payload.stop_reason : "";
      verb = reason ? `turn ended · ${reason}` : "turn ended";
      verbTone = "text-fg-2";
      break;
    }
    case "StopFailure": {
      const errType =
        typeof payload?.error_type === "string" ? payload.error_type : "error";
      verb = `stop failure · ${errType}`;
      verbTone = "text-err";
      status = "err";
      break;
    }
    case "SessionStart":
      verb = "session start";
      verbTone = "text-fg-2";
      break;
    case "SessionEnd":
      verb = "session end";
      verbTone = "text-fg-2";
      break;
    default:
      verb = e.event;
      verbTone = "text-fg-3";
  }

  return {
    id: e.id,
    ts: e.ts,
    hhmmss: formatStartTimeSeconds(e.ts),
    sessionId: e.session_id,
    project: projectFor(e.session_id),
    laneLabel: lane.label,
    laneTone: lane.tone,
    verb,
    verbTone,
    status,
    fresh: events.freshIds.has(e.id),
  };
}

const displayRows = computed<DisplayRow[]>(() =>
  events.items.map((e) => displayFor(e)),
);

const subtitle = computed(
  () => `live event log · ${events.items.length} shown`,
);

// Session dropdown options — project + short id.
interface SessionOption {
  value: string;
  label: string;
}
const sessionOptions = computed<SessionOption[]>(() => {
  const all = [...sessions.active, ...sessions.stopped];
  return all.map((s) => ({
    value: s.session_id,
    label: `${s.project} · ${s.session_id.slice(0, 8)}`,
  }));
});

function goToSession(sessionId: string): void {
  void router.push(`/sessions/${encodeURIComponent(sessionId)}`);
}

function statusPillClass(
  status: DisplayRow["status"],
): { text: string; border: string; label: string } | null {
  switch (status) {
    case "ok":
      return { text: "text-ok", border: "border-ok/40", label: "ok" };
    case "err":
      return { text: "text-err", border: "border-err/50", label: "err" };
    case "attn":
      return { text: "text-attn", border: "border-attn/50", label: "attn" };
    default:
      return null;
  }
}
</script>

<template>
  <section class="px-6 pt-7 pb-16">
    <div class="mb-5">
      <h1 class="text-[24px] font-medium tracking-tight">Events</h1>
      <p class="mt-0.5 text-[12.5px] text-fg-2">{{ subtitle }}</p>
    </div>

    <!-- Filter bar -->
    <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <!-- Event kind chips -->
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="kind in EVENT_KINDS"
          :key="kind"
          type="button"
          :class="[
            'rounded-full border px-2.5 py-[3px] font-mono text-[11px] transition-colors',
            isKindSelected(kind)
              ? 'border-line-2 bg-bg-2 text-fg-1'
              : 'border-line bg-transparent text-fg-2 hover:border-line-2 hover:text-fg-1',
          ]"
          @click="toggleKind(kind)"
        >
          {{ kind }}
        </button>
      </div>

      <!-- Free-text search -->
      <input
        v-model="searchInput"
        type="text"
        placeholder="search payload…"
        class="w-[220px] rounded-chip border border-line bg-bg-2 px-3 py-1.5 font-mono text-[12.5px] text-fg placeholder:text-fg-3 focus:border-line-2 focus:outline-none"
        spellcheck="false"
      />

      <!-- Session filter -->
      <select
        :value="events.filter.sessionId ?? ''"
        class="rounded-chip border border-line bg-bg-2 px-2 py-1.5 font-mono text-[12.5px] text-fg-1 focus:border-line-2 focus:outline-none"
        @change="
          (e) =>
            (events.filter.sessionId =
              (e.target as HTMLSelectElement).value || null)
        "
      >
        <option value="">all sessions</option>
        <option
          v-for="o in sessionOptions"
          :key="o.value"
          :value="o.value"
        >
          {{ o.label }}
        </option>
      </select>

      <!-- Follow-live toggle -->
      <button
        type="button"
        :class="[
          'flex items-center gap-1.5 rounded-chip border px-2.5 py-1.5 font-mono text-[11.5px] transition-colors',
          events.followLive
            ? 'border-line-2 bg-bg-2 text-run'
            : 'border-line text-fg-2 hover:text-fg-1',
        ]"
        @click="events.setFollowLive(!events.followLive)"
      >
        <BreathingDot
          v-if="events.followLive"
          tone="run"
          :size="6"
        />
        <span
          v-else
          class="inline-block h-1.5 w-1.5 rounded-full bg-fg-3"
          aria-hidden="true"
        />
        follow live
      </button>

      <!-- Clear -->
      <button
        v-if="hasAnyFilter()"
        type="button"
        class="rounded-chip px-2 py-1.5 font-mono text-[11.5px] text-fg-2 transition-colors hover:text-fg-1"
        @click="clearAll"
      >
        clear filters
      </button>

      <span class="ml-auto font-mono text-[11px] text-fg-3">
        limit {{ 200 }} · max {{ 400 }} in view
      </span>
    </div>

    <!-- Pending "N new" chip, only visible when paused -->
    <div
      v-if="!events.followLive && events.pendingCount > 0"
      class="mb-2 flex justify-center"
    >
      <button
        type="button"
        class="rounded-full border border-line-2 bg-bg-2 px-3 py-1 font-mono text-[11.5px] text-run transition-colors hover:bg-bg-3"
        @click="events.flushPending()"
      >
        ↑ {{ events.pendingCount }} new
      </button>
    </div>

    <!-- Event table -->
    <div
      v-if="displayRows.length > 0"
      class="rounded-tile border border-line bg-bg-1"
    >
      <div
        class="grid grid-cols-[80px_140px_80px_1fr_80px] items-center gap-x-3 border-b border-line px-4 py-2 font-mono uppercase tracking-[0.12em] text-[10.5px] text-fg-3"
      >
        <span>time</span>
        <span>project</span>
        <span>lane</span>
        <span>event · target</span>
        <span class="text-right">status</span>
      </div>

      <ul class="divide-y divide-line">
        <li
          v-for="r in displayRows"
          :key="r.id"
          :class="[
            'grid cursor-pointer grid-cols-[80px_140px_80px_1fr_80px] items-center gap-x-3 px-4 py-1.5 font-mono text-[12px] transition-colors hover:bg-bg-2',
            r.fresh ? 'animate-slide-up' : '',
          ]"
          @click="goToSession(r.sessionId)"
        >
          <span class="text-fg-3 tabular-nums">{{ r.hhmmss }}</span>
          <span class="truncate text-fg-1" :title="r.project">{{ r.project }}</span>
          <span :class="['truncate', r.laneTone]">{{ r.laneLabel }}</span>
          <span :class="['truncate', r.verbTone]" :title="r.verb">{{ r.verb }}</span>
          <span class="flex justify-end">
            <template v-if="statusPillClass(r.status)">
              <span
                :class="[
                  'rounded-full border px-2 py-[1px] text-[10.5px]',
                  statusPillClass(r.status)!.text,
                  statusPillClass(r.status)!.border,
                ]"
                >{{ statusPillClass(r.status)!.label }}</span
              >
            </template>
            <span v-else class="text-fg-3">—</span>
          </span>
        </li>
      </ul>

      <div
        v-if="events.hasMore"
        class="border-t border-line px-4 py-3 text-center"
      >
        <button
          type="button"
          :disabled="events.loading"
          class="rounded-chip border border-line bg-bg-2 px-4 py-1.5 font-mono text-[11.5px] text-fg-1 transition-colors hover:border-line-2 disabled:opacity-50"
          @click="events.loadMore()"
        >
          {{ events.loading ? "loading…" : "load older" }}
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="rounded-tile border border-dashed border-line p-10 text-center font-mono text-[12.5px] text-fg-3"
    >
      <template v-if="events.loading">loading events…</template>
      <template v-else-if="events.error">error: {{ events.error }}</template>
      <template v-else-if="hasAnyFilter()">
        no events match the current filters
      </template>
      <template v-else>
        no events yet — configure a hook on a Claude Code session to get started
      </template>
    </div>
  </section>
</template>
