"use client";

import {
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  FileDown,
  Gavel,
  Radio,
  ScrollText,
  Shield,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

import { fadeUp } from "@/lib/animations";

const PDF_1V1 = "/documents-rules-ppa/1v1 rulebook.pdf";
const PDF_4V4 = "/documents-rules-ppa/4v4 rulebook.pdf";
const PDF_PPA = "/documents-rules-ppa/ict ppa.pdf";

type TabName = "1v1 Rules" | "4v4 Rules" | "PPA & Conduct";

const tabs: TabName[] = ["1v1 Rules", "4v4 Rules", "PPA & Conduct"];

const tabIds: Record<TabName, string> = {
  "1v1 Rules": "one-v-one-rules",
  "4v4 Rules": "four-v-four-rules",
  "PPA & Conduct": "ppa-conduct",
};

const tabDetails: Record<
  TabName,
  {
    icon: LucideIcon;
    eyebrow: string;
    title: string;
    description: string;
    document: string;
  }
> = {
  "1v1 Rules": {
    icon: Trophy,
    eyebrow: "Solo Competition",
    title: "1v1 Rules",
    description:
      "Bracket tiers, match formats, reporting duties, and ICT points for individual competition.",
    document: "1v1 Rulebook",
  },
  "4v4 Rules": {
    icon: Users,
    eyebrow: "Team Operations",
    title: "4v4 Rules",
    description:
      "Team registration, roster standards, substitutes, disconnect handling, and conduct expectations.",
    document: "4v4 Rulebook",
  },
  "PPA & Conduct": {
    icon: Gavel,
    eyebrow: "Player Agreement",
    title: "PPA & Conduct",
    description:
      "Player responsibilities, competitive integrity, dispute handling, and penalty framework.",
    document: "PPA Document",
  },
};

const operationsBriefing: {
  icon: LucideIcon;
  label: string;
  title: string;
  text: string;
}[] = [
  {
    icon: ShieldCheck,
    label: "Authority",
    title: "Official PDFs decide disputes",
    text: "Use this page for fast orientation, then rely on the rulebooks and PPA for formal decisions.",
  },
  {
    icon: Radio,
    label: "Navigation",
    title: "Start with your rule set",
    text: "Choose the active category before reading details so the page stays focused on your event.",
  },
  {
    icon: FileCheck2,
    label: "Integrity",
    title: "Evidence and conduct matter",
    text: "Match reports, replay proof, admin review, and respectful communication protect competition.",
  },
];

const quickRules: {
  icon: LucideIcon;
  title: string;
  items: string[];
}[] = [
  {
    icon: Trophy,
    title: "1v1 Tournament Format",
    items: [
      "Academy Bracket: Below 1100 ELO",
      "Challenge Bracket: 1100-1399 ELO",
      "Main / Elite Bracket: 1400+ ELO",
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
      "The 1v1 format is divided into Academy, Challenge, and Main / Elite brackets using non-overlapping ELO ranges.",
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
      "Results must be reported through the tournament reporting system with replay proof when requested.",
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
  const reduceMotion = useReducedMotion() ?? false;
  const [activeTab, setActiveTab] = useState<TabName>("1v1 Rules");
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectTab = (tab: TabName) => {
    setActiveTab(tab);
    setOpenIndex(0);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    const lastIndex = tabs.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    }

    if (event.key === "Home") {
      nextIndex = 0;
    }

    if (event.key === "End") {
      nextIndex = lastIndex;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    selectTab(tabs[nextIndex]);
    requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  };

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <HeroSection reduceMotion={reduceMotion} />
      <RuleCategorySelector
        activeTab={activeTab}
        onKeyDown={handleTabKeyDown}
        onSelect={selectTab}
        reduceMotion={reduceMotion}
        tabRefs={tabRefs}
      />
      <QuickBriefingSection reduceMotion={reduceMotion} />
      <RuleExplorerSection
        activeTab={activeTab}
        openIndex={openIndex}
        reduceMotion={reduceMotion}
        setOpenIndex={setOpenIndex}
      />
      <OfficialDocumentsSection reduceMotion={reduceMotion} />
      <DisclaimerSection reduceMotion={reduceMotion} />

    </main>
  );
}

function HeroSection({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section className="relative isolate flex min-h-[72svh] items-end overflow-hidden border-b border-orange-500/20 px-5 pt-28 pb-10 sm:min-h-[78vh] sm:px-8 sm:pt-32 sm:pb-14 lg:min-h-[88vh] lg:px-12">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
      />
      <TacticalBackdrop />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.34),rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.96),rgba(0,0,0,0.6),rgba(249,115,22,0.14))]" />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
        <motion.div
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          variants={fadeUp}
          transition={{ duration: reduceMotion ? 0 : 0.75, ease: "easeOut" }}
          className="max-w-5xl"
        >
          <p className="text-sm font-black uppercase text-orange-300">
            Official Rules Hub
          </p>
          <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[0.96] text-white sm:text-6xl lg:text-8xl">
            IronClad Tournament Rules
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-8 text-zinc-300 sm:text-lg">
            The tournament operations reference for Company of Heroes 3
            competitors. Choose your rule set, review the briefing, and download
            the official documents before match day.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <DocumentAction href={PDF_1V1} label="Download 1v1 Rulebook" />
            <DocumentAction href={PDF_4V4} label="Download 4v4 Rulebook" />
            <DocumentAction href={PDF_PPA} label="Download PPA" secondary />
          </div>
        </motion.div>

        <motion.aside
          initial={reduceMotion ? false : { opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.75, delay: 0.12 }}
          className="hidden border border-white/12 bg-black/50 p-5 shadow-2xl shadow-black/40 backdrop-blur lg:block"
          aria-label="Rules operations summary"
        >
          <div className="relative min-h-[400px] overflow-hidden bg-[linear-gradient(145deg,rgba(249,115,22,0.12),rgba(8,13,24,0.9))]">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:40px_40px]" />
            <div className="absolute inset-x-7 top-7 flex items-center justify-between text-xs font-black uppercase text-orange-200">
              <span>Tournament Operations</span>
              <Radio size={16} aria-hidden="true" />
            </div>
            <div className="absolute right-7 bottom-7 left-7">
              <div className="mb-5 h-1 w-24 bg-orange-400" />
              <p className="text-4xl font-black leading-none">
                RULES READY
              </p>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                Categories, rule summaries, conduct expectations, and official
                PDF downloads are available from a single command center.
              </p>
            </div>
          </div>
        </motion.aside>
      </div>
    </section>
  );
}

function RuleCategorySelector({
  activeTab,
  onKeyDown,
  onSelect,
  reduceMotion,
  tabRefs,
}: {
  activeTab: TabName;
  onKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => void;
  onSelect: (tab: TabName) => void;
  reduceMotion: boolean;
  tabRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 bg-[linear-gradient(180deg,#050505,#090909)] px-5 py-9 sm:px-8 lg:px-12">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/sfondi/2.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.76),rgba(0,0,0,0.93)),linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.58),rgba(0,0,0,0.9))]"
      />
      <TacticalBackdrop muted />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow="Choose Rule Set"
            title="Start with the rules that apply to your event."
            text="The selector controls the detailed rule explorer below and keeps the page focused on the competition format you need."
          />
          <p className="max-w-sm border-l border-orange-400/40 pl-4 text-sm leading-6 text-zinc-400">
            Active categories reset the rule explorer to the first item so the
            briefing starts from the top each time.
          </p>
        </div>

        <div
          aria-label="Rule categories"
          className="grid gap-3 md:grid-cols-3"
          role="tablist"
        >
          {tabs.map((tab, index) => {
            const details = tabDetails[tab];
            const Icon = details.icon;
            const isActive = activeTab === tab;

            return (
              <motion.button
                aria-controls="rule-panel"
                aria-selected={isActive}
                className={`group relative min-h-44 overflow-hidden border p-5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 ${
                  isActive
                    ? "border-orange-300 bg-orange-500/10 shadow-[0_0_36px_rgba(249,115,22,0.16)]"
                    : "border-white/12 bg-white/[0.035] hover:border-orange-300/50 hover:bg-orange-500/10"
                }`}
                id={`rule-tab-${tabIds[tab]}`}
                key={tab}
                onClick={() => onSelect(tab)}
                onKeyDown={(event) => onKeyDown(event, index)}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
                initial={reduceMotion ? false : "hidden"}
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={fadeUp}
                transition={{
                  duration: reduceMotion ? 0 : 0.45,
                  delay: reduceMotion ? 0 : index * 0.06,
                }}
              >
                {isActive && (
                  <motion.span
                    className="absolute inset-x-0 top-0 h-1 bg-orange-400"
                    layoutId="activeRuleTabMarker"
                  />
                )}

                <span className="relative z-10 flex h-full flex-col">
                  <span className="flex items-start justify-between gap-4">
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center border ${
                        isActive
                          ? "border-orange-300/70 bg-orange-500/20 text-orange-200"
                          : "border-white/12 bg-black/30 text-zinc-400 group-hover:text-orange-300"
                      }`}
                    >
                      <Icon size={20} aria-hidden="true" />
                    </span>

                    {isActive && (
                      <span className="inline-flex items-center gap-1 border border-orange-300/40 bg-orange-500/15 px-2.5 py-1 text-xs font-black uppercase text-orange-100">
                        <CheckCircle2 size={14} aria-hidden="true" />
                        Selected
                      </span>
                    )}
                  </span>

                  <span className="mt-5 text-xs font-black uppercase text-orange-300">
                    {details.eyebrow}
                  </span>
                  <span className="mt-2 text-2xl font-black text-white">
                    {details.title}
                  </span>
                  <span className="mt-3 text-sm leading-6 text-zinc-400">
                    {details.description}
                  </span>
                  <span className="mt-auto pt-5 text-xs font-black uppercase text-zinc-500">
                    Primary document: {details.document}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function QuickBriefingSection({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 px-5 py-20 sm:px-8 lg:px-12">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover"
        style={{
          backgroundImage: "url('/images/sfondi/6.jpg')",
          backgroundPosition: "center 48%",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.7)_45%,rgba(0,0,0,0.94)),linear-gradient(100deg,rgba(0,0,0,0.9),rgba(0,0,0,0.58),rgba(0,0,0,0.86))]"
      />
      <TacticalBackdrop muted />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <SectionHeading
            eyebrow="Quick Briefing"
            title="Read the operational summary before the detailed rules."
            text="This overview gives players a fast understanding of format, authority, and competitive expectations without replacing the official rulebooks."
          />

          <div className="grid gap-3 sm:grid-cols-3">
            {operationsBriefing.map((item, index) => {
              const Icon = item.icon;

              return (
                <motion.article
                  className="border border-white/12 bg-white/[0.045] p-5 backdrop-blur"
                  initial={reduceMotion ? false : "hidden"}
                  key={item.title}
                  transition={{
                    duration: reduceMotion ? 0 : 0.45,
                    delay: reduceMotion ? 0 : index * 0.06,
                  }}
                  variants={fadeUp}
                  viewport={{ once: true, margin: "-60px" }}
                  whileInView="visible"
                >
                  <Icon className="text-orange-300" size={26} aria-hidden="true" />
                  <p className="mt-5 text-xs font-black uppercase text-orange-300">
                    {item.label}
                  </p>
                  <h3 className="mt-2 text-lg font-black text-white">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {item.text}
                  </p>
                </motion.article>
              );
            })}
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {quickRules.map((card, index) => {
            const Icon = card.icon;

            return (
              <motion.article
                className="relative overflow-hidden border border-white/12 bg-zinc-950/70 p-6 transition hover:border-orange-400/50 hover:bg-zinc-950"
                initial={reduceMotion ? false : "hidden"}
                key={card.title}
                transition={{
                  duration: reduceMotion ? 0 : 0.5,
                  delay: reduceMotion ? 0 : index * 0.08,
                }}
                variants={fadeUp}
                viewport={{ once: true, margin: "-60px" }}
                whileInView="visible"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-orange-500/75" />
                <Icon className="mb-5 h-10 w-10 text-orange-300" aria-hidden="true" />
                <h3 className="text-2xl font-black text-white">{card.title}</h3>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {card.items.map((item) => (
                    <li
                      className="flex gap-3 text-sm leading-6 text-zinc-300"
                      key={item}
                    >
                      <Shield
                        className="mt-1 h-4 w-4 shrink-0 text-orange-300"
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RuleExplorerSection({
  activeTab,
  openIndex,
  reduceMotion,
  setOpenIndex,
}: {
  activeTab: TabName;
  openIndex: number | null;
  reduceMotion: boolean;
  setOpenIndex: (index: number | null) => void;
}) {
  const activeDetails = tabDetails[activeTab];
  const activeTabId = tabIds[activeTab];
  const ActiveIcon = activeDetails.icon;

  return (
    <section className="relative isolate overflow-hidden border-b border-orange-500/15 bg-[linear-gradient(180deg,#050505,#0b0b0b)] px-5 py-20 sm:px-8 lg:px-12">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover"
        style={{
          backgroundImage: "url('/images/sfondi/3.jpg')",
          backgroundPosition: "58% center",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.84),rgba(0,0,0,0.7)_42%,rgba(0,0,0,0.96)),linear-gradient(110deg,rgba(0,0,0,0.95),rgba(0,0,0,0.66),rgba(37,18,8,0.92))]"
      />
      <div className="absolute inset-y-0 left-0 w-px bg-orange-500/50" />
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[0.78fr_1fr] lg:items-end">
          <SectionHeading
            eyebrow="Rule Explorer"
            title="Detailed rules without the wall of text."
            text="Accordion sections keep the active category readable while preserving access to every existing rule summary."
          />

          <Panel className="p-5">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300">
                <ActiveIcon size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-black uppercase text-orange-300">
                  Active Ruleset
                </p>
                <h3 className="mt-1 text-2xl font-black text-white">
                  {activeDetails.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {activeDetails.description}
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div
          aria-labelledby={`rule-tab-${activeTabId}`}
          className="mt-10 space-y-3"
          id="rule-panel"
          role="tabpanel"
        >
          {ruleSections[activeTab].map(([title, text], index) => {
            const isOpen = openIndex === index;
            const triggerId = `rule-trigger-${activeTabId}-${index}`;
            const panelId = `rule-content-${activeTabId}-${index}`;

            return (
              <motion.article
                className={`overflow-hidden border transition ${
                  isOpen
                    ? "border-orange-300/50 bg-orange-500/[0.055]"
                    : "border-white/12 bg-white/[0.035] hover:border-orange-300/40"
                }`}
                initial={reduceMotion ? false : "hidden"}
                key={title}
                transition={{
                  duration: reduceMotion ? 0 : 0.42,
                  delay: reduceMotion ? 0 : index * 0.035,
                }}
                variants={fadeUp}
                viewport={{ once: true, margin: "-60px" }}
                whileInView="visible"
              >
                <button
                  aria-controls={panelId}
                  aria-expanded={isOpen}
                  className="flex min-h-16 w-full items-center justify-between gap-5 px-5 py-5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 sm:px-6"
                  id={triggerId}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  type="button"
                >
                  <span className="flex items-center gap-4">
                    <span
                      className={`hidden h-9 w-1 shrink-0 sm:block ${
                        isOpen ? "bg-orange-400" : "bg-white/12"
                      }`}
                    />
                    <span className="text-base font-black text-white sm:text-lg">
                      {title}
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-5 w-5 shrink-0 text-orange-300 transition ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      id={panelId}
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      role="region"
                      aria-labelledby={triggerId}
                      transition={{ duration: reduceMotion ? 0 : 0.24 }}
                    >
                      <p className="border-t border-white/10 px-5 py-5 text-sm leading-7 text-zinc-300 sm:px-6 sm:text-base sm:leading-8">
                        {text}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function OfficialDocumentsSection({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 px-5 py-20 sm:px-8 lg:px-12">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover"
        style={{
          backgroundImage: "url('/images/sfondi/7.jpg')",
          backgroundPosition: "center center",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.88),rgba(0,0,0,0.68)_48%,rgba(0,0,0,0.94)),linear-gradient(105deg,rgba(0,0,0,0.92),rgba(0,0,0,0.62),rgba(0,0,0,0.88))]"
      />
      <TacticalBackdrop muted />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-12 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow="Official Documents"
            title="Download the source of truth."
            text="These files remain the official authority for tournament operations, conduct standards, and dispute resolution."
          />
          <p className="max-w-sm border-l border-orange-400/40 pl-4 text-sm leading-6 text-zinc-400">
            Keep the relevant rulebook available before, during, and after
            tournament matches.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {downloads.map((file, index) => {
            const Icon = file.icon;

            return (
              <motion.article
                className="group relative flex min-h-[260px] flex-col overflow-hidden border border-white/12 bg-zinc-950/75 p-6 transition hover:border-orange-300/50 hover:bg-zinc-950"
                initial={reduceMotion ? false : "hidden"}
                key={file.title}
                transition={{
                  duration: reduceMotion ? 0 : 0.5,
                  delay: reduceMotion ? 0 : index * 0.08,
                }}
                variants={fadeUp}
                viewport={{ once: true, margin: "-60px" }}
                whileInView="visible"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-orange-500/75" />
                <div className="flex items-start justify-between gap-4">
                  <span className="grid h-12 w-12 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300">
                    <Icon size={23} aria-hidden="true" />
                  </span>
                  <span className="border border-white/12 bg-white/[0.04] px-2.5 py-1 text-xs font-black uppercase text-zinc-300">
                    Official Source
                  </span>
                </div>

                <h3 className="mt-7 text-2xl font-black text-white">
                  {file.title}
                </h3>
                <p className="mt-4 flex-1 text-sm leading-7 text-zinc-400">
                  {file.text}
                </p>

                <a
                  aria-label={`Download ${file.title}`}
                  className="mt-7 inline-flex min-h-11 w-fit items-center justify-center gap-2 border border-orange-400/50 bg-orange-500/10 px-4 py-2 text-sm font-black text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                  download
                  href={file.href}
                >
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  Download PDF
                </a>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DisclaimerSection({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section className="relative isolate overflow-hidden px-5 py-20 sm:px-8 lg:px-12">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover"
        style={{
          backgroundImage: "url('/images/sfondi/8.jpg')",
          backgroundPosition: "center 46%",
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.62),rgba(0,0,0,0.95)),linear-gradient(115deg,rgba(249,115,22,0.1),transparent_50%)]" />
      <TacticalBackdrop muted />
      <div className="relative z-10 mx-auto max-w-5xl">
        <motion.div
          className="border border-amber-300/25 bg-amber-400/[0.055] p-6 text-left shadow-2xl shadow-black/30 sm:p-8"
          initial={reduceMotion ? false : "hidden"}
          transition={{ duration: reduceMotion ? 0 : 0.55 }}
          variants={fadeUp}
          viewport={{ once: true, margin: "-60px" }}
          whileInView="visible"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <span className="grid h-12 w-12 shrink-0 place-items-center border border-amber-300/40 bg-amber-300/10 text-amber-200">
              <AlertTriangle size={24} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase text-amber-200">
                Final Authority
              </p>
              <h2 className="mt-2 text-3xl font-black text-white">
                Official Disclaimer
              </h2>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
                This rules page is a simplified overview of IronClad tournament
                regulations. In case of disputes or inconsistencies, the
                official PDF rulebooks and Player Participation Agreement remain
                the final authority.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function DocumentAction({
  href,
  label,
  secondary = false,
}: {
  href: string;
  label: string;
  secondary?: boolean;
}) {
  return (
    <a
      className={`inline-flex min-h-12 items-center justify-center gap-2 border px-5 py-3 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 ${
        secondary
          ? "border-white/20 bg-white/[0.035] text-white backdrop-blur hover:border-orange-300/70 hover:bg-orange-500/10"
          : "border-orange-400 bg-orange-500 text-black hover:border-orange-300 hover:bg-orange-300"
      }`}
      download
      href={href}
    >
      {label}
      <FileDown size={17} aria-hidden="true" />
    </a>
  );
}

function SectionHeading({
  eyebrow,
  text,
  title,
}: {
  eyebrow: string;
  text: string;
  title: string;
}) {
  return (
    <div className="max-w-4xl">
      <p className="text-sm font-black uppercase text-orange-300">{eyebrow}</p>
      <h2 className="mt-4 text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      <p className="mt-6 max-w-3xl text-base leading-8 text-zinc-300">
        {text}
      </p>
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border border-white/12 bg-white/[0.045] shadow-2xl shadow-black/25 backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

function TacticalBackdrop({ muted = false }: { muted?: boolean }) {
  return (
    <>
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:52px_52px] ${
          muted ? "opacity-20" : "opacity-30"
        }`}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(125deg,transparent_0%,transparent_42%,rgba(249,115,22,0.14)_42%,transparent_58%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute top-1/4 right-8 hidden h-24 w-px bg-orange-400/50 lg:block"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-1/4 left-8 hidden h-px w-36 bg-orange-400/50 lg:block"
      />
    </>
  );
}