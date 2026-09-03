import { auth } from "@clerk/nextjs/server";
import { ChevronLeft, Plus, Trophy } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { retryTournamentStorageCleanup } from "@/app/admin/tournaments/actions";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  formatTournamentDivisionState,
  formatTournamentEventDivisionState,
  getTournamentEventSection,
  TOURNAMENT_EVENT_SECTIONS,
  type TournamentDivisionStateResolution,
} from "@/lib/tournament-division-state";
import { loadTournamentDivisionStates } from "@/lib/tournament-division-state-data";
import {
  getTournamentBracketDisplayName,
  getTournamentRegistrationStatusLabel,
  type TournamentBracketName,
  type TournamentStatus,
} from "@/lib/tournaments";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type AdminTournamentsPageProps = {
  searchParams?: Promise<{
    selected?: string;
    edit?: string;
    error?: string;
    notice?: string;
  }>;
};

type AdminTournamentListRow = {
  id: string;
  title: string;
  status: TournamentStatus;
  registration_enabled: boolean;
  registration_open_at: string | null;
  registration_close_at: string | null;
  created_at: string;
  tournament_brackets?: Array<{
    id: string;
    name: TournamentBracketName;
    max_players: number;
    launched_at: string | null;
  }>;
};

export default async function AdminTournamentsPage({
  searchParams,
}: AdminTournamentsPageProps) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    redirect("/");
  }

  const params = await searchParams;

  if (params?.selected) {
    const section = params.edit === "1" ? "edit" : "overview";
    const next = new URLSearchParams({ section });
    if (params.notice) next.set("notice", params.notice);
    if (params.error) next.set("error", params.error);
    redirect(
      `/admin/tournaments/${encodeURIComponent(params.selected)}?${next.toString()}`
    );
  }

  const supabase = createSupabaseAdminClient();
  const [tournamentResult, pendingCleanupResult] = await Promise.all([
    supabase
      .from("tournaments")
      .select(
        "id, title, status, registration_enabled, registration_open_at, registration_close_at, created_at, tournament_brackets(id, name, max_players, launched_at)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("tournament_deletion_jobs")
      .select("id, tournament_title, proof_paths, banner_paths, created_at")
      .eq("status", "storage_failed")
      .order("created_at", { ascending: true }),
  ]);

  if (tournamentResult.error || pendingCleanupResult.error) {
    console.error("Admin Tournament list load failed.", {
      operation: "load-admin-tournament-list",
    });
    throw new Error("Tournament Administration could not be loaded.");
  }

  const loadedTournaments = [
    ...((tournamentResult.data ?? []) as AdminTournamentListRow[]),
  ];
  const divisionStatesByTournament = await loadTournamentDivisionStates(
    supabase,
    loadedTournaments
  );
  const tournaments = loadedTournaments.sort((left, right) =>
    compareTournamentRows(left, right, divisionStatesByTournament)
  );
  const pendingCleanupJobs = pendingCleanupResult.data ?? [];

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-28 pb-20 text-white sm:px-6 sm:pt-32">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 rounded-3xl border border-orange-500/30 bg-gradient-to-br from-zinc-950 to-orange-950/30 p-5 sm:p-8 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
              Tournament Administration
            </p>
            <h1 className="mt-4 break-words text-4xl font-black md:text-5xl">
              Tournaments
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-zinc-300">
              Select one Tournament to open its focused management workspace.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap">
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 font-bold text-zinc-200 transition hover:border-orange-400/60 hover:text-white"
            >
              <ChevronLeft size={18} />
              Admin Dashboard
            </Link>
            <Link
              href="/admin/tournaments/new"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-black text-white transition hover:bg-orange-400"
            >
              <Plus size={18} />
              Create Tournament
            </Link>
          </div>
        </div>

        <ListNotice notice={params?.notice} />

        {pendingCleanupJobs.length > 0 && (
          <div className="mt-6 rounded-2xl border border-red-500/35 bg-red-500/10 p-5">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-red-300">
              Storage Cleanup Required
            </p>
            <p className="mt-2 text-sm leading-6 text-red-100">
              Tournament database data was deleted, but some Storage cleanup
              could not be verified. Retry each retained cleanup manifest.
            </p>
            <div className="mt-4 space-y-3">
              {pendingCleanupJobs.map((job) => {
                const pendingFiles =
                  (job.proof_paths ?? []).length +
                  (job.banner_paths ?? []).length;
                return (
                  <form
                    key={job.id}
                    action={retryTournamentStorageCleanup}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <input type="hidden" name="jobId" value={job.id} />
                    <div className="min-w-0">
                      <p className="break-words font-black text-white">
                        {job.tournament_title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {pendingFiles} storage file{pendingFiles === 1 ? "" : "s"}{" "}
                        pending
                      </p>
                    </div>
                    <button className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-black text-white transition hover:bg-red-500 sm:w-auto">
                      Retry Storage Cleanup
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tournaments.map((tournament) => {
            const brackets = tournament.tournament_brackets ?? [];
            const divisionStates = divisionStatesByTournament.get(tournament.id);

            if (!divisionStates) {
              throw new Error("Tournament Administration could not be loaded.");
            }

            const capacity = brackets.reduce(
              (total, bracket) => total + bracket.max_players,
              0
            );
            const launched = divisionStates.filter(
              (division) => division.launchedAt !== null
            ).length;

            return (
              <Link
                key={tournament.id}
                href={`/admin/tournaments/${encodeURIComponent(tournament.id)}?section=overview`}
                className="group min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-0.5 hover:border-orange-400/55 hover:bg-orange-500/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-500/25 bg-orange-500/10 text-orange-300">
                    <Trophy aria-hidden="true" size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-lg font-black text-white group-hover:text-orange-100">
                      {tournament.title}
                    </p>
                    <p className="mt-2 text-xs font-black uppercase tracking-wider text-orange-300">
                      {getTournamentRegistrationStatusLabel({
                        statusValue: tournament.status,
                        registrationEnabled: tournament.registration_enabled,
                        registrationOpenAt: tournament.registration_open_at,
                        registrationCloseAt: tournament.registration_close_at,
                      })}
                    </p>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <ListFact label="Divisions" value={String(brackets.length)} />
                  <ListFact label="Capacity" value={String(capacity)} />
                  <ListFact label="Launched" value={String(launched)} />
                  <ListFact
                    label="Lifecycle"
                    value={formatLabel(
                      getTournamentEventSection(divisionStates)
                    )}
                  />
                </dl>
                {brackets.length > 0 && (
                  <p className="mt-4 break-words text-xs leading-5 text-zinc-500">
                    {brackets
                      .map((bracket) =>
                        getTournamentBracketDisplayName(bracket.name)
                      )
                      .join(" · ")}
                  </p>
                )}
                <div
                  aria-label={formatTournamentEventDivisionState(divisionStates)}
                  className="mt-4 flex flex-wrap gap-2"
                >
                  {divisionStates.map((division) => (
                    <span
                      key={division.canonicalName}
                      className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-300"
                    >
                      {division.displayName}: {formatTournamentDivisionState(division)}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}

          {tournaments.length === 0 && (
            <p className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm leading-6 text-zinc-500 sm:col-span-2 xl:col-span-3">
              No database Tournaments exist yet. Create the first Tournament to
              begin.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function ListNotice({ notice }: { notice?: string }) {
  if (!notice) return null;

  const success = notice === "deleted" || notice === "cleanup-completed";
  const message =
    notice === "deleted"
      ? "Tournament deleted."
      : notice === "cleanup-completed"
        ? "Tournament Storage cleanup completed."
        : notice === "cleanup-failed"
          ? "Tournament Storage cleanup could not be completed."
          : notice === "delete-storage-failed"
            ? "Tournament data was deleted, but Storage cleanup requires a retry."
            : notice.startsWith("delete-")
              ? "Tournament deletion was not completed."
              : null;

  if (!message) return null;

  return (
    <div
      role={success ? "status" : "alert"}
      className={`mt-6 rounded-2xl border p-4 text-sm font-bold ${
        success
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-500/30 bg-red-500/10 text-red-200"
      }`}
    >
      {message}
    </div>
  );
}

function ListFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-black/25 p-3">
      <dt className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 break-words font-black text-zinc-200">{value}</dd>
    </div>
  );
}

function compareTournamentRows(
  left: AdminTournamentListRow,
  right: AdminTournamentListRow,
  divisionStatesByTournament: ReadonlyMap<
    string,
    readonly TournamentDivisionStateResolution[]
  >
) {
  const leftStates = divisionStatesByTournament.get(left.id);
  const rightStates = divisionStatesByTournament.get(right.id);

  if (!leftStates || !rightStates) {
    throw new Error("Tournament lifecycle state was unavailable for sorting.");
  }

  const leftSection = getTournamentEventSection(leftStates);
  const rightSection = getTournamentEventSection(rightStates);
  const sectionDifference =
    TOURNAMENT_EVENT_SECTIONS.indexOf(leftSection) -
    TOURNAMENT_EVENT_SECTIONS.indexOf(rightSection);

  if (sectionDifference !== 0) return sectionDifference;

  const createdDifference =
    getTournamentSortTime(right.created_at) -
    getTournamentSortTime(left.created_at);
  return createdDifference || left.id.localeCompare(right.id);
}

function getTournamentSortTime(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
