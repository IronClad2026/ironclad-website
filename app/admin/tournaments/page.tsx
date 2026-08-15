import { auth } from "@clerk/nextjs/server";
import {
  ChevronLeft,
  Pencil,
  Plus,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import DeleteTournamentControl, {
  type TournamentDeletionPreview,
} from "@/components/DeleteTournamentControl";
import AdminTournamentMapPools from "@/components/AdminTournamentMapPools";
import TournamentBannerPicker from "@/components/TournamentBannerPicker";
import TournamentFormDraft from "@/components/TournamentFormDraft";
import TournamentFormShell, {
  TournamentSubmitButton,
} from "@/components/TournamentFormShell";
import TournamentRecoveryControl from "@/components/TournamentRecoveryControl";
import {
  generateTournamentBracket,
  retryTournamentStorageCleanup,
} from "@/app/admin/tournaments/actions";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  mapCoh3MapDatabaseRow,
  type Coh3MapDatabaseRow,
  type Coh3MapRow,
} from "@/lib/coh3-maps";
import { logSupabaseError } from "@/lib/supabase-errors";
import type {
  TournamentBracketFieldPrefix,
  TournamentBracketRow,
  TournamentRow,
} from "@/lib/tournaments";
import {
  TOURNAMENT_BRACKET_CONFIGS,
  getTournamentBracketSortOrder,
  isTournamentTerminalStatus,
} from "@/lib/tournaments";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type TournamentAdminPageProps = {
  searchParams?: Promise<{
    selected?: string;
    edit?: string;
    error?: string;
    notice?: AdminNotice;
  }>;
};

type AdminNotice =
  | "invalid"
  | "saved"
  | "save-failed"
  | "bracket-generated"
  | "generation-pending"
  | "generation-failed"
  | "generation-blocked"
  | "deleted"
  | "delete-invalid"
  | "delete-protected"
  | "delete-failed"
  | "delete-storage-failed"
  | "cleanup-completed"
  | "cleanup-failed"
  | "map-pool-published"
  | "map-pool-corrected"
  | "map-pool-invalid"
  | "map-pool-failed";

type AdminTournamentBracketRow = TournamentBracketRow & {
  map_pool_published_at: string | null;
};

type AdminTournamentRow = Omit<TournamentRow, "tournament_brackets"> & {
  terminal_at: string | null;
  terminal_reason: string | null;
  tournament_brackets?: AdminTournamentBracketRow[];
};

type UnderReviewSeasonRow = {
  name: string;
  under_review_at: string;
  under_review_reason: string;
  under_review_tournament_id: string;
};

function compareTournamentRows(left: TournamentRow, right: TournamentRow) {
  const leftHistorical = left.status === "completed" ? 1 : 0;
  const rightHistorical = right.status === "completed" ? 1 : 0;

  if (leftHistorical !== rightHistorical) {
    return leftHistorical - rightHistorical;
  }

  return getTournamentSortTime(right) - getTournamentSortTime(left);
}

function getTournamentSortTime(tournament: TournamentRow) {
  const dateValue = tournament.grand_final_at ?? tournament.created_at;
  const timestamp = new Date(dateValue).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

const emptyTournament: TournamentFormValues = {
  id: null,
  title: "",
  slug: "",
  description: "",
  bannerImageUrl: "",
  registrationOpenAt: "",
  registrationCloseAt: "",
  grandFinalAt: "",
  status: "upcoming",
  format: "1v1",
  ruleFormat: "format_a",
  resultConfirmationWindowMinutes: "30",
  prizePool: "",
  rulesUrl: "",
  battlefyUrl: "",
  academy: {
    id: null,
    launchedAt: null,
    enabled: false,
    eloRules: "Below 1100 ELO",
    maxPlayers: 8,
  },
  challenge: {
    id: null,
    launchedAt: null,
    enabled: false,
    eloRules: "1100-1399 ELO",
    maxPlayers: 8,
  },
  main: {
    id: null,
    launchedAt: null,
    enabled: false,
    eloRules: "1400+ ELO",
    maxPlayers: 8,
  },
};

type TournamentFormValues = {
  id: string | null;
  title: string;
  slug: string;
  description: string;
  bannerImageUrl: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  grandFinalAt: string;
  status: string;
  format: string;
  ruleFormat: string;
  resultConfirmationWindowMinutes: string;
  prizePool: string;
  rulesUrl: string;
  battlefyUrl: string;
  academy: BracketFormValues;
  main: BracketFormValues;
  challenge: BracketFormValues;
};

type BracketFormValues = {
  id: string | null;
  launchedAt: string | null;
  enabled: boolean;
  eloRules: string;
  maxPlayers: number;
};

export default async function AdminTournamentsPage({
  searchParams,
}: TournamentAdminPageProps) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    redirect("/");
  }

  const params = await searchParams;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, slug, title, description, banner_image_url, registration_open_at, registration_close_at, start_date, end_date, status, format, prize_pool, rules_url, battlefy_url, registration_enabled, grand_final_at, rule_format, result_confirmation_window_minutes, terminal_at, terminal_reason, created_at, updated_at, tournament_brackets(id, tournament_id, name, elo_rules, max_players, launched_at, map_pool_published_at, created_at, updated_at)"
    )
    .order("grand_final_at", { ascending: false, nullsFirst: false });

  if (error) {
    logSupabaseError("Admin tournament list load failed:", error);
  }

  const tournaments = [...((data ?? []) as AdminTournamentRow[])].sort(
    compareTournamentRows
  );
  const [
    generatedResult,
    approvedResult,
    deletionPreviews,
    pendingCleanupResult,
  ] = await Promise.all([
    supabase
      .from("generated_brackets")
      .select(
        "id, tournament_bracket_id, format, slot_count, generated_at"
      ),
    supabase
      .from("registrations")
      .select("tournament_bracket_id")
      .eq("registration_status", "approved")
      .not("tournament_bracket_id", "is", null),
    Promise.all(
      tournaments.map(async (tournament) => {
        const { data: preview, error: previewError } = await supabase.rpc(
          "get_tournament_deletion_preview",
          { p_tournament_id: tournament.id }
        );

        if (previewError) {
          logCleanupLoadFailure("deletion-preview", previewError);
        }

        return [
          tournament.id,
          (preview ?? emptyDeletionPreview) as TournamentDeletionPreview,
        ] as const;
      })
    ),
    supabase
      .from("tournament_deletion_jobs")
      .select(
        "id, tournament_title, proof_paths, banner_paths, created_at"
      )
      .eq("status", "storage_failed")
      .order("created_at", { ascending: true }),
  ]);
  const deletionPreviewByTournament = new Map(deletionPreviews);
  const pendingCleanupJobs = pendingCleanupResult.data ?? [];

  if (pendingCleanupResult.error) {
    logCleanupLoadFailure("pending-cleanup-jobs", pendingCleanupResult.error);
  }
  const generatedByBracket = new Map(
    (
      (generatedResult.data ?? []) as {
        id: string;
        tournament_bracket_id: string;
        format: string;
        slot_count: number;
        generated_at: string;
      }[]
    ).map((generated) => [generated.tournament_bracket_id, generated])
  );
  const approvedByBracket = new Map<string, number>();

  if (generatedResult.error) {
    logSupabaseError(
      "Generated bracket admin load failed:",
      generatedResult.error
    );
  }

  if (approvedResult.error) {
    logSupabaseError(
      "Approved participant count load failed:",
      approvedResult.error
    );
  }

  for (const registration of (approvedResult.data ?? []) as {
    tournament_bracket_id: string;
  }[]) {
    approvedByBracket.set(
      registration.tournament_bracket_id,
      (approvedByBracket.get(registration.tournament_bracket_id) ?? 0) + 1
    );
  }
  const readinessResults = await Promise.all(
    tournaments.flatMap((tournament) =>
      (tournament.tournament_brackets ?? []).map(async (bracket) => {
        const { data: readinessData, error: readinessError } =
          await supabase.rpc("get_tournament_bracket_readiness", {
            p_tournament_bracket_id: bracket.id,
          });

        if (readinessError) {
          logSupabaseError(
            "Tournament bracket readiness load failed:",
            readinessError
          );
          return null;
        }

        const readiness = Array.isArray(readinessData)
          ? readinessData[0]
          : readinessData;
        return readiness
          ? {
              bracketId: bracket.id,
              approvedCount: Number(readiness.approved_count),
              requiredCount: Number(readiness.required_count),
              isReady: readiness.is_ready === true,
              launchedAt:
                typeof readiness.launched_at === "string"
                  ? readiness.launched_at
                  : bracket.launched_at,
            }
          : null;
      })
    )
  );
  const readinessByBracket = new Map(
    readinessResults
      .filter((result) => result !== null)
      .map((result) => [result.bracketId, result])
  );
  const selected = tournaments.find(
    (tournament) => tournament.id === params?.selected
  );
  const selectedIsTerminal = selected
    ? isTournamentTerminalStatus(selected.status)
    : false;
  const selectedMapPoolsAreReadOnly = selected
    ? selectedIsTerminal || selected.status === "completed"
    : false;
  const selectedBrackets = [...(selected?.tournament_brackets ?? [])].sort(
    (left, right) =>
      getTournamentBracketSortOrder(left.name) -
        getTournamentBracketSortOrder(right.name) ||
      left.name.localeCompare(right.name)
  );
  let underReviewSeason: UnderReviewSeasonRow | null = null;
  let mapPoolCatalogue: Coh3MapRow[] = [];
  const currentMapIdsByBracket = new Map<string, string[]>();

  if (selected) {
    const selectedBracketIds = selectedBrackets.map(
      (bracket) => bracket.id
    );
    const [underReviewResult, catalogueResult, poolEntriesResult] =
      await Promise.all([
        supabase
          .from("leaderboard_seasons")
          .select(
            "name, under_review_at, under_review_reason, under_review_tournament_id"
          )
          .eq("under_review_tournament_id", selected.id)
          .not("under_review_at", "is", null)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("coh3_maps")
          .select(
            "id, slug, display_name, source_type, creator_name, game_mode, status, thumbnail_path, source_reference, admin_note, created_at, updated_at, created_by_clerk_user_id, updated_by_clerk_user_id"
          )
          .order("display_name", { ascending: true }),
        selectedBracketIds.length > 0
          ? supabase
              .from("tournament_bracket_map_pool_entries")
              .select("tournament_bracket_id, coh3_map_id")
              .in("tournament_bracket_id", selectedBracketIds)
              .is("removed_at", null)
          : Promise.resolve({
              data: [] as {
                tournament_bracket_id: string;
                coh3_map_id: string;
              }[],
              error: null,
            }),
      ]);

    if (underReviewResult.error) {
      logSupabaseError(
        "Tournament under-review metadata load failed:",
        underReviewResult.error
      );
    } else {
      underReviewSeason =
        (underReviewResult.data as UnderReviewSeasonRow | null) ?? null;
    }

    if (catalogueResult.error) {
      logSupabaseError(
        "Tournament map catalogue admin load failed:",
        catalogueResult.error
      );
    } else {
      mapPoolCatalogue = (
        (catalogueResult.data ?? []) as Coh3MapDatabaseRow[]
      ).map(mapCoh3MapDatabaseRow);
    }

    if (poolEntriesResult.error) {
      logSupabaseError(
        "Tournament map-pool entries admin load failed:",
        poolEntriesResult.error
      );
    } else {
      for (const entry of poolEntriesResult.data ?? []) {
        currentMapIdsByBracket.set(entry.tournament_bracket_id, [
          ...(currentMapIdsByBracket.get(entry.tournament_bracket_id) ?? []),
          entry.coh3_map_id,
        ]);
      }
    }
  }

  const formValues = selected ? toFormValues(selected) : emptyTournament;
  const isEditing =
    !formValues.id ||
    (!selectedIsTerminal &&
      (params?.edit === "1" ||
        params?.notice === "invalid" ||
        params?.notice === "save-failed"));

  return (
    <main className="min-h-screen min-w-0 bg-black px-4 pt-28 pb-20 text-white sm:px-6 sm:pt-32">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 rounded-3xl border border-orange-500/30 bg-gradient-to-br from-zinc-950 to-orange-950/30 p-5 sm:p-8 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
              Tournament Administration
            </p>
            <h1 className="mt-4 break-words text-4xl font-black md:text-5xl">
              Create And Manage Tournaments
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-zinc-300">
              Publish real IronClad events, configure brackets, and control
              registration availability without changing application code.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 font-bold text-zinc-200 transition hover:border-orange-400/60 hover:text-white"
          >
            <ChevronLeft size={18} />
            Admin Dashboard
          </Link>
        </div>

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
              {pendingCleanupJobs.map((job) => (
                <form
                  key={job.id}
                  action={retryTournamentStorageCleanup}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <input type="hidden" name="jobId" value={job.id} />
                  <div>
                    <p className="font-black text-white">
                      {job.tournament_title}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {(job.proof_paths ?? []).length +
                        (job.banner_paths ?? []).length} storage file
                      {(job.proof_paths ?? []).length +
                        (job.banner_paths ?? []).length ===
                      1
                        ? ""
                        : "s"}{" "}
                      pending
                    </p>
                  </div>
                  <button className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-black text-white transition hover:bg-red-500 sm:w-auto">
                    Retry Storage Cleanup
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-8 xl:grid-cols-[360px_1fr]">
          <aside className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
            <Link
              href="/admin/tournaments"
              className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-black text-white transition hover:bg-orange-400"
            >
              <Plus size={18} />
              New Tournament
            </Link>

            <div className="mt-6 space-y-3">
              {tournaments.map((tournament) => (
                <div key={tournament.id} className="relative">
                  <Link
                    href={`/admin/tournaments?selected=${tournament.id}`}
                    className={`block rounded-2xl border p-4 pr-14 transition ${
                      selected?.id === tournament.id
                        ? "border-orange-400 bg-orange-500/15"
                        : "border-white/10 bg-black/30 hover:border-orange-500/50"
                    }`}
                  >
                  <div className="flex items-start gap-3">
                    <Trophy className="mt-1 shrink-0 text-orange-400" size={18} />
                    <div className="min-w-0">
                      <p className="break-words font-black text-white">
                        {tournament.title}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-wider text-zinc-500">
                      {formatLabel(tournament.status)} -{" "}
                      {tournament.grand_final_at
                        ? formatDate(tournament.grand_final_at)
                        : "Grand Final TBA"}
                      </p>
                    </div>
                  </div>
                  </Link>
                  {!isTournamentTerminalStatus(tournament.status) && (
                    <DeleteTournamentControl
                      tournamentId={tournament.id}
                      tournamentTitle={tournament.title}
                      editHref={`/admin/tournaments?selected=${tournament.id}`}
                      preview={
                        deletionPreviewByTournament.get(tournament.id) ??
                        emptyDeletionPreview
                      }
                    />
                  )}
                </div>
              ))}

              {tournaments.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm leading-6 text-zinc-500">
                  No database tournaments exist yet. Apply the migration, then
                  submit the prefilled 2027 tournament form.
                </p>
              )}
            </div>
          </aside>

          <div className="min-w-0">
            <TournamentForm
              key={`${formValues.id ?? "new"}:${selected?.updated_at ?? "draft"}:${isEditing ? "edit" : "view"}`}
              values={formValues}
              notice={params?.notice}
              generatedByBracket={generatedByBracket}
              approvedByBracket={approvedByBracket}
              readinessByBracket={readinessByBracket}
              isEditing={isEditing}
              errorMessage={params?.error}
              terminal={
                selected && isTournamentTerminalStatus(selected.status)
                  ? {
                      status: selected.status,
                      at: selected.terminal_at,
                      reason: selected.terminal_reason,
                    }
                  : null
              }
              underReview={
                selected && underReviewSeason
                  ? {
                      seasonName: underReviewSeason.name,
                      at: underReviewSeason.under_review_at,
                      reason: underReviewSeason.under_review_reason,
                      triggeringTournamentTitle: selected.title,
                    }
                  : null
              }
            />
            {selected && selectedBrackets.length > 0 && (
              <AdminTournamentMapPools
                key={selected.id}
                tournamentId={selected.id}
                tournamentTitle={selected.title}
                terminal={selectedMapPoolsAreReadOnly}
                brackets={selectedBrackets.map(
                  (bracket) => ({
                    id: bracket.id,
                    name: bracket.name,
                    launchedAt: bracket.launched_at,
                    mapPoolPublishedAt: bracket.map_pool_published_at,
                    currentMapIds:
                      currentMapIdsByBracket.get(bracket.id) ?? [],
                  })
                )}
                catalogue={mapPoolCatalogue}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function logCleanupLoadFailure(operation: string, error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9]{3,10}$/.test(candidateCode)
    ? candidateCode
    : "CLEANUP_FAILED";

  console.error("Tournament storage cleanup load failed.", {
    operation,
    code,
  });
}

function TournamentForm({
  values,
  notice,
  generatedByBracket,
  approvedByBracket,
  readinessByBracket,
  isEditing,
  errorMessage,
  terminal,
  underReview,
}: {
  values: TournamentFormValues;
  notice?: AdminNotice;
  generatedByBracket: Map<
    string,
    {
      id: string;
      tournament_bracket_id: string;
      format: string;
      slot_count: number;
      generated_at: string;
    }
  >;
  approvedByBracket: Map<string, number>;
  readinessByBracket: Map<
    string,
    {
      bracketId: string;
      approvedCount: number;
      requiredCount: number;
      isReady: boolean;
      launchedAt: string | null;
    }
  >;
  isEditing: boolean;
  errorMessage?: string;
  terminal: {
    status: "cancelled" | "voided";
    at: string | null;
    reason: string | null;
  } | null;
  underReview: {
    seasonName: string;
    at: string | null;
    reason: string | null;
    triggeringTournamentTitle: string;
  } | null;
}) {
  const formId = "tournament-editor-form";

  return (
    <>
      <TournamentFormShell
        id={formId}
        className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6 md:p-8"
      >
      {values.id && (
        <input type="hidden" name="tournamentId" value={values.id} />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
            {values.id
              ? isEditing
                ? "Edit Tournament"
                : "Tournament Details"
              : "Create Tournament"}
          </p>
          <h2 className="mt-3 break-words text-3xl font-black text-white">
            {values.id ? values.title : "New Tournament"}
          </h2>
        </div>
        {values.id && isEditing && <Pencil className="text-orange-400" />}
      </div>

      {notice && (
        <div
          className={`mt-6 rounded-xl border p-4 text-sm ${
            notice === "saved" ||
            notice === "bracket-generated" ||
            notice === "generation-pending" ||
            notice === "deleted" ||
            notice === "cleanup-completed" ||
            notice === "map-pool-published" ||
            notice === "map-pool-corrected"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {notice === "saved"
            ? "Tournament saved. Existing bracket assignments were left unchanged."
            : notice === "map-pool-published"
              ? "Division map pool published. Unlaunched pools may be republished until launch."
            : notice === "map-pool-corrected"
              ? "The launched Division map pool was corrected and the change was audited."
            : notice === "deleted"
              ? "Tournament data and referenced proof files were permanently deleted."
            : notice === "cleanup-completed"
              ? "The retained tournament proof cleanup completed successfully."
            : notice === "bracket-generated"
              ? "Private bracket structure generated from the exact approved roster. Regeneration resets the unlaunched draft and requires reseeding."
              : notice === "generation-pending"
                ? "The private bracket structure was not generated. Confirm the division is unlaunched and exactly ready."
            : notice === "invalid"
              ? errorMessage ??
                "Review the fields, dates, URLs, and enabled bracket settings."
              : notice === "generation-failed"
                ? "Bracket generation failed. Confirm the competition migration is applied."
                : notice === "generation-blocked"
                  ? "Bracket generation was blocked because the division is launched or protected competition activity exists. Existing matches, submissions, standings, and results were preserved."
                : notice === "delete-invalid"
                  ? "Tournament deletion was not confirmed. Type DELETE exactly."
                  : notice === "delete-protected"
                    ? "This tournament has launched or contains competitive history and can no longer be permanently deleted. Use the tournament recovery workflow instead."
                  : notice === "delete-storage-failed"
                    ? "Tournament data was deleted, but Storage cleanup requires attention. The cleanup manifest was retained for retry."
                    : notice === "delete-failed"
                      ? "Tournament deletion failed. No database changes were committed."
                    : notice === "cleanup-failed"
                      ? "Storage cleanup still could not be verified. The cleanup manifest remains available for retry."
                    : notice === "map-pool-invalid"
                      ? "Select at least five distinct maps and provide all required map-pool details."
                    : notice === "map-pool-failed"
                      ? "The map-pool change was rejected. Check map eligibility, Division state, and tournament status."
                : errorMessage ??
                  "Tournament could not be saved. Confirm the migration is applied and try again."}
        </div>
      )}

      <TournamentFormDraft
        formId={formId}
        enabled={!values.id}
        clear={notice === "saved"}
      />

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <Field
          label="Title"
          name="title"
          defaultValue={values.title}
          required
          readOnly={!isEditing}
        />
        <TournamentBannerPicker
          defaultValue={values.bannerImageUrl}
          readOnly={!isEditing}
        />
        <label className="md:col-span-2">
          <span className="text-sm font-bold">Description</span>
          <textarea
            name="description"
            defaultValue={values.description}
            required
            maxLength={5000}
            rows={5}
            readOnly={!isEditing}
            className={fieldClassName(!isEditing)}
          />
        </label>
        <SelectField
          label="Status"
          name="status"
          defaultValue={values.status}
          disabled={!isEditing}
          options={getEditableTournamentStatusOptions(values.status)}
        />
        <SelectField
          label="Format"
          name="format"
          defaultValue={values.format}
          disabled={!isEditing}
          options={[["1v1", "1v1"]]}
        />
        <SelectField
          label="Rule Format"
          name="ruleFormat"
          defaultValue={values.ruleFormat}
          disabled={!isEditing}
          options={[
            ["format_a", "Format A"],
            ["format_b", "Format B"],
          ]}
        />
        <SelectField
          label="Result Confirmation Window"
          name="resultConfirmationWindowMinutes"
          defaultValue={values.resultConfirmationWindowMinutes}
          disabled={!isEditing}
          options={[
            ["1", "1 minute"],
            ["5", "5 minutes"],
            ["15", "15 minutes"],
            ["30", "30 minutes"],
            ["60", "1 hour"],
            ["120", "2 hours"],
            ["360", "6 hours"],
            ["720", "12 hours"],
            ["1440", "24 hours"],
          ]}
        />
        <DateField
          label="Registration Opens"
          name="registrationOpenAt"
          defaultValue={values.registrationOpenAt}
          readOnly={!isEditing}
        />
        <DateField
          label="Registration Closes"
          name="registrationCloseAt"
          defaultValue={values.registrationCloseAt}
          readOnly={!isEditing}
        />
        <DateField
          label="Grand Final Date/Time"
          name="grandFinalAt"
          defaultValue={values.grandFinalAt}
          readOnly={!isEditing}
        />
        <TextAreaField
          label="Prize Pool (optional)"
          name="prizePool"
          defaultValue={values.prizePool}
          readOnly={!isEditing}
          rows={4}
          maxLength={2000}
        />
        <Field
          label="Rules URL (optional)"
          name="rulesUrl"
          defaultValue={values.rulesUrl}
          readOnly={!isEditing}
        />
        <Field
          label="Battlefy URL (optional)"
          name="battlefyUrl"
          defaultValue={values.battlefyUrl}
          readOnly={!isEditing}
          className="md:col-span-2"
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {TOURNAMENT_BRACKET_CONFIGS.map((config) => (
          <BracketFields
            key={config.name}
            prefix={config.fieldPrefix}
            label={config.label}
            values={values[config.fieldPrefix]}
            readOnly={!isEditing}
          />
        ))}
      </div>

      {values.id && isEditing && (
        <div className="mt-8 rounded-2xl border border-sky-500/20 bg-sky-950/20 p-5">
          <h3 className="text-lg font-black text-white">Bracket Generation</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Each eight-player division requires exactly 8/8 approved players.
            Generation creates a private structure only; seeding and an explicit
            Launch Division action remain separate.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {TOURNAMENT_BRACKET_CONFIGS.map((config) => {
              const bracket = values[config.fieldPrefix];
              if (!bracket.id) {
                return null;
              }

              const generated = generatedByBracket.get(bracket.id);
              const approved = approvedByBracket.get(bracket.id) ?? 0;
              const readiness = readinessByBracket.get(bracket.id);
              const approvedCount = readiness?.approvedCount ?? approved;
              const requiredCount = readiness?.requiredCount ?? 8;
              const launchedAt = readiness?.launchedAt ?? bracket.launchedAt;
              const isReady = readiness?.isReady ?? false;

              return (
                <div
                  key={bracket.id}
                  className="rounded-xl border border-white/10 bg-black/30 p-4"
                >
                  <p className="font-black text-white">{config.label}</p>
                  <p className="mt-2 text-sm text-zinc-400">
                    {approvedCount}/{requiredCount} approved
                    {generated
                      ? ` — ${formatLabel(generated.format)} private structure ready`
                      : " — not generated"}
                  </p>
                  <p
                    className={`mt-2 text-xs font-black uppercase tracking-wider ${
                      launchedAt
                        ? "text-sky-300"
                        : isReady
                          ? "text-emerald-300"
                          : "text-amber-300"
                    }`}
                  >
                    {launchedAt
                      ? `Launched ${new Date(launchedAt).toLocaleString()}`
                      : isReady
                        ? `${approvedCount}/${requiredCount} approved — ready for private bracket preparation`
                        : `${approvedCount}/${requiredCount} approved — review incomplete`}
                  </p>
                  <button
                    type="submit"
                    form={`generate-bracket-${bracket.id}`}
                    disabled={Boolean(launchedAt) || !isReady}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-sky-400/40 bg-sky-500/10 px-4 py-2 text-center text-sm font-black text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    {launchedAt
                      ? "Division Launched"
                      : !isReady
                        ? `Requires ${requiredCount}/${requiredCount} Approved`
                      : generated
                        ? "Regenerate Private Structure"
                        : "Generate Private Structure"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isEditing && (
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {values.id && (
            <Link
              href={`/admin/tournaments?selected=${values.id}`}
              className="rounded-xl border border-white/15 px-6 py-3 text-center font-black text-zinc-300 transition hover:border-white/30 hover:text-white"
            >
              Cancel
            </Link>
          )}
          <TournamentSubmitButton
            label={
              values.id ? "Save Tournament Changes" : "Create Tournament"
            }
          />
        </div>
      )}
      </TournamentFormShell>

      {values.id && (
        <TournamentRecoveryControl
          tournamentId={values.id}
          tournamentTitle={values.title}
          terminal={terminal}
          underReview={underReview}
        />
      )}

      {values.id &&
        isEditing &&
        TOURNAMENT_BRACKET_CONFIGS.map((config) => {
          const bracket = values[config.fieldPrefix];

          return bracket.id ? (
            <form
              key={bracket.id}
              id={`generate-bracket-${bracket.id}`}
              action={generateTournamentBracket}
              className="hidden"
            >
              <input
                type="hidden"
                name="tournamentId"
                value={values.id ?? ""}
              />
              <input type="hidden" name="bracketId" value={bracket.id} />
            </form>
          ) : null;
        })}
    </>
  );
}

function BracketFields({
  prefix,
  label,
  values,
  readOnly,
}: {
  prefix: TournamentBracketFieldPrefix;
  label: string;
  values: BracketFormValues;
  readOnly: boolean;
}) {
  return (
    <fieldset className="rounded-2xl border border-orange-500/20 bg-black/30 p-5">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-black text-white">
        <input
          type="checkbox"
          name={`${prefix}Enabled`}
          defaultChecked={values.enabled}
          disabled={readOnly}
          className="h-5 w-5 shrink-0 accent-orange-500"
        />
        {label}
      </label>
      <div className="mt-5 space-y-5">
        <Field
          label="ELO Rules"
          name={`${prefix}EloRules`}
          defaultValue={values.eloRules}
          readOnly={readOnly}
        />
        <label>
          <span className="text-sm font-bold">Launch Capacity</span>
          <input
            name={`${prefix}MaxPlayers`}
            value="8"
            readOnly
            aria-describedby={`${prefix}-capacity-help`}
            className={fieldClassName(true)}
          />
          <span
            id={`${prefix}-capacity-help`}
            className="mt-2 block text-xs leading-5 text-zinc-500"
          >
            Fixed at exactly eight players for the current 1v1 launch format.
          </span>
        </label>
      </div>
    </fieldset>
  );
}

const inputClassName =
  "mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-orange-400";

function fieldClassName(readOnly: boolean) {
  return `${inputClassName} ${
    readOnly ? "cursor-default border-white/5 bg-black/20 text-zinc-300" : ""
  }`;
}

function Field({
  label,
  className,
  ...props
}: {
  label: string;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={className}>
      <span className="text-sm font-bold">{label}</span>
      <input
        {...props}
        className={fieldClassName(Boolean(props.readOnly || props.disabled))}
      />
    </label>
  );
}

function TextAreaField({
  label,
  className,
  ...props
}: {
  label: string;
  className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={className}>
      <span className="text-sm font-bold">{label}</span>
      <textarea
        {...props}
        className={fieldClassName(Boolean(props.readOnly || props.disabled))}
      />
    </label>
  );
}

function DateField({
  label,
  ...props
}: {
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return <Field label={`${label} (UTC)`} type="datetime-local" {...props} />;
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: [string, string][];
  disabled?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-bold">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className={fieldClassName(Boolean(disabled))}
      >
        {options.map(([value, optionLabel]) => (
          <option key={value} value={value}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function toFormValues(tournament: TournamentRow): TournamentFormValues {
  const brackets = tournament.tournament_brackets ?? [];

  return {
    id: tournament.id,
    title: tournament.title,
    slug: tournament.slug,
    description: tournament.description,
    bannerImageUrl: tournament.banner_image_url,
    registrationOpenAt: tournament.registration_open_at
      ? toDateTimeLocal(tournament.registration_open_at)
      : "",
    registrationCloseAt: tournament.registration_close_at
      ? toDateTimeLocal(tournament.registration_close_at)
      : "",
    grandFinalAt: tournament.grand_final_at
      ? toDateTimeLocal(tournament.grand_final_at)
      : "",
    status: tournament.status,
    format: tournament.format,
    ruleFormat: tournament.rule_format ?? "format_a",
    resultConfirmationWindowMinutes: String(
      tournament.result_confirmation_window_minutes ?? 30
    ),
    prizePool: tournament.prize_pool,
    rulesUrl: tournament.rules_url ?? "",
    battlefyUrl: tournament.battlefy_url ?? "",
    academy: toBracketValues(brackets, "Academy"),
    challenge: toBracketValues(brackets, "Challenge"),
    main: toBracketValues(brackets, "Main"),
  };
}

function toBracketValues(
  brackets: TournamentBracketRow[],
  name: TournamentBracketRow["name"]
): BracketFormValues {
  const bracket = brackets.find((item) => item.name === name);
  const config = TOURNAMENT_BRACKET_CONFIGS.find(
    (item) => item.name === name
  );

  return {
    id: bracket?.id ?? null,
    launchedAt: bracket?.launched_at ?? null,
    enabled: Boolean(bracket),
    eloRules: bracket?.elo_rules ?? config?.defaultEloRules ?? "",
    maxPlayers: bracket?.max_players ?? config?.defaultMaxPlayers ?? 8,
  };
}

function toDateTimeLocal(value: string) {
  return new Date(value).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value)
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getEditableTournamentStatusOptions(
  currentStatus: string
): Array<[string, string]> {
  if (currentStatus === "in_progress") {
    return [["in_progress", "In Progress — managed by division launch"]];
  }

  if (currentStatus === "completed") {
    return [["completed", "Completed — managed by match lifecycle"]];
  }

  return [
    ["upcoming", "Closed"],
    ["registration_open", "Open"],
  ];
}

const emptyDeletionPreview: TournamentDeletionPreview = {
  registrations: 0,
  brackets: 0,
  generated_brackets: 0,
  rounds: 0,
  matches: 0,
  standings: 0,
  result_submissions: 0,
  storage_files: 0,
};
