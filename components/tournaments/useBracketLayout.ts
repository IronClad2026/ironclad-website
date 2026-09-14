"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { calculateBracketLayout } from "./bracket-layout";

export default function useBracketLayout(roundIds: string[][]) {
  const boardRef = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify(roundIds);
  const [measured, setMeasured] = useState<{
    signature: string;
    layout: ReturnType<typeof calculateBracketLayout>;
  } | null>(null);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === "undefined") return;
    const ids: string[][] = JSON.parse(signature);
    const elements = new Map(
      Array.from(board.querySelectorAll<HTMLElement>("[data-bracket-match]"), (element) => [
        element.dataset.bracketMatch!, element,
      ])
    );
    const measure = () => {
      // Desktop and mobile boards coexist; defer the hidden board until visible.
      if (board.getBoundingClientRect().width === 0) return;
      const rounds = ids.map((round) => round.map((id) => {
        const element = elements.get(id)!;
        const card = element.getBoundingClientRect();
        const core = element.querySelector<HTMLElement>("[data-bracket-core]")!.getBoundingClientRect();
        return { id, height: card.height, anchorOffset: core.top + core.height / 2 - card.top };
      }));
      const layout = calculateBracketLayout(rounds);
      setMeasured((previous) =>
        previous?.signature === signature && JSON.stringify(previous.layout) === JSON.stringify(layout)
          ? previous : { signature, layout }
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    for (const element of elements.values()) {
      observer.observe(element);
      observer.observe(element.querySelector<HTMLElement>("[data-bracket-core]")!);
    }
    return () => observer.disconnect();
  }, [signature]);

  return { boardRef, layout: measured?.signature === signature ? measured.layout : null };
}
