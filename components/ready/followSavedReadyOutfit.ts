import { invalidateWardrobe, observeWardrobe, readWardrobe } from "@/lib/wardrobe/client";
import { visibleWardrobeItems, type WardrobeState } from "@/lib/wardrobe/catalogue";
import type { MascotRenderer } from "./renderer";

export function followSavedReadyOutfit(renderer: MascotRenderer, sessionId: string) {
  let stopped = false;
  let check: AbortController | undefined;
  let loading: AbortController | undefined;
  let drawn = "";
  let target = "";

  function reset() {
    loading?.abort();
    loading = undefined;
    target = drawn = "";
  }

  function apply(state: WardrobeState | null) {
    if (stopped) return;
    if (!state) {
      reset();
      renderer.clearWardrobe();
      return;
    }
    const items = visibleWardrobeItems(state);
    const key = items.join(",");
    if (key === target) return;
    loading?.abort();
    target = key;
    if (key === drawn) return;
    const attempt = new AbortController();
    loading = attempt;
    void (async () => {
      let prepared;
      try {
        prepared = await renderer.prepareWardrobe(items, attempt.signal);
        if (stopped || attempt.signal.aborted) return;
        prepared.commit();
        drawn = key;
      } catch {
        // Leave the last complete appearance and Help usable. Recheck on the next refresh.
        if (!attempt.signal.aborted) target = drawn;
      } finally {
        prepared?.discard();
        if (loading === attempt) loading = undefined;
      }
    })();
  }

  function refresh() {
    if (stopped || check || document.hidden) return;
    const attempt = new AbortController();
    check = attempt;
    void readWardrobe(sessionId, attempt.signal).then(state => {
      if (stopped || attempt.signal.aborted) return;
      if (state) apply(state);
      else invalidateWardrobe(sessionId);
    }).catch(() => {
      // An unavailable authority check cannot renew permission to display private assets.
      if (!stopped && !attempt.signal.aborted) invalidateWardrobe(sessionId);
    }).finally(() => {
      if (check === attempt) check = undefined;
    });
  }

  const unobserve = observeWardrobe(sessionId, state => {
    check?.abort();
    check = undefined;
    apply(state);
  });
  const timer = window.setInterval(refresh, 15_000);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  void renderer.ready.then(refresh, () => undefined);

  return {
    refresh,
    reset,
    stop() {
      stopped = true;
      check?.abort();
      reset();
      unobserve();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    },
  };
}
