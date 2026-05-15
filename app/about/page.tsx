import Navbar from "@/components/Navbar";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      <section className="mx-auto max-w-5xl px-6 pt-32 pb-20">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
          About IronClad
        </p>

        <h1 className="mt-4 text-5xl font-bold">Competitive Structure. Fair Play. Community.</h1>

        <p className="mt-6 max-w-3xl text-zinc-300">
          IronClad is a competitive Company of Heroes 3 tournament initiative
          focused on structured events, balanced competition, community growth,
          and long-term esports development.
        </p>

        <p className="mt-6 max-w-3xl text-zinc-300">
          Our goal is to create a professional competitive environment where
          players can improve, compete, and participate in meaningful seasonal
          events supported by transparent rules and consistent organization.
        </p>
      </section>
    </main>
  );
}