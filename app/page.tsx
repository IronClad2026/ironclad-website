export default function Home() {
  return (
    <main
      className="relative min-h-screen bg-contain bg-center bg-no-repeat text-white"
      style={{
        backgroundImage: "url('/images/ironclad-background.jpg')",
      }}
    >
      <div className="absolute inset-0 bg-black/70" />

      <section className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="max-w-3xl text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-300">
            Competitive Company of Heroes 3 Events
          </p>

          <h1 className="mt-6 text-6xl font-bold tracking-tight">
            IronClad Tournaments
          </h1>

          <p className="mt-6 text-lg text-zinc-200">
            Join a structured competitive community built around fair play,
            seasonal tournaments, rankings, and tactical excellence.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              className="rounded-xl bg-white px-6 py-3 font-semibold text-black transition hover:scale-105"
              href="#"
            >
              Join the Frontline
            </a>

            <a
              className="rounded-xl border border-zinc-500 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
              href="/tournaments"
            >
              View Current Events
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}