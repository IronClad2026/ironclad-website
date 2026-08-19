export default function AdminOperationsLoading() {
  return (
    <main
      lang="en"
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen min-w-0 bg-black px-4 pb-20 pt-28 text-white sm:px-6 sm:pt-32 lg:px-8"
    >
      <div className="mx-auto max-w-7xl animate-pulse space-y-7">
        <div className="rounded-3xl border border-orange-500/20 bg-white/[0.04] p-5 sm:p-8">
          <div className="h-3 w-40 rounded bg-orange-500/20" />
          <div className="mt-5 h-10 max-w-xl rounded bg-white/10" />
          <div className="mt-4 h-5 max-w-3xl rounded bg-white/[0.06]" />
          <p className="sr-only">Loading Admin Operations &amp; Analytics…</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              aria-hidden="true"
              className="h-36 rounded-2xl border border-white/10 bg-white/[0.04]"
            />
          ))}
        </div>

        <div className="h-44 rounded-3xl border border-amber-500/15 bg-amber-500/[0.04]" />

        <div className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              aria-hidden="true"
              className="h-96 rounded-3xl border border-white/10 bg-white/[0.04]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
