import { auth } from "@clerk/nextjs/server";
import {
  Activity,
  ClipboardCheck,
  Clock,
  MapPinned,
  Megaphone,
  Plus,
  ShieldAlert,
  Trophy,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import InAppNotificationCenter from "@/components/InAppNotificationCenter";
import type { AdminRegistrationStatus } from "@/lib/admin-registration-review";
import { loadAdminNotifications } from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  formatTournamentDivisionState,
  formatTournamentEventDivisionState,
  type TournamentDivisionStateResolution,
} from "@/lib/tournament-division-state";
import { loadTournamentDivisionStates } from "@/lib/tournament-division-state-data";
import type {
  TournamentBracketName,
  TournamentStatus,
} from "@/lib/tournaments";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type LegacyRegistrationNotice =
  | "note-required"
  | "saved"
  | "save-failed"
  | "registration-deleted"
  | "registration-delete-failed"
  | "registration-delete-blocked"
  | "bracket-full"
  | "registration-closed"
  | "registration-locked"
  | "registration-bulk-approved"
  | "registration-bulk-partial"
  | "registration-bulk-failed";
type LegacyRegistrationFocus = "note" | "reject" | "manual_review";
type LegacyRegistrationFilter = "all" | AdminRegistrationStatus;
type AdminBracketNotice =
  | "population-saved"
  | "population-failed"
  | "division-launched"
  | "division-already-launched"
  | "division-launch-failed";

type AdminPageSearchParams = {
  filter?: string | string[];
  selected?: string | string[];
  notice?: string | string[];
  detail?: string | string[];
  focus?: string | string[];
  bracketNotice?: string | string[];
};

type AdminPageProps = {
  searchParams?: Promise<AdminPageSearchParams>;
};

type RegistrationSummaryRow = {
  registration_status: AdminRegistrationStatus;
};

type TournamentSummaryRow = {
  id: string;
  title: string;
  status: TournamentStatus;
  created_at: string;
  tournament_brackets?: Array<{
    id: string;
    name: TournamentBracketName;
    launched_at: string | null;
  }>;
};

const registrationFilters: LegacyRegistrationFilter[] = [
  "all",
  "pending",
  "manual_review",
  "approved",
  "rejected",
  "waitlisted",
  "withdrawn",
];
const registrationNotices: LegacyRegistrationNotice[] = [
  "note-required",
  "saved",
  "save-failed",
  "registration-deleted",
  "registration-delete-failed",
  "registration-delete-blocked",
  "bracket-full",
  "registration-closed",
  "registration-locked",
  "registration-bulk-approved",
  "registration-bulk-partial",
  "registration-bulk-failed",
];
const registrationFocusTargets: LegacyRegistrationFocus[] = [
  "note",
  "reject",
  "manual_review",
];
const bracketNoticeMessages: Record<AdminBracketNotice, string> = {
  "population-saved":
    "Bracket assignments saved privately. The division remains unpublished until Launch Division.",
  "population-failed":
    "Bracket assignments could not be saved. Open the Tournament workspace and verify every selected Player is approved and unique.",
  "division-launched":
    "Division launched. Its bracket is now public and its roster is locked.",
  "division-already-launched":
    "This division was already launched; its original launch time and notifications were preserved.",
  "division-launch-failed":
    "Division launch failed. Open the Tournament workspace and confirm readiness, assignments, and private-draft integrity.",
};

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getLegacyRegistrationRedirect(params?: AdminPageSearchParams) {
  if (
    !params ||
    !["filter", "selected", "notice", "detail", "focus"].some(
      (key) => params[key as keyof AdminPageSearchParams] !== undefined
    )
  ) {
    return null;
  }

  const target = new URLSearchParams();
  const requestedFilter = singleValue(params.filter);
  const filter = registrationFilters.includes(
    requestedFilter as LegacyRegistrationFilter
  )
    ? (requestedFilter as LegacyRegistrationFilter)
    : "all";
  target.set("filter", filter);

  const selected = singleValue(params.selected)?.trim();
  if (selected && isUuid(selected)) {
    target.set("selected", selected);
  }

  const notice = singleValue(params.notice);
  if (registrationNotices.includes(notice as LegacyRegistrationNotice)) {
    target.set("notice", notice as LegacyRegistrationNotice);
  }

  const detail = singleValue(params.detail)?.trim();
  if (detail) {
    target.set("detail", detail.slice(0, 2_000));
  }

  const focus = singleValue(params.focus);
  if (registrationFocusTargets.includes(focus as LegacyRegistrationFocus)) {
    target.set("focus", focus as LegacyRegistrationFocus);
  }

  return `/admin/registrations?${target.toString()}`;
}

function getTournamentSortTime(tournament: TournamentSummaryRow) {
  const timestamp = new Date(tournament.created_at).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    redirect("/");
  }

  const params = await searchParams;
  const legacyRegistrationRedirect = getLegacyRegistrationRedirect(params);
  if (legacyRegistrationRedirect) {
    redirect(legacyRegistrationRedirect);
  }

  const supabase = createSupabaseAdminClient();
  const [registrationResult, tournamentResult, adminNotifications] =
    await Promise.all([
      supabase.from("registrations").select("registration_status"),
      supabase
        .from("tournaments")
        .select(
          "id, title, status, created_at, tournament_brackets(id, name, launched_at)"
        )
        .order("created_at", { ascending: false }),
      loadAdminNotifications(50),
    ]);

  if (registrationResult.error) {
    console.error(
      "Admin Command Center registration summary failed:",
      registrationResult.error.message
    );
  }
  if (tournamentResult.error) {
    console.error(
      "Admin Command Center Tournament summary failed:",
      tournamentResult.error.message
    );
  }

  const registrations = (Array.isArray(registrationResult.data)
    ? registrationResult.data
    : []) as RegistrationSummaryRow[];
  const tournaments = (Array.isArray(tournamentResult.data)
    ? tournamentResult.data
    : []) as TournamentSummaryRow[];
  const activeTournaments = tournaments
    .filter(
      (tournament) =>
        tournament.status === "registration_open" ||
        tournament.status === "in_progress"
    )
    .sort(
      (left, right) => getTournamentSortTime(right) - getTournamentSortTime(left)
    );
  const registrationSummaryAvailable = !registrationResult.error;
  const tournamentSummaryAvailable = !tournamentResult.error;
  const divisionStatesByTournament = tournamentSummaryAvailable
    ? await loadTournamentDivisionStates(supabase, activeTournaments)
    : new Map<string, readonly TournamentDivisionStateResolution[]>();
  const summaryCards = [
    {
      label: "Pending Registrations",
      value: registrationSummaryAvailable
        ? registrations.filter(
            (registration) => registration.registration_status === "pending"
          ).length
        : null,
      href: "/admin/registrations?filter=pending",
      icon: Clock,
    },
    {
      label: "Manual Review Registrations",
      value: registrationSummaryAvailable
        ? registrations.filter(
            (registration) =>
              registration.registration_status === "manual_review"
          ).length
        : null,
      href: "/admin/registrations?filter=manual_review",
      icon: ShieldAlert,
    },
    {
      label: "Active Tournaments",
      value: tournamentSummaryAvailable ? activeTournaments.length : null,
      href: "/admin/tournaments",
      icon: Trophy,
    },
  ];
  const bracketNotice = singleValue(params?.bracketNotice) as
    | AdminBracketNotice
    | undefined;

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-28 pb-20 text-white sm:px-6 sm:pt-32">
      <div className="mx-auto max-w-7xl space-y-8">
        <header
          className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-cover bg-center p-5 shadow-2xl sm:p-8"
          style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
        >
          <div className="absolute inset-0 bg-black/75" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-orange-950/40" />

          <div className="relative z-10 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
                Private Admin Area
              </p>
              <h1 className="mt-4 break-words text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
                IronClad Admin Command Center
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
                See what needs administrative attention now, then move directly
                into the authoritative workspace for the task.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/admin/tournaments/new"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-black text-white transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create Tournament
              </Link>
              <Link
                href="/admin/operations#attention-required"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-orange-400/50 bg-orange-500/10 px-5 py-3 font-bold text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
              >
                <Activity className="h-4 w-4" aria-hidden="true" />
                Operations Attention
              </Link>
            </div>
          </div>

          <nav
            aria-label="Admin mobile workspace navigation"
            className="relative z-10 mt-7 grid gap-3 sm:grid-cols-2 xl:hidden"
          >
            {[
              {
                href: "/admin/registrations",
                label: "Registration Review",
                icon: ClipboardCheck,
              },
              {
                href: "/admin/operations",
                label: "Operations & Analytics",
                icon: Activity,
              },
              {
                href: "/admin/tournaments",
                label: "Manage Tournaments",
                icon: Trophy,
              },
              {
                href: "/admin/maps",
                label: "Global Map Catalogue",
                icon: MapPinned,
              },
              {
                href: "/admin/polls",
                label: "Polls & Decisions",
                icon: Vote,
              },
              {
                href: "/admin/announcements",
                label: "Official Announcements",
                icon: Megaphone,
              },
              {
                href: "/admin/system",
                label: "System & Recovery",
                icon: ShieldAlert,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:border-orange-400/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                >
                  <Icon className="h-4 w-4 text-orange-400" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        {bracketNotice && bracketNoticeMessages[bracketNotice] && (
          <div
            role="status"
            className={`flex flex-col gap-3 rounded-2xl border p-4 text-sm font-bold sm:flex-row sm:items-center sm:justify-between ${
              bracketNotice === "population-saved" ||
              bracketNotice === "division-launched" ||
              bracketNotice === "division-already-launched"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            <p>{bracketNoticeMessages[bracketNotice]}</p>
            <Link
              href="/admin/tournaments"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-current/30 px-4 py-2 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
            >
              Open Tournament workspace
            </Link>
          </div>
        )}

        {(registrationResult.error || tournamentResult.error) && (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
          >
            One or more Command Center summaries could not be loaded. Open the
            focused workspace to retry the authoritative data view.
          </div>
        )}

        <section aria-labelledby="needs-attention-heading" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
                Current Work
              </p>
              <h2 id="needs-attention-heading" className="mt-2 text-2xl font-black">
                Needs Attention
              </h2>
            </div>
            <Link
              href="/admin/operations#attention-required"
              className="text-sm font-bold text-orange-300 underline decoration-orange-400/40 underline-offset-4 transition hover:text-orange-200"
            >
              Open Operations attention queue
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.label}
                  href={card.href}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-0.5 hover:border-orange-400/50 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
                >
                  <Icon className="h-5 w-5 text-orange-400" aria-hidden="true" />
                  <p className="mt-4 text-3xl font-black">
                    {card.value === null ? "—" : card.value}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">{card.label}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="active-tournaments-heading"
          className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
                Competition Context
              </p>
              <h2 id="active-tournaments-heading" className="mt-2 text-2xl font-black">
                Active Tournaments
              </h2>
            </div>
            <Link
              href="/admin/tournaments"
              className="text-sm font-bold text-orange-300 underline decoration-orange-400/40 underline-offset-4 transition hover:text-orange-200"
            >
              View all Tournaments
            </Link>
          </div>

          {tournamentResult.error ? (
            <p className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              Active Tournament context is temporarily unavailable.
            </p>
          ) : activeTournaments.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
              No Tournaments are currently open for registration or in progress.
            </p>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeTournaments.slice(0, 6).map((tournament) => {
                const divisionStates = divisionStatesByTournament.get(
                  tournament.id
                );

                if (!divisionStates) {
                  throw new Error(
                    "Admin Command Center Tournament state could not be loaded."
                  );
                }

                return (
                  <Link
                    key={tournament.id}
                    href={`/admin/tournaments/${tournament.id}?section=overview`}
                    aria-label={`${tournament.title} — ${formatTournamentEventDivisionState(divisionStates)}`}
                    className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:border-orange-400/45 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
                  >
                    <p className="break-words font-black text-white">
                      {tournament.title}
                    </p>
                    <p className="mt-2 text-xs font-bold uppercase tracking-wider text-orange-300">
                      {formatStatus(tournament.status)}
                    </p>
                    <span className="mt-3 flex flex-wrap gap-2">
                      {divisionStates.map((division) => (
                        <span
                          key={division.canonicalName}
                          className="rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-300"
                        >
                          {division.displayName}: {formatTournamentDivisionState(division)}
                        </span>
                      ))}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="relative z-0 max-w-4xl">
          <InAppNotificationCenter
            key={[
              adminNotifications.unreadCount,
              ...adminNotifications.notifications.map(
                (notification) =>
                  `${notification.id}:${notification.readAt ?? ""}`
              ),
            ].join("|")}
            scope="admin"
            title="Admin Notification Center"
            description="Recent registration, match result, and dispute events that need administrative awareness."
            emptyMessage="New registrations, submitted results, and disputes will appear here."
            notifications={adminNotifications.notifications}
            totalCount={adminNotifications.totalCount}
            unreadCount={adminNotifications.unreadCount}
            error={adminNotifications.error}
          />
        </div>
      </div>
    </main>
  );
}
