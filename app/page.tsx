import Navbar from "@/components/Navbar";
export default function Home() {
  return (
    <main
      className="relative min-h-screen bg-contain bg-center text-white"
      style={{
        backgroundImage: "url('/images/ironclad-background.jpg')",
      }}
    ><Navbar />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Content */}
      <section className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="max-w-3xl text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-300">
            Company of Heroes 3 Tournament Hub
          </p>

          <h1 className="mt-6 text-6xl font-bold tracking-tight">
            IronClad Tournaments
          </h1>

          <p className="mt-6 text-lg text-zinc-200">
            Competitive CoH 3 events, rankings, rules, and community-driven esports structure.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              className="rounded-xl bg-white px-6 py-3 font-semibold text-black transition hover:scale-105"
              href="#"
            >
              Join Discord
            </a>

            <a
              className="rounded-xl border border-zinc-500 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
              href="#"
            >
              View Current Events
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}