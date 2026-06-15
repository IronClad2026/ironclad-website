"use client";

import { useEffect } from "react";

const DRAFT_KEY = "ironclad:new-tournament-draft";

export default function TournamentFormDraft({
  formId,
  enabled,
  clear,
}: {
  formId: string;
  enabled: boolean;
  clear: boolean;
}) {
  useEffect(() => {
    if (clear) {
      sessionStorage.removeItem(DRAFT_KEY);
      return;
    }
    if (!enabled) return;

    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const savedDraft = sessionStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft) as Record<string, string | boolean>;
        for (const [name, value] of Object.entries(draft)) {
          const field = form.elements.namedItem(name);
          if (
            field instanceof HTMLInputElement &&
            field.type === "checkbox"
          ) {
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
      } catch {
        sessionStorage.removeItem(DRAFT_KEY);
      }
    }

    const saveDraft = () => {
      const draft: Record<string, string | boolean> = {};
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
        draft[field.name] =
          field instanceof HTMLInputElement && field.type === "checkbox"
            ? field.checked
            : field.value;
      }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    };

    form.addEventListener("input", saveDraft);
    form.addEventListener("change", saveDraft);
    form.addEventListener("submit", saveDraft);
    return () => {
      form.removeEventListener("input", saveDraft);
      form.removeEventListener("change", saveDraft);
      form.removeEventListener("submit", saveDraft);
    };
  }, [clear, enabled, formId]);

  return null;
}
