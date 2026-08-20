"use client";

import { SignOutButton } from "@clerk/nextjs";
import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { acceptAccountLegalUpdate } from "@/app/legal-update-actions";
import type { AccountLegalAcceptanceActionState } from "@/app/legal-update-actions";
import type {
  AccountLegalGateDocument,
  AccountLegalGateState,
} from "@/lib/account-legal-acceptance";

const initialState: AccountLegalAcceptanceActionState = {
  status: "idle",
  code: "idle",
};

export type AccountLegalUpdateCopy = {
  eyebrow: string;
  title: string;
  description: string;
  termsLinkLabel: string;
  privacyLinkLabel: string;
  termsAgreement: string;
  privacyAcknowledgement: string;
  continueAction: string;
  savingAction: string;
  signOutAction: string;
  retryAction: string;
  unavailableTitle: string;
  unavailableDescription: string;
  authRequiredError: string;
  acceptanceRequiredError: string;
  unavailableError: string;
  acceptedMessage: string;
};

type RequiredGateState = Extract<AccountLegalGateState, { status: "required" }>;

type AccountLegalUpdateShellProps = {
  state: RequiredGateState | { status: "unavailable" };
  copy: AccountLegalUpdateCopy;
};

export default function AccountLegalUpdateShell({
  state,
  copy,
}: AccountLegalUpdateShellProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center overflow-x-hidden bg-black px-4 py-10 text-white sm:px-6">
      <section
        aria-labelledby="account-legal-update-title"
        className="relative isolate w-full max-w-3xl overflow-hidden border border-orange-500/30 bg-[linear-gradient(145deg,rgba(249,115,22,0.1),rgba(8,8,8,0.96)_48%)] p-5 shadow-2xl shadow-black/50 sm:p-8 lg:p-10"
      >
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:48px_48px] opacity-20" />
        <div className="flex h-12 w-12 items-center justify-center border border-orange-400/40 bg-orange-500/10 text-orange-300">
          <ShieldCheck aria-hidden="true" size={24} />
        </div>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.28em] text-orange-400">
          {copy.eyebrow}
        </p>
        <h1
          ref={headingRef}
          id="account-legal-update-title"
          tabIndex={-1}
          className="mt-3 text-3xl font-black tracking-tight outline-none sm:text-4xl"
        >
          {state.status === "unavailable" ? copy.unavailableTitle : copy.title}
        </h1>

        {state.status === "unavailable" ? (
          <UnavailableControls copy={copy} />
        ) : (
          <RequiredAcceptance state={state} copy={copy} />
        )}
      </section>
    </main>
  );
}

function RequiredAcceptance({
  state,
  copy,
}: {
  state: RequiredGateState;
  copy: AccountLegalUpdateCopy;
}) {
  const router = useRouter();
  const [actionState, formAction, pending] = useActionState(
    acceptAccountLegalUpdate,
    initialState
  );

  useEffect(() => {
    if (actionState.status === "success") {
      router.refresh();
    }
  }, [actionState.status, router]);

  return (
    <>
      <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
        {copy.description}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <DocumentLink
          document={state.terms}
          label={copy.termsLinkLabel}
        />
        <DocumentLink
          document={state.privacy}
          label={copy.privacyLinkLabel}
        />
      </div>

      <form action={formAction} className="mt-7">
        <input
          type="hidden"
          name="termsDocumentId"
          value={state.terms.id}
        />
        <input
          type="hidden"
          name="privacyDocumentId"
          value={state.privacy.id}
        />

        <fieldset disabled={pending} className="grid gap-3">
          <label className="flex cursor-pointer items-start gap-3 border border-white/12 bg-white/[0.035] p-4 text-sm leading-6 text-zinc-200 transition hover:border-orange-400/40">
            <input
              required
              type="checkbox"
              name="termsAccepted"
              value="accepted"
              className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
            />
            <span>{copy.termsAgreement}</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 border border-white/12 bg-white/[0.035] p-4 text-sm leading-6 text-zinc-200 transition hover:border-orange-400/40">
            <input
              required
              type="checkbox"
              name="privacyAcknowledged"
              value="acknowledged"
              className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
            />
            <span>{copy.privacyAcknowledgement}</span>
          </label>
        </fieldset>

        {actionState.status !== "idle" && (
          <p
            role={actionState.status === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`mt-4 border p-4 text-sm ${
              actionState.status === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            {getActionMessage(actionState.code, copy)}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <SignOutControl label={copy.signOutAction} />
          <button
            type="submit"
            disabled={pending}
            className="min-h-12 border border-orange-400 bg-orange-500 px-6 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? copy.savingAction : copy.continueAction}
          </button>
        </div>
      </form>
    </>
  );
}

function UnavailableControls({ copy }: { copy: AccountLegalUpdateCopy }) {
  const router = useRouter();

  return (
    <>
      <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
        {copy.unavailableDescription}
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <SignOutControl label={copy.signOutAction} />
        <button
          type="button"
          onClick={() => router.refresh()}
          className="inline-flex min-h-12 items-center justify-center gap-2 border border-orange-400 bg-orange-500 px-6 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
        >
          <RefreshCw aria-hidden="true" size={17} />
          {copy.retryAction}
        </button>
      </div>
    </>
  );
}

function DocumentLink({
  document,
  label,
}: {
  document: AccountLegalGateDocument;
  label: string;
}) {
  return (
    <a
      href={document.url}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-12 items-center justify-between gap-3 border border-white/12 bg-black/50 px-4 py-3 text-sm font-bold text-white transition hover:border-orange-400/50 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
    >
      <span>
        {label} v{document.version}
      </span>
      <ExternalLink aria-hidden="true" size={16} className="shrink-0" />
    </a>
  );
}

function SignOutControl({ label }: { label: string }) {
  return (
    <SignOutButton redirectUrl="/">
      <button
        type="button"
        className="min-h-12 border border-white/15 bg-white/[0.035] px-6 py-3 text-sm font-bold text-zinc-200 transition hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
      >
        {label}
      </button>
    </SignOutButton>
  );
}

function getActionMessage(
  code:
    | "idle"
    | "auth-required"
    | "acceptance-required"
    | "unavailable"
    | "accepted",
  copy: AccountLegalUpdateCopy
) {
  if (code === "auth-required") return copy.authRequiredError;
  if (code === "acceptance-required") return copy.acceptanceRequiredError;
  if (code === "accepted") return copy.acceptedMessage;
  return copy.unavailableError;
}
