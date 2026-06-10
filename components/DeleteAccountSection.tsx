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
    <section className="mt-8 rounded-3xl border border-red-500/25 bg-red-950/10 p-6 backdrop-blur md:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">
            Danger Zone
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white">Delete Account</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Permanently remove your Clerk account, player profile, and avatar.
            Historical tournament records will remain anonymized.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-3 font-bold text-red-300 transition hover:border-red-400 hover:bg-red-500/20"
        >
          <Trash2 size={18} />
          Delete Account
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 px-4 py-6 backdrop-blur">
          <div className="w-full max-w-lg rounded-3xl border border-red-500/35 bg-[#111318] p-6 shadow-2xl shadow-red-950/40">
            <div className="flex items-start justify-between gap-4">
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
                className="rounded-lg bg-zinc-800 p-2 text-zinc-300 transition hover:bg-zinc-700 hover:text-white disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-5 text-sm leading-6 text-zinc-300">
              This cannot be undone. Your historical registrations will remain
              available to tournament administrators without your personal
              identity.
            </p>

            <form action={formAction} className="mt-6">
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
                className="mt-3 w-full rounded-xl border border-red-500/30 bg-black/50 px-4 py-3 font-mono text-white outline-none transition placeholder:text-zinc-700 focus:border-red-400 disabled:opacity-60"
                placeholder="DELETE"
              />

              {state.message && (
                <div
                  aria-live="polite"
                  className={`mt-4 rounded-xl border p-4 text-sm ${
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
                  className="rounded-xl border border-white/10 px-5 py-3 font-bold text-zinc-300 transition hover:border-white/25 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || confirmation !== "DELETE"}
                  className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
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
