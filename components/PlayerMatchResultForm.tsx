"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  submitMatchResult,
  type MatchResultActionState,
} from "@/app/tournaments/match-actions";
import type { GeneratedTournamentMatch } from "@/lib/tournaments";

const initialState: MatchResultActionState = {
  status: "idle",
  message: "",
};

export default function PlayerMatchResultForm({
  match,
  playerOneName,
  playerTwoName,
}: {
  match: GeneratedTournamentMatch;
  playerOneName: string;
  playerTwoName: string;
}) {
  const [state, formAction, pending] = useActionState(
    submitMatchResult,
    initialState
  );
  const router = useRouter();
  const winsRequired = Math.floor(match.seriesBestOf / 2) + 1;

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="matchId" value={match.id} />
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-white">
          Submit Match Result
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Enter the final BO{match.seriesBestOf} score and upload the replay.
          Your opponent will be asked to confirm or dispute the result.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <PlayerLabel label="Player A" name={playerOneName} />
        <PlayerLabel label="Player B" name={playerTwoName} />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <ScoreField
          name="playerOneScore"
          label={playerOneName}
          max={winsRequired}
        />
        <ScoreField
          name="playerTwoScore"
          label={playerTwoName}
          max={winsRequired}
        />
        <div className="rounded-xl border border-orange-400/20 bg-orange-500/10 p-4 text-xs text-orange-100/80">
          Winner must finish on {winsRequired} wins.
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-bold text-slate-300">Winner</span>
        <select
          name="winnerRegistrationId"
          required
          defaultValue=""
          className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-orange-400"
        >
          <option value="">Select winner</option>
          <option value={match.playerOneRegistrationId ?? ""}>
            {playerOneName}
          </option>
          <option value={match.playerTwoRegistrationId ?? ""}>
            {playerTwoName}
          </option>
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-bold text-slate-300">
          Replay proof (.rec required)
        </span>
        <input
          name="replay"
          type="file"
          accept=".rec"
          required
          className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-3 file:font-bold file:text-white"
        />
      </label>
      <p className="text-[11px] text-slate-500">
        Replay proof is required.
      </p>
      <label className="block">
        <span className="text-xs font-bold text-slate-300">
          Notes (optional)
        </span>
        <textarea
          name="notes"
          maxLength={2000}
          rows={5}
          className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-400"
        />
      </label>

      {state.status !== "idle" && (
        <p
          className={`rounded-lg border p-2 text-xs ${
            state.status === "success"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-400/30 bg-red-500/10 text-red-200"
          }`}
        >
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-400 disabled:opacity-50"
      >
        {pending ? "Submitting..." : "Submit for Opponent Confirmation"}
      </button>
    </form>
  );
}

function PlayerLabel({ label, name }: { label: string; name: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate font-black text-white">{name}</p>
    </div>
  );
}

function ScoreField({
  name,
  label,
  max,
}: {
  name: string;
  label: string;
  max: number;
}) {
  return (
    <label className="block">
      <span className="block truncate text-xs font-bold text-slate-300">
        {label}
      </span>
      <input
        name={name}
        type="number"
        min="0"
        max={max}
        required
        className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-orange-400"
      />
    </label>
  );
}
