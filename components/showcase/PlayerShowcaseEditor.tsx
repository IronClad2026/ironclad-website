"use client";

import { startTransition, useId, useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import BadgeArtwork from "@/components/badges/BadgeArtwork";
import { localizeBadgeItem } from "@/components/badges/badgeUi";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishAccount from "@/lib/i18n/dictionaries/en/account-dashboard";
import englishBadges from "@/lib/i18n/dictionaries/en/badges";
import type { BadgesDictionary } from "@/lib/i18n/badges";
import type { ActionResult, ShowcaseEditorState } from "@/lib/player-showcase/types";
import { countCurrentThoughtCodePoints, validateCurrentThought } from "@/lib/player-showcase/validation";
import FeaturedBadgePicker from "./FeaturedBadgePicker";
import { getShowcaseBadgeItem } from "./badge-presentation";
import { SHOWCASE_SUPPORT_URL } from "./support";

const secondaryButton = "inline-flex min-h-11 items-center justify-center border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-200 motion-safe:transition-colors hover:border-white/40 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = "inline-flex min-h-11 items-center justify-center border border-orange-300/35 bg-orange-300/10 px-4 py-2 text-sm font-semibold text-orange-200 motion-safe:transition-colors hover:bg-orange-300/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-50";

export type PlayerShowcaseEditorProps = {
  initialState: ShowcaseEditorState;
  saveThought: (input: { currentThought: string | null; revision: number }) => Promise<ActionResult>;
  saveBadge: (input: { awardId: string | null; revision: number }) => Promise<ActionResult>;
  badgeDictionary?: BadgesDictionary;
};

export default function PlayerShowcaseEditor({
  initialState, saveThought, saveBadge, badgeDictionary = englishBadges,
}: PlayerShowcaseEditorProps) {
  const t = useOptionalTranslations("account-dashboard", englishAccount);
  const id = useId();
  const [thought, setThought] = useState(initialState.currentThought ?? "");
  const [savedThought, setSavedThought] = useState(initialState.currentThought ?? "");
  const [featuredAwardId, setFeaturedAwardId] = useState(initialState.featuredBadgeAwardId);
  const [revision, setRevision] = useState(initialState.revision);
  const [thoughtHidden, setThoughtHidden] = useState(initialState.thoughtHidden);
  const [conflict, setConflict] = useState<ActionResult | null>(null);
  const [reviewedThought, setReviewedThought] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState<"thought" | "badge" | null>(null);
  const pendingRef = useRef(false);
  const [thoughtFeedback, setThoughtFeedback] = useState<ActionResult | null>(null);
  const [badgeFeedback, setBadgeFeedback] = useState<ActionResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const validatedThought = validateCurrentThought(thought);
  const count = countCurrentThoughtCodePoints(thought);
  const dirty = thought !== savedThought;
  const selectedAward = initialState.awards.find((award) => award.awardId === featuredAwardId);
  const selectedItem = selectedAward ? getShowcaseBadgeItem(selectedAward) : null;
  const localizedItem = selectedItem ? localizeBadgeItem(selectedItem, badgeDictionary) : null;

  function updateThought(value: string | null) {
    if (pendingRef.current) return;
    const validation = validateCurrentThought(value);
    if (!validation.ok) {
      setThoughtFeedback({ status: "error", code: validation.code });
      return;
    }
    pendingRef.current = true;
    setPending("thought");
    setThoughtFeedback(null);
    startTransition(async () => {
      try {
        const result = await saveThought({ currentThought: validation.value, revision });
        setThoughtFeedback(result);
        if (result.code === "conflict") setConflict(result);
        if (result.status === "success") {
          setConflict(null);
          setReviewedThought(undefined);
          if (typeof result.thoughtHidden === "boolean") setThoughtHidden(result.thoughtHidden);
          const nextThought = result.currentThought === undefined ? validation.value : result.currentThought;
          setSavedThought(nextThought ?? "");
          setThought(nextThought ?? "");
          if (typeof result.revision === "number") setRevision(result.revision);
        }
      } catch {
        setThoughtFeedback({ status: "error", code: "saveFailed" });
      } finally {
        pendingRef.current = false;
        setPending(null);
      }
    });
  }

  function updateBadge(awardId: string | null) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending("badge");
    setBadgeFeedback(null);
    startTransition(async () => {
      try {
        const result = await saveBadge({ awardId, revision });
        setBadgeFeedback(result);
        if (result.code === "conflict") { setConflict(result); setPickerOpen(false); }
        if (result.status === "success") {
          setConflict(null);
          setReviewedThought(undefined);
          if (typeof result.thoughtHidden === "boolean") setThoughtHidden(result.thoughtHidden);
          setFeaturedAwardId(result.featuredBadgeAwardId === undefined ? awardId : result.featuredBadgeAwardId);
          if (typeof result.revision === "number") setRevision(result.revision);
          setPickerOpen(false);
        }
      } catch {
        setBadgeFeedback({ status: "error", code: "saveFailed" });
      } finally {
        pendingRef.current = false;
        setPending(null);
      }
    });
  }

  const canReviewConflict = conflict?.code === "conflict" &&
    typeof conflict.revision === "number" &&
    conflict.currentThought !== undefined &&
    conflict.featuredBadgeAwardId !== undefined;

  function reviewLatest() {
    if (!canReviewConflict || !conflict) return;
    const latest = conflict.currentThought ?? "";
    if (!dirty) setThought(latest);
    setSavedThought(latest);
    setFeaturedAwardId(conflict.featuredBadgeAwardId ?? null);
    setRevision(conflict.revision as number);
    if (typeof conflict.thoughtHidden === "boolean") setThoughtHidden(conflict.thoughtHidden);
    setReviewedThought(conflict.currentThought ?? null);
    setThoughtFeedback(null);
    setBadgeFeedback(null);
    setConflict(null);
  }
  return (
    <div className="mx-auto w-full max-w-[960px] min-w-0" data-showcase-editor>
      <Link href="/dashboard" className="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">{t("showcase.backToDashboard")}</Link>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/15 pb-6">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{t("showcase.title")}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{t("showcase.description")}</p>
        </div>
        {initialState.publicProfileEnabled ? (
          <Link href={`/players/${initialState.playerId}`} className={secondaryButton}>{t("showcase.viewPublicProfile")}</Link>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-l-2 border-zinc-500 bg-white/[0.025] px-4 py-3">
        <div className="min-w-0 max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            {initialState.publicProfileEnabled ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
            {t(initialState.publicProfileEnabled ? "showcase.publicProfile" : "showcase.privateProfile")}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{t(initialState.publicProfileEnabled ? "showcase.publicVisibilityHelp" : "showcase.privateVisibilityHelp")}</p>
        </div>
        <Link href="/dashboard#dashboard-visibility-title" className="inline-flex min-h-11 items-center text-sm font-semibold text-zinc-300 underline decoration-white/25 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">{t("showcase.manageVisibility")}</Link>
      </div>

      {canReviewConflict ? (
        <div className="mt-5 border border-amber-300/25 bg-amber-300/[0.03] p-4">
          <p className="text-sm leading-6 text-amber-200">{t("showcase.conflict")}</p>
          <button type="button" className={`mt-3 ${secondaryButton}`} disabled={pending !== null} onClick={reviewLatest}>{t("showcase.reviewLatest")}</button>
        </div>
      ) : null}
      {reviewedThought !== undefined ? (
        <div className="mt-5 border border-white/15 p-4">
          <p role="status" className="text-sm leading-6 text-zinc-200">{t("showcase.conflictResolved")}</p>
          <p className="mt-3 text-xs font-semibold text-zinc-400">{t("showcase.latestThought")}</p>
          <p dir="auto" className="mt-1 break-words text-sm leading-6 text-zinc-300 [overflow-wrap:anywhere]">{reviewedThought || t("showcase.latestEmpty")}</p>
        </div>
      ) : null}
      <div className="mt-6 divide-y divide-white/10 border border-white/12 bg-[linear-gradient(130deg,rgba(39,39,42,0.5),rgba(12,13,15,0.9))]">
        <section className="min-w-0 p-4 sm:p-6" aria-labelledby={`${id}-thought-title`}>
          <h2 id={`${id}-thought-title`} className="text-lg font-bold text-white">{t("showcase.thoughtTitle")}</h2>
          <p id={`${id}-thought-help`} className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{t("showcase.thoughtHelp")}</p>
          {thoughtHidden ? (
            <div className="mt-3 border-l-2 border-amber-300/50 pl-3">
              <p className="text-sm leading-6 text-amber-200">{t("showcase.thoughtHidden")}</p>
              <a href={SHOWCASE_SUPPORT_URL} className="inline-flex min-h-11 items-center text-xs text-zinc-300 underline decoration-zinc-500 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">{t("showcase.report")}</a>
            </div>
          ) : null}
          <form onSubmit={(event) => { event.preventDefault(); updateThought(thought); }} className="mt-4" aria-busy={pending === "thought"}>
            <label htmlFor={`${id}-thought`} className="sr-only">{t("showcase.thoughtTitle")}</label>
            <textarea
              id={`${id}-thought`}
              value={thought}
              onChange={(event) => { setThought(event.target.value); setThoughtFeedback(null); }}
              disabled={pending === "thought"}
              rows={3}
              dir="auto"
              aria-describedby={`${id}-thought-help ${id}-count${!validatedThought.ok ? ` ${id}-validation` : ""}${thoughtFeedback ? ` ${id}-thought-feedback` : ""}`}
              aria-invalid={!validatedThought.ok || thoughtFeedback?.status === "error"}
              placeholder={t("showcase.thoughtPlaceholder")}
              className="block min-h-28 w-full resize-y rounded-sm border border-white/20 bg-black/35 p-3 text-base leading-7 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-orange-300/70 focus:ring-1 focus:ring-orange-300/70 disabled:opacity-60"
            />
            <p id={`${id}-count`} className={`mt-2 text-right text-xs tabular-nums ${!validatedThought.ok ? "text-red-300" : "text-zinc-400"}`}>{t("showcase.characterCount", { count, max: 160 })}</p>
            {!validatedThought.ok ? <p id={`${id}-validation`} className="mt-2 text-sm text-red-300">{t(`showcase.${validatedThought.code}`)}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" disabled={pending !== null || !dirty || !validatedThought.ok} className={primaryButton}>{t(pending === "thought" ? "showcase.saving" : "showcase.saveThought")}</button>
              {dirty ? (
                <button type="button" disabled={pending === "thought"} className={secondaryButton} onClick={() => { setThought(savedThought); setThoughtFeedback(null); }}>{t("showcase.cancel")}</button>
              ) : null}
              {savedThought ? (
                <button type="button" disabled={pending !== null} className={secondaryButton} onClick={() => updateThought(null)}>{t("showcase.removeThought")}</button>
              ) : null}
            </div>
            {thoughtFeedback ? <p id={`${id}-thought-feedback`} role="status" className={`mt-3 text-sm leading-6 ${thoughtFeedback.status === "error" ? "text-red-300" : "text-zinc-200"}`}>{t(`showcase.${thoughtFeedback.code}`)}</p> : null}
          </form>
        </section>

        <section className="min-w-0 p-4 sm:p-6" aria-labelledby={`${id}-badge-title`} aria-busy={pending === "badge"}>
          <h2 id={`${id}-badge-title`} className="text-lg font-bold text-white">{t("showcase.featuredBadgeTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{t("showcase.featuredBadgeHelp")}</p>
          {localizedItem && selectedItem ? (
            <div className="mt-5 flex items-center gap-4">
              <BadgeArtwork item={selectedItem} variant="featured" dictionary={badgeDictionary} className="max-w-14 shrink-0" />
              <div className="min-w-0">
                <p className="break-words text-base font-semibold text-zinc-100">{localizedItem.definition.name}</p>
                <p className="mt-1 text-xs text-zinc-400">{badgeDictionary.rarity[localizedItem.definition.rarity]}</p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-400">{t(featuredAwardId ? "showcase.removedBadge" : "showcase.noFeaturedBadge")}</p>
          )}
          {initialState.awards.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" disabled={pending !== null} aria-haspopup="dialog" className={secondaryButton} onClick={() => { setBadgeFeedback(null); setPickerOpen(true); }}>{t(pending === "badge" ? "showcase.saving" : featuredAwardId ? "showcase.changeBadge" : "showcase.chooseBadge")}</button>
              {featuredAwardId ? <button type="button" disabled={pending !== null} className={secondaryButton} onClick={() => updateBadge(null)}>{t("showcase.removeBadge")}</button> : null}
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-zinc-400">{t("showcase.noEarnedBadges")}</p>
              <Link href="/dashboard/badges" className={`mt-4 ${secondaryButton}`}>{t("showcase.viewCollection")}</Link>
              {featuredAwardId ? <button type="button" disabled={pending !== null} className={`mt-4 sm:ml-2 ${secondaryButton}`} onClick={() => updateBadge(null)}>{t("showcase.removeBadge")}</button> : null}
            </div>
          )}
          {badgeFeedback ? <p role="status" className={`mt-3 text-sm leading-6 ${badgeFeedback.status === "error" ? "text-red-300" : "text-zinc-200"}`}>{t(`showcase.${badgeFeedback.code}`)}</p> : null}
        </section>
      </div>

      {pickerOpen ? (
        <FeaturedBadgePicker
          awards={initialState.awards}
          selectedAwardId={featuredAwardId}
          pending={pending === "badge"}
          error={badgeFeedback?.status === "error" ? t(`showcase.${badgeFeedback.code}`) : null}
          badgeDictionary={badgeDictionary}
          onSelect={(awardId) => updateBadge(awardId)}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}