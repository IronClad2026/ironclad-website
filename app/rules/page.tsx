"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  FileDown,
  Gavel,
  ScrollText,
  Shield,
  Swords,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

const PDF_1V1 = "/documents-rules-ppa/1v1 rulebook.pdf";
const PDF_4V4 = "/documents-rules-ppa/4v4 rulebook.pdf";
const PDF_PPA = "/documents-rules-ppa/ict ppa.pdf";

import { fadeUp } from "@/lib/animations";

type TabName = "1v1 Rules" | "4v4 Rules" | "PPA & Conduct";

const tabs: TabName[] = ["1v1 Rules", "4v4 Rules", "PPA & Conduct"];

const quickRules: {
  icon: LucideIcon;
  title: string;
  items: string[];
}[] = [
  {
    icon: Trophy,
    title: "1v1 Tournament Format",
    items: [
      "Main Bracket: 1300+ ELO",
      "Challenge Bracket: Below 1300 ELO",
      "Monthly tournaments",
      "ICT points system",
      "Bo3 matches / Bo5 finals",
    ],
  },

  {
    icon: Users,
    title: "4v4 Competitive Format",
    items: [
      "Team-based competition",
      "Beta/testing phase",
      "Structured registration",
      "Roster and substitute rules",
      "Competitive integrity standards",
    ],
  },
];

const ruleSections: Record<TabName, [string, string][]> = {
  "1v1 Rules": [
    [
      "Registration Rules",
      "Players must register before the deadline using the official tournament platform or Discord instructions. Accurate player information and current ELO may be required.",
    ],

    [
      "Bracket Structure",
      "The 1v1 format is divided into a Main Bracket for 1300+ ELO players and a Challenge Bracket for players below 1300 ELO.",
    ],

    [
      "Match Format",
      "Standard tournament matches are played as Bo3, with finals using Bo5 when specified by tournament staff.",
    ],

    [
      "ICT Points System",
      "Players earn IronClad Tournament Points through participation, placement, and consistent competitive performance.",
    ],

    [
      "Match Reporting",
      "Results must be reported through the correct Discord or tournament reporting channel with screenshots or replay proof when requested.",
    ],

    [
      "Conduct & Fair Play",
      "Players must respect opponents, admins, casters, and tournament integrity standards at all times.",
    ],
  ],

  "4v4 Rules": [
    [
      "Team Registration",
      "Teams must register with complete roster information before the announced deadline.",
    ],

    [
      "Roster Rules",
      "Each team must maintain a valid roster and follow all eligibility requirements listed in the official 4v4 rulebook.",
    ],

    [
      "Substitute Rules",
      "Substitutes may be allowed if approved by tournament staff and used within roster limitations.",
    ],

    [
      "Match Format",
      "4v4 matches follow structured competitive settings designed for team-based Company of Heroes 3 play.",
    ],

    [
      "Disconnect Rules",
      "Disconnects are handled by tournament admins based on evidence, timing, and competitive impact.",
    ],

    [
      "Team Conduct",
      "Teams are responsible for the conduct of every rostered player, substitute, and representative.",
    ],
  ],

  "PPA & Conduct": [
    [
      "Player Responsibilities",
      "Players are expected to read the official rules, communicate clearly, and follow tournament instructions.",
    ],

    [
      "Competitive Integrity",
      "Smurfing, cheating, match manipulation, abuse of exploits, or dishonest behavior may result in penalties.",
    ],

    [
      "Conduct Expectations",
      "Harassment, hate speech, threats, or toxic behavior toward players, staff, or casters is not tolerated.",
    ],

    [
      "Dispute Handling",
      "Disputes must be submitted respectfully with evidence. Tournament staff decisions are final unless otherwise stated.",
    ],

    [
      "Penalties",
      "Penalties may include warnings, match forfeits, point deductions, suspensions, or removal from IronClad events.",
    ],
  ],
};

const downloads: {
  icon: LucideIcon;
  title: string;
  text: string;
  href: string;
}[] = [
  {
    icon: ScrollText,
    title: "1v1 Rulebook",
    text: "Complete official regulations for IronClad 1v1 tournaments.",
    href: PDF_1V1,
  },

  {
    icon: Swords,
    title: "4v4 Rulebook",
    text: "Official team-based format, roster, substitute, and match rules.",
    href: PDF_4V4,
  },

  {
    icon: Gavel,
    title: "PPA Document",
    text: "Player participation agreement, conduct standards, and penalty framework.",
    href: PDF_PPA,
  },
];

export default function RulesPage() {
  const [activeTab, setActiveTab] = useState<TabName>("1v1 Rules");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section
        className="relative flex min-h-screen items-center justify-center bg-contain bg-center bg-no-repeat px-6 text-center"
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
          className="relative z-10 max-w-5xl"
        >
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-300">
            Official Rules Hub
          </p>

          <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-7xl">
            IronClad Tournament Rules
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-zinc-200">
            Competitive formats, player guidelines, and tournament regulations
            for Company of Heroes 3 events.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-4 md:flex-row">
            <a
              href={PDF_1V1}
              download
              className="rounded-xl bg-white px-6 py-3 font-semibold text-black transition hover:scale-105"
            >
              Download 1v1 Rulebook
            </a>

            <a
              href={PDF_PPA}
              download
              className="rounded-xl border border-zinc-500 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              Download PPA
            </a>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Quick Overview
          </p>

          <h2 className="mt-4 text-4xl font-bold">
            Tournament Rule Summary
          </h2>

          <p className="mt-6 text-zinc-300">
            A simplified overview of IronClad competitive formats. The official
            PDFs remain the final authority for disputes and formal decisions.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {quickRules.map((card) => {
            const Icon = card.icon;

            return (
              <motion.div
                key={card.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur"
              >
                <Icon className="mb-5 h-11 w-11 text-zinc-200" />

                <h3 className="text-2xl font-bold">{card.title}</h3>

                <ul className="mt-6 space-y-3">
                  {card.items.map((item) => (
                    <li key={item} className="flex gap-3 text-zinc-300">
                      <Shield className="mt-1 h-4 w-4 shrink-0 text-zinc-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Interactive Rules
          </p>

          <h2 className="mt-4 text-4xl font-bold">Rule Categories</h2>
        </div>

        <div className="mb-10 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 md:flex-row">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setOpenIndex(0);
              }}
              className={`relative flex-1 rounded-xl px-5 py-4 text-sm font-bold uppercase tracking-widest transition ${
                activeTab === tab
                  ? "text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {activeTab === tab && (
                <motion.span
                  layoutId="activeRuleTab"
                  className="absolute inset-0 rounded-xl bg-white"
                />
              )}

              <span className="relative z-10">{tab}</span>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {ruleSections[activeTab].map(([title, text], index) => (
            <motion.div
              key={title}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
            >
              <button
                onClick={() =>
                  setOpenIndex(openIndex === index ? null : index)
                }
                className="flex w-full items-center justify-between px-6 py-5 text-left"
              >
                <span className="text-lg font-bold">{title}</span>

                <ChevronDown
                  className={`h-5 w-5 text-zinc-400 transition ${
                    openIndex === index ? "rotate-180" : ""
                  }`}
                />
              </button>

              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="border-t border-white/10 px-6 py-5 leading-8 text-zinc-400">
                      {text}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Official Documents
          </p>

          <h2 className="mt-4 text-4xl font-bold">Download Full PDFs</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {downloads.map((document) => {
            const Icon = document.icon;

            return (
              <motion.div
                key={document.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="flex min-h-[170px] flex-col rounded-2xl border border-white/10 bg-white/5 p-7"
              >
                <Icon className="mb-5 h-11 w-11 text-zinc-200" />

                <h3 className="text-2xl font-bold">{document.title}</h3>

                <p className="mt-4 leading-7 text-zinc-400">
                  {document.text}
                </p>

                <a
                  href={document.href}
                  download
                  className="mt-4 inline-flex w-fit items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/10"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Download
                </a>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-28 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-8"
        >
          <AlertTriangle className="mx-auto mb-5 h-10 w-10 text-yellow-300" />

          <h2 className="text-3xl font-bold">Official Disclaimer</h2>

          <p className="mx-auto mt-5 max-w-3xl leading-8 text-zinc-300">
            This rules page is a simplified overview of IronClad tournament
            regulations. In case of disputes or inconsistencies, the official
            PDF rulebooks and Player Participation Agreement remain the final
            authority.
          </p>
        </motion.div>
      </section>
    </main>
  );
}