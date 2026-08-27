"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Trash2 } from "lucide-react";
import {
  deleteIronCladAccount,
  type DeleteAccountState,
} from "@/app/profile/delete-account-action";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishAccountDictionary from "@/lib/i18n/dictionaries/en/account-dashboard";

const initialDeleteAccountState: DeleteAccountState = {
  status: "idle",
  message: "",
};

const dangerPanelOverlayClass =
  "pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:56px_56px] opacity-10";

export default function DeleteAccountSection() {
  const t = useOptionalTranslations(
    "account-dashboard",
    englishAccountDictionary
  );
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const disclosureId = useId();
  const disclosureTriggerId = useId();
  const disclosureTriggerRef = useRef<HTMLButtonElement>(null);
  const [state, formAction, pending] = useActionState(
    deleteIronCladAccount,
    initialDeleteAccountState
  );

  useEffect(() => {
    if (state.status === "success") {
      window.location.assign("/");
    }
  }, [state.status]);

  const collapse = (returnFocus: boolean) => {
    if (pending) return;

    setOpen(false);
    setConfirmation("");

    if (returnFocus) {
      disclosureTriggerRef.current?.focus();
    }
  };

  return (
    <section className="group relative isolate mt-8 overflow-hidden border border-red-500/25 bg-[linear-gradient(145deg,rgba(127,29,29,0.16),rgba(8,8,8,0.86))] shadow-2xl shadow-black/30 backdrop-blur transition hover:border-red-400/35">
      <div className={dangerPanelOverlayClass} />
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition group-hover:opacity-100">
        <div className="absolute inset-x-0 top-0 h-px bg-red-300/45" />
      </div>

      <h2 className="relative z-10">
        <button
          ref={disclosureTriggerRef}
          id={disclosureTriggerId}
          type="button"
          disabled={pending}
          aria-expanded={open}
          aria-controls={disclosureId}
          onClick={() => {
            if (open) {
              collapse(false);
              return;
            }

            setOpen(true);
          }}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-red-500/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-300 disabled:cursor-wait disabled:opacity-60 sm:px-6"
        >
          <span className="flex min-w-0 items-center gap-3">
            <Trash2
              className="shrink-0 text-red-400"
              size={18}
              aria-hidden="true"
            />
            <span className="font-bold text-white">
              {t("deleteAccount.title")}
            </span>
          </span>
          <ChevronDown
            className={`shrink-0 text-red-300 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            size={19}
            aria-hidden="true"
          />
        </button>
      </h2>

      {open && (
        <div
          id={disclosureId}
          role="region"
          aria-labelledby={disclosureTriggerId}
          className="relative z-10 border-t border-red-500/20 px-5 py-5 sm:px-6 sm:py-6"
        >
          <p className="max-w-3xl text-sm leading-6 text-zinc-400">
            {t("deleteAccount.description")}
          </p>

          <div className="mt-5 border border-red-500/30 bg-black/35 p-4 sm:p-5">
            <div className="flex gap-3">
              <AlertTriangle className="mt-1 shrink-0 text-red-400" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-red-400">
                  {t("deleteAccount.permanent")}
                </p>
                <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
                  {t("deleteAccount.confirmTitle")}
                </h3>
                <p className="mt-4 text-sm leading-6 text-zinc-300">
                  {t("deleteAccount.warning")}
                </p>
              </div>
            </div>

            <form
              action={formAction}
              className="mt-6"
            >
              <label htmlFor="delete-confirmation" className="text-sm font-bold text-white">
                {t("deleteAccount.typeDelete")}
              </label>
              <input
                id="delete-confirmation"
                name="confirmation"
                value={confirmation}
                disabled={pending}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                className="mt-3 w-full border border-red-500/30 bg-black/55 px-4 py-3 font-mono text-white shadow-inner shadow-black/20 outline-none transition placeholder:text-zinc-700 focus:border-red-400 focus:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-60"
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
                  {state.code
                    ? t(
                        {
                          "session-expired": "deleteAccount.sessionExpired",
                          "confirmation-invalid":
                            "deleteAccount.confirmationInvalid",
                          "not-configured": "deleteAccount.notConfigured",
                          "avatar-failed": "deleteAccount.avatarFailed",
                          "data-failed": "deleteAccount.dataFailed",
                          "clerk-failed": "deleteAccount.clerkFailed",
                          deleted: "deleteAccount.success",
                        }[state.code]
                      )
                    : state.message}
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => collapse(true)}
                  className="min-h-11 border border-white/10 px-5 py-3 font-bold text-zinc-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-300 disabled:opacity-50"
                >
                  {t("deleteAccount.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={pending || confirmation !== "DELETE"}
                  className="min-h-11 border border-red-500 bg-red-600 px-5 py-3 font-bold text-white transition hover:border-red-400 hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending
                    ? t("deleteAccount.deleting")
                    : t("deleteAccount.permanentlyDelete")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
