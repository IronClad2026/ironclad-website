import { Pencil } from "lucide-react";
import Link from "next/link";
import { generateTournamentBracket } from "@/app/admin/tournaments/actions";
import TournamentBannerPicker from "@/components/TournamentBannerPicker";
import TournamentFormDraft from "@/components/TournamentFormDraft";
import TournamentFormShell, {
  TournamentSubmitButton,
} from "@/components/TournamentFormShell";
import TournamentRecoveryControl from "@/components/TournamentRecoveryControl";
import type {
  TournamentBracketFieldPrefix,
  TournamentBracketRow,
  TournamentRow,
} from "@/lib/tournaments";
import { TOURNAMENT_BRACKET_CONFIGS } from "@/lib/tournaments";

export type TournamentEditorNotice =
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

export type TournamentFormValues = {
  id: string | null;
  title: string;
  slug: string;
  description: string;
  bannerImageUrl: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
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

export type BracketFormValues = {
  id: string | null;
  launchedAt: string | null;
  enabled: boolean;
  eloRules: string;
  maxPlayers: number;
};

export type TournamentGeneratedBracketSummary = {
  id: string;
  tournament_bracket_id: string;
  format: string;
  slot_count: number;
  generated_at: string;
};

export type TournamentBracketReadinessSummary = {
  bracketId: string;
  approvedCount: number;
  requiredCount: number;
  isReady: boolean;
  launchedAt: string | null;
};

export type TournamentTerminalPresentation = {
  status: "cancelled" | "voided";
  at: string | null;
  reason: string | null;
};

export type TournamentUnderReviewPresentation = {
  seasonName: string;
  at: string | null;
  reason: string | null;
  triggeringTournamentTitle: string;
};

export type TournamentEditorProps = {
  values: TournamentFormValues;
  notice?: TournamentEditorNotice;
  generatedByBracket: Map<string, TournamentGeneratedBracketSummary>;
  approvedByBracket: Map<string, number>;
  readinessByBracket: Map<string, TournamentBracketReadinessSummary>;
  isEditing: boolean;
  errorMessage?: string;
  terminal: TournamentTerminalPresentation | null;
  underReview: TournamentUnderReviewPresentation | null;
  showBracketGeneration?: boolean;
  showRecoveryControls?: boolean;
};

export const EMPTY_TOURNAMENT_VALUES: TournamentFormValues = {
  id: null,
  title: "",
  slug: "",
  description: "",
  bannerImageUrl: "",
  registrationOpenAt: "",
  registrationCloseAt: "",
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

export function TournamentEditor({
  values,
  notice,
  generatedByBracket,
  approvedByBracket,
  readinessByBracket,
  isEditing,
  errorMessage,
  terminal,
  underReview,
  showBracketGeneration = true,
  showRecoveryControls = true,
}: TournamentEditorProps) {
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
          <div
            data-event-scheduling-policy
            className="md:col-span-2 rounded-2xl border border-orange-400/25 bg-orange-500/10 p-4 text-sm leading-6 text-orange-100"
          >
            <p className="font-black text-white">Rolling Division schedule</p>
            <p className="mt-1">
              Each Division launches independently when eight approved Players
              are ready. Each Matchup, including the Grand Final, normally
              receives seven days after activation.
            </p>
          </div>
          <details
            data-registration-window-controls
            className="md:col-span-2 rounded-2xl border border-white/10 bg-black/25 p-4"
            open={Boolean(
              values.registrationOpenAt || values.registrationCloseAt
            )}
          >
            <summary className="cursor-pointer text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
              Advanced Event-Wide Registration Window
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              These optional times affect every unlaunched Division in this
              Event. Leave both blank to keep eligible Divisions open until
              they launch or an administrator deliberately closes Event
              registration. These controls do not schedule Match deadlines or
              the Grand Final.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <DateField
                label="Registration Opens (optional)"
                name="registrationOpenAt"
                defaultValue={values.registrationOpenAt}
                readOnly={!isEditing}
              />
              <DateField
                label="Registration Closes (optional)"
                name="registrationCloseAt"
                defaultValue={values.registrationCloseAt}
                readOnly={!isEditing}
              />
            </div>
          </details>
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

        {showBracketGeneration && values.id && isEditing && (
          <div className="mt-8 rounded-2xl border border-sky-500/20 bg-sky-950/20 p-5">
            <h3 className="text-lg font-black text-white">
              Bracket Generation
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Each eight-player division requires exactly 8/8 approved players.
              Generation creates a private structure only; seeding and an
              explicit Launch Division action remain separate.
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
                href={`/admin/tournaments/${encodeURIComponent(values.id)}?section=overview`}
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

      {showRecoveryControls && values.id && (
        <TournamentRecoveryControl
          tournamentId={values.id}
          tournamentTitle={values.title}
          terminal={terminal}
          underReview={underReview}
        />
      )}

      {values.id &&
        showBracketGeneration &&
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
              <input type="hidden" name="workspaceSection" value="bracket" />
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

export function toTournamentFormValues(
  tournament: TournamentRow
): TournamentFormValues {
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

  if (currentStatus === "cancelled") {
    return [["cancelled", "Cancelled — terminal history"]];
  }

  if (currentStatus === "voided") {
    return [["voided", "Voided — terminal history"]];
  }

  return [
    ["upcoming", "Closed"],
    ["registration_open", "Open"],
  ];
}

export default TournamentEditor;
