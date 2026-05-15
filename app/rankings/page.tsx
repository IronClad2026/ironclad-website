import Navbar from "@/components/Navbar";

export default function RankingsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      <section className="mx-auto max-w-5xl px-6 pt-32 pb-20">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
          IronClad Competitive Ladder
        </p>

        <h1 className="mt-4 text-5xl font-bold">Rankings</h1>

        <p className="mt-6 max-w-2xl text-zinc-300">
          Player standings, tournament points, seasonal performance, and future
          IronClad competitive rankings will be displayed here.
        </p>
      </section>
    </main>
  );
}