"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpenCheck, ExternalLink } from "lucide-react";

import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import type { TournamentCard } from "@/lib/tournaments";

type TournamentRulesEssentialsProps = {
  tournament: Pick<
    TournamentCard,
    "ruleFormatLabel" | "rules" | "rulesUrl"
  >;
};

const essentialRules = [
  ["formatTitle", "formatBody"],
  ["seriesTitle", "seriesBody"],
  ["matchTimingTitle", "matchTimingBody"],
  ["schedulingTitle", "schedulingBody"],
  ["resultsTitle", "resultsBody"],
  ["confirmationTitle", "confirmationBody"],
  ["noShowsTitle", "noShowsBody"],
  ["mapsTitle", "mapsBody"],
] as const;

export default function TournamentRulesEssentials({
  tournament,
}: TournamentRulesEssentialsProps) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="w-full max-w-full min-w-0"
      data-tournament-rules-essentials
    >
      <div className="flex min-w-0 items-start gap-3 border border-orange-400/25 bg-orange-500/8 p-4 sm:p-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center border border-orange-400/30 bg-black/35 text-orange-300">
          <BookOpenCheck aria-hidden="true" size={20} />
        </div>
        <div className="min-w-0">
          <h3 id={titleId} className="break-words text-lg font-black text-white">
            {t("tournaments.rulesSummary.title")}
          </h3>
          <p className="mt-1 break-words text-sm leading-6 text-zinc-300">
            {t("tournaments.rulesSummary.description")}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid w-full max-w-full min-w-0 gap-3 sm:grid-cols-2">
        {essentialRules.map(([titleKey, bodyKey]) => (
          <div
            key={titleKey}
            className="min-w-0 border border-white/12 bg-black/35 p-4"
          >
            <dt className="break-words text-xs font-black uppercase tracking-wider text-orange-200">
              {t(`tournaments.rulesSummary.${titleKey}`)}
            </dt>
            <dd className="mt-2 break-words text-sm leading-6 text-zinc-300">
              {t(`tournaments.rulesSummary.${bodyKey}`)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 min-w-0 border border-white/12 bg-black/35 p-4">
        <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
          {t("tournaments.overview.tournamentRuleFormat")}
        </p>
        <p className="mt-1 break-words font-bold text-zinc-100">
          {tournament.ruleFormatLabel}
        </p>
        <p className="mt-4 text-xs font-black uppercase tracking-wider text-zinc-500">
          {t("tournaments.rulesSummary.tournamentRulesTitle")}
        </p>
        <p className="mt-2 break-words text-sm leading-6 text-zinc-300">
          {tournament.rules}
        </p>
      </div>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="break-words text-xs leading-5 text-zinc-400">
          {t("tournaments.rulesSummary.authorityNote")}
        </p>
        <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          {tournament.rulesUrl ? (
            <a
              href={tournament.rulesUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 border border-white/15 bg-white/[0.04] px-4 py-2 text-center text-xs font-black uppercase tracking-wide text-zinc-200 transition hover:border-orange-300/55 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
            >
              <span className="break-words">
                {t("tournaments.rulesSummary.openTournamentRules")}
              </span>
              <ExternalLink aria-hidden="true" className="shrink-0" size={15} />
              <span className="sr-only">
                ({t("tournaments.rulesSummary.opensNewTab")})
              </span>
            </a>
          ) : null}
          <Link
            href="/rules"
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-center text-xs font-black uppercase tracking-wide text-orange-100 transition hover:border-orange-300/70 hover:bg-orange-500/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            <span className="break-words">
              {t("tournaments.rulesSummary.readFullRulebook")}
            </span>
            <ArrowUpRight aria-hidden="true" className="shrink-0" size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
