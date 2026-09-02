import { CheckCircle, Clock3 } from "lucide-react";
import Link from "next/link";
import {
  approveSelectedRegistrations,
  updateRegistrationStatus,
} from "@/app/admin/registration-actions";
import AdminRegistrationReviewRows from "@/components/AdminRegistrationReviewRows";
import AdminRegistrationSelectAll from "@/components/AdminRegistrationSelectAll";
import AdminRegistrationDetailDialog from "@/components/admin/tournaments/AdminRegistrationDetailDialog";
import type {
  AdminTournamentRegistrationFilter,
  AdminTournamentRegistrationSection,
  AdminTournamentRegistrationWorkspaceData,
} from "@/lib/admin-tournament-registration-workspace";
import type { AdminTournamentWorkspaceRow } from "@/lib/admin-tournament-workspace";
import {
  formatTournamentDivisionState,
  getEffectiveTournamentDivisionState,
} from "@/lib/tournament-division-state";

export default function AdminTournamentRegistrations({
  data,
  detail,
  focus,
  notice,
  section,
  tournament,
}: {
  data: AdminTournamentRegistrationWorkspaceData;
  detail?: string;
  focus?: "note" | "reject" | "manual_review";
  notice?: string;
  section: AdminTournamentRegistrationSection;
  tournament: AdminTournamentWorkspaceRow;
}) {
  const playersView = section === "players-waitlist";
  const baseHref = `/admin/tournaments/${encodeURIComponent(tournament.id)}?section=${section}`;
  const filters: AdminTournamentRegistrationFilter[] = playersView
    ? ["all", "approved", "waitlisted"]
    : ["all", "pending", "manual_review", "approved", "rejected", "withdrawn"];
  const formId = `tournament-registration-bulk-${tournament.id}`;

  return (
    <section
      aria-labelledby="tournament-registration-workspace-title"
      className="min-w-0"
    >
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">
              {playersView ? "Roster and FIFO" : "Admin review"}
            </p>
            <h2
              id="tournament-registration-workspace-title"
              className="mt-2 break-words text-2xl font-black text-white"
            >
              {playersView ? "Players / Waitlist" : "Registrations"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              {playersView
                ? "Approved Players and the existing FIFO Waitlist are shown together. Vacancy offers and capacity remain database-authoritative."
                : "Review pending evidence, private Admin notes, approvals, rejections, and manual-review states using the existing authoritative action."}
            </p>
          </div>

          {!playersView && (
            <>
              <form id={formId} action={approveSelectedRegistrations}>
                <input
                  type="hidden"
                  name="activeFilter"
                  value={data.activeFilter}
                />
                <input
                  type="hidden"
                  name="workspaceTournamentId"
                  value={tournament.id}
                />
                <input
                  type="hidden"
                  name="workspaceSection"
                  value={section}
                />
              </form>
              <button
                type="submit"
                form={formId}
                disabled={!data.hasBulkApprovableRegistration}
                className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-green-200 transition hover:border-green-400/60 hover:bg-green-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600 sm:w-auto"
              >
                <CheckCircle aria-hidden="true" className="h-4 w-4" />
                Approve Selected
              </button>
            </>
          )}
        </div>

        <div className="mt-5 flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {filters.map((filter) => (
            <Link
              key={filter}
              href={`${baseHref}&filter=${filter}`}
              aria-current={data.activeFilter === filter ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wider transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
                data.activeFilter === filter
                  ? "border-orange-400/50 bg-orange-500/15 text-orange-100"
                  : "border-white/10 bg-black/30 text-zinc-400 hover:border-orange-400/40 hover:text-white"
              }`}
            >
              {formatLabel(filter)} ({data.counts[filter]})
            </Link>
          ))}
        </div>

        <RegistrationNotice notice={notice} detail={detail} />

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.cohortSummaries.map((summary) => {
            const effectiveState = getEffectiveTournamentDivisionState(
              summary.divisionState
            );

            return (
              <div
                key={summary.bracketId}
                className={`min-w-0 rounded-2xl border p-4 ${
                  effectiveState === "cancelled" ||
                  effectiveState === "voided"
                    ? "border-red-400/35 bg-red-500/10"
                    : effectiveState === "completed"
                    ? "border-emerald-400/35 bg-emerald-500/10"
                    : effectiveState === "in_progress"
                      ? "border-sky-400/35 bg-sky-500/10"
                      : effectiveState === "ready"
                        ? "border-orange-400/35 bg-orange-500/10"
                        : "border-white/10 bg-black/30"
                }`}
              >
                <p className="break-words text-sm font-black text-white">
                  {summary.bracketName}
                </p>
                <p className="mt-3 text-2xl font-black text-orange-300">
                  {summary.approvedCount} / {summary.requiredCount}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wider text-zinc-400">
                  Approved Players
                </p>
                <p className="mt-3 break-words text-xs leading-5 text-zinc-400">
                  Active cohort: {summary.activeCohortCount} · Waiting:{" "}
                  {summary.waitlistCount}
                </p>
                <p className="mt-2 text-xs font-black text-zinc-200">
                  {formatTournamentDivisionState(summary.divisionState)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {playersView && data.waitlistNotices.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 text-amber-300">
            <Clock3 aria-hidden="true" size={18} />
            <p className="text-xs font-black uppercase tracking-wider">
              FIFO Waitlist
            </p>
          </div>
          <div className="mt-3 space-y-2 text-sm leading-6 text-amber-50/90">
            {data.waitlistNotices.map((registration) => (
              <p key={registration.id} className="break-words">
                <span className="font-black">{registration.playerName}</span>{" "}
                — {registration.bracketName} —{" "}
                {registration.offerStatus
                  ? `Offer ${formatLabel(registration.offerStatus)}`
                  : `Waitlist Position #${registration.waitlistPosition ?? "?"}`}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
        <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">
              {playersView ? "Roster records" : "Registration records"}
            </p>
            <p className="mt-1 break-words text-sm text-zinc-400">
              Showing {data.rows.length} of {data.counts.all} in this workspace.
            </p>
          </div>
          {!playersView && (
            <div className="xl:hidden">
              <AdminRegistrationSelectAll
                formId={formId}
                name="registrationId"
                scope={tournament.id}
                showLabel
              />
            </div>
          )}
        </div>

        <AdminRegistrationReviewRows
          registrations={data.rows}
          activeFilter={data.activeFilter}
          formId={playersView ? `${formId}-read-only` : formId}
          selectionScope={tournament.id}
          isTournamentTerminal={data.selectedRegistrationIsTerminal}
          updateRegistrationStatusAction={updateRegistrationStatus}
          returnHref={baseHref}
          workspaceTournamentId={tournament.id}
          workspaceSection={section}
        />
      </div>

      {data.rows.length === 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-500">
          No {playersView ? "Player or Waitlist" : "registration"} records
          match this filter.
        </div>
      )}

      {data.selectedRegistration && (
        <AdminRegistrationDetailDialog
          activeFilter={data.activeFilter}
          focus={focus}
          notice={notice}
          registration={data.selectedRegistration}
          section={section}
          terminal={data.selectedRegistrationIsTerminal}
          tournamentId={tournament.id}
          updateRegistrationStatusAction={updateRegistrationStatus}
        />
      )}
    </section>
  );
}

function RegistrationNotice({
  detail,
  notice,
}: {
  detail?: string;
  notice?: string;
}) {
  if (!notice || notice === "saved" || notice === "note-required") return null;

  const success = notice === "registration-bulk-approved";
  const warning = notice === "registration-bulk-partial";
  const message =
    detail ||
    (notice === "registration-bulk-approved"
      ? "Selected registration(s) approved."
      : notice === "registration-bulk-partial"
        ? "Some selected registration(s) were approved. Others failed validation."
        : notice === "bracket-full"
          ? "Approval blocked because this Division's active cohort is full."
          : notice === "registration-closed"
            ? "Registration update blocked because this Division is closed for roster changes."
            : notice === "registration-locked"
              ? "Registration update blocked because this Division has launched and its roster is locked."
              : "The requested registration action could not be completed.");

  return (
    <div
      role={success ? "status" : "alert"}
      className={`mt-5 rounded-2xl border p-4 text-sm font-semibold leading-6 ${
        success
          ? "border-green-500/30 bg-green-500/10 text-green-300"
          : warning
            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
            : "border-red-500/30 bg-red-500/10 text-red-300"
      }`}
    >
      {message}
    </div>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
