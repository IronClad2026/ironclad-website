"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function AdminOperationsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin Operations render error.");
  }, []);

  return (
    <main
      lang="en"
      className="grid min-h-screen place-items-center bg-black px-4 py-28 text-white sm:px-6"
    >
      <section className="w-full max-w-2xl rounded-3xl border border-red-500/30 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.12),transparent_35%),linear-gradient(145deg,#18181b,#09090b)] p-5 shadow-2xl shadow-black/60 sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-200">
          <AlertTriangle aria-hidden="true" className="h-6 w-6" />
        </span>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.26em] text-red-300">
          Admin Operations
        </p>
        <h1 className="mt-3 break-words text-3xl font-black sm:text-4xl">
          The operational dashboard could not load.
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-zinc-400">
          Registration and Tournament administration remain available. Retry
          this dashboard, or return to the Admin command centre.
        </p>
        <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white transition hover:bg-orange-400 sm:w-auto"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/admin"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-black text-zinc-200 transition hover:border-orange-400/50 hover:text-white sm:w-auto"
          >
            Return to Admin
          </Link>
        </div>
      </section>
    </main>
  );
}
