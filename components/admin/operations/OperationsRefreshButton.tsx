"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function OperationsRefreshButton({ generatedAt }: { generatedAt?: string; }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [requestedSnapshot, setRequestedSnapshot] = useState<string | null>(null);
  const feedback = requestedSnapshot === null ? "" : pending ? "Refreshing snapshot…" : generatedAt && generatedAt !== requestedSnapshot ? "Snapshot updated." : "Refresh finished. Snapshot time is unchanged.";
  return (
    <div className="min-w-0">
      <button type="button" disabled={pending} aria-busy={pending} onClick={() => {
        setRequestedSnapshot(generatedAt ?? "");
        startTransition(() => { router.refresh(); });
      }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-black px-3 py-2 text-sm font-semibold text-zinc-200 hover:border-orange-400/60 hover:bg-orange-500/10 disabled:cursor-wait disabled:opacity-60">
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} />
        {pending ? "Refreshing…" : "Refresh"}
      </button>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">{feedback}</span>
    </div>
  );
}
