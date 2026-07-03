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
}: {
  formId: string;
  name: string;
  scope?: string;
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
      className="h-4 w-4 rounded border-white/20 bg-black/40 text-orange-500 focus:ring-orange-500 disabled:opacity-40"
    />
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
