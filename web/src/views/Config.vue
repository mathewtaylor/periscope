<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { clearAllEvents } from "@/lib/api";
import { useSessionsStore } from "@/stores/sessions";

const router = useRouter();
const sessions = useSessionsStore();

const host = ref(
  typeof window !== "undefined" ? window.location.origin : "http://localhost:5050",
);

const hookConfig = computed(() => {
  const base = host.value.replace(/\/+$/, "");
  const hooks = {
    SessionStart: [
      { hooks: [{ type: "http", url: `${base}/hook/SessionStart` }] },
    ],
    SessionEnd: [
      { hooks: [{ type: "http", url: `${base}/hook/SessionEnd` }] },
    ],
    UserPromptSubmit: [
      { hooks: [{ type: "http", url: `${base}/hook/UserPromptSubmit` }] },
    ],
    PreToolUse: [
      {
        matcher: "*",
        hooks: [{ type: "http", url: `${base}/hook/PreToolUse` }],
      },
    ],
    PostToolUse: [
      {
        matcher: "*",
        hooks: [{ type: "http", url: `${base}/hook/PostToolUse` }],
      },
    ],
    SubagentStart: [
      { hooks: [{ type: "http", url: `${base}/hook/SubagentStart` }] },
    ],
    SubagentStop: [
      { hooks: [{ type: "http", url: `${base}/hook/SubagentStop` }] },
    ],
    Notification: [
      { hooks: [{ type: "http", url: `${base}/hook/Notification` }] },
    ],
    Stop: [
      { hooks: [{ type: "http", url: `${base}/hook/Stop` }] },
    ],
    PreCompact: [
      { hooks: [{ type: "http", url: `${base}/hook/PreCompact` }] },
    ],
  };
  return JSON.stringify({ hooks }, null, 2);
});

const copyState = ref<"idle" | "copied" | "error">("idle");
async function copy() {
  try {
    await navigator.clipboard.writeText(hookConfig.value);
    copyState.value = "copied";
    setTimeout(() => (copyState.value = "idle"), 1800);
  } catch {
    copyState.value = "error";
    setTimeout(() => (copyState.value = "idle"), 2500);
  }
}

const confirming = ref(false);
const clearing = ref(false);
const clearError = ref<string | null>(null);
const clearedCount = ref<number | null>(null);

async function runClear() {
  clearing.value = true;
  clearError.value = null;
  try {
    const { cleared } = await clearAllEvents();
    clearedCount.value = cleared;
    confirming.value = false;
    // Client will also receive a ws "reset" message; force a local refresh for
    // good measure.
    void sessions.refresh();
    setTimeout(() => (clearedCount.value = null), 4000);
  } catch (err) {
    clearError.value = (err as Error).message;
  } finally {
    clearing.value = false;
  }
}

function goHome() {
  void router.push("/");
}
</script>

<template>
  <section class="px-6 pt-7 pb-16">
    <div class="mb-6">
      <h1 class="text-[24px] font-medium tracking-tight">Config</h1>
      <p class="mt-0.5 text-[12.5px] text-fg-2">
        Hook configuration and housekeeping for this Periscope instance.
      </p>
    </div>

    <section class="mb-10 rounded-tile border border-line bg-bg-1 p-6">
      <div class="mb-4 flex items-start justify-between gap-6">
        <div>
          <h2
            class="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-3"
          >
            step 1 — hook configuration
          </h2>
          <p class="mt-2 text-[13px] text-fg-1">
            Paste the block below into
            <code class="font-mono text-fg">~/.claude/settings.json</code>
            on every machine you want to observe. It wires every relevant
            Claude Code hook event to this Periscope instance.
          </p>
        </div>
      </div>

      <label class="block">
        <span
          class="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3"
        >
          collector host
        </span>
        <input
          v-model="host"
          type="text"
          class="mt-1.5 w-full rounded-chip border border-line bg-bg-2 px-3 py-2 font-mono text-[12.5px] text-fg focus:border-line-2 focus:outline-none"
          spellcheck="false"
        />
        <p class="mt-1.5 font-mono text-[11px] text-fg-3">
          Where Claude Code should POST hook events. Default is the dashboard
          URL. Change to a Tailscale hostname (e.g.
          <code>http://home-server:5050</code>) if other machines need to
          reach it.
        </p>
      </label>

      <div class="relative mt-5">
        <pre
          class="max-h-[520px] overflow-auto rounded-tile border border-line bg-bg px-4 py-3 font-mono text-[12px] leading-relaxed text-fg-1"
        >{{ hookConfig }}</pre>
        <button
          type="button"
          class="absolute right-3 top-3 rounded-chip border border-line bg-bg-2 px-2.5 py-1 font-mono text-[11px] text-fg-1 transition-colors hover:border-line-2 hover:text-fg"
          @click="copy"
        >
          <template v-if="copyState === 'copied'">✓ copied</template>
          <template v-else-if="copyState === 'error'">copy failed</template>
          <template v-else>copy</template>
        </button>
      </div>

      <ol
        class="mt-6 space-y-3 text-[13px] text-fg-1"
      >
        <li class="flex gap-3">
          <span
            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
          >
            1
          </span>
          <span>
            Copy the JSON above (click
            <span class="font-mono text-fg">copy</span>) and paste it into
            <code class="font-mono text-fg">~/.claude/settings.json</code>.
            If the file already has a top-level <code class="font-mono text-fg">"hooks"</code>
            key, merge by adding each event handler into the existing arrays
            rather than overwriting.
          </span>
        </li>
        <li class="flex gap-3">
          <span
            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
          >
            2
          </span>
          <span>
            Open a new Claude Code session and run
            <code class="font-mono text-fg">/hooks</code>. Claude Code
            requires explicit approval of any hook changes before they take
            effect; step through the prompts and accept each one.
          </span>
        </li>
        <li class="flex gap-3">
          <span
            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
          >
            3
          </span>
          <span>
            Run any command. Within a second, its session should appear on
            the
            <button
              type="button"
              class="font-mono text-run hover:underline"
              @click="goHome"
            >
              Sessions home
            </button>
            with a live sparkline.
          </span>
        </li>
        <li class="flex gap-3">
          <span
            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
          >
            4
          </span>
          <span>
            Hooks are non-blocking: if Periscope is down, Claude Code
            continues normally. The collector returns
            <code class="font-mono text-fg">200 {"ok":true}</code> as fast as
            possible and persists events asynchronously.
          </span>
        </li>
      </ol>
    </section>

    <section class="rounded-tile border border-line bg-bg-1 p-6">
      <h2
        class="font-mono text-[11px] uppercase tracking-[0.14em] text-err"
      >
        danger zone
      </h2>
      <p class="mt-2 text-[13px] text-fg-1">
        Clear every event in the local SQLite database. This does not touch
        your Claude Code machines — it only wipes what Periscope has
        collected. Useful after a noisy experiment or before sharing
        screenshots.
      </p>

      <div class="mt-4 flex items-center gap-3">
        <button
          v-if="!confirming"
          type="button"
          class="rounded-chip border px-3 py-1.5 font-mono text-[12px] text-err transition-colors hover:bg-[rgba(226,122,114,0.08)]"
          style="border-color: rgba(226, 122, 114, 0.35)"
          @click="confirming = true"
        >
          Clear database…
        </button>
        <template v-else>
          <span class="font-mono text-[12px] text-fg-1">
            Permanently delete all events?
          </span>
          <button
            type="button"
            :disabled="clearing"
            class="rounded-chip border px-3 py-1.5 font-mono text-[12px] text-err transition-colors hover:bg-[rgba(226,122,114,0.12)] disabled:opacity-50"
            style="border-color: rgba(226, 122, 114, 0.6)"
            @click="runClear"
          >
            {{ clearing ? "clearing…" : "yes, clear" }}
          </button>
          <button
            type="button"
            :disabled="clearing"
            class="rounded-chip px-3 py-1.5 font-mono text-[12px] text-fg-2 hover:text-fg-1 disabled:opacity-50"
            @click="confirming = false"
          >
            cancel
          </button>
        </template>

        <span
          v-if="clearedCount !== null"
          class="font-mono text-[12px] text-ok"
        >
          ✓ cleared {{ clearedCount }} events
        </span>
        <span
          v-if="clearError"
          class="font-mono text-[12px] text-err"
        >
          error: {{ clearError }}
        </span>
      </div>
    </section>
  </section>
</template>
