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

import type { HelpLegalUiDictionary } from "@/lib/i18n/dictionaries/en/help-legal-ui";
import type { Locale } from "@/lib/i18n/config";
import { fadeUp } from "@/lib/animations";
import { interpolateMessage } from "@/lib/i18n/translate";
import type { LegalDocumentKind } from "@/lib/legal-corpus-publication";

export type RuleDocumentSummary = {
  kind: LegalDocumentKind;
  title: string;
  version: string;
  status: string;
  description: string;
  href: string;
  filename: string;
  readHref: string;
};

type TabName = "oneVOne" | "rankings" | "conduct";

const tabs = ["oneVOne", "rankings", "conduct"] as const;
const tabIds: Record<TabName, string> = {
  oneVOne: "one-v-one-rules",
  rankings: "rankings-seasons",
  conduct: "ppa-conduct",
};
const tabIcons: Record<TabName, LucideIcon> = {
  oneVOne: Trophy,
  rankings: ScrollText,
  conduct: Gavel,
};
const documentIcons: Record<LegalDocumentKind, LucideIcon> = {
  rulebook: ScrollText,
  ppa: Gavel,
  terms: FileCheck2,
  privacy: Shield,
};

export default function RulesExperience({
  copy,
  documents,
  effectiveDate,
  locale,
}: {
  copy: HelpLegalUiDictionary;
  documents: RuleDocumentSummary[];
  effectiveDate: string;
  locale: Locale;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [activeTab, setActiveTab] = useState<TabName>("oneVOne");
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
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(tabs[nextIndex]);
    requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  };

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white" lang={locale}>
      <HeroSection copy={copy} effectiveDate={effectiveDate} reduceMotion={reduceMotion} />
      <RuleCategorySelector
        activeTab={activeTab}
        copy={copy}
        onKeyDown={handleTabKeyDown}
        onSelect={selectTab}
        reduceMotion={reduceMotion}
        tabRefs={tabRefs}
      />
      <QuickBriefingSection activeTab={activeTab} copy={copy} effectiveDate={effectiveDate} reduceMotion={reduceMotion} />
      <RuleExplorerSection
        activeTab={activeTab}
        copy={copy}
        openIndex={openIndex}
        reduceMotion={reduceMotion}
        setOpenIndex={setOpenIndex}
      />
      <OfficialDocumentsSection copy={copy} documents={documents} effectiveDate={effectiveDate} reduceMotion={reduceMotion} />
      <FaqSection copy={copy} reduceMotion={reduceMotion} />
      <DisclaimerSection copy={copy} effectiveDate={effectiveDate} reduceMotion={reduceMotion} />
    </main>
  );
}

function HeroSection({ copy, effectiveDate, reduceMotion }: RulesSectionProps) {
  const hero = copy.rules.hero;
  return (
    <section className="relative isolate flex min-h-[72svh] items-end overflow-hidden border-b border-orange-500/20 px-5 pt-28 pb-10 sm:min-h-[78vh] sm:px-8 sm:pt-32 sm:pb-14 lg:min-h-[88vh] lg:px-12">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }} />
      <TacticalBackdrop />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.34),rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.96),rgba(0,0,0,0.6),rgba(249,115,22,0.14))]" />
      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
        <motion.div initial={reduceMotion ? false : "hidden"} animate="visible" variants={fadeUp} transition={{ duration: reduceMotion ? 0 : 0.75 }} className="max-w-5xl">
          <p className="locale-display text-sm font-black uppercase text-orange-300">{hero.eyebrow}</p>
          <h1 className="locale-display mt-5 max-w-5xl text-5xl font-black leading-[0.96] text-white sm:text-6xl lg:text-8xl">{hero.title}</h1>
          <p className="mt-7 max-w-3xl text-base leading-8 text-zinc-300 sm:text-lg">{hero.description}</p>
          <div className="mt-9 w-fit border border-emerald-300/35 bg-emerald-300/10 px-4 py-3 text-sm font-black uppercase tracking-wide text-emerald-100" role="status">
            {interpolateMessage(hero.effective, { date: effectiveDate })}
          </div>
        </motion.div>
        <motion.aside
          initial={reduceMotion ? false : { opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.75, delay: 0.12 }}
          className="hidden border border-white/12 bg-black/50 p-5 shadow-2xl shadow-black/40 backdrop-blur lg:block"
          aria-label={hero.summaryAria}
        >
          <div className="relative min-h-[400px] overflow-hidden bg-[linear-gradient(145deg,rgba(249,115,22,0.12),rgba(8,13,24,0.9))]">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:40px_40px]" />
            <div className="absolute inset-x-7 top-7 flex items-center justify-between text-xs font-black uppercase text-orange-200"><span>{hero.operations}</span><Radio size={16} aria-hidden="true" /></div>
            <div className="absolute right-7 bottom-7 left-7"><div className="mb-5 h-1 w-24 bg-orange-400" /><p className="locale-display text-4xl font-black leading-none">{hero.corpus}</p><p className="mt-4 text-sm leading-6 text-zinc-300">{interpolateMessage(hero.corpusText, { date: effectiveDate })}</p></div>
          </div>
        </motion.aside>
      </div>
    </section>
  );
}

function RuleCategorySelector({ activeTab, copy, onKeyDown, onSelect, reduceMotion, tabRefs }: {
  activeTab: TabName;
  copy: HelpLegalUiDictionary;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => void;
  onSelect: (tab: TabName) => void;
  reduceMotion: boolean;
  tabRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
}) {
  const category = copy.rules.category;
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 bg-[#070707] px-5 py-12 sm:px-8 lg:px-12" id="one-v-one-rules">
      <TacticalBackdrop muted />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading eyebrow={category.eyebrow} title={category.title} text={category.description} />
          <p className="max-w-sm border-l border-orange-400/40 pl-4 text-sm leading-6 text-zinc-400">{category.resetHelp}</p>
        </div>
        <div aria-label={category.aria} className="grid gap-3 md:grid-cols-3" role="tablist">
          {tabs.map((tab, index) => {
            const details = copy.rules.tabs[tab];
            const Icon = tabIcons[tab];
            const isActive = activeTab === tab;
            return (
              <motion.button
                aria-controls="rule-panel" aria-selected={isActive}
                className={`group relative min-h-44 overflow-hidden border p-5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 ${isActive ? "border-orange-300 bg-orange-500/10" : "border-white/12 bg-white/[0.035] hover:border-orange-300/50"}`}
                id={`rule-tab-${tabIds[tab]}`} key={tab} onClick={() => onSelect(tab)} onKeyDown={(event) => onKeyDown(event, index)}
                ref={(node) => { tabRefs.current[index] = node; }} role="tab" tabIndex={isActive ? 0 : -1} type="button"
                initial={reduceMotion ? false : "hidden"} whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={fadeUp}
              >
                {isActive && <motion.span className="absolute inset-x-0 top-0 h-1 bg-orange-400" layoutId="activeRuleTabMarker" />}
                <span className="relative z-10 flex h-full flex-col">
                  <span className="flex items-start justify-between gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center border border-orange-300/40 bg-orange-500/10 text-orange-200"><Icon size={20} aria-hidden="true" /></span>
                    {isActive && <span className="inline-flex items-center gap-1 border border-orange-300/40 bg-orange-500/15 px-2.5 py-1 text-xs font-black uppercase text-orange-100"><CheckCircle2 size={14} aria-hidden="true" />{category.selected}</span>}
                  </span>
                  <span className="mt-5 text-xs font-black uppercase text-orange-300">{details.eyebrow}</span>
                  <span className="locale-display mt-2 text-2xl font-black text-white">{details.title}</span>
                  <span className="mt-3 text-sm leading-6 text-zinc-400">{details.description}</span>
                  <span className="mt-auto pt-5 text-xs font-black uppercase text-zinc-500">{interpolateMessage(category.primaryDraft, { document: details.document })}</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function QuickBriefingSection({ activeTab, copy, effectiveDate, reduceMotion }: RulesSectionProps & { activeTab: TabName }) {
  const details = copy.rules.tabs[activeTab];
  const ActiveIcon = tabIcons[activeTab];
  const quick = copy.rules.quick;
  const cards = [
    { icon: ShieldCheck, label: quick.documentStatusLabel, title: quick.documentStatusTitle, text: interpolateMessage(quick.documentStatusText, { date: effectiveDate }) },
    { icon: Radio, label: quick.navigationLabel, title: quick.navigationTitle, text: quick.navigationText },
    { icon: FileCheck2, label: quick.integrityLabel, title: quick.integrityTitle, text: quick.integrityText },
  ];
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 px-5 py-20 sm:px-8 lg:px-12">
      <TacticalBackdrop muted />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
          <SectionHeading eyebrow={quick.eyebrow} title={quick.title} text={quick.description} />
          <Panel className="p-6"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300"><ActiveIcon size={23} aria-hidden="true" /></span><div><p className="text-xs font-black uppercase text-orange-300">{quick.selected}</p><h3 className="locale-display mt-2 text-2xl font-black text-white">{details.title}</h3><p className="mt-4 text-sm leading-7 text-zinc-300 sm:text-base">{details.description}</p></div></div></Panel>
        </div>
        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {cards.map((item, index) => { const Icon = item.icon; return <motion.article className="border border-white/12 bg-white/[0.045] p-5" initial={reduceMotion ? false : "hidden"} key={item.title} variants={fadeUp} viewport={{ once: true }} whileInView="visible" transition={{ delay: reduceMotion ? 0 : index * 0.06 }}><Icon className="text-orange-300" size={26} aria-hidden="true" /><p className="mt-5 text-xs font-black uppercase text-orange-300">{item.label}</p><h3 className="mt-2 text-lg font-black text-white">{item.title}</h3><p className="mt-3 text-sm leading-6 text-zinc-400">{item.text}</p></motion.article>; })}
        </div>
      </div>
    </section>
  );
}

function RuleExplorerSection({ activeTab, copy, openIndex, reduceMotion, setOpenIndex }: {
  activeTab: TabName; copy: HelpLegalUiDictionary; openIndex: number | null; reduceMotion: boolean; setOpenIndex: (index: number | null) => void;
}) {
  const details = copy.rules.tabs[activeTab];
  const sections = getRuleSections(copy, activeTab);
  const ActiveIcon = tabIcons[activeTab];
  return (
    <section className="relative isolate overflow-hidden border-b border-orange-500/15 bg-[#070707] px-5 py-20 sm:px-8 lg:px-12">
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[0.78fr_1fr] lg:items-end">
          <SectionHeading eyebrow={copy.rules.explorer.eyebrow} title={copy.rules.explorer.title} text={copy.rules.explorer.description} />
          <Panel className="p-5"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300"><ActiveIcon size={22} aria-hidden="true" /></span><div><p className="text-xs font-black uppercase text-orange-300">{copy.rules.explorer.active}</p><h3 className="locale-display mt-1 text-2xl font-black text-white">{details.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{details.description}</p></div></div></Panel>
        </div>
        <div aria-labelledby={`rule-tab-${tabIds[activeTab]}`} className="mt-10 space-y-3" id="rule-panel" role="tabpanel">
          {sections.map(([title, text], index) => <AccordionItem index={index} key={title} openIndex={openIndex} prefix={`rule-${tabIds[activeTab]}`} reduceMotion={reduceMotion} setOpenIndex={setOpenIndex} text={text} title={title} />)}
        </div>
      </div>
    </section>
  );
}

function OfficialDocumentsSection({ copy, documents, effectiveDate, reduceMotion }: RulesSectionProps & { documents: RuleDocumentSummary[] }) {
  const labels = copy.rules.documents;
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 px-5 py-20 sm:px-8 lg:px-12">
      <TacticalBackdrop muted />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-12 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><SectionHeading eyebrow={labels.eyebrow} title={labels.title} text={interpolateMessage(labels.description, { date: effectiveDate })} /><p className="max-w-sm border-l border-orange-400/40 pl-4 text-sm leading-6 text-zinc-400">{labels.immutable}</p></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {documents.map((document, index) => {
            const Icon = documentIcons[document.kind];
            const online = document.kind === "terms" || document.kind === "privacy";
            return (
              <motion.article className="group relative flex min-h-[280px] flex-col overflow-hidden border border-white/12 bg-zinc-950/75 p-6" initial={reduceMotion ? false : "hidden"} key={document.kind} variants={fadeUp} viewport={{ once: true }} whileInView="visible" transition={{ delay: reduceMotion ? 0 : index * 0.08 }}>
                <div className="absolute inset-x-0 top-0 h-1 bg-orange-500/75" />
                <div className="flex items-start justify-between gap-4"><span className="grid h-12 w-12 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300"><Icon size={23} aria-hidden="true" /></span><span className="border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-xs font-black uppercase text-emerald-100">{document.status}</span></div>
                <h3 className="mt-7 text-2xl font-black text-white" lang="en">{document.title}</h3>
                <p className="mt-2 text-xs font-black uppercase tracking-wide text-orange-300">{interpolateMessage(labels.version, { version: document.version })}</p>
                <p className="mt-4 flex-1 text-sm leading-7 text-zinc-400" lang="en">{document.description}</p>
                <p className="mt-4 text-xs font-black uppercase tracking-wide text-zinc-500">{interpolateMessage(labels.effective, { date: effectiveDate })}</p>
                <div className="mt-5 grid gap-2">
                  {online ? <Link className="inline-flex min-h-11 items-center justify-center border border-white/20 bg-white/[0.04] px-4 py-2 text-sm font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300" href={document.readHref}>{labels.readOnline}</Link> : <a className="inline-flex min-h-11 items-center justify-center border border-white/20 bg-white/[0.04] px-4 py-2 text-sm font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300" href={document.readHref} rel="noopener noreferrer" target="_blank">{labels.read}<span className="sr-only"> {labels.opensNewTab}</span></a>}
                  <a className="inline-flex min-h-11 items-center justify-center gap-2 border border-orange-400/70 bg-orange-500/10 px-4 py-2 text-sm font-black text-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300" download={document.filename} href={document.href}>{labels.download}<Download aria-hidden="true" size={17} /></a>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FaqSection({ copy, reduceMotion }: { copy: HelpLegalUiDictionary; reduceMotion: boolean }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const faq = copy.rules.faq;
  const items = getFaqs(copy);
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 bg-[#080808] px-5 py-20 sm:px-8 lg:px-12">
      <TacticalBackdrop muted />
      <div className="relative z-10 mx-auto max-w-6xl"><SectionHeading eyebrow={faq.eyebrow} title={faq.title} text={faq.description} /><div className="mt-10 space-y-3">{items.map(([title, text], index) => <AccordionItem index={index} key={title} openIndex={openIndex} prefix="faq" reduceMotion={reduceMotion} setOpenIndex={setOpenIndex} text={text} title={title} />)}</div></div>
    </section>
  );
}

function DisclaimerSection({ copy, effectiveDate, reduceMotion }: RulesSectionProps) {
  const disclaimer = copy.rules.disclaimer;
  return (
    <section className="relative isolate overflow-hidden px-5 py-20 sm:px-8 lg:px-12"><TacticalBackdrop muted /><div className="relative z-10 mx-auto max-w-5xl"><motion.div className="border border-amber-300/25 bg-amber-400/[0.055] p-6 sm:p-8" initial={reduceMotion ? false : "hidden"} variants={fadeUp} viewport={{ once: true }} whileInView="visible"><div className="flex flex-col gap-5 sm:flex-row sm:items-start"><span className="grid h-12 w-12 shrink-0 place-items-center border border-amber-300/40 bg-amber-300/10 text-amber-200"><AlertTriangle size={24} aria-hidden="true" /></span><div><p className="text-xs font-black uppercase text-amber-200">{disclaimer.eyebrow}</p><h2 className="locale-display mt-2 text-3xl font-black text-white">{disclaimer.title}</h2><p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">{disclaimer.text}</p><p className="mt-4 max-w-3xl text-sm font-bold leading-7 text-amber-100 sm:text-base">{interpolateMessage(disclaimer.effective, { date: effectiveDate })}</p><p className="mt-4 max-w-3xl border-l-2 border-orange-400 pl-4 text-sm font-bold leading-7 text-orange-100">{disclaimer.english}</p></div></div></motion.div></div></section>
  );
}

function AccordionItem({ index, openIndex, prefix, reduceMotion, setOpenIndex, text, title }: {
  index: number; openIndex: number | null; prefix: string; reduceMotion: boolean; setOpenIndex: (index: number | null) => void; text: string; title: string;
}) {
  const isOpen = openIndex === index;
  const triggerId = `${prefix}-trigger-${index}`;
  const panelId = `${prefix}-panel-${index}`;
  return (
    <motion.article className={`overflow-hidden border transition ${isOpen ? "border-orange-300/50 bg-orange-500/[0.055]" : "border-white/12 bg-white/[0.035] hover:border-orange-300/40"}`} initial={reduceMotion ? false : "hidden"} variants={fadeUp} viewport={{ once: true }} whileInView="visible">
      <button aria-controls={panelId} aria-expanded={isOpen} className="flex min-h-16 w-full items-center justify-between gap-5 px-5 py-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 sm:px-6" id={triggerId} onClick={() => setOpenIndex(isOpen ? null : index)} type="button"><span className="text-base font-black text-white sm:text-lg">{title}</span><ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 text-orange-300 transition ${isOpen ? "rotate-180" : ""}`} /></button>
      <AnimatePresence initial={false}>{isOpen && <motion.div animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} id={panelId} initial={reduceMotion ? false : { height: 0, opacity: 0 }} role="region" aria-labelledby={triggerId} transition={{ duration: reduceMotion ? 0 : 0.24 }}><p className="border-t border-white/10 px-5 py-5 text-sm leading-7 text-zinc-300 sm:px-6 sm:text-base sm:leading-8">{text}</p></motion.div>}</AnimatePresence>
    </motion.article>
  );
}

function getRuleSections(copy: HelpLegalUiDictionary, tab: TabName): [string, string][] {
  const s = copy.rules.sections;
  if (tab === "oneVOne") return [[s.oneVOne.eligibilityTitle, s.oneVOne.eligibilityText], [s.oneVOne.eloTitle, s.oneVOne.eloText], [s.oneVOne.reviewTitle, s.oneVOne.reviewText], [s.oneVOne.seriesTitle, s.oneVOne.seriesText], [s.oneVOne.mapTitle, s.oneVOne.mapText], [s.oneVOne.diceTitle, s.oneVOne.diceText], [s.oneVOne.scheduleTitle, s.oneVOne.scheduleText], [s.oneVOne.pauseTitle, s.oneVOne.pauseText], [s.oneVOne.resultTitle, s.oneVOne.resultText], [s.oneVOne.confirmationTitle, s.oneVOne.confirmationText]];
  if (tab === "rankings") return [[s.rankings.pointsTitle, s.rankings.pointsText], [s.rankings.playTitle, s.rankings.playText], [s.rankings.careerTitle, s.rankings.careerText], [s.rankings.catchupTitle, s.rankings.catchupText], [s.rankings.seasonTitle, s.rankings.seasonText], [s.rankings.rankingTitle, s.rankings.rankingText], [s.rankings.prizesTitle, s.rankings.prizesText]];
  return [[s.conduct.accountsTitle, s.conduct.accountsText], [s.conduct.discordTitle, s.conduct.discordText], [s.conduct.integrityTitle, s.conduct.integrityText], [s.conduct.pollTitle, s.conduct.pollText], [s.conduct.evidenceTitle, s.conduct.evidenceText], [s.conduct.privacyTitle, s.conduct.privacyText], [s.conduct.mediaTitle, s.conduct.mediaText], [s.conduct.prizesTitle, s.conduct.prizesText], [s.conduct.acceptanceTitle, s.conduct.acceptanceText]];
}

function getFaqs(copy: HelpLegalUiDictionary): [string, string][] {
  const f = copy.rules.faq;
  return [[f.registerQuestion, f.registerAnswer], [f.divisionQuestion, f.divisionAnswer], [f.discordQuestion, f.discordAnswer], [f.fullQuestion, f.fullAnswer], [f.mapQuestion, f.mapAnswer], [f.diceQuestion, f.diceAnswer], [f.scheduleQuestion, f.scheduleAnswer], [f.replayQuestion, f.replayAnswer], [f.resultQuestion, f.resultAnswer], [f.standingsQuestion, f.standingsAnswer], [f.pollQuestion, f.pollAnswer], [f.prizesQuestion, f.prizesAnswer]];
}

type RulesSectionProps = { copy: HelpLegalUiDictionary; effectiveDate: string; reduceMotion: boolean };

function SectionHeading({ eyebrow, text, title }: { eyebrow: string; text: string; title: string }) {
  return <div className="max-w-4xl"><p className="text-sm font-black uppercase text-orange-300">{eyebrow}</p><h2 className="locale-display mt-4 text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">{title}</h2><p className="mt-6 max-w-3xl text-base leading-8 text-zinc-300">{text}</p></div>;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-white/12 bg-white/[0.045] shadow-2xl shadow-black/25 backdrop-blur ${className}`}>{children}</div>;
}

function TacticalBackdrop({ muted = false }: { muted?: boolean }) {
  return <><div aria-hidden="true" className={`absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:52px_52px] ${muted ? "opacity-20" : "opacity-30"}`} /><div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(125deg,transparent_0%,transparent_42%,rgba(249,115,22,0.14)_42%,transparent_58%,transparent_100%)]" /></>;
}
