"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import {
  deleteIronCladAccount,
  type DeleteAccountState,
} from "@/app/profile/delete-account-action";

const initialDeleteAccountState: DeleteAccountState = {
  status: "idle",
  message: "",
};

const dangerPanelOverlayClass =
  "pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:56px_56px] opacity-10";

export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState(
    deleteIronCladAccount,
    initialDeleteAccountState
  );

  useEffect(() => {
    if (state.status === "success") {
      window.location.assign("/");
    }
  }, [state.status]);

  return (
    <section className="group relative isolate mt-8 overflow-hidden border border-red-500/25 bg-[linear-gradient(145deg,rgba(127,29,29,0.16),rgba(8,8,8,0.86))] p-6 shadow-2xl shadow-black/30 backdrop-blur transition hover:border-red-400/35 md:p-8">
      <div className={dangerPanelOverlayClass} />
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition group-hover:opacity-100">
        <div className="absolute inset-x-0 top-0 h-px bg-red-300/45" />
      </div>

      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">
            Danger Zone
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white">Delete Account</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Permanently remove your live IronClad sign-in and profile identity,
            avatar, and direct personal identifiers. Private account links are
            removed or neutralized. Official tournament, match, leaderboard,
            and champion history is preserved publicly only as Former
            Competitor. Referenced private replay proof may remain for
            authorized review.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 border border-red-500/40 bg-red-500/10 px-5 py-3 font-bold text-red-300 transition hover:border-red-400 hover:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-300"
        >
          <Trash2 size={18} />
          Delete Account
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 px-4 py-6 backdrop-blur">
          <div className="relative isolate w-full max-w-lg overflow-hidden border border-red-500/35 bg-[linear-gradient(145deg,rgba(127,29,29,0.16),rgba(8,8,8,0.94))] p-6 shadow-2xl shadow-red-950/40 backdrop-blur-xl">
            <div className={dangerPanelOverlayClass} />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-1 shrink-0 text-red-400" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-red-400">
                    Permanent Action
                  </p>
                  <h3 className="mt-2 text-2xl font-black text-white">
                    Delete your IronClad account?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  setConfirmation("");
                }}
                aria-label="Close delete account confirmation"
                className="border border-white/10 bg-zinc-900/80 p-2 text-zinc-300 transition hover:border-red-400/45 hover:bg-red-500/10 hover:text-white disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <p className="relative z-10 mt-5 text-sm leading-6 text-zinc-300">
              This cannot be undone. If you have official competition history,
              its registrations, match results, leaderboard standings, champion
              records, and referenced private replay proof will remain. Public
              history will identify you only as Former Competitor, and private
              proof remains limited to authorized reviewers. Otherwise, your
              player record will be removed.
            </p>

            <form action={formAction} className="relative z-10 mt-6">
              <label htmlFor="delete-confirmation" className="text-sm font-bold text-white">
                Type DELETE to confirm
              </label>
              <input
                id="delete-confirmation"
                name="confirmation"
                value={confirmation}
                disabled={pending}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                className="mt-3 w-full border border-red-500/30 bg-black/55 px-4 py-3 font-mono text-white shadow-inner shadow-black/20 outline-none transition placeholder:text-zinc-700 focus:border-red-400 focus:bg-black/70 disabled:opacity-60"
                placeholder="DELETE"
              />

              {state.message && (
                <div
                  aria-live="polite"
                  className={`mt-4 border p-4 text-sm shadow-xl shadow-black/20 ${
                    state.status === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {state.message}
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setOpen(false);
                    setConfirmation("");
                  }}
                  className="border border-white/10 px-5 py-3 font-bold text-zinc-300 transition hover:border-white/25 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || confirmation !== "DELETE"}
                  className="border border-red-500 bg-red-600 px-5 py-3 font-bold text-white transition hover:border-red-400 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? "Deleting Account..." : "Permanently Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
