"use client";

import Link from "next/link";
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
  Download,
  FileCheck2,
  Gavel,
  Radio,
  ScrollText,
  Shield,
  ShieldCheck,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { fadeUp } from "@/lib/animations";
import {
  legalCorpus,
  resolveEffectiveDateToken,
  type LegalDocumentKind,
} from "@/lib/legal-corpus-publication";

type TabName = "1V1 RULES" | "RANKINGS & SEASONS" | "PPA & CONDUCT";

const tabs: TabName[] = [
  "1V1 RULES",
  "RANKINGS & SEASONS",
  "PPA & CONDUCT",
];

const tabIds: Record<TabName, string> = {
  "1V1 RULES": "one-v-one-rules",
  "RANKINGS & SEASONS": "rankings-seasons",
  "PPA & CONDUCT": "ppa-conduct",
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
  "1V1 RULES": {
    icon: Trophy,
    eyebrow: "Solo Competition",
    title: "1V1 RULES",
    description:
      "IronClad launch Tournaments are free CoH3 1v1 Events with separate eight-Player Academy, Challenge and Main / Pro Divisions. Quarterfinals and semifinals are BO3; the grand final is BO5.",
    document: "Rulebook v3.0",
  },
  "RANKINGS & SEASONS": {
    icon: ScrollText,
    eyebrow: "Competitive Record",
    title: "RANKINGS & SEASONS",
    description:
      "Academy and Challenge maintain permanent Career standings. Main / Pro uses six-valid-Event seasons. Only genuine played competition creates played statistics.",
    document: "Rulebook sections 13-14",
  },
  "PPA & CONDUCT": {
    icon: Gavel,
    eyebrow: "Player Agreement",
    title: "PPA & CONDUCT",
    description:
      "The PPA governs eligibility, account ownership, conduct, evidence cooperation, privacy-facing obligations, sanctions, media and conditional prizes. Detailed Game procedure remains in the Rulebook.",
    document: "PPA v3.0",
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
    label: "Document Status",
    title: "Approved governing corpus",
    text: `The Rulebook, PPA, Terms and Privacy Policy are Effective from ${legalCorpus.effectiveDateDisplay}. Registration uses their exact versioned records.`,
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
    title: "Plain language, exact boundaries",
    text: "This guide summarises current native 1v1 competition and clearly separates platform-enforced features from player-managed rules.",
  },
];

const ruleSections: Record<TabName, [string, string][]> = {
  "1V1 RULES": [
    [
      "Eligibility & Native Registration",
      "Registration is free and native to IronClad. Players must be 18 or older, use their own authenticated IronClad and linked Steam accounts, complete fresh Relic 1v1 verification, and accept the exact governing-document versions presented. Discord is not required.",
    ],
    [
      "ELO Snapshot & Division",
      "The highest valid current Relic 1v1 faction ELO determines Academy (0-1099), Challenge (1100-1399), or Main / Pro (1400+). IronClad stores that eligibility as an immutable Event registration snapshot, so later live ELO changes do not move the Player for that Event.",
    ],
    [
      "Review, Waitlist & Launch",
      "The first eight valid registrations enter the Active Review Cohort; later eligible Players may join the FIFO Waitlist. A vacancy offer uses the exact deadline shown by IronClad and returns an accepting Player to review. A Division launches only with exactly eight approved Players, a ready bracket, and its required published map pool.",
    ],
    [
      "Series & Lobby Settings",
      "Each Division is an eight-Player single-elimination bracket. Quarterfinals and semifinals are BO3; the grand final is BO5. Players manually configure 1v1, 575 Victory Points, Standard Resources, Random starting positions, and Cheats disabled. IronClad does not configure or validate the CoH3 lobby.",
    ],
    [
      "Published Map Pool",
      "Each Division uses a published pool of at least five active 1v1 Maps. It may be republished before launch and freezes when the Division launches. After launch, only an audited technical-issue, exploit, game-update, or competitive-integrity correction may replace a Map. Poll finalisation does not change the pool automatically.",
    ],
    [
      "Dice & Manual Side/Map",
      "Each Player initiates their own authenticated 2d6 for Games 1, 3, and 5; Games 3 and 5 may be pre-rolled, and a tie requires both Players to complete another authenticated round. The winner chooses Side or an eligible unused Map, and the opponent chooses the remaining item. Each Player may use any permitted faction within the assigned Side. In even Games, Players swap Sides and the preceding Game loser chooses a new Map. Maps normally do not repeat. IronClad records Dice history, not Side or Map choices.",
    ],
    [
      "Scheduling & Communication",
      "Make reasonable first contact as soon as practicable, normally within 24 hours after the Match becomes available; missing that target alone is not an automatic forfeit. Request Admin Assistance after 48 hours without a response, or earlier if the deadline may be jeopardised. IronClad notifications and Admin Assistance are platform fallbacks; Discord is optional, and Steam may be used where reasonably available outside IronClad.",
    ],
    [
      "Pauses & Disconnects",
      "Each Player may take one reasonable pause per Game for a genuine technical or urgent issue, normally for up to five minutes; another or longer pause needs opponent agreement or Admin approval. A genuine disconnect before 10:00 normally means restart, subject to the approved fairness exceptions. At or after 10:00 there is no automatic winner: preserve the replay and request an Admin ruling.",
    ],
    [
      "Results & Replay Proof",
      "Report the Series winner and final score through IronClad with one unique CoH3 `.rec` for every Game actually played, up to 10 MiB each. Replays are private. Screenshots are not accepted as substitute Match-result proof; separate supplemental material may be requested only for a dispute or integrity investigation.",
    ],
    [
      "Confirmation, Disputes & No-Shows",
      "The opponent may confirm or dispute a report before the displayed deadline, after which an undisputed report may be confirmed automatically. Disputes go to Admin review. A no-show is not self-awarded, and a bye, walkover, no-show, empty feeder, or double forfeit does not create fake played statistics.",
    ],
  ],
  "RANKINGS & SEASONS": [
    [
      "Points by Division",
      "Academy and Challenge award 10 participation points, 2 points per round passed, and 3 points for a Tournament win. Main / Pro awards 10 participation points, 5 points per round passed, and 5 points for a Tournament win.",
    ],
    [
      "Genuine Play",
      "Played-Match totals, wins, losses, and win rate include only genuine completed Series between two Players. No-shows, automatic byes, walkovers, empty feeders, and double forfeits do not create played statistics, although legitimate non-played advancement may still earn approved round-passed points.",
    ],
    [
      "Career Standings",
      "Academy and Challenge maintain separate permanent Career standings. They do not reset when a Main / Pro season ends.",
    ],
    [
      "Career Catch-Up",
      "Academy and Challenge may award +5 points for each prior eligible missed completed Event in the same Division, up to +25. The award is available once per Player per Division and never applies to Main / Pro.",
    ],
    [
      "Main / Pro Season",
      "A Main / Pro season consists of exactly six valid qualifying Events. Event seven begins the next season, and the standings freeze after the sixth valid Event is scored unless a later integrity review places the season under review.",
    ],
    [
      "Ranking & True Ties",
      "Ranking order is total points, Tournament wins, rounds passed, exact genuine-Match win rate, then genuine Match wins. Players still equal on every competitive key share the same official rank. Names, display order, or internal IDs do not break a true tie.",
    ],
    [
      "Conditional Prizes",
      "A leaderboard rank is not automatically a prize position. Any prize-bearing Event is governed separately by Prize Terms published before registration. If a true tie crosses prize positions and no different fair method was published before registration, the crossed allocations are combined and divided equally among the tied Players. No unpublished leaderboard tie-break may be invented.",
    ],
  ],
  "PPA & CONDUCT": [
    [
      "Eligibility & Own Accounts",
      "Players must be at least 18, use their own IronClad and linked Steam accounts, provide accurate eligibility information, and complete the presented declarations. Account sharing, impersonation, unauthorised substitution, smurfing for bracket manipulation, and duplicate registration are prohibited.",
    ],
    [
      "Optional Discord & Coordination",
      "Discord is optional but recommended. IronClad notifications and the match-scoped Admin Assistance feature are the guaranteed platform fallbacks; Steam may be used where reasonably available outside IronClad. Public Discord visibility is a separate opt-in.",
    ],
    [
      "Conduct & Integrity",
      "Players must compete honestly and respectfully. Cheating, match manipulation, exploit abuse, stream sniping, harassment, evidence destruction, fraudulent voting, and deliberate scheduling or technical obstruction may result in proportionate sanctions.",
    ],
    [
      "Poll Participation",
      "A Tournament Poll declares its scope and Advisory or Binding status before voting, and its eligible audience freezes at publication. Each eligible Player may revise one authenticated current ballot, with selections up to the published limit, until close. Advisory voting informs the final Admin decision. Binding voting determines the configured top-K outcome with no quorum but requires at least one valid ballot; a zero-ballot Poll is cancelled or replaced, and a cutoff tie is resolved only among the tied cutoff options. Individual ballot attribution is private. Eligible Players may see aggregates according to configured live or after-close visibility; anonymous public totals exist only when explicitly enabled. The final Published Decision may be public, but finalisation does not automatically alter another subsystem.",
    ],
    [
      "Evidence & Admin Review",
      "Players must use reporting and dispute tools honestly and cooperate with proportionate evidence requests. Admins may review private replays, Match metadata, submitted communications, and other reliable material, but do not require account passwords, authentication codes, or unrestricted access to personal devices.",
    ],
    [
      "Privacy & Public History",
      "Optional public-profile visibility is separate from factual competition history. Private replays, Poll records, disputes, and Admin-review material remain access-controlled. Account closure may pseudonymise a history-bearing account rather than erase official brackets, results, and standings.",
    ],
    [
      "Streaming & Media",
      "A permitted personal live stream uses at least a two-minute delay unless a published Event or broadcast instruction requires longer or expressly waives the default. Official broadcast and integrity requirements take priority. Final media and privacy obligations remain subject to the approved governing documents.",
    ],
    [
      "Event Prizes",
      "Participation is free and not every Event has prizes. A prize-bearing Event must publish its gross amount, currency, allocation, material eligibility, fees, supported payout method, and expected timeframe before registration. Payout may be administered manually.",
    ],
    [
      "Versioned Acceptance",
      "Registration records the exact accepted Rulebook, PPA, and Terms versions; the acknowledged Privacy Policy version; authenticated identity; server acceptance time; the 18+ declaration; and own-account confirmations. Registration is available only while one complete approved document set is Effective.",
    ],
  ],
};

const documentIcons: Record<LegalDocumentKind, LucideIcon> = {
  rulebook: ScrollText,
  ppa: Gavel,
  terms: FileCheck2,
  privacy: Shield,
};

const documentStatuses = legalCorpus.documents.map((document) => ({
  icon: documentIcons[document.kind],
  kind: document.kind,
  title: document.shortTitle,
  version: `Version ${document.version}`,
  status: document.status,
  text: resolveEffectiveDateToken(document.subtitle),
  href: document.publicPath,
  filename: document.filename,
  readHref:
    document.kind === "terms"
      ? "/terms"
      : document.kind === "privacy"
        ? "/privacy"
        : document.publicPath,
}));

const faqs: [string, string][] = [
  [
    "How do I register?",
    "Registration is free and native to IronClad. Sign in, complete the required profile fields, link your own Steam account, complete fresh Relic 1v1 verification, choose the eligible open Division, confirm that you are 18 or older and using your own accounts, and accept the exact Effective governing-document versions shown.",
  ],
  [
    "How is my Division determined?",
    "IronClad uses the highest valid current 1v1 faction ELO returned by the authoritative Relic lookup: Academy is 0-1099, Challenge is 1100-1399, and Main / Pro is 1400+. The server stores an immutable registration snapshot, so later live ELO changes do not move that Event entry.",
  ],
  [
    "Is Discord required?",
    "No. Discord is optional but recommended. IronClad notifications and the match-scoped Admin Assistance feature provide platform fallbacks. Steam may be used where reasonably available. Public Discord visibility is a separate opt-in.",
  ],
  [
    "What happens if a Division is full?",
    "Later eligible Players may join the FIFO Waitlist after the eight Active Review places are occupied. If a place opens before launch, IronClad offers it to the oldest eligible waitlisted Player until the exact displayed deadline. Acceptance returns the Player to review; it does not guarantee approval. A Division launches only with exactly eight approved Players.",
  ],
  [
    "How does the map pool work?",
    "Each Division has a published pool of at least five active 1v1 Maps. It may be republished before launch and freezes at launch. After launch, only an audited correction for a technical issue, exploit, game update, or competitive-integrity reason may replace a Map. A Poll decision does not change the pool automatically.",
  ],
  [
    "How do Dice, Side and Map choices work?",
    "Each Player initiates their own authenticated 2d6 for Games 1, 3, and 5; Games 3 and 5 may be pre-rolled, and tied totals require another authenticated round. The higher total chooses Side or an eligible unused Map, and the opponent chooses the remaining item. Each Player may use any permitted faction within the assigned Side. For Games 2 and 4, Players swap Sides and the preceding Game loser chooses a new Map. Maps normally do not repeat. IronClad stores Dice history, not Side or Map choices.",
  ],
  [
    "What are the scheduling and technical expectations?",
    "Make reasonable first contact as soon as practicable, normally within 24 hours; missing that target alone is not an automatic forfeit. Request Admin Assistance after 48 hours without a response or earlier if the deadline is at risk. Each Player may normally take one genuine pause per Game for up to five minutes. A genuine pre-10:00 disconnect normally restarts subject to the approved exceptions; at or after 10:00 there is no automatic winner, so preserve the replay and request an Admin ruling.",
  ],
  [
    "Which replay files are required?",
    "Upload one unique CoH3 `.rec` for every Game actually played, up to 10 MiB each. Replays are private. Screenshots are not accepted as substitute Match-result proof; separate supplemental material may be requested only for a dispute or integrity investigation.",
  ],
  [
    "What happens after a result or no-show report?",
    "The opponent may confirm or dispute before the displayed deadline. An undisputed report may then confirm automatically; a dispute goes to Admin review. A no-show is never self-awarded. Confirmed no-shows and other non-played advancement do not create fake played-Match statistics.",
  ],
  [
    "How do standings work?",
    "Academy and Challenge build permanent Career standings; Main / Pro uses exactly six valid qualifying Events per season. Rankings use total points, Tournament wins, rounds passed, exact genuine-Match win rate, then genuine Match wins. Players still equal on every key share the same official rank.",
  ],
  [
    "What is Advisory versus Binding?",
    "An Advisory Poll informs the final Admin decision. A Binding Poll has no quorum and determines its configured top-K outcome once at least one valid ballot exists; a zero-ballot Binding Poll is cancelled or replaced. Individual ballot attribution is private. Eligible Players see aggregate totals according to the configured live or after-close visibility, while anonymous public totals exist only when explicitly enabled. The final Published Decision may be public, but finalisation does not automatically change another subsystem.",
  ],
  [
    "Does every Tournament have prizes?",
    "No. Participation is free, and a leaderboard rank is not automatically a prize position. Before registration opens for a prize-bearing Event, its Tournament Page or Prize Terms must publish the gross amount, currency, allocation, eligibility, fees, supported payout method, and expected timeframe. Payout may be administered manually.",
  ],
];

export default function RulesPage() {
  const reduceMotion = useReducedMotion() ?? false;
  const [activeTab, setActiveTab] = useState<TabName>("1V1 RULES");
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
      <QuickBriefingSection
        activeTab={activeTab}
        reduceMotion={reduceMotion}
      />
      <RuleExplorerSection
        activeTab={activeTab}
        openIndex={openIndex}
        reduceMotion={reduceMotion}
        setOpenIndex={setOpenIndex}
      />
      <OfficialDocumentsSection reduceMotion={reduceMotion} />
      <FaqSection reduceMotion={reduceMotion} />
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
            OFFICIAL RULES HUB
          </p>
          <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[0.96] text-white sm:text-6xl lg:text-8xl">
            IRONCLAD COMPETITION RULES
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-8 text-zinc-300 sm:text-lg">
            Start with the plain-language briefing, then use the versioned
            Rulebook and Player Participation Agreement for the governing text.
          </p>

          <div
            className="mt-9 w-fit border border-emerald-300/35 bg-emerald-300/10 px-4 py-3 text-sm font-black uppercase tracking-wide text-emerald-100"
            role="status"
          >
            Effective · {legalCorpus.effectiveDateDisplay}
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
                GOVERNING CORPUS
              </p>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                Four approved, versioned documents are Effective from
                {` ${legalCorpus.effectiveDateDisplay}`}.
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
    <section
      className="relative isolate overflow-hidden border-b border-white/10 bg-[linear-gradient(180deg,#050505,#090909)] px-5 py-9 sm:px-8 lg:px-12"
      id="one-v-one-rules"
    >
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
                    Primary draft: {details.document}
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

function QuickBriefingSection({
  activeTab,
  reduceMotion,
}: {
  activeTab: TabName;
  reduceMotion: boolean;
}) {
  const activeDetails = tabDetails[activeTab];
  const ActiveIcon = activeDetails.icon;

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
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
          <SectionHeading
            eyebrow="Quick Briefing"
            title="Read the selected briefing before the detailed rules."
            text="The category summary gives you the launch facts without duplicating the full governing documents."
          />

          <Panel className="p-6">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300">
                <ActiveIcon size={23} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-black uppercase text-orange-300">
                  Selected Briefing
                </p>
                <h3 className="mt-2 text-2xl font-black text-white">
                  {activeDetails.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-zinc-300 sm:text-base">
                  {activeDetails.description}
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
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
            title="Governing-document status."
            text={`The approved final versions are the governing source of truth from ${legalCorpus.effectiveDateDisplay}.`}
          />
          <p className="max-w-sm border-l border-orange-400/40 pl-4 text-sm leading-6 text-zinc-400">
            Download the immutable versioned PDFs used by Tournament
            registration.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {documentStatuses.map((document, index) => {
            const Icon = document.icon;

            return (
              <motion.article
                className="group relative flex min-h-[260px] flex-col overflow-hidden border border-white/12 bg-zinc-950/75 p-6 transition hover:border-orange-300/50 hover:bg-zinc-950"
                initial={reduceMotion ? false : "hidden"}
                key={document.title}
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
                  <span className="border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-xs font-black uppercase text-emerald-100">
                    {document.status}
                  </span>
                </div>

                <h3 className="mt-7 text-2xl font-black text-white">
                  {document.title}
                </h3>
                <p className="mt-2 text-xs font-black uppercase tracking-wide text-orange-300">
                  {document.version}
                </p>
                <p className="mt-4 flex-1 text-sm leading-7 text-zinc-400">
                  {document.text}
                </p>
                <p className="mt-4 text-xs font-black uppercase tracking-wide text-zinc-500">
                  Effective {legalCorpus.effectiveDateDisplay}
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {document.kind === "terms" || document.kind === "privacy" ? (
                    <Link
                      className="inline-flex min-h-11 items-center justify-center border border-white/20 bg-white/[0.04] px-4 py-2 text-sm font-black text-white transition hover:border-orange-300/70 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                      href={document.readHref}
                    >
                      Read Online
                    </Link>
                  ) : (
                    <a
                      className="inline-flex min-h-11 items-center justify-center border border-white/20 bg-white/[0.04] px-4 py-2 text-sm font-black text-white transition hover:border-orange-300/70 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                      href={document.readHref}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Read
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                  <a
                    className="inline-flex min-h-11 items-center justify-center gap-2 border border-orange-400/70 bg-orange-500/10 px-4 py-2 text-sm font-black text-orange-200 transition hover:border-orange-300 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                    download={document.filename}
                    href={document.href}
                  >
                    Download PDF
                    <Download aria-hidden="true" size={17} />
                  </a>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FaqSection({ reduceMotion }: { reduceMotion: boolean }) {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 bg-[linear-gradient(180deg,#070707,#0b0b0b)] px-5 py-20 sm:px-8 lg:px-12">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover"
        style={{
          backgroundImage: "url('/images/sfondi/3.jpg')",
          backgroundPosition: "42% center",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.74)_45%,rgba(0,0,0,0.97)),linear-gradient(105deg,rgba(0,0,0,0.96),rgba(0,0,0,0.68),rgba(40,18,6,0.88))]"
      />
      <TacticalBackdrop muted />

      <div className="relative z-10 mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="FAQ"
          title="Answers to the launch questions players ask most."
          text="These concise answers follow the approved competition model without replacing the governing documents."
        />

        <div className="mt-10 space-y-3">
          {faqs.map(([question, answer], index) => {
            const isOpen = openFaqIndex === index;
            const triggerId = `faq-trigger-${index}`;
            const panelId = `faq-panel-${index}`;

            return (
              <motion.article
                className={`overflow-hidden border transition ${
                  isOpen
                    ? "border-orange-300/50 bg-orange-500/[0.055]"
                    : "border-white/12 bg-white/[0.035] hover:border-orange-300/40"
                }`}
                initial={reduceMotion ? false : "hidden"}
                key={question}
                transition={{
                  duration: reduceMotion ? 0 : 0.4,
                  delay: reduceMotion ? 0 : index * 0.025,
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
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                  type="button"
                >
                  <span className="flex items-center gap-4">
                    <span
                      className={`hidden h-9 w-1 shrink-0 sm:block ${
                        isOpen ? "bg-orange-400" : "bg-white/12"
                      }`}
                    />
                    <span className="text-base font-black text-white sm:text-lg">
                      {question}
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
                        {answer}
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
                Governing Status
              </p>
              <h2 className="mt-2 text-3xl font-black text-white">
                Plain-language guide
              </h2>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
                This page is a plain-language guide. The governing-document
                hierarchy and exact accepted versions control. Tournament Pages,
                Published Decisions and Event Prize Terms supplement them only
                within their stated scope.
              </p>
              <p className="mt-4 max-w-3xl text-sm font-bold leading-7 text-amber-100 sm:text-base sm:leading-8">
                The Rulebook, PPA, Terms and Privacy Policy are Effective from
                {` ${legalCorpus.effectiveDateDisplay}`}. Registration records
                the exact version presented for each document.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
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
