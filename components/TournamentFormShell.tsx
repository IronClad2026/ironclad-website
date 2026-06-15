"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveTournament,
  type TournamentSaveState,
} from "@/app/admin/tournaments/actions";

const initialState: TournamentSaveState = {
  error: null,
};

export default function TournamentFormShell({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(saveTournament, initialState);

  return (
    <form id={id} action={formAction} className={className}>
      {state.error && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-6 rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm font-bold leading-6 text-red-200"
        >
          {state.error}
        </div>
      )}
      {children}
    </form>
  );
}

export function TournamentSubmitButton({
  label,
}: {
  label: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-orange-500 px-6 py-3 font-black text-white transition hover:bg-orange-400 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Saving Tournament..." : label}
    </button>
  );
}
