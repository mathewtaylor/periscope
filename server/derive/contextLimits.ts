// Effective context window per model, in tokens. Opus 4.6 and 4.7 default
// to the 1 M window; everything else is 200 k. Model IDs may carry a `[1m]`
// suffix to explicitly request extended context — `contextLimit()` strips
// that before lookup, so both `claude-opus-4-7` and `claude-opus-4-7[1m]`
// resolve to the same entry.
export const CONTEXT_LIMITS: Record<string, number> = {
  "claude-sonnet-4-5": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-sonnet-4-7": 200_000,
  "claude-opus-4-5": 200_000,
  "claude-opus-4-6": 1_000_000,
  "claude-opus-4-7": 1_000_000,
  "claude-haiku-4-5": 200_000,
};

export function contextLimit(model: string | null | undefined): number | null {
  if (!model) return null;
  const normalised = model.replace(/\[.*\]$/, "");
  return CONTEXT_LIMITS[normalised] ?? null;
}
