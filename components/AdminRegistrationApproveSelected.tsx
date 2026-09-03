"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
import { getSelectableRegistrationInputs } from "@/components/AdminRegistrationSelectAll";

export default function AdminRegistrationApproveSelected({
  formId,
  name,
  scope,
  className = "",
}: {
  formId: string;
  name: string;
  scope?: string;
  className?: string;
}) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setSelectedCount(
        getSelectableRegistrationInputs(formId, name, scope).filter(
          (input) => input.checked
        ).length
      );
    };

    refresh();
    document.addEventListener("change", refresh);

    return () => {
      document.removeEventListener("change", refresh);
    };
  }, [formId, name, scope]);

  return (
    <button
      type="submit"
      form={formId}
      disabled={selectedCount === 0}
      className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-green-200 transition hover:border-green-400/60 hover:bg-green-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600 sm:w-auto ${className}`}
    >
      <CheckCircle aria-hidden="true" className="h-4 w-4" />
      <span>
        Approve Selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
      </span>
    </button>
  );
}
