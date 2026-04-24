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

// Legacy HTTP hooks — kept as a collapsed alternative for users who
// don't want a client-side install.
const httpConfig = computed(() => {
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
    Stop: [{ hooks: [{ type: "http", url: `${base}/hook/Stop` }] }],
    PreCompact: [
      { hooks: [{ type: "http", url: `${base}/hook/PreCompact` }] },
    ],
  };
  return JSON.stringify({ hooks }, null, 2);
});

const httpCopyState = ref<"idle" | "copied" | "error">("idle");
async function copyHttp() {
  try {
    await navigator.clipboard.writeText(httpConfig.value);
    httpCopyState.value = "copied";
    setTimeout(() => (httpCopyState.value = "idle"), 1800);
  } catch {
    httpCopyState.value = "error";
    setTimeout(() => (httpCopyState.value = "idle"), 2500);
  }
}

const relayPath = ref("~/.local/bin/periscope-relay.ts");

const relayEnvLine = computed(() => {
  const base = host.value.replace(/\/+$/, "");
  return `export PERISCOPE_URL=${base}`;
});

const relayFullConfig = computed(() => {
  const cmd = `bun ${relayPath.value}`;
  const hooks = {
    SessionStart: [{ hooks: [{ type: "command", command: cmd }] }],
    SessionEnd: [{ hooks: [{ type: "command", command: cmd }] }],
    UserPromptSubmit: [{ hooks: [{ type: "command", command: cmd }] }],
    PreToolUse: [
      { matcher: "*", hooks: [{ type: "command", command: cmd }] },
    ],
    PostToolUse: [
      { matcher: "*", hooks: [{ type: "command", command: cmd }] },
    ],
    PostToolUseFailure: [
      { matcher: "*", hooks: [{ type: "command", command: cmd }] },
    ],
    PermissionDenied: [{ hooks: [{ type: "command", command: cmd }] }],
    SubagentStart: [{ hooks: [{ type: "command", command: cmd }] }],
    SubagentStop: [{ hooks: [{ type: "command", command: cmd }] }],
    Notification: [{ hooks: [{ type: "command", command: cmd }] }],
    Stop: [{ hooks: [{ type: "command", command: cmd }] }],
    StopFailure: [{ hooks: [{ type: "command", command: cmd }] }],
    PreCompact: [{ hooks: [{ type: "command", command: cmd }] }],
  };
  return JSON.stringify({ hooks }, null, 2);
});

const relayCopyState = ref<"idle" | "copied" | "error">("idle");
async function copyRelay() {
  try {
    await navigator.clipboard.writeText(relayFullConfig.value);
    relayCopyState.value = "copied";
    setTimeout(() => (relayCopyState.value = "idle"), 1800);
  } catch {
    relayCopyState.value = "error";
    setTimeout(() => (relayCopyState.value = "idle"), 2500);
  }
}

const envCopyState = ref<"idle" | "copied" | "error">("idle");
async function copyEnv() {
  try {
    await navigator.clipboard.writeText(relayEnvLine.value);
    envCopyState.value = "copied";
    setTimeout(() => (envCopyState.value = "idle"), 1800);
  } catch {
    envCopyState.value = "error";
    setTimeout(() => (envCopyState.value = "idle"), 2500);
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

    <!-- Primary: install the enrichment relay -->
    <section class="mb-10 rounded-tile border border-line bg-bg-1 p-6">
      <div class="mb-4">
        <h2
          class="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-3"
        >
          step 1 — hook configuration (with enrichment relay)
        </h2>
        <p class="mt-2 text-[13px] text-fg-1">
          Wires Claude Code hooks through a small local Bun script
          (<code class="font-mono text-fg">periscope-relay.ts</code>) that
          enriches every payload with hostname, git context, and live token
          counts read fresh from the transcript file, then forwards to this
          collector. This is the recommended path — without the relay,
          tokens and remaining-context stay blank.
        </p>
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
          Where the relay should POST. Default is this dashboard's URL. Change
          to a Tailscale hostname (e.g.
          <code>http://home-server:5050</code>) if other machines need to
          reach it.
        </p>
      </label>

      <label class="mt-5 block">
        <span
          class="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3"
        >
          relay script path (on the client machine)
        </span>
        <input
          v-model="relayPath"
          type="text"
          class="mt-1.5 w-full rounded-chip border border-line bg-bg-2 px-3 py-2 font-mono text-[12.5px] text-fg focus:border-line-2 focus:outline-none"
          spellcheck="false"
        />
        <p class="mt-1.5 font-mono text-[11px] text-fg-3">
          Stable absolute path where
          <code class="text-fg">periscope-relay.ts</code> lives on each
          Claude Code machine. On Windows use something like
          <code class="text-fg">%USERPROFILE%\bin\periscope-relay.ts</code>.
        </p>
      </label>

      <div
        class="mt-3 flex items-start gap-3 rounded-tile border border-line bg-bg-2 p-3"
      >
        <span
          class="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3"
        >
          tip
        </span>
        <p class="flex-1 text-[12.5px] text-fg-1">
          From the Periscope repo root you can run
          <code class="font-mono text-fg">./install-relay.sh</code> to copy
          the script to
          <code class="font-mono text-fg">~/.local/bin/periscope-relay.ts</code>
          in one step (pass
          <code class="font-mono text-fg">--path &lt;dir&gt;</code> to override).
          The installer prints the exact
          <code class="font-mono text-fg">bun &lt;path&gt;</code> command to
          paste into <code class="font-mono text-fg">settings.json</code>.
        </p>
      </div>

      <ol class="mt-6 space-y-3 text-[13px] text-fg-1">
        <li class="flex gap-3">
          <span
            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
          >
            1
          </span>
          <span>
            Copy
            <code class="font-mono text-fg">scripts/periscope-relay.ts</code>
            from the Periscope repo to the path above on every machine you
            want observed.
          </span>
        </li>
        <li class="flex gap-3">
          <span
            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
          >
            2
          </span>
          <div class="flex-1">
            Set <code class="font-mono text-fg">PERISCOPE_URL</code> in the
            shell that Claude Code runs under (your shell rc / Windows user
            env). Export line:
            <div class="relative mt-2">
              <pre
                class="overflow-auto rounded-tile border border-line bg-bg px-3 py-2 font-mono text-[12px] text-fg-1"
              >{{ relayEnvLine }}</pre>
              <button
                type="button"
                class="absolute right-2 top-2 rounded-chip border border-line bg-bg-2 px-2 py-0.5 font-mono text-[10.5px] text-fg-1 transition-colors hover:border-line-2 hover:text-fg"
                @click="copyEnv"
              >
                <template v-if="envCopyState === 'copied'">✓</template>
                <template v-else-if="envCopyState === 'error'">fail</template>
                <template v-else>copy</template>
              </button>
            </div>
          </div>
        </li>
        <li class="flex gap-3">
          <span
            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
          >
            3
          </span>
          <span>
            Paste the JSON below into
            <code class="font-mono text-fg">~/.claude/settings.json</code>.
            If the file already has a
            <code class="font-mono text-fg">"hooks"</code> key, merge entries
            rather than overwriting the block.
          </span>
        </li>
        <li class="flex gap-3">
          <span
            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
          >
            4
          </span>
          <span>
            Open Claude Code and run
            <code class="font-mono text-fg">/hooks</code> to approve the new
            command-type hooks. Claude Code requires review before they take
            effect.
          </span>
        </li>
        <li class="flex gap-3">
          <span
            class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
          >
            5
          </span>
          <span>
            Send any prompt. The session should appear on
            <button
              type="button"
              class="font-mono text-run hover:underline"
              @click="goHome"
            >
              Sessions home
            </button>
            with tokens + git context populated.
          </span>
        </li>
      </ol>

      <div class="relative mt-6">
        <pre
          class="max-h-[520px] overflow-auto rounded-tile border border-line bg-bg px-4 py-3 font-mono text-[12px] leading-relaxed text-fg-1"
        >{{ relayFullConfig }}</pre>
        <button
          type="button"
          class="absolute right-3 top-3 rounded-chip border border-line bg-bg-2 px-2.5 py-1 font-mono text-[11px] text-fg-1 transition-colors hover:border-line-2 hover:text-fg"
          @click="copyRelay"
        >
          <template v-if="relayCopyState === 'copied'">✓ copied</template>
          <template v-else-if="relayCopyState === 'error'">
            copy failed
          </template>
          <template v-else>copy</template>
        </button>
      </div>
      <p class="mt-1.5 font-mono text-[11px] text-fg-3">
        The same block also lives in
        <code class="text-fg">settings.claude.example.json</code> at the
        repo root.
      </p>
    </section>

    <!-- Alternative: direct HTTP hooks (no enrichment), collapsed by default -->
    <details class="mb-10 rounded-tile border border-line bg-bg-1 p-6 group">
      <summary
        class="cursor-pointer list-none flex items-center justify-between gap-4"
      >
        <div>
          <h2
            class="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-3"
          >
            alternative — direct HTTP hooks (no enrichment)
          </h2>
          <p class="mt-2 text-[13px] text-fg-1">
            Zero-install fallback. Claude Code POSTs straight to the
            collector, skipping the relay. Tokens, remaining context, git
            branch, and hostname stay unavailable; everything else works.
          </p>
        </div>
        <span
          aria-hidden="true"
          class="inline-block font-mono text-[11px] text-fg-3 transition-transform group-open:rotate-90"
        >
          ▶
        </span>
      </summary>

      <div class="mt-6">
        <ol class="space-y-3 text-[13px] text-fg-1">
          <li class="flex gap-3">
            <span
              class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
            >
              1
            </span>
            <span>
              Paste the JSON below into
              <code class="font-mono text-fg">~/.claude/settings.json</code>.
              It uses the collector host from step 1.
            </span>
          </li>
          <li class="flex gap-3">
            <span
              class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 font-mono text-[11px] text-fg-2"
            >
              2
            </span>
            <span>
              Run <code class="font-mono text-fg">/hooks</code> inside Claude
              Code to approve. HTTP hooks are non-blocking — if Periscope is
              down, Claude Code continues normally.
            </span>
          </li>
        </ol>

        <div class="relative mt-5">
          <pre
            class="max-h-[520px] overflow-auto rounded-tile border border-line bg-bg px-4 py-3 font-mono text-[12px] leading-relaxed text-fg-1"
          >{{ httpConfig }}</pre>
          <button
            type="button"
            class="absolute right-3 top-3 rounded-chip border border-line bg-bg-2 px-2.5 py-1 font-mono text-[11px] text-fg-1 transition-colors hover:border-line-2 hover:text-fg"
            @click="copyHttp"
          >
            <template v-if="httpCopyState === 'copied'">✓ copied</template>
            <template v-else-if="httpCopyState === 'error'">
              copy failed
            </template>
            <template v-else>copy</template>
          </button>
        </div>
      </div>
    </details>

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
