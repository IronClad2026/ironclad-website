"use client";

import PageHero from "@/components/PageHero";
import { motion } from "framer-motion";
import { CalendarDays, Gamepad2, Swords, Trophy } from "lucide-react";
import TournamentCard from "@/components/TournamentCard";

import { fadeUp } from "@/lib/animations";

export default function TournamentsPage() {
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
            Current Events
          </p>

          <h2 className="mt-4 text-4xl font-bold">Active Tournament Formats</h2>

          <p className="mt-6 text-zinc-300">
            IronClad currently focuses on monthly 1v1 events, split by player
            level, while preparing structured 4v4 competitive formats.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <TournamentCard
            title="IronClad 1v1 Main Bracket"
            format="1v1"
            game="Company of Heroes 3"
            status="Active Format"
            description="Competitive 1v1 bracket designed for higher-level players above the required ELO threshold."
          />

          <TournamentCard
            title="IronClad 1v1 Challenge Bracket"
            format="1v1"
            game="Company of Heroes 3"
            status="Active Format"
            description="Competitive bracket for developing players below the Main Bracket ELO threshold."
          />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-20 md:grid-cols-3">
        {[
          {
            icon: Trophy,
            title: "Monthly Events",
            text: "Regular tournament cycles designed to build consistency and competitive momentum.",
          },
          {
            icon: Swords,
            title: "Skill-Based Brackets",
            text: "Main and Challenge divisions help create fairer and more meaningful matches.",
          },
          {
            icon: CalendarDays,
            title: "Seasonal Progression",
            text: "Tournament results can support future ICT points, rankings, and seasonal standings.",
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <motion.div
              key={item.title}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur"
            >
              <Icon className="mb-5 h-11 w-11 text-zinc-200" />
              <h3 className="text-2xl font-bold">{item.title}</h3>
              <p className="mt-4 leading-7 text-zinc-400">{item.text}</p>
            </motion.div>
          );
        })}
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-28 text-center">
        <Gamepad2 className="mx-auto mb-6 h-12 w-12 text-zinc-300" />

        <h2 className="text-4xl font-bold">4v4 Format in Development</h2>

        <p className="mx-auto mt-6 max-w-3xl leading-8 text-zinc-300">
          IronClad is also exploring structured 4v4 events, team registration,
          roster rules, and competitive procedures for larger-scale Company of
          Heroes 3 tournaments.
        </p>
      </section>
    </main>
  );
}