"use client";

import { useActionState, useEffect, useRef } from "react";
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
  const formRef = useRef<HTMLFormElement | null>(null);
  const lastSubmission = useRef<Record<string, string | boolean>>({});

  useEffect(() => {
    if (!state.error || !formRef.current) return;

    for (const [name, value] of Object.entries(lastSubmission.current)) {
      const field = formRef.current.elements.namedItem(name);

      if (field instanceof HTMLInputElement && field.type === "checkbox") {
        field.checked = Boolean(value);
        field.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      ) {
        field.value = String(value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }, [state]);

  const captureSubmission = (form: HTMLFormElement) => {
    const snapshot: Record<string, string | boolean> = {};

    for (const field of Array.from(form.elements)) {
      if (
        !(
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement
        ) ||
        !field.name ||
        field.type === "file"
      ) {
        continue;
      }

      snapshot[field.name] =
        field instanceof HTMLInputElement && field.type === "checkbox"
          ? field.checked
          : field.value;
    }

    lastSubmission.current = snapshot;
  };

  return (
    <form
      ref={formRef}
      id={id}
      action={formAction}
      onSubmit={(event) => captureSubmission(event.currentTarget)}
      className={className}
    >
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
