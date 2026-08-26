import {
  AlertTriangle,
  CheckCircle,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import type { AdminRegistrationReviewRow } from "@/lib/admin-registration-review";
import type {
  AdminTournamentRegistrationFilter,
  AdminTournamentRegistrationSection,
} from "@/lib/admin-tournament-registration-workspace";

export default function AdminRegistrationDetailDialog({
  activeFilter,
  focus,
  notice,
  registration,
  section,
  terminal,
  tournamentId,
  updateRegistrationStatusAction,
}: {
  activeFilter: AdminTournamentRegistrationFilter;
  focus?: "note" | "reject" | "manual_review";
  notice?: string;
  registration: AdminRegistrationReviewRow;
  section: AdminTournamentRegistrationSection;
  terminal: boolean;
  tournamentId: string;
  updateRegistrationStatusAction: (formData: FormData) => void | Promise<void>;
}) {
  const closeHref = buildWorkspaceHref({
    activeFilter,
    section,
    tournamentId,
  });
  const titleId = `registration-${registration.registrationId}-title`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-3xl border border-orange-500/30 bg-zinc-950 p-4 shadow-2xl shadow-orange-950/40 sm:max-h-[calc(100dvh-3rem)] sm:p-6"
      >
        <div className="sticky top-0 z-10 -mx-1 mb-5 flex items-start justify-between gap-4 border-b border-white/10 bg-zinc-950/95 px-1 pb-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-400">
              Registration Details
            </p>
            <h2
              id={titleId}
              className="mt-3 break-words text-2xl font-bold sm:text-3xl"
            >
              {registration.playerDisplayName || "N/A"}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Immutable Tournament evidence and private administrator review.
            </p>
          </div>
          <Link
            href={closeHref}
            aria-label="Close registration details"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-2 text-zinc-400 transition hover:border-orange-500/50 hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </Link>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {getEvidenceFacts(registration).map(({ detail, label, value }) => (
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

        <form action={updateRegistrationStatusAction} className="mt-4">
          <input
            type="hidden"
            name="registrationId"
            value={registration.registrationId}
          />
          <input type="hidden" name="activeFilter" value={activeFilter} />
          <input
            type="hidden"
            name="selected"
            value={registration.registrationId}
          />
          <input
            type="hidden"
            name="workspaceTournamentId"
            value={tournamentId}
          />
          <input type="hidden" name="workspaceSection" value={section} />

          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
            <label
              htmlFor="adminNotes"
              className="text-xs font-bold uppercase tracking-wider text-orange-300"
            >
              Private Admin Note{terminal ? " (read-only)" : ""}
            </label>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              {terminal
                ? "Terminal Tournament notes are retained as read-only administrator history."
                : "Required when rejecting a registration or marking it for manual review. This note is restricted to administrators and is never included in Player-facing status messages."}
            </p>
            <textarea
              id="adminNotes"
              name="adminNotes"
              defaultValue={registration.privateAdminNote ?? ""}
              maxLength={1000}
              rows={5}
              readOnly={terminal}
              autoFocus={!terminal && (focus === "note" || focus === "reject")}
              className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-orange-400 read-only:cursor-default read-only:border-white/5 read-only:text-zinc-400"
              placeholder="Record private review context for administrators."
            />
          </div>

          {notice && (
            <RegistrationDecisionNotice notice={notice} terminal={terminal} />
          )}

          <div className="mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <button
              type="submit"
              name="nextStatus"
              value={registration.status}
              disabled={terminal}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:border-white/5 disabled:text-zinc-600 lg:w-auto"
            >
              Save Private Note
            </button>

            {!registration.isDivisionLaunched &&
              !terminal &&
              registration.status !== "waitlisted" &&
              registration.status !== "withdrawn" && (
                <button
                  type="submit"
                  name="nextStatus"
                  value="approved"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 transition hover:bg-green-500/20 lg:w-auto"
                >
                  <CheckCircle aria-hidden="true" className="h-4 w-4" />
                  Approve
                </button>
              )}

            {!registration.isDivisionLaunched &&
              !terminal &&
              registration.status !== "withdrawn" && (
                <button
                  type="submit"
                  name="nextStatus"
                  value="rejected"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 lg:w-auto"
                >
                  <XCircle aria-hidden="true" className="h-4 w-4" />
                  Reject
                </button>
              )}

            {!registration.isDivisionLaunched &&
              !terminal &&
              registration.status !== "waitlisted" &&
              registration.status !== "withdrawn" && (
                <button
                  type="submit"
                  name="nextStatus"
                  value="manual_review"
                  autoFocus={focus === "manual_review"}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-300 transition hover:bg-orange-500/20 lg:w-auto"
                >
                  <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                  Mark Manual Review
                </button>
              )}
          </div>

          {registration.status === "waitlisted" &&
            !registration.isDivisionLaunched &&
            !terminal && (
              <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                A waitlisted Player cannot be promoted by an administrator. The
                Player must receive the oldest eligible FIFO offer, accept it,
                and return to Pending review first.
              </p>
            )}

          {registration.isDivisionLaunched && (
            <p className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/10 p-4 text-sm leading-6 text-sky-100">
              This Division has launched. Registration status decisions are
              locked; private administrator notes remain editable.
            </p>
          )}

          {terminal && (
            <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-950/20 p-4 text-sm leading-6 text-amber-100">
              This Tournament is terminal. Competition decisions are locked;
              factual registration history and private administrator notes
              remain available in read-only form.
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

function RegistrationDecisionNotice({
  notice,
  terminal,
}: {
  notice: string;
  terminal: boolean;
}) {
  const success = notice === "saved";
  const message =
    notice === "note-required"
      ? "Add an Admin note before rejecting or marking this registration for manual review."
      : notice === "saved"
        ? "Registration decision and Admin note saved."
        : notice === "registration-locked"
          ? terminal
            ? "This Tournament is terminal, so registration decisions and private administrator notes are read-only."
            : "This Division has launched, so its roster decisions are locked. Private administrator notes remain editable."
          : "The registration decision could not be saved. Check the note length and try again.";

  return (
    <div
      role={success ? "status" : "alert"}
      className={`mt-4 rounded-xl border p-4 text-sm ${
        success
          ? "border-green-500/30 bg-green-500/10 text-green-300"
          : "border-red-500/30 bg-red-500/10 text-red-300"
      }`}
    >
      {message}
    </div>
  );
}

function getEvidenceFacts(registration: AdminRegistrationReviewRow) {
  return [
    { label: "Player display name", value: registration.playerDisplayName },
    { label: "Tournament", value: registration.tournamentName },
    {
      label: "Selected bracket / Division",
      value: registration.selectedBracket,
    },
    {
      label: "Registration order (Tournament Division)",
      value: registration.registrationOrder
        ? `#${registration.registrationOrder}`
        : null,
    },
    {
      label: "Frozen Tournament registration ELO",
      value: registration.frozenRegistrationElo,
      detail:
        "Authoritative for this Tournament. This is not the Player's current profile ELO.",
    },
    { label: "Verified Division", value: registration.verifiedDivision },
    { label: "Verified faction", value: registration.verifiedFaction },
    {
      label: "Verification source",
      value: formatVerificationSource(registration.verificationSource),
    },
    {
      label: "Verification / check time",
      value: formatDateTime(registration.verificationCheckedAt),
    },
    {
      label: "Eligibility rules version",
      value: registration.eligibilityRulesVersion,
    },
    {
      label: "Current registration status",
      value: formatLabel(registration.status),
    },
    {
      label: "Waitlist position",
      value:
        registration.status === "waitlisted"
          ? registration.waitlistPosition
            ? `#${registration.waitlistPosition}`
            : null
          : "Not waitlisted",
    },
    {
      label: "Waitlist offer",
      value: registration.waitlistOfferStatus
        ? formatLabel(registration.waitlistOfferStatus)
        : "No active or historical offer",
    },
    {
      label: "Division launch state",
      value: registration.isDivisionLaunched
        ? "Launched — roster locked"
        : "Not launched",
    },
    {
      label: "Registered at",
      value: formatDateTime(registration.registeredAt),
    },
  ];
}

function buildWorkspaceHref({
  activeFilter,
  section,
  tournamentId,
}: {
  activeFilter: AdminTournamentRegistrationFilter;
  section: AdminTournamentRegistrationSection;
  tournamentId: string;
}) {
  const params = new URLSearchParams({ section, filter: activeFilter });
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}?${params.toString()}`;
}

function formatVerificationSource(source: string | null) {
  if (!source) return null;
  if (source.toLowerCase() === "relic") return "Relic";
  if (source.toLowerCase() === "coh3stats") return "CoH3 Stats";
  return formatLabel(source);
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unavailable";
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
