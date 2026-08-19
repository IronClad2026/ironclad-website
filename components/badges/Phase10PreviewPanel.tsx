"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import BadgeGrid from "@/components/badges/BadgeGrid";
import BadgeQueue from "@/components/badges/BadgeQueue";
import {
  mockBadgeRevealQueue,
  mockFreeBadgeEntitlement,
  mockFreePlayerBadgeCollection,
  mockPremiumBadgeEntitlement,
  mockPremiumPlayerBadgeCollection,
} from "@/lib/badges/fixtures";
import type { BadgeRevealQueueItem } from "@/lib/badges/types";

type PreviewMode = "free" | "premium";

export default function Phase10PreviewPanel() {
  const [mode, setMode] = useState<PreviewMode>("free");
  const [queueRun, setQueueRun] = useState(0);
  const [seenItems, setSeenItems] = useState<readonly BadgeRevealQueueItem[]>(
    []
  );
  const collection =
    mode === "premium"
      ? mockPremiumPlayerBadgeCollection
      : mockFreePlayerBadgeCollection;
  const entitlement =
    mode === "premium" ? mockPremiumBadgeEntitlement : mockFreeBadgeEntitlement;

  return (
    <section
      aria-label="Badge system mock preview"
      className="rounded-lg border border-orange-500/25 bg-[linear-gradient(145deg,rgba(249,115,22,0.09),rgba(0,0,0,0.9))] p-5 text-white shadow-2xl shadow-black/40"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-orange-300">
            <Sparkles size={15} aria-hidden="true" />
            Mock / preview
          </p>
          <h2 className="mt-3 text-3xl font-black text-white">
            Phase 10 Badge Preview
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Fixture data only. No production awards, grants, resets, billing, or
            profile writes are connected here.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Badge fixture mode"
          className="grid grid-cols-2 gap-2 sm:flex"
        >
          {(["free", "premium"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={mode === option}
              onClick={() => setMode(option)}
              className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-black uppercase tracking-wider transition ${
                mode === option
                  ? "border-orange-400 bg-orange-500/20 text-orange-100"
                  : "border-white/10 bg-black/35 text-zinc-400 hover:border-orange-400/35 hover:text-white"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <BadgeGrid
          collection={collection}
          entitlement={entitlement}
          title={`${mode === "premium" ? "Premium" : "Free"} fixture collection`}
        />
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-black/35 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-white">
              Local reveal queue
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Seen in this preview: {seenItems.length}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSeenItems([]);
              setQueueRun((current) => current + 1);
            }}
            className="min-h-11 rounded-lg border border-orange-400/35 bg-orange-500/10 px-4 py-2 text-sm font-black uppercase tracking-wider text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            Preview reveals
          </button>
        </div>
      </div>

      {queueRun > 0 ? (
        <BadgeQueue
          key={queueRun}
          items={mockBadgeRevealQueue}
          onItemSeen={(item) =>
            setSeenItems((current) => [...current, item])
          }
        />
      ) : null}
    </section>
  );
}
