import { CheckCircle2, Clock3, ShieldAlert, Trophy, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import PlayerRegistrationActions from "@/components/PlayerRegistrationActions";
import type { Locale } from "@/lib/i18n/config";
import { formatNumber } from "@/lib/i18n/format";
import type { MessageValues } from "@/lib/i18n/types";
import { isTournamentTerminalStatus } from "@/lib/tournaments";
import type { PlayerRegistration, RegistrationStatus } from "@/components/dashboard/registration-presentation";

type DashboardTranslator = (path: string, values?: MessageValues) => string;

type RegistrationProps = {
  registration: PlayerRegistration;
  locale: Locale;
  t: DashboardTranslator;
};

export function RegistrationCard({
  registration,
  locale,
  t,
}: RegistrationProps) {
  return (
    <article
      id={`registration-${registration.id}`}
      data-registration-presentation="current"
      className="min-w-0 scroll-mt-28 border border-white/12 border-t-orange-400/50 bg-zinc-950/85 transition-colors focus-within:border-white/25 target:border-orange-400/70"
    >
      <div className="px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-48">
            <h3 className="break-words text-base font-bold leading-6 text-white sm:text-lg">
              {registration.tournament_title}
            </h3>
            <p className="mt-1 flex items-start gap-2 text-sm leading-5 text-zinc-400">
              <Trophy size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-orange-300/80" />
              <span className="min-w-0 break-words">{registration.bracket_name}</span>
            </p>
          </div>
          <StatusBadge status={registration.registration_status} t={t} />
        </div>
      </div>
      <div className="border-y border-white/8 bg-white/[0.025] px-4 py-2.5 sm:px-5">
        <RegistrationMetadata registration={registration} locale={locale} t={t} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-5">
        <RegistrationContext registration={registration} t={t} />
        <RegistrationActions registration={registration} />
      </div>
    </article>
  );
}

export function HistoricalRegistrationRecord({ registration, locale, t }: RegistrationProps) {
  return (
    <article
      id={`registration-${registration.id}`}
      data-registration-presentation="historical"
      className="min-w-0 scroll-mt-28 px-4 py-3.5 transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.025] target:bg-orange-500/[0.06] target:ring-1 target:ring-inset target:ring-orange-400/60 sm:px-5"
    >
      <div className="grid min-w-0 gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-44">
            <h3 className="break-words text-sm font-semibold leading-5 text-zinc-100 sm:text-base">
              {registration.tournament_title}
            </h3>
            <p className="mt-1 break-words text-sm leading-5 text-zinc-400">{registration.bracket_name}</p>
          </div>
          <StatusBadge status={registration.registration_status} t={t} />
        </div>
        <RegistrationMetadata registration={registration} locale={locale} t={t} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <RegistrationContext registration={registration} t={t} historical />
        <RegistrationActions registration={registration} />
      </div>
    </article>
  );
}

function RegistrationMetadata({ registration, locale, t }: RegistrationProps) {
  return (
    <dl className="flex min-w-0 flex-wrap gap-x-5 gap-y-2">
      <RegistrationValue
        label={t("dashboard.registrations.eloStatus")}
        value={eloStatusLabel(registration.elo_status, t)}
      />
      <RegistrationValue
        label={t("dashboard.registrations.submittedElo")}
        value={
          registration.submitted_elo === null
            ? t("dashboard.notAvailable")
            : formatNumber(registration.submitted_elo, locale)
        }
      />
      <RegistrationValue
        label={t("dashboard.registrations.submitted")}
        value={
          <HydrationSafeLocalDateTime
            value={registration.created_at}
            fallback={t("dashboard.notAvailable")}
          />
        }
      />
    </dl>
  );
}

function RegistrationContext({
  registration,
  t,
  historical = false,
}: Pick<RegistrationProps, "registration" | "t"> & { historical?: boolean }) {
  if (isTournamentTerminalStatus(registration.tournament_status)) {
    return (
      <div
        role="status"
        className="min-w-0 flex-1 basis-64 border-l-2 border-amber-400/40 pl-3 text-sm leading-5 text-amber-100/90"
      >
        <p>
          <span className="font-semibold">{t("dashboard.registrations.historicalTitle")}</span>{". "}
          {t(
            registration.tournament_status === "cancelled"
              ? "dashboard.registrations.cancelledMessage"
              : "dashboard.registrations.voidedMessage"
          )}
        </p>
      </div>
    );
  }
  if (registration.registration_status === "waitlisted" && registration.waitlist_offer_status === "offered") return null;
  return <RegistrationDecision registration={registration} t={t} historical={historical} />;
}

function RegistrationActions({ registration }: Pick<RegistrationProps, "registration">) {
  return (
    <PlayerRegistrationActions
      registrationId={registration.id}
      registrationStatus={registration.registration_status}
      waitlistOfferStatus={registration.waitlist_offer_status}
      waitlistOfferExpiresAt={registration.waitlist_offer_expires_at}
      launchedAt={registration.launched_at}
      tournamentStatus={registration.tournament_status}
    />
  );
}

function RegistrationDecision({
  registration,
  t,
  historical,
}: {
  registration: PlayerRegistration;
  t: DashboardTranslator;
  historical: boolean;
}) {
  const waitlistContent = {
    offered: {
      title: t("dashboard.registrations.offerTitle"),
      message: t("dashboard.registrations.offerMessage"),
      className: "border-amber-400/40 bg-amber-500/10 text-amber-100",
    },
    declined: {
      title: t("dashboard.registrations.declinedTitle"),
      message: t("dashboard.registrations.declinedMessage"),
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
    expired: {
      title: t("dashboard.registrations.expiredTitle"),
      message: t("dashboard.registrations.expiredMessage"),
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
    cancelled: {
      title: t("dashboard.registrations.waitlistClosedTitle"),
      message: t("dashboard.registrations.waitlistClosedMessage"),
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
    accepted: {
      title: t("dashboard.registrations.acceptedTitle"),
      message: t("dashboard.registrations.acceptedMessage"),
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    },
    waiting: registration.launched_at
      ? {
          title: t("dashboard.registrations.waitlistClosedTitle"),
          message: t("dashboard.registrations.launchedWaitlistMessage"),
          className: "border-white/10 bg-white/[0.04] text-zinc-300",
        }
      : {
          title: t("dashboard.registrations.waitlistedTitle"),
          message: t("dashboard.registrations.waitlistedMessage"),
          className: "border-amber-500/30 bg-amber-500/10 text-amber-200",
        },
  }[registration.waitlist_offer_status ?? "waiting"];
  const content = {
    approved: {
      title: t("dashboard.registrations.approvedTitle"),
      message: t("dashboard.registrations.approvedMessage"),
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    },
    rejected: {
      title: t("dashboard.registrations.rejectedTitle"),
      message: t("dashboard.registrations.rejectedMessage"),
      className: "border-red-500/30 bg-red-500/10 text-red-200",
    },
    manual_review: {
      title: t("dashboard.registrations.manualReviewTitle"),
      message: t("dashboard.registrations.manualReviewMessage"),
      className:
        "border-orange-500/30 bg-orange-500/10 text-orange-200",
    },
    waitlisted: waitlistContent,
    withdrawn: {
      title: t("dashboard.registrations.withdrawnTitle"),
      message: t("dashboard.registrations.withdrawnMessage"),
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
    pending: {
      title: t("dashboard.registrations.pendingTitle"),
      message: t("dashboard.registrations.pendingMessage"),
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
  }[registration.registration_status] ?? {
    title: t("dashboard.registrations.fallbackTitle"),
    message: t("dashboard.registrations.fallbackMessage"),
    className: "border-white/10 bg-white/[0.04] text-zinc-300",
  };
  return (
    <div className={`min-w-0 flex-1 basis-64 border-l-2 pl-3 text-sm leading-5 ${historical ? "border-white/15 text-zinc-400" : content.className}`}>
      <p>
        <span className={historical ? "font-medium text-zinc-300" : "font-semibold"}>{content.title}</span>{". "}
        <span className={historical ? "" : "opacity-90"}>{content.message}</span>
      </p>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: RegistrationStatus;
  t: DashboardTranslator;
}) {
  const content = {
    approved: {
      label: t("dashboard.registrations.statusApproved"),
      icon: CheckCircle2,
      className:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    },
    rejected: {
      label: t("dashboard.registrations.statusRejected"),
      icon: XCircle,
      className: "border-red-500/40 bg-red-500/10 text-red-300",
    },
    manual_review: {
      label: t("dashboard.registrations.statusManualReview"),
      icon: ShieldAlert,
      className: "border-orange-500/40 bg-orange-500/10 text-orange-300",
    },
    waitlisted: {
      label: t("dashboard.registrations.statusWaitlisted"),
      icon: Clock3,
      className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    },
    withdrawn: {
      label: t("dashboard.registrations.statusWithdrawn"),
      icon: XCircle,
      className: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
    },
    pending: {
      label: t("dashboard.registrations.statusPending"),
      icon: Clock3,
      className: "border-white/15 bg-white/5 text-zinc-300",
    },
  }[status] ?? {
    label: t("dashboard.registrations.statusPending"),
    icon: Clock3,
    className: "border-white/15 bg-white/5 text-zinc-300",
  };
  const Icon = content.icon;

  return (
    <span
      data-registration-status={status}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-semibold leading-5 ${content.className}`}
    >
      <Icon size={14} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 break-words">{content.label}</span>
    </span>
  );
}

function RegistrationValue({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0 max-w-full">
      <dt className="text-xs leading-5 text-zinc-400">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium leading-5 tabular-nums text-zinc-300">{value}</dd>
    </div>
  );
}

export function EmptyRegistrations({ t }: { t: DashboardTranslator }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border border-dashed border-white/15 bg-zinc-950/50 p-4 sm:px-5">
      <div className="min-w-0 flex-1 basis-64">
        <h3 className="text-base font-bold text-white">
          {t("dashboard.competition.emptyCurrentTitle")}
        </h3>
        <p className="mt-1 max-w-lg text-sm leading-5 text-zinc-400">
          {t("dashboard.competition.emptyCurrentDescription")}
        </p>
      </div>
      <Link
        href="/tournaments"
        className="inline-flex min-h-11 items-center border border-orange-400 bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
      >
        {t("dashboard.registrations.explore")}
      </Link>
    </div>
  );
}

function eloStatusLabel(status: string, t: DashboardTranslator) {
  const path = {
    pending: "dashboard.registrations.eloPending",
    verified: "dashboard.registrations.eloVerified",
    rejected: "dashboard.registrations.eloRejected",
    failed: "dashboard.registrations.eloFailed",
    manual_review: "dashboard.registrations.eloManualReview",
  }[status.trim().toLowerCase()];

  return t(path ?? "dashboard.registrations.eloUnavailable");
}
