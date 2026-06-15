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
import TournamentBannerPicker from "@/components/TournamentBannerPicker";
import TournamentFormDraft from "@/components/TournamentFormDraft";
import TournamentFormShell, {
  TournamentSubmitButton,
} from "@/components/TournamentFormShell";
import {
  generateTournamentBracket,
  retryTournamentStorageCleanup,
} from "@/app/admin/tournaments/actions";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-errors";
import type {
  TournamentBracketRow,
  TournamentRow,
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
  | "bracket-repaired"
  | "generation-pending"
  | "generation-failed"
  | "generation-blocked"
  | "deleted"
  | "delete-invalid"
  | "delete-failed"
  | "delete-storage-failed"
  | "cleanup-completed"
  | "cleanup-failed";

const emptyTournament: TournamentFormValues = {
  id: null,
  title: "",
  slug: "",
  description: "",
  bannerImageUrl: "",
  registrationOpenAt: "",
  registrationCloseAt: "",
  startsAt: "",
  endsAt: "",
  status: "upcoming",
  format: "1v1",
  prizePool: "",
  rulesUrl: "",
  battlefyUrl: "",
  main: {
    id: null,
    enabled: false,
    eloRules: "",
    maxPlayers: 0,
  },
  challenge: {
    id: null,
    enabled: false,
    eloRules: "",
    maxPlayers: 0,
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
  startsAt: string;
  endsAt: string;
  status: string;
  format: string;
  prizePool: string;
  rulesUrl: string;
  battlefyUrl: string;
  main: BracketFormValues;
  challenge: BracketFormValues;
};

type BracketFormValues = {
  id: string | null;
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
      "id, slug, title, description, banner_image_url, registration_open_at, registration_close_at, start_date, end_date, status, format, prize_pool, rules_url, battlefy_url, registration_enabled, created_at, updated_at, tournament_brackets(id, tournament_id, name, elo_rules, max_players, created_at, updated_at)"
    )
    .order("start_date", { ascending: false, nullsFirst: false });

  if (error) {
    logSupabaseError("Admin tournament list load failed:", error);
  }

  const tournaments = (data ?? []) as TournamentRow[];
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
      ((data ?? []) as TournamentRow[]).map(async (tournament) => {
        const { data: preview, error: previewError } = await supabase.rpc(
          "get_tournament_deletion_preview",
          { p_tournament_id: tournament.id }
        );

        if (previewError) {
          logSupabaseError(
            "Tournament deletion preview load failed:",
            previewError
          );
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
        "id, tournament_title, proof_paths, banner_paths, error_message, created_at"
      )
      .eq("status", "storage_failed")
      .order("created_at", { ascending: true }),
  ]);
  const deletionPreviewByTournament = new Map(deletionPreviews);
  const pendingCleanupJobs = pendingCleanupResult.data ?? [];

  if (pendingCleanupResult.error) {
    logSupabaseError(
      "Tournament cleanup jobs load failed:",
      pendingCleanupResult.error
    );
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
  const selected = tournaments.find(
    (tournament) => tournament.id === params?.selected
  );
  const formValues = selected ? toFormValues(selected) : emptyTournament;
  const isEditing =
    !formValues.id ||
    params?.edit === "1" ||
    params?.notice === "invalid" ||
    params?.notice === "save-failed";

  return (
    <main className="min-h-screen bg-black px-6 pt-32 pb-20 text-white">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 rounded-3xl border border-orange-500/30 bg-gradient-to-br from-zinc-950 to-orange-950/30 p-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
              Tournament Administration
            </p>
            <h1 className="mt-4 text-4xl font-black md:text-5xl">
              Create And Manage Tournaments
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-zinc-300">
              Publish real IronClad events, configure brackets, and control
              registration availability without changing application code.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 font-bold text-zinc-200 transition hover:border-orange-400/60 hover:text-white"
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
                  <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-black text-white transition hover:bg-red-500">
                    Retry Storage Cleanup
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-8 xl:grid-cols-[360px_1fr]">
          <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
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
                        {tournament.start_date
                          ? formatDate(tournament.start_date)
                          : "Date TBA"}
                      </p>
                    </div>
                  </div>
                  </Link>
                  <DeleteTournamentControl
                    tournamentId={tournament.id}
                    tournamentTitle={tournament.title}
                    editHref={`/admin/tournaments?selected=${tournament.id}`}
                    preview={
                      deletionPreviewByTournament.get(tournament.id) ??
                      emptyDeletionPreview
                    }
                  />
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

          <TournamentForm
            key={`${formValues.id ?? "new"}:${selected?.updated_at ?? "draft"}:${isEditing ? "edit" : "view"}`}
            values={formValues}
            notice={params?.notice}
            generatedByBracket={generatedByBracket}
            approvedByBracket={approvedByBracket}
            isEditing={isEditing}
            errorMessage={params?.error}
          />
        </div>
      </section>
    </main>
  );
}

function TournamentForm({
  values,
  notice,
  generatedByBracket,
  approvedByBracket,
  isEditing,
  errorMessage,
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
  isEditing: boolean;
  errorMessage?: string;
}) {
  const formId = "tournament-editor-form";

  return (
    <>
      <TournamentFormShell
        id={formId}
        className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8"
      >
      {values.id && (
        <input type="hidden" name="tournamentId" value={values.id} />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
            {values.id
              ? isEditing
                ? "Edit Tournament"
                : "Tournament Details"
              : "Create Tournament"}
          </p>
          <h2 className="mt-3 text-3xl font-black text-white">
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
            notice === "bracket-repaired" ||
            notice === "generation-pending" ||
            notice === "deleted" ||
            notice === "cleanup-completed"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {notice === "saved"
            ? "Tournament saved. Existing bracket assignments were left unchanged."
            : notice === "deleted"
              ? "Tournament data and referenced proof files were permanently deleted."
            : notice === "cleanup-completed"
              ? "The retained tournament proof cleanup completed successfully."
            : notice === "bracket-generated"
              ? "Empty tournament bracket structure regenerated from the approved-player count."
              : notice === "bracket-repaired"
                ? "Missing bracket rounds or match records were recreated without deleting the generated bracket or existing assignments."
              : notice === "generation-pending"
                ? "At least two approved participants are required before a bracket structure can be generated."
            : notice === "invalid"
              ? errorMessage ??
                "Review the fields, dates, URLs, and enabled bracket settings."
              : notice === "generation-failed"
                ? "Bracket generation failed. Confirm the competition migration is applied."
                : notice === "generation-blocked"
                  ? "Bracket regeneration was blocked because assignments or competition data already exist. Existing matches, submissions, standings, and results were preserved. Use an explicit administrator reset before rebuilding it."
                : notice === "delete-invalid"
                  ? "Tournament deletion was not confirmed. Type DELETE exactly."
                  : notice === "delete-storage-failed"
                    ? "Tournament data was deleted, but Storage cleanup requires attention. The cleanup manifest was retained for retry."
                    : notice === "delete-failed"
                      ? "Tournament deletion failed. No database changes were committed."
                    : notice === "cleanup-failed"
                      ? "Storage cleanup still could not be verified. The cleanup manifest remains available for retry."
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
        <Field
          label="Slug"
          name="slug"
          defaultValue={values.slug}
          required
          readOnly={!isEditing}
        />
        <TournamentBannerPicker
          defaultValue={values.bannerImageUrl}
          tournamentId={values.id}
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
          options={[
            ["upcoming", "Closed"],
            ["registration_open", "Open"],
            ["in_progress", "In Progress"],
            ["completed", "Completed"],
          ]}
        />
        <SelectField
          label="Format"
          name="format"
          defaultValue={values.format}
          disabled={!isEditing}
          options={[["1v1", "1v1"]]}
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
          label="Tournament Starts"
          name="startsAt"
          defaultValue={values.startsAt}
          readOnly={!isEditing}
        />
        <DateField
          label="Tournament Ends"
          name="endsAt"
          defaultValue={values.endsAt}
          readOnly={!isEditing}
        />
        <Field
          label="Prize Pool"
          name="prizePool"
          defaultValue={values.prizePool}
          required
          readOnly={!isEditing}
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

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <BracketFields
          prefix="main"
          label="Main"
          values={values.main}
          readOnly={!isEditing}
        />
        <BracketFields
          prefix="challenge"
          label="Challenge"
          values={values.challenge}
          readOnly={!isEditing}
        />
      </div>

      {values.id && isEditing && (
        <div className="mt-8 rounded-2xl border border-sky-500/20 bg-sky-950/20 p-5">
          <h3 className="text-lg font-black text-white">Bracket Generation</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Empty structures use the current approved-player count. Any
            power-of-two count uses single elimination; every other count uses
            round robin. Participants are never seeded or assigned
            automatically.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[values.main, values.challenge].map((bracket, index) => {
              if (!bracket.id) {
                return null;
              }

              const generated = generatedByBracket.get(bracket.id);
              const approved = approvedByBracket.get(bracket.id) ?? 0;
              const label = index === 0 ? "Main" : "Challenge";

              return (
                <div
                  key={bracket.id}
                  className="rounded-xl border border-white/10 bg-black/30 p-4"
                >
                  <p className="font-black text-white">{label} Bracket</p>
                  <p className="mt-2 text-sm text-zinc-400">
                        Capacity {bracket.maxPlayers} - {approved} approved participant
                    {approved === 1 ? "" : "s"}
                    {generated
                          ? ` - ${formatLabel(generated.format)} structure ready`
                          : " - not generated"}
                  </p>
                  <button
                    type="submit"
                    form={`generate-bracket-${bracket.id}`}
                    className="mt-4 rounded-lg border border-sky-400/40 bg-sky-500/10 px-4 py-2 text-sm font-black text-sky-200 transition hover:bg-sky-500/20"
                  >
                    {generated
                      ? "Repair Missing Match Records"
                      : "Generate Empty Structure"}
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

      {values.id &&
        isEditing &&
        [values.main, values.challenge].map((bracket) =>
          bracket.id ? (
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
          ) : null
        )}
    </>
  );
}

function BracketFields({
  prefix,
  label,
  values,
  readOnly,
}: {
  prefix: "main" | "challenge";
  label: string;
  values: BracketFormValues;
  readOnly: boolean;
}) {
  return (
    <fieldset className="rounded-2xl border border-orange-500/20 bg-black/30 p-5">
      <label className="flex items-center gap-3 font-black text-white">
        <input
          type="checkbox"
          name={`${prefix}Enabled`}
          defaultChecked={values.enabled}
          disabled={readOnly}
          className="h-4 w-4 accent-orange-500"
        />
        {label} Bracket
      </label>
      <div className="mt-5 space-y-5">
        <Field
          label="ELO Rules"
          name={`${prefix}EloRules`}
          defaultValue={values.eloRules}
          readOnly={readOnly}
        />
        <Field
          label="Maximum Players"
          name={`${prefix}MaxPlayers`}
          type="number"
          min={2}
          max={1024}
          defaultValue={String(values.maxPlayers)}
          readOnly={readOnly}
        />
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
    startsAt: tournament.start_date
      ? toDateTimeLocal(tournament.start_date)
      : "",
    endsAt: tournament.end_date
      ? toDateTimeLocal(tournament.end_date)
      : "",
    status: tournament.status,
    format: tournament.format,
    prizePool: tournament.prize_pool,
    rulesUrl: tournament.rules_url ?? "",
    battlefyUrl: tournament.battlefy_url ?? "",
    main: toBracketValues(brackets, "Main"),
    challenge: toBracketValues(brackets, "Challenge"),
  };
}

function toBracketValues(
  brackets: TournamentBracketRow[],
  name: "Main" | "Challenge"
): BracketFormValues {
  const bracket = brackets.find((item) => item.name === name);

  return {
    id: bracket?.id ?? null,
    enabled: Boolean(bracket),
    eloRules: bracket?.elo_rules ?? "",
    maxPlayers: bracket?.max_players ?? 8,
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
