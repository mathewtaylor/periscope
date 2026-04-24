<script setup lang="ts">
import { computed } from "vue";
import type { EventRow } from "@/lib/types";
import { formatStartTimeSeconds } from "@/lib/time";

interface Props {
  events: readonly EventRow[];
}
const props = defineProps<Props>();

interface PromptEntry {
  id: number;
  ts: string;
  hhmmss: string;
  body: string;
  source: "main" | "sub";
  agentType: string | null;
  expansion?: { command: string; args: string };
}

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const prompts = computed<PromptEntry[]>(() => {
  const list: PromptEntry[] = [];
  for (const e of props.events) {
    if (e.event !== "UserPromptSubmit" && e.event !== "UserPromptExpansion")
      continue;
    const payload = parsePayload(e.payload);
    const body = typeof payload?.prompt === "string" ? payload.prompt : "";
    if (!body) continue;
    const entry: PromptEntry = {
      id: e.id,
      ts: e.ts,
      hhmmss: formatStartTimeSeconds(e.ts),
      body,
      source: e.agent_id ? "sub" : "main",
      agentType: e.agent_type ?? null,
    };
    if (e.event === "UserPromptExpansion") {
      const cmd = typeof payload?.command_name === "string" ? payload.command_name : "";
      const args = typeof payload?.command_args === "string" ? payload.command_args : "";
      entry.expansion = { command: cmd, args };
    }
    list.push(entry);
  }
  return list.reverse(); // newest first
});
</script>

<template>
  <div class="rounded-tile border border-line bg-bg-1">
    <div
      class="flex items-center justify-between border-b border-line px-4 py-2.5"
    >
      <div class="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-3">
        prompts
      </div>
      <span class="font-mono text-[11px] text-fg-3">
        {{ prompts.length }} {{ prompts.length === 1 ? "prompt" : "prompts" }}
      </span>
    </div>
    <ul
      v-if="prompts.length > 0"
      class="divide-y divide-line"
    >
      <li
        v-for="p in prompts"
        :key="p.id"
        class="flex items-start gap-4 px-4 py-4"
      >
        <div class="flex flex-col items-start gap-1 shrink-0">
          <span
            class="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3"
          >
            {{ p.expansion ? "expansion" : "user prompt" }}
          </span>
          <span
            v-if="p.source === 'sub'"
            class="whitespace-nowrap rounded-full border border-line-2 px-2 py-0.5 font-mono text-[10.5px] text-sub"
          >
            {{ p.agentType ?? "sub" }}
          </span>
        </div>
        <div class="flex-1">
          <div
            v-if="p.expansion"
            class="mb-1 font-mono text-[11px] text-sub"
          >
            /{{ p.expansion.command
            }}<span v-if="p.expansion.args" class="text-fg-3">
              {{ p.expansion.args }}</span>
          </div>
          <p class="whitespace-pre-wrap text-[14px] leading-snug text-fg">
            {{ p.body }}
          </p>
        </div>
        <span class="whitespace-nowrap font-mono text-[11px] text-fg-3">
          {{ p.hhmmss }}
        </span>
      </li>
    </ul>
    <div
      v-else
      class="px-4 py-10 text-center font-mono text-[12.5px] text-fg-3"
    >
      no user prompts captured for this session
    </div>
  </div>
</template>
