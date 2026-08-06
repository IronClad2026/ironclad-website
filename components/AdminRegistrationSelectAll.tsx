"use client";

import { useEffect, useRef, useState } from "react";

type SelectionState = {
  checked: boolean;
  disabled: boolean;
  indeterminate: boolean;
};

export default function AdminRegistrationSelectAll({
  formId,
  name,
  scope,
  showLabel = false,
}: {
  formId: string;
  name: string;
  scope?: string;
  showLabel?: boolean;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<SelectionState>({
    checked: false,
    disabled: true,
    indeterminate: false,
  });

  useEffect(() => {
    const refresh = () => {
      const inputs = getRegistrationInputs(formId, name, scope);
      const checkedCount = inputs.filter((input) => input.checked).length;

      setState({
        checked: inputs.length > 0 && checkedCount === inputs.length,
        disabled: inputs.length === 0,
        indeterminate: checkedCount > 0 && checkedCount < inputs.length,
      });
    };

    refresh();
    document.addEventListener("change", refresh);

    return () => {
      document.removeEventListener("change", refresh);
    };
  }, [formId, name, scope]);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = state.indeterminate;
    }
  }, [state.indeterminate]);

  return (
    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 text-xs font-black uppercase tracking-wider text-zinc-300 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40">
      <input
        ref={checkboxRef}
        type="checkbox"
        aria-label="Select all visible registrations"
        checked={state.checked}
        disabled={state.disabled}
        onChange={(event) => {
          const inputs = getRegistrationInputs(formId, name, scope);
          for (const input of inputs) {
            input.checked = event.currentTarget.checked;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }}
        className="h-5 w-5 rounded border-white/20 bg-black/40 text-orange-500 focus:ring-orange-500"
      />
      {showLabel && <span>Select all</span>}
    </label>
  );
}

function getRegistrationInputs(
  formId: string,
  name: string,
  scope?: string
) {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][form="${formId}"][name="${name}"][data-registration-selection="true"]`
    )
  ).filter(
    (input) =>
      !input.disabled &&
      (!scope || input.dataset.registrationSelectionScope === scope)
  );
}
