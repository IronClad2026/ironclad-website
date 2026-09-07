import styles from "@/components/admin/operations/operations.module.css";

export default function AdminOperationsLoading() {
  return (
    <main lang="en" aria-busy="true" aria-live="polite" className={styles.workspace + " relative z-10 min-h-screen min-w-0 bg-black px-4 pb-16 pt-28 text-white sm:px-6 sm:pt-32 lg:px-8"}>
      <div className="mx-auto max-w-7xl space-y-5">
        <p className="text-sm text-zinc-300">Loading Admin Operations &amp; Analytics…</p>
        <div aria-hidden="true" className="animate-pulse space-y-5 motion-reduce:animate-none">
          <div className="border-b border-white/10 pb-4"><div className="h-7 max-w-sm rounded bg-white/10" /><div className="mt-3 h-4 max-w-xs rounded bg-white/5" /></div>
          <div className="h-11 rounded-xl border border-white/10 bg-zinc-950" />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className={"h-24 rounded-xl border border-white/10 bg-zinc-950 " + (index === 0 ? "col-span-2 lg:col-span-1" : "")} />)}</div>
          <div className="space-y-2"><div className="h-5 w-40 rounded bg-white/10" />{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-20 rounded-xl border border-white/10 bg-zinc-950" />)}</div>
          <div className="h-28 rounded-xl border border-white/10 bg-zinc-950" />
          <div className="grid gap-2 sm:grid-cols-2"><div className="h-36 rounded-xl bg-zinc-950" /><div className="h-36 rounded-xl bg-zinc-950" /></div>
        </div>
      </div>
    </main>
  );
}
