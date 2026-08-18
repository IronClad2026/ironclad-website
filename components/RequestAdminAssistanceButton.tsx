"use client";

import { useState } from "react";
import { requestMatchAdminAssistance } from "@/app/tournaments/support-actions";

export default function RequestAdminAssistanceButton({
  matchId,
}: {
  matchId: string;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const requestAssistance = async () => {
    setIsSubmitting(true);
    setResult(null);

    try {
      setResult(await requestMatchAdminAssistance({ matchId }));
    } catch {
      setResult({
        success: false,
        message: "Admin assistance could not be requested. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mb-6 border border-orange-500/30 bg-orange-500/10 p-4">
      <p className="text-sm leading-6 text-zinc-200">
        Need help coordinating this match without Discord? Ask the Tournament
        team through IronClad.
      </p>
      <button
        type="button"
        onClick={requestAssistance}
        disabled={isSubmitting || result?.success === true}
        className="mt-3 rounded border border-orange-400/60 px-4 py-2 text-xs font-black uppercase tracking-wide text-orange-200 transition hover:border-orange-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Requesting..." : "Request Admin Assistance"}
      </button>
      {result && (
        <p
          role="status"
          className={
            result.success
              ? "mt-3 text-sm font-bold text-emerald-300"
              : "mt-3 text-sm font-bold text-orange-300"
          }
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
