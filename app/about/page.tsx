"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Crosshair,
  FileCheck2,
  Flag,
  Radio,
  ShieldCheck,
  Swords,
  Trophy,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";

gsap.registerPlugin(useGSAP);

const discordUrl = "https://discord.gg/ZQSQjBNRm3";

const sectionReveal = {
  hidden: { opacity: 0, y: 48 },
  visible: { opacity: 1, y: 0 },
};

const tournamentBrackets = [
  {
    label: "Academy",
    range: "Below 1100 ELO",
    text: "For players building competitive fundamentals in a protected skill range.",
  },
  {
    label: "Challenge",
    range: "1100-1399 ELO",
    text: "For rising competitors pushing into sharper brackets and stronger opponents.",
  },
  {
    label: "Main / Elite",
    range: "1400+ ELO",
    text: "For top competitors fighting for the highest IronClad placements.",
  },
];

const integrityHighlights = [
  { label: "ELO verification", icon: ShieldCheck },
  { label: "Admin approval", icon: UserCheck },
  { label: "Proof-based match results", icon: Upload },
  { label: "Seasonal leaderboard tracking", icon: BarChart3 },
  { label: "Anti-impersonation checks", icon: FileCheck2 },
  { label: "Clear tournament rules", icon: BookOpen },
];

const visionItems = [
  "Better events",
  "Stronger community tools",
  "Seasonal rankings",
  "Professional tournament experiences",
];

export default function AboutPage() {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      if (reduceMotion) return;

      gsap.to(".about-scanline", {
        xPercent: 18,
        opacity: 0.45,
        duration: 4.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      gsap.to(".about-signal", {
        opacity: 0.78,
        scale: 1.04,
        duration: 2.8,
        repeat: -1,
        yoyo: true,
        stagger: 0.24,
        ease: "sine.inOut",
      });
    },
    { scope: rootRef, dependencies: [reduceMotion], revertOnUpdate: true }
  );

  return (
    <main ref={rootRef} className="overflow-hidden bg-black text-white">
      <HeroSection />
      <MissionSection />
      <TournamentStructureSection />
      <FairCompetitionSection />
      <CommunitySection />
      <FutureVisionSection />
    </main>
  );
}

function HeroSection() {
  return (
    <section className="relative isolate flex min-h-[92vh] items-end overflow-hidden border-b border-orange-500/20 px-5 pt-32 pb-12 sm:px-8 lg:px-12">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-28"
        style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
      />
      <TacticalBackdrop />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.32),rgba(0,0,0,0.92)),linear-gradient(110deg,rgba(0,0,0,0.95),rgba(0,0,0,0.58),rgba(249,115,22,0.14))]" />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[1fr_420px] lg:items-end">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={sectionReveal}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-5xl"
        >
          <p className="text-sm font-black uppercase text-orange-300">
            Built for Competitive Company of Heroes 3
          </p>
          <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[0.94] text-white sm:text-6xl lg:text-8xl">
            IronClad Tournaments
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-8 text-zinc-300 sm:text-lg">
            A community-driven tournament platform built to give Company of
            Heroes 3 players a structured, competitive, and fair place to
            compete.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <PrimaryLink href="/tournaments">Join Tournament</PrimaryLink>
            <SecondaryLink href="/rankings">View Rankings</SecondaryLink>
            <SecondaryLink href={discordUrl} external>
              Join Discord
            </SecondaryLink>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.18, ease: "easeOut" }}
          className="hidden border border-white/12 bg-black/45 p-5 backdrop-blur lg:block"
        >
          <div className="relative aspect-[4/5] overflow-hidden border border-orange-400/30 bg-[linear-gradient(145deg,rgba(249,115,22,0.12),rgba(8,13,24,0.92))]">
            <div className="about-scanline absolute inset-y-0 left-[-30%] w-1/2 skew-x-[-14deg] bg-[linear-gradient(90deg,transparent,rgba(249,115,22,0.22),transparent)]" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:40px_40px]" />
            <div className="absolute inset-x-8 top-8 flex items-center justify-between text-xs font-black text-orange-200">
              <span>TACTICAL EVENT SYSTEM</span>
              <Radio size={16} />
            </div>
            <div className="absolute inset-x-8 bottom-8">
              <div className="about-signal mb-4 h-1 w-24 bg-orange-400" />
              <p className="text-4xl font-black leading-none">SEASON READY</p>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Brackets, verification, match reporting, and rankings prepared
                for competitive play.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function MissionSection() {
  return (
    <CinematicSection
      eyebrow="Mission"
      title="A Competitive Home for CoH3 Players"
      text="IronClad exists to support the Company of Heroes 3 competitive scene with organised tournaments, clear rules, fair brackets, seasonal rankings, and a serious community environment."
      visual={
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Clear Rules", "Every event starts from visible expectations."],
            ["Fair Brackets", "Players compete inside defined ELO ranges."],
            ["Seasonal Progress", "Results become part of a long-term record."],
          ].map(([title, text]) => (
            <GlassPanel key={title}>
              <p className="text-lg font-black text-white">{title}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{text}</p>
            </GlassPanel>
          ))}
        </div>
      }
    />
  );
}

function TournamentStructureSection() {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 px-5 py-24 sm:px-8 lg:px-12">
      <TacticalBackdrop muted />
      <div className="relative z-10 mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Tournament Structure"
          title="Structured Events. Clear Progression."
          text="We run community tournaments designed for different skill levels, from new competitive players to elite competitors. Each event is built around clear rules, bracket integrity, match reporting, and competitive progression."
        />

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {tournamentBrackets.map((bracket, index) => (
            <motion.article
              key={bracket.label}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={sectionReveal}
              transition={{ duration: 0.55, delay: index * 0.08 }}
              className="group relative min-h-72 overflow-hidden border border-white/12 bg-zinc-950/70 p-6 transition hover:border-orange-400/50 hover:bg-zinc-950"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-orange-500 opacity-70" />
              <p className="text-sm font-black uppercase text-orange-300">
                {bracket.range}
              </p>
              <h3 className="mt-5 text-4xl font-black">{bracket.label}</h3>
              <p className="mt-5 max-w-sm text-sm leading-7 text-zinc-400">
                {bracket.text}
              </p>
              <div className="absolute right-5 bottom-5 text-orange-400/35 transition group-hover:text-orange-300">
                <Trophy size={54} strokeWidth={1.4} />
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FairCompetitionSection() {
  return (
    <section className="relative isolate overflow-hidden border-b border-orange-500/15 bg-[linear-gradient(180deg,#050505,#0b0b0b)] px-5 py-24 sm:px-8 lg:px-12">
      <div className="absolute inset-y-0 left-0 w-px bg-orange-500/40" />
      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <SectionHeading
          eyebrow="Integrity"
          title="Fair Competition Comes First"
          text="IronClad uses ELO verification, profile checks, admin review, structured match reporting, proof uploads, and leaderboard controls to protect tournament integrity."
        />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={sectionReveal}
          transition={{ duration: 0.6 }}
          className="grid gap-3 sm:grid-cols-2"
        >
          {integrityHighlights.map((item) => {
            const Icon = item.icon;

            return (
              <GlassPanel key={item.label}>
                <div className="flex items-center gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300">
                    <Icon size={20} />
                  </span>
                  <p className="font-black text-white">{item.label}</p>
                </div>
              </GlassPanel>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

function CommunitySection() {
  return (
    <CinematicSection
      eyebrow="Community"
      title="Built by the Community. For the Community."
      text="IronClad is built around players, admins, casters, and the wider Company of Heroes 3 community. The goal is to create a competitive environment where players can improve, compete, and be recognised."
      visual={
        <div className="grid gap-4 sm:grid-cols-2">
          <GlassPanel>
            <Users className="text-orange-300" size={34} />
            <p className="mt-5 text-2xl font-black">Players</p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              A place to test skill, track progress, and earn recognition.
            </p>
          </GlassPanel>
          <GlassPanel>
            <Crosshair className="text-orange-300" size={34} />
            <p className="mt-5 text-2xl font-black">Competitive Staff</p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Admins and casters supporting clear outcomes and better events.
            </p>
          </GlassPanel>
        </div>
      }
    />
  );
}

function FutureVisionSection() {
  return (
    <section className="relative isolate min-h-[88vh] overflow-hidden px-5 py-24 sm:px-8 lg:px-12">
      <TacticalBackdrop />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.72),rgba(0,0,0,0.94)),linear-gradient(115deg,rgba(249,115,22,0.12),transparent_50%)]" />
      <div className="relative z-10 mx-auto flex min-h-[68vh] max-w-7xl flex-col justify-end">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={sectionReveal}
          transition={{ duration: 0.65 }}
          className="max-w-5xl"
        >
          <p className="text-sm font-black uppercase text-orange-300">
            Future Vision
          </p>
          <h2 className="mt-5 text-5xl font-black leading-[0.98] sm:text-6xl lg:text-8xl">
            Building the Future of CoH3 Competition
          </h2>
          <p className="mt-7 max-w-3xl text-base leading-8 text-zinc-300 sm:text-lg">
            IronClad is more than a tournament website. It is a long-term
            project built to grow the Company of Heroes 3 competitive scene
            through better events, stronger community tools, seasonal rankings,
            and professional tournament experiences.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visionItems.map((item) => (
            <div
              key={item}
              className="border border-white/12 bg-white/[0.04] px-4 py-4 text-sm font-black text-zinc-200 backdrop-blur"
            >
              {item}
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-white/12 pt-8">
          <p className="text-3xl font-black text-white">
            Enter the Battlefield
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <PrimaryLink href="/tournaments">
              Register for a Tournament
            </PrimaryLink>
            <SecondaryLink href={discordUrl} external>
              Join Discord
            </SecondaryLink>
            <SecondaryLink href="/rankings">View Leaderboard</SecondaryLink>
          </div>
        </div>
      </div>
    </section>
  );
}

function CinematicSection({
  eyebrow,
  title,
  text,
  visual,
}: {
  eyebrow: string;
  title: string;
  text: string;
  visual: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 px-5 py-24 sm:px-8 lg:px-12">
      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <SectionHeading eyebrow={eyebrow} title={title} text={text} />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={sectionReveal}
          transition={{ duration: 0.6 }}
        >
          {visual}
        </motion.div>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionReveal}
      transition={{ duration: 0.6 }}
      className="max-w-4xl"
    >
      <p className="text-sm font-black uppercase text-orange-300">{eyebrow}</p>
      <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      <p className="mt-6 max-w-3xl text-base leading-8 text-zinc-300">
        {text}
      </p>
    </motion.div>
  );
}

function GlassPanel({ children }: { children: ReactNode }) {
  return (
    <div className="border border-white/12 bg-white/[0.045] p-5 shadow-2xl shadow-black/25 backdrop-blur">
      {children}
    </div>
  );
}

function TacticalBackdrop({ muted = false }: { muted?: boolean }) {
  return (
    <>
      <div
        className={`absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:52px_52px] ${
          muted ? "opacity-20" : "opacity-30"
        }`}
      />
      <div className="absolute inset-0 bg-[linear-gradient(125deg,transparent_0%,transparent_42%,rgba(249,115,22,0.14)_42%,transparent_58%,transparent_100%)]" />
      <div className="about-signal absolute top-1/4 right-8 hidden h-24 w-px bg-orange-400/50 lg:block" />
      <div className="about-signal absolute bottom-1/4 left-8 hidden h-px w-36 bg-orange-400/45 lg:block" />
    </>
  );
}

function PrimaryLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center gap-2 border border-orange-400 bg-orange-500 px-5 py-3 text-sm font-black text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
    >
      {children}
      <ArrowRight size={17} />
    </Link>
  );
}

function SecondaryLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  const className =
    "inline-flex min-h-12 items-center justify-center gap-2 border border-white/18 bg-white/[0.035] px-5 py-3 text-sm font-black text-white backdrop-blur transition hover:border-orange-300/70 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300";

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
        <Flag size={17} />
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
      <Swords size={17} />
    </Link>
  );
}
