import { CalendarDays, CheckCircle2, Clock3, ShieldAlert, Trophy, XCircle } from "lucide-react";
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

export function RegistrationCard({
  registration,
  locale,
  t,
}: {
  registration: PlayerRegistration;
  locale: Locale;
  t: DashboardTranslator;
}) {
  const terminalTournament = isTournamentTerminalStatus(
    registration.tournament_status
  );

  return (
    <article id={`registration-${registration.id}`} className="min-w-0 scroll-mt-28 border border-white/12 bg-zinc-950/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-orange-300">
            <Trophy size={18} />
            <p className="text-xs font-black uppercase tracking-[0.22em]">
              {t("dashboard.registrations.cardEyebrow")}
            </p>
          </div>
          <h3 className="mt-1.5 break-words text-lg font-black text-white">
            {registration.tournament_title}
          </h3>
          <p className="mt-2 text-sm font-semibold text-zinc-400">
            {registration.bracket_name}
          </p>
        </div>
        <StatusBadge status={registration.registration_status} t={t} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-white/10 py-3 sm:grid-cols-3">
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
      </div>

      {terminalTournament ? (
        <div
          role="status"
          className="mt-5 border border-amber-400/30 bg-amber-950/20 p-4 text-amber-100"
        >
          <p className="text-sm font-black uppercase tracking-wider">
            {t("dashboard.registrations.historicalTitle")}
          </p>
          <p className="mt-2 text-sm leading-6">
            {t(
              registration.tournament_status === "cancelled"
                ? "dashboard.registrations.cancelledMessage"
                : "dashboard.registrations.voidedMessage"
            )}
          </p>
        </div>
      ) : registration.registration_status === "waitlisted" && registration.waitlist_offer_status === "offered" ? null : (
        <RegistrationDecision registration={registration} t={t} />
      )}
      <PlayerRegistrationActions
        registrationId={registration.id}
        registrationStatus={registration.registration_status}
        waitlistOfferStatus={registration.waitlist_offer_status}
        waitlistOfferExpiresAt={registration.waitlist_offer_expires_at}
        launchedAt={registration.launched_at}
        tournamentStatus={registration.tournament_status}
      />
    </article>
  );
}

function RegistrationDecision({
  registration,
  t,
}: {
  registration: PlayerRegistration;
  t: DashboardTranslator;
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
    <div className={`mt-3 border-l-2 px-3 py-2.5 ${content.className}`}>
      <p className="text-sm font-black uppercase tracking-wider">
        {content.title}
      </p>
      <p className="mt-1 text-sm leading-5 opacity-90">{content.message}</p>
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
      className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-black uppercase tracking-wider ${content.className}`}
    >
      <Icon size={14} />
      {content.label}
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
    <div className="min-w-0 last:col-span-2 sm:last:col-span-1">
      <p className="text-xs text-zinc-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-zinc-200">{value}</p>
    </div>
  );
}

export function EmptyRegistrations({ t }: { t: DashboardTranslator }) {
  return (
    <div className="mt-3 border border-dashed border-white/15 bg-zinc-950/50 p-4 sm:p-5">
      <div className="hidden">
        <CalendarDays size={21} />
      </div>
      <h3 className="text-base font-bold text-white">
        {t("dashboard.competition.emptyCurrentTitle")}
      </h3>
      <p className="mt-1 max-w-lg text-sm leading-5 text-zinc-400">
        {t("dashboard.competition.emptyCurrentDescription")}
      </p>
      <Link
        href="/tournaments"
        className="mt-3 inline-flex min-h-11 items-center border border-orange-400 bg-orange-500 px-5 py-2.5 text-sm font-bold text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
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
