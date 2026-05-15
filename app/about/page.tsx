"use client";

import { motion } from "framer-motion";
import { Shield, Trophy, Users, Target } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 35 },
  visible: { opacity: 1, y: 0 },
};

const cards = [
  {
    icon: Trophy,
    title: "Structured Competition",
    text: "Monthly Company of Heroes 3 tournaments with clear formats, rules, and competitive standards.",
  },
  {
    icon: Shield,
    title: "Fair Play",
    text: "IronClad is built around transparent rules, anti-smurf standards, and consistent tournament procedures.",
  },
  {
    icon: Users,
    title: "Community Growth",
    text: "A competitive environment designed to help players improve, compete, and participate long term.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section
        className="relative flex min-h-screen items-center justify-center bg-contain bg-center bg-no-repeat px-6"
        style={{
          backgroundImage: "url('/images/ironclad-background.jpg')",
        }}
      >
        <div className="absolute inset-0 bg-black/70" />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          transition={{ duration: 0.7 }}
          className="relative z-10 max-w-4xl text-center"
        >
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-300">
            About IronClad
          </p>

          <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-7xl">
            Competitive Structure. Fair Play. Community.
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-zinc-200">
            IronClad is building a structured competitive home for Company of
            Heroes 3 players through organized events, clear rules, rankings,
            and long-term esports development.
          </p>
        </motion.div>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Our Identity
          </p>

          <h2 className="mt-4 text-4xl font-bold">What IronClad Stands For</h2>

          <p className="mt-6 text-zinc-300">
            IronClad exists to give competitive Company of Heroes 3 players a
            more organized, fair, and consistent tournament environment.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <motion.div
                key={card.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur"
              >
                <Icon className="mb-5 h-10 w-10 text-zinc-200" />

                <h3 className="text-2xl font-bold">{card.title}</h3>

                <p className="mt-4 leading-7 text-zinc-400">{card.text}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24 text-center">
        <Target className="mx-auto mb-6 h-12 w-12 text-zinc-300" />

        <h2 className="text-4xl font-bold">Long-Term Vision</h2>

        <p className="mx-auto mt-6 max-w-3xl leading-8 text-zinc-300">
          Our long-term goal is to grow IronClad into a trusted competitive hub
          with seasonal events, rankings, content coverage, team formats, and
          eventually custom tournament systems.
        </p>
      </section>
    </main>
  );
}