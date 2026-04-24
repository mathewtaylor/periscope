import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { ViewMode, WindowLabel } from "@/lib/types";

const LS_KEY = "periscope.preferences.v1";

interface StoredPrefs {
  window: WindowLabel;
  viewMode: ViewMode;
  mutes: Record<string, number>;
  followNow: boolean;
}

function loadPrefs(): StoredPrefs {
  const defaults: StoredPrefs = {
    window: "15m",
    viewMode: "tiles",
    mutes: {},
    followNow: true,
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      window: parsed.window ?? defaults.window,
      viewMode: parsed.viewMode ?? defaults.viewMode,
      mutes: parsed.mutes ?? defaults.mutes,
      followNow: parsed.followNow ?? defaults.followNow,
    };
  } catch {
    return defaults;
  }
}

export const usePreferencesStore = defineStore("preferences", () => {
  const initial = loadPrefs();
  const window = ref<WindowLabel>(initial.window);
  const viewMode = ref<ViewMode>(initial.viewMode);
  const mutes = ref<Record<string, number>>(initial.mutes);
  const followNow = ref<boolean>(initial.followNow);

  watch(
    [window, viewMode, mutes, followNow],
    () => {
      try {
        localStorage.setItem(
          LS_KEY,
          JSON.stringify({
            window: window.value,
            viewMode: viewMode.value,
            mutes: mutes.value,
            followNow: followNow.value,
          } satisfies StoredPrefs),
        );
      } catch {
        /* localStorage may be unavailable (private mode) */
      }
    },
    { deep: true },
  );

  function muteSession(sessionId: string, durationMs = 5 * 60 * 1000): void {
    mutes.value = { ...mutes.value, [sessionId]: Date.now() + durationMs };
  }

  function isMuted(sessionId: string, now = Date.now()): boolean {
    const until = mutes.value[sessionId];
    return typeof until === "number" && until > now;
  }

  function pruneExpiredMutes(now = Date.now()): void {
    const next: Record<string, number> = {};
    for (const [id, until] of Object.entries(mutes.value)) {
      if (until > now) next[id] = until;
    }
    mutes.value = next;
  }

  return {
    window,
    viewMode,
    mutes,
    followNow,
    muteSession,
    isMuted,
    pruneExpiredMutes,
  };
});
