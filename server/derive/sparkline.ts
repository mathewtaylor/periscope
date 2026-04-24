import type { EventRow } from "../types.ts";

export type SparkColor = "run" | "sub" | "attn" | "err" | "fg-4";

export interface SparkBin {
  count: number;
  color: SparkColor;
}

export type WindowLabel = "5m" | "15m" | "1h" | "24h";

const WINDOW_MS: Record<WindowLabel, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

export function parseWindow(value: string | undefined): WindowLabel {
  if (value === "5m" || value === "15m" || value === "1h" || value === "24h") {
    return value;
  }
  return "15m";
}

export function windowMs(window: WindowLabel): number {
  return WINDOW_MS[window];
}

/**
 * Bin events into `bins` buckets covering `[endTs - windowMs, endTs]`.
 * Color precedence per bin: err > attn > sub > run > fg-4.
 */
export function deriveSparkline(
  events: readonly EventRow[],
  endTs: Date,
  windowMsSpan: number,
  bins: number,
): SparkBin[] {
  interface Tally {
    count: number;
    err: number;
    attn: number;
    sub: number;
    run: number;
  }
  const tallies: Tally[] = [];
  for (let i = 0; i < bins; i++) {
    tallies.push({ count: 0, err: 0, attn: 0, sub: 0, run: 0 });
  }

  const endMs = endTs.getTime();
  const startMs = endMs - windowMsSpan;
  const binWidth = windowMsSpan / bins;

  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t) || t < startMs || t > endMs) continue;
    const raw = Math.floor((t - startMs) / binWidth);
    const idx = raw >= bins ? bins - 1 : raw < 0 ? 0 : raw;
    const bin = tallies[idx];
    if (!bin) continue;

    bin.count++;

    if (e.event === "PostToolUseFailure" || e.event === "StopFailure") {
      bin.err++;
    } else if (e.event === "Notification") {
      bin.attn++;
    } else if (e.agent_id !== null) {
      bin.sub++;
    } else if (e.event === "PreToolUse" || e.event === "PostToolUse") {
      bin.run++;
    }
  }

  return tallies.map((t): SparkBin => {
    let color: SparkColor = "fg-4";
    if (t.err > 0) color = "err";
    else if (t.attn > 0) color = "attn";
    else if (t.sub * 2 > t.count) color = "sub";
    else if (t.run > 0) color = "run";
    return { count: t.count, color };
  });
}
