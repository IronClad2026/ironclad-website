"use client";

import { useActionState, useEffect, useState } from "react";
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
  reportedGameNumbers,
}: {
  match: GeneratedTournamentMatch;
  playerOneName: string;
  playerTwoName: string;
  reportedGameNumbers: number[];
}) {
  const [state, formAction, pending] = useActionState(
    submitMatchResult,
    initialState
  );
  const [outcome, setOutcome] = useState<"win" | "loss" | null>(null);
  const router = useRouter();
  const nextGameNumber =
    Array.from({ length: match.seriesBestOf }, (_, index) => index + 1).find(
      (gameNumber) => !reportedGameNumbers.includes(gameNumber)
    ) ?? null;

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="matchId" value={match.id} />
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-white">
          Player Result Claim
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Choose your result. The opposing result is assigned automatically.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <PlayerLabel label="Player A" name={playerOneName} />
        <PlayerLabel label="Player B" name={playerTwoName} />
      </div>

      <label className="block">
        <span className="text-xs font-bold text-slate-300">Game</span>
        <select
          name="gameNumber"
          required
          defaultValue={nextGameNumber ?? ""}
          className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-orange-400"
        >
          {nextGameNumber ? (
            <option value={nextGameNumber}>Game {nextGameNumber}</option>
          ) : (
            <option value="">All games reported</option>
          )}
        </select>
      </label>

      <fieldset>
        <legend className="text-xs font-bold text-slate-300">Your Result</legend>
        <input type="hidden" name="outcome" value={outcome ?? ""} />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <OutcomeOption
            value="win"
            label="Win"
            tone="win"
            selected={outcome === "win"}
            onSelect={setOutcome}
          />
          <OutcomeOption
            value="loss"
            label="Loss"
            tone="loss"
            selected={outcome === "loss"}
            onSelect={setOutcome}
          />
        </div>
      </fieldset>

      <label className="block">
        <span className="text-xs font-bold text-slate-300">
          Replay proof (.rec or .replay)
        </span>
        <input
          name="replay"
          type="file"
          accept=".rec,.replay"
          className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-3 file:font-bold file:text-white"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-300">
          Victory screenshot
        </span>
        <input
          name="screenshot"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-3 file:font-bold file:text-white"
        />
      </label>
      <p className="text-[11px] text-slate-500">
        At least one proof file is required. Maximum 10 MB per file.
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
        disabled={pending || !outcome || nextGameNumber === null}
        className="w-full rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-400 disabled:opacity-50"
      >
        {pending ? "Submitting..." : "Submit Result for Review"}
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

function OutcomeOption({
  value,
  label,
  tone,
  selected,
  onSelect,
}: {
  value: "win" | "loss";
  label: string;
  tone: "win" | "loss";
  selected: boolean;
  onSelect: (value: "win" | "loss") => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={`rounded-xl border p-4 text-center font-black transition ${
        tone === "win"
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-400/30 bg-red-500/10 text-red-200"
      } ${selected ? "ring-2 ring-current" : "hover:border-current/60"}`}
    >
      {label}
    </button>
  );
}
