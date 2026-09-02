import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  approveSelectedRegistrations,
  deleteSelectedRegistrations,
  updateRegistrationStatus,
} from "@/app/admin/registration-actions";
import AdminRegistrationReviewRows from "@/components/AdminRegistrationReviewRows";
import AdminRegistrationSelectAll from "@/components/AdminRegistrationSelectAll";
import {
  formatTournamentDivisionState,
  formatTournamentEventDivisionState,
  getEffectiveTournamentDivisionState,
  type TournamentDivisionStateResolution,
} from "@/lib/tournament-division-state";
import { loadTournamentDivisionStates } from "@/lib/tournament-division-state-data";
import {
  getTournamentBracketDisplayName,
  isTournamentTerminalStatus,
  type TournamentBracketName,
  type TournamentStatus,
} from "@/lib/tournaments";
import { isActiveReviewCohortStatus } from "@/lib/tournament-registration-cohort";
import {
  buildAdminRegistrationEvidence,
  buildRegistrationOrderMap,
  buildWaitlistPositionMap,
  type AdminRegistrationOrderInput,
  type AdminRegistrationReviewRow,
  type AdminRegistrationStatus,
  type AdminWaitlistOfferStatus,
} from "@/lib/admin-registration-review";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  X,
  XCircle,
} from "lucide-react";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type RegistrationStatus = AdminRegistrationStatus;
type FilterStatus = "all" | RegistrationStatus;
type AdminFocusTarget = "note" | "reject" | "manual_review";
type AdminNotice =
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
type AdminRegistrationsPageProps = {
  searchParams?: Promise<{
    filter?: FilterStatus;
    selected?: string;
    notice?: AdminNotice;
    detail?: string;
    focus?: AdminFocusTarget;
  }>;
};

type SupabaseRegistration = {
  id: string;
  player_name: string;
  country: string | null;
  submitted_elo: number | null;
  elo_verified_elo: number | null;
  elo_highest_faction: string | null;
  elo_checked_at: string | null;
  elo_verification_source: string | null;
  elo_verified_division: string | null;
  elo_calculation_version: string | null;
  registration_status: RegistrationStatus;
  admin_notes: string | null;
  created_at: string;
  tournament_id: string | null;
  tournament_bracket_id: string | null;
  tournament_title: string | null;
  bracket_name: string | null;
  waitlist_offer_status: AdminWaitlistOfferStatus | null;
  waitlist_position?: number | null;
  registration_order?: number | null;
};

type AdminTournamentOption = {
  id: string;
  title: string;
  status: TournamentStatus;
  grand_final_at: string | null;
  created_at: string;
  tournament_brackets?: {
    id: string;
    name: TournamentBracketName;
    launched_at: string | null;
  }[];
};

type RegistrationCohortSummary = {
  bracketId: string | null;
  canonicalName: string;
  tournamentId: string;
  tournamentTitle: string;
  bracketName: string;
  activeCohortCount: number;
  approvedCount: number | null;
  requiredCount: number | null;
  waitlistCount: number;
  divisionState: TournamentDivisionStateResolution;
};

type RegistrationReviewGroupStatus =
  | TournamentStatus
  | "metadata_unavailable"
  | "unknown";

type RegistrationReviewGroup = {
  key: string;
  title: string;
  status: RegistrationReviewGroupStatus;
  rows: AdminRegistrationReviewRow[];
  totalCount: number;
  statusCounts: Record<RegistrationStatus, number>;
  readiness: RegistrationCohortSummary[];
  waitlistRows: SupabaseRegistration[];
};

const ACTIVE_TOURNAMENT_STATUSES: readonly TournamentStatus[] = [
  "upcoming",
  "registration_open",
  "in_progress",
];

const ARCHIVED_TOURNAMENT_STATUSES: readonly TournamentStatus[] = [
  "completed",
  "cancelled",
  "voided",
];

const REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
  "pending",
  "manual_review",
  "approved",
  "rejected",
  "waitlisted",
  "withdrawn",
];

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAdminVerificationSource(source: string | null) {
  if (!source) {
    return null;
  }

  if (source.toLowerCase() === "relic") {
    return "Relic";
  }

  if (source.toLowerCase() === "coh3stats") {
    return "CoH3 Stats";
  }

  return formatStatus(source);
}

function formatAdminEvidenceDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp)
    ? new Date(value).toLocaleString()
    : "Unavailable";
}

function compareAdminRegistrationReviewRows(
  left: AdminRegistrationReviewRow,
  right: AdminRegistrationReviewRow
) {
  return (
    (left.tournamentId ?? "").localeCompare(right.tournamentId ?? "") ||
    (left.selectedBracket ?? "").localeCompare(right.selectedBracket ?? "") ||
    (left.registrationOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.registrationOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.registrationId.localeCompare(right.registrationId)
  );
}

function getSafeFilter(filter?: string): FilterStatus {
  const validFilters: FilterStatus[] = [
    "all",
    "pending",
    "manual_review",
    "approved",
    "rejected",
    "waitlisted",
    "withdrawn",
  ];

  return validFilters.includes(filter as FilterStatus)
    ? (filter as FilterStatus)
    : "all";
}

function buildHref({
  filter,
  selected,
  notice,
  detail,
  focus,
}: {
  filter: FilterStatus;
  selected?: string;
  notice?: AdminNotice;
  detail?: string;
  focus?: AdminFocusTarget;
}) {
  const params = new URLSearchParams();
  params.set("filter", filter);

  if (selected) {
    params.set("selected", selected);
  }

  if (notice) {
    params.set("notice", notice);
  }

  if (detail) {
    params.set("detail", detail);
  }

  if (focus) {
    params.set("focus", focus);
  }

  return `/admin/registrations?${params.toString()}`;
}

function compareAdminTournaments(
  left: AdminTournamentOption,
  right: AdminTournamentOption
) {
  const leftHistorical = left.status === "completed" ? 1 : 0;
  const rightHistorical = right.status === "completed" ? 1 : 0;

  if (leftHistorical !== rightHistorical) {
    return leftHistorical - rightHistorical;
  }

  return getAdminTournamentSortTime(right) - getAdminTournamentSortTime(left);
}

function isActiveTournamentStatus(status: RegistrationReviewGroupStatus) {
  return ACTIVE_TOURNAMENT_STATUSES.includes(status as TournamentStatus);
}

function isArchivedTournamentStatus(status: RegistrationReviewGroupStatus) {
  return ARCHIVED_TOURNAMENT_STATUSES.includes(status as TournamentStatus);
}

function getRegistrationStatusCounts(rows: AdminRegistrationReviewRow[]) {
  const counts = Object.fromEntries(
    REGISTRATION_STATUSES.map((status) => [status, 0])
  ) as Record<RegistrationStatus, number>;

  for (const row of rows) {
    counts[row.status] += 1;
  }

  return counts;
}

function getContextualWaitlistGroups(rows: SupabaseRegistration[]) {
  const rowsByBracket = new Map<string, SupabaseRegistration[]>();

  for (const row of rows) {
    const key = row.tournament_bracket_id ?? "unassigned";
    const bracketRows = rowsByBracket.get(key) ?? [];
    bracketRows.push(row);
    rowsByBracket.set(key, bracketRows);
  }

  return Array.from(rowsByBracket, ([key, bracketRows]) => ({
    key,
    bracketName:
      bracketRows[0]?.bracket_name?.trim()
        ? getTournamentBracketDisplayName(bracketRows[0].bracket_name.trim())
        : "Division not assigned",
    rows: bracketRows,
  }));
}

function getAdminTournamentSortTime(tournament: AdminTournamentOption) {
  const dateValue = tournament.grand_final_at ?? tournament.created_at;
  const timestamp = new Date(dateValue).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareWaitlistedRegistrations(
  left: SupabaseRegistration,
  right: SupabaseRegistration
) {
  const leftTime = new Date(left.created_at).getTime();
  const rightTime = new Date(right.created_at).getTime();
  const timeDelta =
    (Number.isFinite(leftTime) ? leftTime : 0) -
    (Number.isFinite(rightTime) ? rightTime : 0);

  return timeDelta || left.id.localeCompare(right.id);
}

function RegistrationWorkbenchGroup({
  group,
  activeFilter,
  defaultOpen,
  isTournamentTerminal,
}: {
  group: RegistrationReviewGroup;
  activeFilter: FilterStatus;
  defaultOpen: boolean;
  isTournamentTerminal: boolean;
}) {
  const statusCounts = [
    ["Pending", group.statusCounts.pending],
    ["Manual", group.statusCounts.manual_review],
    ["Approved", group.statusCounts.approved],
    ["Rejected", group.statusCounts.rejected],
    ["Waitlist", group.statusCounts.waitlisted],
    ["Withdrawn", group.statusCounts.withdrawn],
  ].filter((entry): entry is [string, number] => Number(entry[1]) > 0);
  const waitlistGroups = getContextualWaitlistGroups(group.waitlistRows);

  return (
    <details
      open={defaultOpen}
      data-registration-tournament-group={group.key}
      data-registration-group-status={group.status}
      className="group min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] open:border-orange-400/25 open:bg-white/[0.05]"
    >
      <summary className="cursor-pointer list-none px-4 py-4 marker:text-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-400 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="break-words text-base font-black text-white sm:text-lg">
                {group.title}
              </span>
              <span className="rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider text-zinc-300">
                {formatStatus(group.status)}
              </span>
            </span>
            <span className="mt-2 block text-xs font-semibold text-zinc-400">
              {group.rows.length} matching · {group.totalCount} total
            </span>
            {statusCounts.length > 0 && (
              <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-300">
                {statusCounts.map(([label, count]) => (
                  <span key={label}>
                    <span className="font-bold text-zinc-100">{label}</span>{" "}
                    {count}
                  </span>
                ))}
              </span>
            )}
          </span>

          {group.readiness.length > 0 && (
            <span
              data-registration-readiness-summary={group.key}
              aria-label={formatTournamentEventDivisionState(
                group.readiness.map((readiness) => readiness.divisionState)
              )}
              className="flex min-w-0 flex-wrap gap-2 xl:max-w-[58%] xl:justify-end"
            >
              {group.readiness.map((readiness) => {
                const effectiveState = getEffectiveTournamentDivisionState(
                  readiness.divisionState
                );

                return (
                  <span
                    key={readiness.canonicalName}
                    className={`rounded-xl border px-3 py-2 text-xs leading-5 ${
                      effectiveState === "cancelled" ||
                      effectiveState === "voided"
                        ? "border-red-400/30 bg-red-500/10 text-red-100"
                        : effectiveState === "completed"
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                        : effectiveState === "in_progress"
                          ? "border-sky-400/30 bg-sky-500/10 text-sky-100"
                          : effectiveState === "ready"
                            ? "border-orange-400/35 bg-orange-500/10 text-orange-100"
                            : "border-white/10 bg-black/30 text-zinc-300"
                    }`}
                  >
                    <span className="font-black text-white">
                      {readiness.bracketName}
                    </span>{" — "}
                    {formatTournamentDivisionState(readiness.divisionState)}
                    {readiness.bracketId && (
                      <>
                        {" · "}{readiness.activeCohortCount} active ·{" "}
                        {readiness.waitlistCount} waiting
                      </>
                    )}
                  </span>
                );
              })}
            </span>
          )}
        </span>
        <span className="mt-3 block text-[0.65rem] font-black uppercase tracking-[0.22em] text-orange-300 group-open:text-orange-200">
          <span className="group-open:hidden">Open Tournament registrations</span>
          <span className="hidden group-open:inline">
            Hide Tournament registrations
          </span>
        </span>
      </summary>

      <div className="border-t border-white/10 px-4 py-4 sm:px-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-zinc-500">
            Frozen ELO is captured at registration and is not the current
            profile ELO. Full immutable evidence remains in Registration
            Details.
          </p>
          <div className="shrink-0 xl:hidden">
            <AdminRegistrationSelectAll
              formId="registration-bulk-form"
              name="registrationId"
              scope={group.key}
              showLabel
            />
          </div>
        </div>

        {waitlistGroups.length > 0 && (
          <div
            data-registration-fifo-summary={group.key}
            className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3"
          >
            <p className="text-xs font-black uppercase tracking-wider text-amber-300">
              FIFO Waitlist · {group.waitlistRows.length} waiting
            </p>
            <div className="mt-2 space-y-1 text-xs leading-5 text-amber-50/85">
              {waitlistGroups.map((waitlistGroup) => {
                const oldest = waitlistGroup.rows[0];

                return (
                  <p key={waitlistGroup.key}>
                    <span className="font-bold text-amber-100">
                      {waitlistGroup.bracketName}
                    </span>{" "}
                    · {waitlistGroup.rows.length} waiting · Oldest: {" "}
                    {oldest.player_name || "Player"} · Position #{" "}
                    {oldest.waitlist_position ?? "?"}
                  </p>
                );
              })}
              <p>Vacancy offers remain transactional and follow Division FIFO.</p>
            </div>
          </div>
        )}

        <AdminRegistrationReviewRows
          registrations={group.rows}
          activeFilter={activeFilter}
          formId="registration-bulk-form"
          selectionScope={group.key}
          isTournamentTerminal={isTournamentTerminal}
          updateRegistrationStatusAction={updateRegistrationStatus}
          returnHref="/admin/registrations"
          desktopPresentation="tournament-workbench"
        />
      </div>
    </details>
  );
}

export default async function AdminRegistrationsPage({
  searchParams,
}: AdminRegistrationsPageProps) {
  const { userId, sessionClaims } = await auth();

  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  const isAdmin = role === "admin";

  if (!userId || !isAdmin) {
    redirect("/");
  }

  const params = await searchParams;
  const activeFilter = getSafeFilter(params?.filter);

  const supabase = createSupabaseAdminClient();
  const [registrationResult, tournamentResult] = await Promise.all([
    supabase
      .from("registrations")
      .select(
        "id, player_name, country, submitted_elo, elo_verified_elo, elo_highest_faction, elo_checked_at, elo_verification_source, elo_verified_division, elo_calculation_version, registration_status, admin_notes, created_at, tournament_id, tournament_bracket_id, tournament_title, bracket_name, waitlist_offer_status"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("tournaments")
      .select(
        "id, title, status, grand_final_at, created_at, tournament_brackets(id, name, launched_at)"
      )
      .order("grand_final_at", { ascending: false, nullsFirst: false }),
  ]);
  const registrationsData = registrationResult.data;
  const error = registrationResult.error;
  const invalidRegistrationResponse = !Array.isArray(registrationsData);
  const invalidTournamentResponse = !Array.isArray(tournamentResult.data);

  if (error) {
    console.error("Supabase registrations fetch error:", error.message);
  }

  if (
    (!error && invalidRegistrationResponse) ||
    (!tournamentResult.error && invalidTournamentResponse)
  ) {
    console.error("Admin Tournament operations returned an invalid response.");
  }

  const baseRegistrations = (Array.isArray(registrationsData)
    ? registrationsData
    : []) as SupabaseRegistration[];
  const registrationOrderInputs: AdminRegistrationOrderInput[] =
    baseRegistrations.map((registration) => ({
      registrationId: registration.id,
      tournamentId: registration.tournament_id,
      tournamentBracketId: registration.tournament_bracket_id,
      createdAt: registration.created_at,
      status: registration.registration_status,
      waitlistOfferStatus: registration.waitlist_offer_status,
    }));
  const registrationPriorityById = buildRegistrationOrderMap(
    registrationOrderInputs
  );
  const tournaments = [
    ...((Array.isArray(tournamentResult.data)
      ? tournamentResult.data
      : []) as AdminTournamentOption[]),
  ].sort(compareAdminTournaments);
  const divisionStatesByTournament =
    tournamentResult.error || invalidTournamentResponse
      ? new Map<string, readonly TournamentDivisionStateResolution[]>()
      : await loadTournamentDivisionStates(supabase, tournaments);
  const divisionStateByBracket = new Map(
    Array.from(divisionStatesByTournament.values()).flatMap((divisions) =>
      divisions.flatMap((division) =>
        division.bracketId ? [[division.bracketId, division] as const] : []
      )
    )
  );
  const tournamentsById = new Map(
    tournaments.map((tournament) => [tournament.id, tournament.title])
  );
  const terminalTournamentIds = new Set(
    tournaments
      .filter((tournament) => isTournamentTerminalStatus(tournament.status))
      .map((tournament) => tournament.id)
  );
  const bracketMetaById = new Map(
    tournaments.flatMap((tournament) =>
      (tournament.tournament_brackets ?? []).map((bracket) => [
        bracket.id,
        {
          tournamentId: tournament.id,
          tournamentTitle: tournament.title,
          bracketName: getTournamentBracketDisplayName(bracket.name),
          launchedAt:
            divisionStateByBracket.get(bracket.id)?.launchedAt ??
            bracket.launched_at,
          isTournamentTerminal: isTournamentTerminalStatus(tournament.status),
        },
      ])
    )
  );
  const isBracketWaitlistOpen = (bracketId: string | null) =>
    bracketId !== null &&
    bracketMetaById.get(bracketId)?.launchedAt === null &&
    bracketMetaById.get(bracketId)?.isTournamentTerminal === false;
  const activeCohortCountByBracket = new Map<string, number>();
  const waitlistCountByBracket = new Map<string, number>();
  for (const registration of baseRegistrations) {
    if (!registration.tournament_bracket_id) {
      continue;
    }

    if (isActiveReviewCohortStatus(registration.registration_status)) {
      activeCohortCountByBracket.set(
        registration.tournament_bracket_id,
        (activeCohortCountByBracket.get(
          registration.tournament_bracket_id
        ) ?? 0) + 1
      );
    } else if (
      registration.registration_status === "waitlisted" &&
      registration.waitlist_offer_status === null &&
      isBracketWaitlistOpen(registration.tournament_bracket_id)
    ) {
      waitlistCountByBracket.set(
        registration.tournament_bracket_id,
        (waitlistCountByBracket.get(registration.tournament_bracket_id) ?? 0) +
          1
      );
    }
  }
  const registrationCohortSummaries: RegistrationCohortSummary[] =
    tournaments.flatMap((tournament) =>
      (divisionStatesByTournament.get(tournament.id) ?? []).map((division) => {
        const bracketId = division.bracketId;
        return {
          bracketId,
          canonicalName: division.canonicalName,
          tournamentId: tournament.id,
          tournamentTitle: tournament.title,
          bracketName: division.displayName,
          activeCohortCount: bracketId
            ? activeCohortCountByBracket.get(bracketId) ?? 0
            : 0,
          approvedCount: division.approvedCount,
          requiredCount: division.requiredCount,
          waitlistCount: bracketId
            ? waitlistCountByBracket.get(bracketId) ?? 0
            : 0,
          divisionState: division,
        };
      })
    );
  const waitlistPositionByRegistration = buildWaitlistPositionMap(
    registrationOrderInputs.filter(({ tournamentBracketId }) =>
      isBracketWaitlistOpen(tournamentBracketId)
    )
  );
  const registrations = baseRegistrations.map((registration) => ({
    ...registration,
    waitlist_position: waitlistPositionByRegistration.get(registration.id) ?? null,
    registration_order: registrationPriorityById.get(registration.id) ?? null,
  }));
  const waitlistNotices = registrations
    .filter(
      (registration) =>
        registration.registration_status === "waitlisted" &&
        registration.waitlist_offer_status === null &&
        registration.tournament_bracket_id &&
        isBracketWaitlistOpen(registration.tournament_bracket_id)
    )
    .slice()
    .sort(compareWaitlistedRegistrations);
  if (tournamentResult.error) {
    console.error(
      "Admin tournament operations load failed:",
      tournamentResult.error.message
    );
  }

  const allRegistrationReviewRows: AdminRegistrationReviewRow[] =
    registrations.map((registration) => ({
      registrationId: registration.id,
      tournamentId: registration.tournament_id,
      privateAdminNote: registration.admin_notes,
      isDivisionLaunched: Boolean(
        registration.tournament_bracket_id &&
          bracketMetaById.get(registration.tournament_bracket_id)?.launchedAt
      ),
      ...buildAdminRegistrationEvidence({
        playerDisplayName: registration.player_name,
        tournamentName:
          registration.tournament_title ||
          (registration.tournament_id
            ? tournamentsById.get(registration.tournament_id) ?? ""
            : ""),
        selectedBracket: registration.bracket_name,
        submittedElo: registration.submitted_elo,
        verifiedElo: registration.elo_verified_elo,
        verifiedDivision: registration.elo_verified_division,
        verifiedFaction: registration.elo_highest_faction,
        verificationSource: registration.elo_verification_source,
        verificationCheckedAt: registration.elo_checked_at,
        eligibilityRulesVersion: registration.elo_calculation_version,
        status: registration.registration_status,
        registeredAt: registration.created_at,
        waitlistPosition: registration.waitlist_position,
        registrationOrder: registration.registration_order,
        waitlistOfferStatus: registration.waitlist_offer_status,
      }),
    }));
  const selectedRegistration = allRegistrationReviewRows.find(
    (registration) => registration.registrationId === params?.selected
  );
  const selectedRegistrationIsTerminal = Boolean(
    selectedRegistration?.tournamentId &&
      terminalTournamentIds.has(selectedRegistration.tournamentId)
  );
  const registrationReviewRows =
    activeFilter === "all"
      ? allRegistrationReviewRows.slice().sort(compareAdminRegistrationReviewRows)
      : allRegistrationReviewRows.filter(
          (registration) => registration.status === activeFilter
        ).sort(compareAdminRegistrationReviewRows);
  const hasBulkApprovableRegistration = registrationReviewRows.some(
    (registration) =>
      !registration.isDivisionLaunched &&
      (!registration.tournamentId ||
        !terminalTournamentIds.has(registration.tournamentId)) &&
      registration.status !== "waitlisted" &&
      registration.status !== "withdrawn" &&
      registration.status !== "approved"
  );
  const totalRegistrationCountByTournament = registrations.reduce(
    (counts, registration) => {
      const key = registration.tournament_id ?? "unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    },
    new Map<string, number>()
  );
  const registrationRowsByTournament = registrationReviewRows.reduce(
    (groups, registration) => {
      const key = registration.tournamentId ?? "unassigned";
      const group = groups.get(key) ?? [];
      group.push(registration);
      groups.set(key, group);
      return groups;
    },
    new Map<string, AdminRegistrationReviewRow[]>()
  );
  const allRegistrationRowsByTournament = allRegistrationReviewRows.reduce(
    (groups, registration) => {
      const key = registration.tournamentId ?? "unassigned";
      const group = groups.get(key) ?? [];
      group.push(registration);
      groups.set(key, group);
      return groups;
    },
    new Map<string, AdminRegistrationReviewRow[]>()
  );
  const readinessByTournament = registrationCohortSummaries.reduce(
    (groups, readiness) => {
      const group = groups.get(readiness.tournamentId) ?? [];
      group.push(readiness);
      groups.set(readiness.tournamentId, group);
      return groups;
    },
    new Map<string, RegistrationCohortSummary[]>()
  );
  const waitlistNoticesByTournament = waitlistNotices.reduce(
    (groups, registration) => {
      const key = registration.tournament_id ?? "unassigned";
      const group = groups.get(key) ?? [];
      group.push(registration);
      groups.set(key, group);
      return groups;
    },
    new Map<string, SupabaseRegistration[]>()
  );
  const tournamentIdsWithMetadata = new Set(
    tournaments.map((tournament) => tournament.id)
  );
  const registrationReviewGroupsBase: {
    key: string;
    title: string;
    status: RegistrationReviewGroupStatus;
    rows: AdminRegistrationReviewRow[];
    totalCount: number;
  }[] = tournaments.flatMap((tournament) => {
    const rows = registrationRowsByTournament.get(tournament.id) ?? [];

    return rows.length > 0
      ? [
          {
            key: tournament.id,
            title: tournament.title,
            status: tournament.status,
            rows,
            totalCount:
              totalRegistrationCountByTournament.get(tournament.id) ?? 0,
          },
        ]
      : [];
  });
  const fallbackRegistrationGroupKeys = new Set(
    registrationRowsByTournament.keys()
  );

  for (const key of fallbackRegistrationGroupKeys) {
    if (key === "unassigned" || tournamentIdsWithMetadata.has(key)) {
      continue;
    }

    const rows = registrationRowsByTournament.get(key) ?? [];
    const storedTitle =
      rows.find((row) => row.tournamentName.trim())?.tournamentName.trim() ||
      registrations
        .find((registration) => registration.tournament_id === key)
        ?.tournament_title?.trim();

    registrationReviewGroupsBase.push({
      key,
      title: storedTitle
        ? `${storedTitle} (metadata unavailable)`
        : "Tournament metadata unavailable",
      status: "metadata_unavailable",
      rows,
      totalCount: totalRegistrationCountByTournament.get(key) ?? rows.length,
    });
  }

  const unassignedRegistrationRows =
    registrationRowsByTournament.get("unassigned") ?? [];

  if (unassignedRegistrationRows.length > 0) {
    registrationReviewGroupsBase.push({
      key: "unassigned",
      title: "Unassigned registrations",
      status: "unknown",
      rows: unassignedRegistrationRows,
      totalCount: totalRegistrationCountByTournament.get("unassigned") ?? 0,
    });
  }

  const registrationReviewGroups: RegistrationReviewGroup[] =
    registrationReviewGroupsBase.map((group) => ({
      ...group,
      statusCounts: getRegistrationStatusCounts(
        allRegistrationRowsByTournament.get(group.key) ?? []
      ),
      readiness: readinessByTournament.get(group.key) ?? [],
      waitlistRows: waitlistNoticesByTournament.get(group.key) ?? [],
    }));
  const activeTournamentGroups = registrationReviewGroups.filter((group) =>
    isActiveTournamentStatus(group.status)
  );
  const archivedTournamentGroups = registrationReviewGroups.filter((group) =>
    isArchivedTournamentStatus(group.status)
  );
  const exceptionGroups = registrationReviewGroups.filter(
    (group) =>
      group.status === "metadata_unavailable" || group.status === "unknown"
  );
  const selectedGroupKey = selectedRegistration
    ? selectedRegistration.tournamentId ?? "unassigned"
    : undefined;
  const selectedGroupIsArchived = archivedTournamentGroups.some(
    (group) => group.key === selectedGroupKey
  );
  const shouldOpenArchive =
    selectedGroupIsArchived ||
    (activeFilter !== "all" &&
      activeTournamentGroups.length === 0 &&
      archivedTournamentGroups.length > 0);

  const filterOptions = [
    {
      label: "All",
      value: registrations.length,
      filter: "all" as FilterStatus,
    },
    {
      label: "Pending",
      value: registrations.filter(
        (item) => item.registration_status === "pending"
      ).length,
      filter: "pending" as FilterStatus,
    },
    {
      label: "Manual Review",
      value: registrations.filter(
        (item) => item.registration_status === "manual_review"
      ).length,
      filter: "manual_review" as FilterStatus,
    },
    {
      label: "Approved",
      value: registrations.filter(
        (item) => item.registration_status === "approved"
      ).length,
      filter: "approved" as FilterStatus,
    },
    {
      label: "Rejected",
      value: registrations.filter(
        (item) => item.registration_status === "rejected"
      ).length,
      filter: "rejected" as FilterStatus,
    },
    {
      label: "Waitlisted",
      value: registrations.filter(
        (item) => item.registration_status === "waitlisted"
      ).length,
      filter: "waitlisted" as FilterStatus,
    },
    {
      label: "Withdrawn",
      value: registrations.filter(
        (item) => item.registration_status === "withdrawn"
      ).length,
      filter: "withdrawn" as FilterStatus,
    },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-black px-4 pt-28 pb-16 text-white sm:px-6 sm:pt-32">
      <section className="mx-auto max-w-7xl space-y-8">
        <header
          className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-cover bg-center p-5 shadow-2xl sm:p-8"
          style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
        >
          <div className="absolute inset-0 bg-black/75" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-orange-950/40" />

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-4xl">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-orange-400">
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                Global Competition Review
              </p>

              <h1 className="mt-4 break-words text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
                Registrations
              </h1>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
                Review cross-Tournament registration evidence, readiness,
                waitlist order, and administrative decisions in one focused
                workspace.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/admin"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/45 px-5 py-3 font-bold text-zinc-200 transition hover:border-orange-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 xl:hidden"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Command Center
              </Link>
              <Link
                href="/admin/operations#attention-required"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-orange-400/50 bg-orange-500/10 px-5 py-3 font-bold text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
              >
                Operations Attention
              </Link>
            </div>
          </div>
        </header>

        <section
          id="registration-review"
          className="relative z-10 scroll-mt-28 space-y-5"
        >
          <div
            data-registration-workbench-toolbar="true"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur"
          >
            <form
              id="registration-bulk-form"
              action={deleteSelectedRegistrations}
            >
              <input type="hidden" name="activeFilter" value={activeFilter} />
            </form>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <nav
                aria-label="Registration status filters"
                className="min-w-0 flex-1"
              >
                <div className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1">
                  {filterOptions.map((option) => {
                    const isActive = activeFilter === option.filter;

                    return (
                      <Link
                        key={option.filter}
                        href={buildHref({ filter: option.filter })}
                        aria-current={isActive ? "page" : undefined}
                        className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${
                          isActive
                            ? "border-orange-400/60 bg-orange-500/20 text-orange-100"
                            : "border-white/10 bg-black/30 text-zinc-300 hover:border-orange-400/40 hover:text-white"
                        }`}
                      >
                        <span>{option.label}</span>
                        <span className="rounded-full bg-black/40 px-2 py-0.5 text-xs text-orange-300">
                          {option.value}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </nav>

              <button
                type="submit"
                form="registration-bulk-form"
                formAction={approveSelectedRegistrations}
                disabled={!hasBulkApprovableRegistration}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-green-200 transition hover:border-green-400/60 hover:bg-green-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600 sm:w-auto"
              >
                <CheckCircle className="h-4 w-4" />
                Approve Selected
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Showing {registrationReviewRows.length} registration(s).
            </p>
          </div>

          {params?.notice === "registration-deleted" && (
            <div className="mb-5 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm font-semibold text-green-300">
              Selected registration(s) deleted.
            </div>
          )}

          {params?.notice === "registration-bulk-approved" && (
            <div className="mb-5 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm font-semibold text-green-300">
              {params.detail || "Selected registration(s) approved."}
            </div>
          )}

          {params?.notice === "registration-bulk-partial" && (
            <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-amber-200">
              {params.detail ||
                "Some selected registration(s) were approved. Others failed validation."}
            </div>
          )}

          {params?.notice === "registration-bulk-failed" && (
            <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold leading-6 text-red-300">
              {params.detail ||
                "Selected registration(s) could not be approved."}
            </div>
          )}

          {params?.notice === "registration-delete-blocked" && (
            <div className="mb-5 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm font-semibold leading-6 text-orange-200">
              Selected registration(s) are tied to generated bracket data,
              matches, standings, submissions, or report groups. Reset or
              remove the related tournament data before deleting them.
            </div>
          )}

          {params?.notice === "registration-delete-failed" && (
            <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-300">
              Registration deletion failed. Select at least one registration and
              confirm the selected records are not protected by active
              tournament data.
            </div>
          )}

          {params?.notice === "bracket-full" && (
            <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-amber-200">
              Approval blocked because the bracket already has eight active
              review-cohort registrations.
            </div>
          )}

          {params?.notice === "registration-closed" && (
            <div className="mb-5 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm font-semibold leading-6 text-orange-200">
              Registration update blocked because this division is closed for
              roster changes.
            </div>
          )}

          {params?.notice === "registration-locked" && (
            <div className="mb-5 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm font-semibold leading-6 text-orange-200">
              Registration update blocked because this division has launched
              and its roster is locked.
            </div>
          )}

          {activeTournamentGroups.length > 0 && (
            <section
              data-registration-workbench-section="active"
              aria-labelledby="active-registration-tournaments"
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-3 px-1">
                <h2
                  id="active-registration-tournaments"
                  className="text-sm font-black uppercase tracking-[0.24em] text-orange-300"
                >
                  Active Tournaments
                </h2>
                <span className="text-xs text-zinc-500">
                  {activeTournamentGroups.length} Tournament(s)
                </span>
              </div>
              {activeTournamentGroups.map((group, index) => (
                <RegistrationWorkbenchGroup
                  key={group.key}
                  group={group}
                  activeFilter={activeFilter}
                  defaultOpen={
                    group.key === selectedGroupKey ||
                    (index === 0 && !selectedGroupKey)
                  }
                  isTournamentTerminal={terminalTournamentIds.has(group.key)}
                />
              ))}
            </section>
          )}

          {exceptionGroups.length > 0 && (
            <section
              data-registration-workbench-section="exceptions"
              aria-labelledby="registration-exceptions"
              className="space-y-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-3 sm:p-4"
            >
              <div className="flex items-center gap-2 px-1">
                <AlertTriangle
                  className="h-4 w-4 text-amber-300"
                  aria-hidden="true"
                />
                <h2
                  id="registration-exceptions"
                  className="text-sm font-black uppercase tracking-[0.2em] text-amber-200"
                >
                  Attention / Exceptions
                </h2>
              </div>
              {exceptionGroups.map((group, index) => (
                <RegistrationWorkbenchGroup
                  key={group.key}
                  group={group}
                  activeFilter={activeFilter}
                  defaultOpen={
                    group.key === selectedGroupKey ||
                    (index === 0 && !selectedGroupKey)
                  }
                  isTournamentTerminal={terminalTournamentIds.has(group.key)}
                />
              ))}
            </section>
          )}

          {archivedTournamentGroups.length > 0 && (
            <details
              open={shouldOpenArchive}
              data-registration-workbench-section="archive"
              className="group/archive rounded-2xl border border-white/10 bg-white/[0.025] p-3 open:bg-white/[0.04] sm:p-4"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-black uppercase tracking-[0.2em] text-zinc-300 marker:text-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 [&::-webkit-details-marker]:hidden">
                <span>
                  Past Tournaments ({archivedTournamentGroups.length})
                  <span className="ml-2 text-xs normal-case tracking-normal text-zinc-500">
                    Archive
                  </span>
                </span>
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-orange-300 transition-transform group-open/archive:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="mt-4 space-y-3">
                {archivedTournamentGroups.map((group, index) => (
                  <RegistrationWorkbenchGroup
                    key={group.key}
                    group={group}
                    activeFilter={activeFilter}
                    defaultOpen={
                      group.key === selectedGroupKey ||
                      (shouldOpenArchive && !selectedGroupIsArchived && index === 0)
                    }
                    isTournamentTerminal={terminalTournamentIds.has(group.key)}
                  />
                ))}
              </div>
            </details>
          )}

          {registrationReviewGroups.length === 0 && !error && (
            <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-center text-sm text-zinc-500">
              No registrations found for this status.
            </p>
          )}

          {error && (
            <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              Could not load registrations from Supabase. Check your table name,
              column names, and Row Level Security policy.
            </div>
          )}
        </section>

      </section>

      {selectedRegistration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur sm:p-6">
          <div className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-3xl border border-orange-500/30 bg-zinc-950 p-4 shadow-2xl shadow-orange-950/40 sm:max-h-[calc(100dvh-3rem)] sm:p-6">
            <div className="sticky top-0 z-10 -mx-1 mb-5 flex items-start justify-between gap-4 border-b border-white/10 bg-zinc-950/95 px-1 pb-4 backdrop-blur">
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-400">
                  Registration Details
                </p>

                <h2 className="mt-3 break-words text-2xl font-bold sm:text-3xl">
                  {selectedRegistration.playerDisplayName || "N/A"}
                </h2>

                <p className="mt-2 text-sm text-zinc-400">
                  Immutable tournament evidence and private administrator review.
                </p>
              </div>

              <Link
                href={buildHref({ filter: activeFilter })}
                aria-label="Close registration details"
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-2 text-zinc-400 transition hover:border-orange-500/50 hover:text-orange-300"
              >
                <X className="h-5 w-5" />
              </Link>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Player display name",
                  value: selectedRegistration.playerDisplayName,
                },
                {
                  label: "Tournament",
                  value: selectedRegistration.tournamentName,
                },
                {
                  label: "Selected bracket / division",
                  value: selectedRegistration.selectedBracket,
                },
                {
                  label: "Registration order (tournament division)",
                  value: selectedRegistration.registrationOrder
                    ? `#${selectedRegistration.registrationOrder}`
                    : null,
                },
                {
                  label: "Frozen tournament registration ELO",
                  value: selectedRegistration.frozenRegistrationElo,
                  detail:
                    "Authoritative for this tournament. This is not the player's current profile ELO.",
                },
                {
                  label: "Verified division",
                  value: selectedRegistration.verifiedDivision,
                },
                {
                  label: "Verified faction",
                  value: selectedRegistration.verifiedFaction,
                },
                {
                  label: "Verification source",
                  value: formatAdminVerificationSource(
                    selectedRegistration.verificationSource
                  ),
                },
                {
                  label: "Verification / check time",
                  value: formatAdminEvidenceDateTime(
                    selectedRegistration.verificationCheckedAt
                  ),
                },
                {
                  label: "Eligibility rules version",
                  value: selectedRegistration.eligibilityRulesVersion,
                },
                {
                  label: "Current registration status",
                  value: formatStatus(selectedRegistration.status),
                },
                {
                  label: "Waitlist position",
                  value:
                    selectedRegistration.status === "waitlisted"
                      ? selectedRegistration.waitlistPosition
                        ? `#${selectedRegistration.waitlistPosition}`
                        : null
                      : "Not waitlisted",
                },
                {
                  label: "Waitlist offer",
                  value: selectedRegistration.waitlistOfferStatus
                    ? formatStatus(selectedRegistration.waitlistOfferStatus)
                    : "No active or historical offer",
                },
                {
                  label: "Division launch state",
                  value: selectedRegistration.isDivisionLaunched
                    ? "Launched — roster locked"
                    : "Not launched",
                },
                {
                  label: "Registered at",
                  value: formatAdminEvidenceDateTime(
                    selectedRegistration.registeredAt
                  ),
                },
              ].map(({ label, value, detail }) => (
                <div
                  key={label}
                  className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    {label}
                  </p>

                  <p className="mt-2 break-words font-semibold text-white">
                    {value === null || value === "" ? "Unavailable" : value}
                  </p>
                  {detail && (
                    <p className="mt-2 text-xs leading-5 text-orange-200/75">
                      {detail}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <form action={updateRegistrationStatus} className="mt-4">
              <input
                type="hidden"
                name="registrationId"
                value={selectedRegistration.registrationId}
              />
              <input
                type="hidden"
                name="activeFilter"
                value={activeFilter}
              />
              <input
                type="hidden"
                name="selected"
                value={selectedRegistration.registrationId}
              />

              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
                <label
                  htmlFor="adminNotes"
                  className="text-xs font-bold uppercase tracking-wider text-orange-300"
                >
                  Private Admin Note
                  {selectedRegistrationIsTerminal ? " (read-only)" : ""}
                </label>
                <p className="mt-2 text-xs leading-5 text-zinc-400">
                  {selectedRegistrationIsTerminal
                    ? "Terminal tournament notes are retained as read-only administrator history."
                    : "Required when rejecting a registration or marking it for manual review. This note is restricted to administrators and is never included in player-facing status messages."}
                </p>
                <textarea
                  id="adminNotes"
                  name="adminNotes"
                  defaultValue={selectedRegistration.privateAdminNote ?? ""}
                  maxLength={1000}
                  rows={5}
                  readOnly={selectedRegistrationIsTerminal}
                  autoFocus={
                    !selectedRegistrationIsTerminal &&
                    (params?.focus === "note" || params?.focus === "reject")
                  }
                  className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-orange-400 read-only:cursor-default read-only:border-white/5 read-only:text-zinc-400"
                  placeholder="Record private review context for administrators."
                />
              </div>

              {params?.notice && (
                <div
                  className={`mt-4 rounded-xl border p-4 text-sm ${
                    params.notice === "saved"
                      ? "border-green-500/30 bg-green-500/10 text-green-300"
                      : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {params.notice === "note-required"
                    ? "Add an admin note before rejecting or marking this registration for manual review."
                    : params.notice === "saved"
                      ? "Registration decision and admin note saved."
                      : params.notice === "registration-locked"
                          ? selectedRegistrationIsTerminal
                            ? "This tournament is terminal, so registration decisions and private administrator notes are read-only."
                            : "This division has launched, so its roster decisions are locked. Private administrator notes remain editable."
                          : "The registration decision could not be saved. Check the note length and try again."}
                </div>
              )}

              <div className="mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2 lg:flex lg:flex-wrap">
                <button
                  type="submit"
                  name="nextStatus"
                  value={selectedRegistration.status}
                  disabled={selectedRegistrationIsTerminal}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:border-white/5 disabled:text-zinc-600 lg:w-auto"
                >
                  Save Private Note
                </button>

                {!selectedRegistration.isDivisionLaunched &&
                  !selectedRegistrationIsTerminal &&
                  selectedRegistration.status !== "waitlisted" &&
                  selectedRegistration.status !== "withdrawn" && (
                    <button
                      type="submit"
                      name="nextStatus"
                      value="approved"
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 transition hover:bg-green-500/20 lg:w-auto"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </button>
                  )}

                {!selectedRegistration.isDivisionLaunched &&
                  !selectedRegistrationIsTerminal &&
                  selectedRegistration.status !== "withdrawn" && (
                    <button
                      type="submit"
                      name="nextStatus"
                      value="rejected"
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 lg:w-auto"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  )}

                {!selectedRegistration.isDivisionLaunched &&
                  !selectedRegistrationIsTerminal &&
                  selectedRegistration.status !== "waitlisted" &&
                  selectedRegistration.status !== "withdrawn" && (
                    <button
                      type="submit"
                      name="nextStatus"
                      value="manual_review"
                      autoFocus={params?.focus === "manual_review"}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-300 transition hover:bg-orange-500/20 lg:w-auto"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      Mark Manual Review
                    </button>
                  )}

              </div>

              {selectedRegistration.status === "waitlisted" &&
                !selectedRegistration.isDivisionLaunched &&
                !selectedRegistrationIsTerminal && (
                  <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                    A waitlisted player cannot be promoted by an administrator.
                    The player must receive the oldest eligible FIFO offer,
                    accept it, and return to Pending review first.
                  </p>
                )}

              {selectedRegistration.isDivisionLaunched && (
                <p className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/10 p-4 text-sm leading-6 text-sky-100">
                  This division has launched. Registration status decisions are
                  locked; private administrator notes remain editable.
                </p>
              )}

              {selectedRegistrationIsTerminal && (
                <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-950/20 p-4 text-sm leading-6 text-amber-100">
                  This tournament is terminal. Competition decisions are locked;
                  factual registration history and private administrator notes
                  remain available in read-only form.
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
