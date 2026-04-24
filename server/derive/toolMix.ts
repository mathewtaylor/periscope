import type { EventRow } from "../types.ts";

export interface ToolMixEntry {
  name: string;
  count: number;
}

export function deriveToolMix(events: readonly EventRow[]): ToolMixEntry[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!e.tool_name) continue;
    if (e.event !== "PreToolUse") continue;
    counts.set(e.tool_name, (counts.get(e.tool_name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
