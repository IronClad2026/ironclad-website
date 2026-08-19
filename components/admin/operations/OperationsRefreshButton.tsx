"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function OperationsRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/35 px-4 py-2.5 text-sm font-black text-zinc-200 transition hover:border-orange-400/60 hover:bg-orange-500/10 hover:text-white disabled:cursor-wait disabled:opacity-60 sm:w-auto"
    >
      <RefreshCw
        aria-hidden="true"
        className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
      />
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
