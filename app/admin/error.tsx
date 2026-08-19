"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin experience render error.", error);
  }, [error]);

  return (
    <main lang="en" className="grid min-h-screen place-items-center bg-black px-6 py-32 text-white">
      <section className="w-full max-w-2xl border border-red-400/25 bg-zinc-950/90 p-8 shadow-2xl shadow-black/60 sm:p-12">
        <h1 className="text-4xl font-black leading-tight sm:text-5xl">
          Something went wrong.
        </h1>
        <p className="mt-5 max-w-xl leading-7 text-zinc-400">
          IronClad could not load this Admin experience. Please try again.
        </p>
        <button
          type="button"
          className="mt-8 inline-flex min-h-12 items-center justify-center border border-orange-400 bg-orange-500 px-5 py-3 text-sm font-black text-black transition hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
          onClick={reset}
        >
          Try again
        </button>
      </section>
    </main>
  );
}
