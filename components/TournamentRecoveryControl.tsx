"use client";

import { useActionState, useState, type ReactNode } from "react";
import { AlertTriangle, Ban, CircleOff, Info } from "lucide-react";
import {
  cancelTournamentAction,
  voidTournamentAction,
  type TournamentTerminalActionState,
} from "@/app/admin/tournaments/actions";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";

type TournamentTerminalPresentation = {
  status: "cancelled" | "voided";
  at: string | null;
  reason: string | null;
};

type TournamentUnderReviewPresentation = {
  seasonName: string;
  at: string | null;
  reason: string | null;
  triggeringTournamentTitle: string;
};

const initialState: TournamentTerminalActionState = {
  status: "idle",
  message: "",
};

export default function TournamentRecoveryControl({
  tournamentId,
  tournamentTitle,
  terminal,
  underReview,
}: {
  tournamentId: string;
  tournamentTitle: string;
  terminal: TournamentTerminalPresentation | null;
  underReview: TournamentUnderReviewPresentation | null;
}) {
  return (
    <section className="mt-6 min-w-0 rounded-3xl border border-amber-400/25 bg-amber-950/10 p-4 sm:p-6 md:p-8">
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={22} />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">
            Tournament Recovery
          </p>
          <h2 className="mt-2 break-words text-2xl font-black text-white">
            Cancel, Void, or Delete?
          </h2>
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm leading-6 text-zinc-300 md:grid-cols-3">
        <RecoveryGuidance
          title="Hard Delete"
          detail="Only for genuinely disposable tournaments that have never launched. Use the existing protected Delete workflow."
        />
        <RecoveryGuidance
          title="Cancel"
          detail="For launched competition without official competitive history. The database verifies eligibility."
        />
        <RecoveryGuidance
          title="Void"
          detail="For competition whose derived scoring effects must no longer count while factual history remains."
        />
      </div>

      <p className="mt-4 border border-sky-400/20 bg-sky-950/15 p-3 text-sm leading-6 text-sky-100">
        For a finalized Main / Pro qualifier, Void places the season under
        review; frozen standings are not rewritten.
      </p>

      {terminal ? (
        <TerminalMetadata
          terminal={terminal}
          tournamentTitle={tournamentTitle}
        />
      ) : underReview ? (
        <p className="mt-6 rounded-xl border border-sky-400/25 bg-sky-950/20 p-4 text-sm leading-6 text-sky-100">
          This finalized-season request is already under review. Do not use
          ordinary Cancel, Void, or recalculation controls to resolve it.
        </p>
      ) : (
        <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-2">
          <TerminalOperationForm
            tournamentId={tournamentId}
            operation="cancel"
          />
          <TerminalOperationForm
            tournamentId={tournamentId}
            operation="void"
          />
        </div>
      )}

      {underReview && <UnderReviewMetadata underReview={underReview} />}
    </section>
  );
}

function RecoveryGuidance({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/30 p-4">
      <p className="font-black text-white">{title}</p>
      <p className="mt-1 break-words text-zinc-400">{detail}</p>
    </div>
  );
}

function TerminalOperationForm({
  tournamentId,
  operation,
}: {
  tournamentId: string;
  operation: "cancel" | "void";
}) {
  const action =
    operation === "cancel" ? cancelTournamentAction : voidTournamentAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const token = operation === "cancel" ? "CANCEL" : "VOID";
  const title = operation === "cancel" ? "Cancel Tournament" : "Void Tournament";
  const Icon = operation === "cancel" ? Ban : CircleOff;
  const formId = `${operation}-tournament-${tournamentId}`;
  const ready = reason.trim().length > 0 && confirmation === token;

  return (
    <form
      action={formAction}
      className="min-w-0 rounded-2xl border border-red-400/25 bg-black/40 p-4 sm:p-5"
      aria-labelledby={`${formId}-title`}
    >
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <div className="flex items-center gap-3">
        <Icon className="shrink-0 text-red-300" size={19} />
        <h3 id={`${formId}-title`} className="break-words font-black text-white">
          {title}
        </h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        This is a recovery operation. Eligibility remains authoritative in the
        database and is not guaranteed by this form.
      </p>

      <label className="mt-5 block" htmlFor={`${formId}-reason`}>
        <span className="text-sm font-bold text-zinc-200">
          Administrator reason
        </span>
        <textarea
          id={`${formId}-reason`}
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          maxLength={2000}
          rows={4}
          disabled={pending}
          className="mt-2 w-full min-w-0 rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30 disabled:cursor-wait disabled:opacity-60"
        />
      </label>

      <label className="mt-4 block" htmlFor={`${formId}-confirmation`}>
        <span className="text-sm font-bold text-zinc-200">
          Type {token} exactly to confirm
        </span>
        <input
          id={`${formId}-confirmation`}
          name="confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          autoComplete="off"
          disabled={pending}
          className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30 disabled:cursor-wait disabled:opacity-60"
        />
      </label>

      <button
        type="submit"
        disabled={pending || !ready}
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-center text-sm font-black text-red-100 transition hover:border-red-300 hover:bg-red-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-500"
      >
        {pending ? `${title}...` : title}
      </button>

      <p
        aria-live="polite"
        className={`mt-4 min-h-5 text-sm ${
          state.status === "success" ? "text-emerald-300" : "text-red-300"
        }`}
      >
        {state.message}
      </p>
    </form>
  );
}

function TerminalMetadata({
  terminal,
  tournamentTitle,
}: {
  terminal: TournamentTerminalPresentation;
  tournamentTitle: string;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-amber-400/30 bg-black/40 p-4 sm:p-5">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">
        Terminal - View Only
      </p>
      <h3 className="mt-2 break-words text-xl font-black text-white">
        {tournamentTitle} is {terminal.status}
      </h3>
      <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <MetadataRow label="Terminal timestamp">
          <HydrationSafeLocalDateTime
            value={terminal.at}
            fallback="Timestamp unavailable"
          />
        </MetadataRow>
        <MetadataRow label="Performed by">Administrator</MetadataRow>
        <MetadataRow label="Private reason" wide>
          {terminal.reason ?? "Reason unavailable"}
        </MetadataRow>
      </dl>
      <p className="mt-4 text-sm leading-6 text-zinc-400">
        Normal lifecycle, registration, bracket, and result operations are no
        longer available for this tournament.
      </p>
    </div>
  );
}

function UnderReviewMetadata({
  underReview,
}: {
  underReview: TournamentUnderReviewPresentation;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-sky-400/30 bg-sky-950/20 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 shrink-0 text-sky-300" size={19} />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">
            Under Review
          </p>
          <h3 className="mt-2 break-words text-xl font-black text-white">
            {underReview.seasonName}
          </h3>
        </div>
      </div>
      <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <MetadataRow label="Triggering tournament">
          {underReview.triggeringTournamentTitle}
        </MetadataRow>
        <MetadataRow label="Review timestamp">
          <HydrationSafeLocalDateTime
            value={underReview.at}
            fallback="Timestamp unavailable"
          />
        </MetadataRow>
        <MetadataRow label="Private reason" wide>
          {underReview.reason ?? "Reason unavailable"}
        </MetadataRow>
      </dl>
      <p className="mt-4 text-sm leading-6 text-zinc-300">
        Frozen standings were not changed. Separate adjudication is required;
        this panel does not reopen, reflow, or resolve the season.
      </p>
    </div>
  );
}

function MetadataRow({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-white/10 bg-black/30 p-3 ${
        wide ? "sm:col-span-2" : ""
      }`}
    >
      <dt className="text-xs font-black uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-zinc-200">{children}</dd>
    </div>
  );
}
