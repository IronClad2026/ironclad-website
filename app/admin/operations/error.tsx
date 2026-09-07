"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import styles from "@/components/admin/operations/operations.module.css";

export default function AdminOperationsError({
  reset,
}: {
  error: Error & { digest?: string; };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin Operations render error.");
  }, []);

  return (
    <main
      lang="en"
      className={styles.workspace + " relative z-10 min-h-screen min-w-0 bg-black px-4 py-28 text-white sm:px-6"}
    >
      <section className="mx-auto w-full max-w-2xl rounded-xl border border-white/15 bg-zinc-950 p-5 sm:p-6">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-200">
          <AlertTriangle aria-hidden="true" className="h-6 w-6" />
        </span>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.26em] text-red-300">
          Admin Operations
        </p>
        <h1 className="mt-3 break-words text-2xl font-bold">
          The operational dashboard could not load.
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-zinc-400">
          Retry this dashboard, or return to the Admin command centre to open an existing workflow. No operational changes were made by this view.
        </p>
        <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-300 px-5 py-3 text-sm font-bold text-black transition hover:bg-orange-400 sm:w-auto"
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
