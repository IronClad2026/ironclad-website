type TournamentRouter = {
  push: (href: string, options: { scroll: false }) => void;
  replace: (href: string, options: { scroll: false }) => void;
  refresh: () => void;
};

/** Native history immediately updates Next 16's useSearchParams. A fresh
 * authority read follows every change: a native history update can interrupt
 * an in-flight refresh, including one started by another component. Cross-event
 * navigation and canonicalization stay server-led.
 */
export function navigateTournamentPresentation({
  href, mode, sameTournament, router, history,
}: {
  href: string;
  mode: "push" | "replace";
  sameTournament: boolean;
  router: TournamentRouter;
  history: Pick<History, "pushState">;
}): void {
  if (mode === "replace" || !sameTournament) {
    router[mode](href, { scroll: false });
    return;
  }
  history.pushState(null, "", href);
  router.refresh();
}
