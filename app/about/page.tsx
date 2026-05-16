"use client";

import { motion } from "framer-motion";
import { Shield, Trophy, Users, Target, Swords } from "lucide-react";
import PageHero from "@/components/PageHero";

import { fadeUp } from "@/lib/animations";

const pillars = [
  {
    icon: Trophy,
    title: "Structured Competition",
    text: "Organized Company of Heroes 3 tournaments with clear formats, rules, and competitive standards.",
  },
  {
    icon: Shield,
    title: "Fair Play",
    text: "Transparent rule enforcement, anti-smurf standards, and consistent tournament procedures.",
  },
  {
    icon: Users,
    title: "Community Growth",
    text: "A long-term competitive home for players who want to improve, compete, and contribute.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <PageHero
  eyebrow="About IronClad"
  title="Built for Competitive COH3"
  description="IronClad is a tournament initiative focused on structured events, fair play, rankings, and long-term competitive development for Company of Heroes 3."
/>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Our Foundation
          </p>

          <h2 className="mt-4 text-4xl font-bold">What IronClad Stands For</h2>

          <p className="mt-6 text-zinc-300">
            IronClad exists to give competitive players a serious, organized,
            and transparent environment where tournaments feel consistent,
            fair, and worth competing in.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;

            return (
              <motion.div
                key={pillar.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur"
              >
                <Icon className="mb-5 h-11 w-11 text-zinc-200" />

                <h3 className="text-2xl font-bold">{pillar.title}</h3>

                <p className="mt-4 leading-7 text-zinc-400">{pillar.text}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-20 md:grid-cols-2 md:items-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
        >
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Competitive Identity
          </p>

          <h2 className="mt-4 text-4xl font-bold">
            More than a bracket. A competitive ecosystem.
          </h2>

          <p className="mt-6 leading-8 text-zinc-300">
            IronClad is not just a place to register for matches. It is being
            built as a structured competitive environment with rulebooks,
            rankings, seasonal progression, community standards, and future
            tournament systems.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-white/10 bg-white/5 p-8"
        >
          <Swords className="mb-6 h-12 w-12 text-zinc-200" />

          <h3 className="text-3xl font-bold">Our Current Focus</h3>

          <ul className="mt-6 space-y-4 text-zinc-300">
            <li>• Monthly 1v1 tournament structure</li>
            <li>• Main and Challenge bracket formats</li>
            <li>• 4v4 competitive testing</li>
            <li>• ICT points and rankings foundation</li>
            <li>• Long-term esports platform development</li>
          </ul>
        </motion.div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-28 text-center">
        <Target className="mx-auto mb-6 h-12 w-12 text-zinc-300" />

        <h2 className="text-4xl font-bold">Long-Term Vision</h2>

        <p className="mx-auto mt-6 max-w-3xl leading-8 text-zinc-300">
          Our goal is to grow IronClad into a trusted competitive hub with
          seasonal events, rankings, media coverage, team formats, and
          eventually custom tournament systems owned by the IronClad brand.
        </p>
      </section>
    </main>
  );
}