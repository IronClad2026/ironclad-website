"use client";

import { Award, Layers3, LockKeyhole, Play, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

import BadgeDetailModal from "@/components/badges/BadgeDetailModal";
import BadgeGrid from "@/components/badges/BadgeGrid";
import BadgeQueue from "@/components/badges/BadgeQueue";
import BadgeSlot from "@/components/badges/BadgeSlot";
import {
  mockBadgeRevealQueue,
  mockFreeBadgeEntitlement,
  mockFreePlayerBadgeCollection,
  mockNewUnlockQueued,
  mockPremiumBadgeEntitlement,
  mockPremiumPlayerBadgeCollection,
  mockRetroactivePremiumRevealPending,
} from "@/lib/badges/fixtures";
import {
  BADGE_RARITY_LABELS,
  BADGE_RARITY_TOKENS,
  isEarnedBadgeCollectionItem,
  mapBadgeCollection,
} from "@/lib/badges/presentation";
import { PILOT_BADGE_SLUGS } from "@/lib/badges/catalog";
import type {
  BadgeCollectionItem,
  BadgePresentationEntitlement,
  BadgeRarity,
  BadgeRevealQueueItem,
  BadgeSlug,
  EarnedBadgeCollectionItem,
  PlayerBadgeAward,
} from "@/lib/badges/types";

type PreviewMode = "free" | "premium";
type RevealPreviewKind = "free" | "premium" | "queue" | "reduced-motion";

const pilotPreviewAwards: readonly PlayerBadgeAward[] = [
  {
    badgeSlug: "ironclad-recruit",
    awardedAt: "2026-08-01T10:00:00.000Z",
    originalAwardedAt: "2026-08-01T10:00:00.000Z",
    awardId: "fixture-pilot-ironclad-recruit",
    evidenceLabel: "Fixture identity readiness",
  },
  {
    badgeSlug: "first-victory",
    awardedAt: "2026-08-03T18:30:00.000Z",
    originalAwardedAt: "2026-08-03T18:30:00.000Z",
    awardId: "fixture-pilot-first-victory",
    evidenceLabel: "Fixture match result",
  },
  {
    badgeSlug: "elite-champion",
    awardedAt: "2026-08-09T21:15:00.000Z",
    originalAwardedAt: "2026-08-09T21:15:00.000Z",
    awardId: "fixture-pilot-elite-champion",
    evidenceLabel: "Fixture Main/Pro championship",
  },
];

const lockedPilotCollection = mapBadgeCollection({
  awards: [],
  playerId: "fixture-pilot-locked-preview",
});
const earnedPilotCollection = mapBadgeCollection({
  awards: pilotPreviewAwards,
  playerId: "fixture-pilot-earned-preview",
});

const rarityOrder: readonly BadgeRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

const revealPreviewConfigs: Record<
  RevealPreviewKind,
  {
    label: string;
    items: readonly BadgeRevealQueueItem[];
    entitlement: BadgePresentationEntitlement;
    reducedMotion: boolean;
  }
> = {
  free: {
    label: "Free reveal",
    items: [mockNewUnlockQueued],
    entitlement: mockFreeBadgeEntitlement,
    reducedMotion: false,
  },
  premium: {
    label: "Premium reveal",
    items: [mockRetroactivePremiumRevealPending],
    entitlement: mockPremiumBadgeEntitlement,
    reducedMotion: false,
  },
  queue: {
    label: "Sequential multi-badge queue",
    items: mockBadgeRevealQueue,
    entitlement: mockFreeBadgeEntitlement,
    reducedMotion: false,
  },
  "reduced-motion": {
    label: "Reduced-motion reveal",
    items: [
      {
        ...mockNewUnlockQueued,
        id: "fixture-reduced-motion-first-victory",
      },
    ],
    entitlement: mockFreeBadgeEntitlement,
    reducedMotion: true,
  },
};

export default function Phase10PreviewPanel() {
  const [mode, setMode] = useState<PreviewMode>("free");
  const [activeReveal, setActiveReveal] = useState<{
    kind: RevealPreviewKind;
    runId: number;
  } | null>(null);
  const [selectedItem, setSelectedItem] = useState<BadgeCollectionItem | null>(
    null
  );
  const [seenItems, setSeenItems] = useState<readonly BadgeRevealQueueItem[]>(
    []
  );
  const collection =
    mode === "premium"
      ? mockPremiumPlayerBadgeCollection
      : mockFreePlayerBadgeCollection;
  const entitlement =
    mode === "premium" ? mockPremiumBadgeEntitlement : mockFreeBadgeEntitlement;
  const activeRevealConfig = activeReveal
    ? revealPreviewConfigs[activeReveal.kind]
    : null;

  return (
    <section
      aria-label="Badge system mock preview"
      className="rounded-lg border border-orange-500/25 bg-[linear-gradient(145deg,rgba(249,115,22,0.09),rgba(0,0,0,0.9))] p-4 text-white shadow-2xl shadow-black/40 sm:p-5"
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
          <p className="mt-3 inline-flex rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs font-black uppercase tracking-wider text-zinc-300">
            30 / 30 badge slots
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

      <RarityLegend />

      <div className="mt-5">
        <BadgeGrid
          collection={collection}
          entitlement={entitlement}
          title={`${
            mode === "premium" ? "Premium" : "Free"
          } fixture collection`}
        />
      </div>

      <PilotBadgeLab onSelect={setSelectedItem} />

      <div className="mt-5 rounded-lg border border-white/10 bg-black/35 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white">
              <Play size={16} aria-hidden="true" />
              Reveal lab
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Local fixture state only. These controls do not award badges,
              call Supabase, persist state, or invoke server actions.
            </p>
            {activeRevealConfig ? (
              <p className="mt-2 text-xs font-bold text-orange-200">
                Active: {activeRevealConfig.label}. Seen this run:{" "}
                {seenItems.length}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["free", "Free reveal"],
                ["premium", "Premium reveal"],
                ["queue", "Multi-badge queue"],
                ["reduced-motion", "Reduced motion"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setSeenItems([]);
                  setActiveReveal({
                    kind,
                    runId: Date.now(),
                  });
                }}
                className="min-h-11 rounded-lg border border-orange-400/35 bg-orange-500/10 px-4 py-2 text-sm font-black uppercase tracking-wider text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeReveal && activeRevealConfig ? (
        <BadgeQueue
          key={`${activeReveal.kind}-${activeReveal.runId}`}
          items={activeRevealConfig.items}
          entitlement={activeRevealConfig.entitlement}
          onItemSeen={(item) =>
            setSeenItems((current) => [...current, item])
          }
          reducedMotion={activeRevealConfig.reducedMotion}
        />
      ) : null}

      {selectedItem ? (
        <BadgeDetailModal
          item={selectedItem}
          entitlement={entitlement}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </section>
  );
}

function RarityLegend() {
  return (
    <div className="mt-5 rounded-lg border border-white/10 bg-black/30 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
        Rarity coverage
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {rarityOrder.map((rarity) => {
          const tokens = BADGE_RARITY_TOKENS[rarity];

          return (
            <span
              key={rarity}
              className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${tokens.badgeClassName}`}
            >
              {BADGE_RARITY_LABELS[rarity]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PilotBadgeLab({
  onSelect,
}: {
  onSelect: (item: BadgeCollectionItem) => void;
}) {
  return (
    <div className="mt-5 rounded-lg border border-white/10 bg-black/35 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white">
            <ShieldCheck size={16} aria-hidden="true" />
            Phase 10 pilot badges
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
            Click any slot to inspect the detail modal in locked, earned, free,
            or Premium presentation states.
          </p>
        </div>
        <p className="text-xs font-black uppercase tracking-wider text-orange-200">
          01 / 03 / 26
        </p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {PILOT_BADGE_SLUGS.map((slug) => (
          <PilotBadgePreview
            key={slug}
            slug={slug}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function PilotBadgePreview({
  slug,
  onSelect,
}: {
  slug: BadgeSlug;
  onSelect: (item: BadgeCollectionItem) => void;
}) {
  const lockedItem = requirePreviewItem(
    lockedPilotCollection.items,
    slug,
    "locked"
  );
  const earnedItem = requirePreviewEarnedItem(slug);

  return (
    <article className="rounded-lg border border-white/10 bg-black/35 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
            Pilot badge {String(earnedItem.definition.number).padStart(2, "0")}
          </p>
          <h3 className="mt-1 break-words text-base font-black text-white">
            {earnedItem.definition.name}
          </h3>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-orange-400/30 bg-orange-500/10 text-orange-200">
          <Award size={18} aria-hidden="true" />
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        <PilotStateColumn
          label="Locked"
          icon="locked"
          item={lockedItem}
          entitlement={mockFreeBadgeEntitlement}
          onSelect={onSelect}
        />
        <PilotStateColumn
          label="Free earned"
          icon="earned"
          item={earnedItem}
          entitlement={mockFreeBadgeEntitlement}
          onSelect={onSelect}
        />
        <PilotStateColumn
          label="Premium earned"
          icon="premium"
          item={earnedItem}
          entitlement={mockPremiumBadgeEntitlement}
          onSelect={onSelect}
        />
      </div>
    </article>
  );
}

function PilotStateColumn({
  label,
  icon,
  item,
  entitlement,
  onSelect,
}: {
  label: string;
  icon: "locked" | "earned" | "premium";
  item: BadgeCollectionItem;
  entitlement: BadgePresentationEntitlement;
  onSelect: (item: BadgeCollectionItem) => void;
}) {
  const Icon =
    icon === "locked" ? LockKeyhole : icon === "premium" ? Sparkles : Layers3;

  return (
    <div className="min-w-0">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500">
        <Icon size={13} aria-hidden="true" />
        {label}
      </p>
      <BadgeSlot
        item={item}
        entitlement={entitlement}
        onSelect={onSelect}
        className="min-h-48"
      />
    </div>
  );
}

function requirePreviewEarnedItem(slug: BadgeSlug): EarnedBadgeCollectionItem {
  const item = requirePreviewItem(earnedPilotCollection.items, slug, "earned");

  if (!isEarnedBadgeCollectionItem(item)) {
    throw new Error(`Expected pilot preview badge ${slug} to be earned.`);
  }

  return item;
}

function requirePreviewItem(
  items: readonly BadgeCollectionItem[],
  slug: BadgeSlug,
  state: BadgeCollectionItem["state"]
) {
  const item = items.find((candidate) => candidate.definition.slug === slug);

  if (!item || item.state !== state) {
    throw new Error(`Missing ${state} pilot preview badge for ${slug}.`);
  }

  return item;
}
