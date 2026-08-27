import HomeAccountSection from "@/components/HomeAccountSection";
import ScrollReveal from "@/components/ScrollReveal";
import {
  ArrowRight,
  Crosshair,

  Flag,
  Radio,
  ShieldCheck,
  Trophy,

  UserRoundCheck,

} from "lucide-react";
import Link from "next/link";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";
import type { PublicDictionary } from "@/lib/i18n/dictionaries/en/public";

const discordUrl = "https://discord.gg/ZQSQjBNRm3";

const commandStats: Array<{
  labelKey: string;
  value?: string;
  valueKey?: string;
}> = [
  {
    labelKey: "home.hero.launchFormat",
    value: "1v1",
  },
  {
    labelKey: "home.hero.divisionSize",
    value: "08",
  },
  {
    labelKey: "home.hero.integrityModel",
    valueKey: "home.hero.fairPlay",

  },
];

const competitionPaths = [
  {
    icon: ShieldCheck,
    titleKey: "home.path.verifyTitle",
    textKey: "home.path.verifyText",
    ctaKey: "home.path.verifyCta",
    href: "/tournaments",
  },
  {
    icon: Crosshair,
    titleKey: "home.path.reportTitle",
    textKey: "home.path.reportText",
    ctaKey: "home.path.reportCta",
    href: "/rules#one-v-one-rules",
  },
  {
    icon: Trophy,
    titleKey: "home.path.progressTitle",
    textKey: "home.path.progressText",
    ctaKey: "home.path.progressCta",
    href: "/rankings",
  },
];

const platformSignals = [
  {
    icon: ShieldCheck,
    titleKey: "home.command.integrityTitle",
    textKey: "home.command.integrityText",

  },
  {
    icon: Trophy,
    titleKey: "home.command.tournamentsTitle",
    textKey: "home.command.tournamentsText",
  },
  {
    icon: UserRoundCheck,
    titleKey: "home.command.choiceTitle",
    textKey: "home.command.choiceText",

  },
];

export default async function Home() {
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "public");

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <HeroSection copy={copy} />
      <HomeAccountSection />
      <PlayersSection copy={copy} />
      <CompetitionPathSection copy={copy} />
    </main>
  );
}

function HeroSection({ copy }: { copy: PublicDictionary }) {
  const t = (path: string) => translate(copy, path);

  return (
    <section
      className="relative isolate flex min-h-[88svh] items-end overflow-hidden border-b border-orange-500/20 bg-cover bg-center px-5 pt-32 pb-12 sm:px-8 lg:min-h-[86svh] lg:px-12"
      style={{
        backgroundImage: "url('/images/ironclad-background.jpg')",
        backgroundPosition: "center 52%",
      }}
      aria-labelledby="home-hero-title"
    >
      <TacticalBackdrop />

      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.3),rgba(0,0,0,0.94)),linear-gradient(108deg,rgba(0,0,0,0.96),rgba(0,0,0,0.64),rgba(249,115,22,0.18))]"
      />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:items-end">
        <ScrollReveal className="min-w-0 max-w-5xl">

          <p className="text-sm font-black uppercase text-orange-300">
            {t("home.hero.eyebrow")}
          </p>

          <h1
            id="home-hero-title"
            className="mt-5 max-w-5xl text-5xl font-black leading-[0.96] text-white sm:text-6xl lg:text-8xl"
          >
            {t("home.hero.title")}
          </h1>

          <p className="mt-7 max-w-2xl text-base leading-8 text-zinc-300 sm:text-lg">
            {t("home.hero.description")}
          </p>

          <div className="mt-9 flex w-full min-w-0 max-w-full flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex min-h-12 w-full min-w-0 max-w-full items-center justify-center gap-2 border border-orange-400 bg-orange-500 px-5 py-3 text-sm font-black text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 sm:w-auto"
              href="/tournaments"
            >
              <span className="min-w-0 text-center leading-5 [overflow-wrap:anywhere]">
                {t("home.hero.viewTournaments")}
              </span>
              <ArrowRight className="shrink-0" size={17} aria-hidden="true" />
            </Link>

            <a
              className="inline-flex min-h-12 w-full min-w-0 max-w-full items-center justify-center gap-2 border border-white/20 bg-white/[0.035] px-5 py-3 text-sm font-black text-white backdrop-blur transition hover:border-orange-300/70 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 sm:w-auto"
              href={discordUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="min-w-0 text-center leading-5 [overflow-wrap:anywhere]">
                {t("home.hero.joinDiscord")}
              </span>
              <Flag className="shrink-0" size={17} aria-hidden="true" />
            </a>
          </div>

          <dl className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
            {commandStats.map((stat) => (
              <div
                key={stat.labelKey}
                className="border border-white/15 bg-black/50 px-4 py-4 backdrop-blur"
              >
                <dt className="text-xs font-bold uppercase text-zinc-500">
                  {t(stat.labelKey)}
                </dt>
                <dd className="mt-2 text-xl font-black text-white">
                  {stat.valueKey ? t(stat.valueKey) : stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </ScrollReveal>

        <aside
          className="hidden border border-white/15 bg-black/55 p-5 backdrop-blur lg:block"
          aria-label={t("home.command.label")}
        >
          <div className="relative min-h-[560px] overflow-hidden border border-orange-400/30 bg-[linear-gradient(145deg,rgba(249,115,22,0.12),rgba(8,13,24,0.92))] xl:min-h-[600px]">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:40px_40px]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12),rgba(0,0,0,0.42))]"
            />

            <div className="relative z-10 flex min-h-[560px] flex-col p-7 xl:min-h-[600px]">
              <div className="flex items-center justify-between border-b border-white/15 pb-6 text-xs font-black uppercase text-orange-200">
                <span>{t("home.command.online")}</span>
                <Radio size={16} aria-hidden="true" />
              </div>

              <div className="mt-8 grid gap-6">
                {platformSignals.map((signal) => {
                  const Icon = signal.icon;

                  return (
                    <div
                      key={signal.titleKey}
                      className="border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <Icon
                          size={19}
                          className="mt-0.5 shrink-0 text-orange-300"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-black leading-6 text-white">
                            {t(signal.titleKey)}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-zinc-400">
                            {t(signal.textKey)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-auto pt-8">
                <div className="border-t border-orange-400/35 pt-6">
                  <p className="text-4xl font-black leading-none">
                    {t("home.command.ready")}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-zinc-300">
                    {t("home.command.readyText")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function PlayersSection({ copy }: { copy: PublicDictionary }) {
  const t = (path: string) => translate(copy, path);

  return (
    <section
      className="relative isolate overflow-hidden border-y border-white/10 bg-cover bg-center px-5 py-24 sm:px-8 lg:px-12"
      style={{
        backgroundImage: "url('/images/sfondi/4.jpg')",
        backgroundPosition: "58% center",
      }}
      aria-labelledby="players-section-title"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.82)),linear-gradient(115deg,rgba(0,0,0,0.86),rgba(249,115,22,0.12),rgba(0,0,0,0.92))]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:64px_64px] opacity-25"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-px bg-orange-400/35"
      />
      <TacticalBackdrop muted />

      <ScrollReveal className="relative z-10 mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_340px] lg:items-center">
        <SectionHeading
          eyebrow={t("home.players.eyebrow")}
          title={t("home.players.title")}
          text={t("home.players.description")}
          titleId="players-section-title"
        />

        <div className="border border-orange-400/30 bg-black/55 p-5 backdrop-blur">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center border border-orange-400/35 bg-orange-500/10 text-orange-300">
              <Crosshair size={23} aria-hidden="true" />
            </span>
            <div>
              <p className="font-black text-white">
                {t("home.players.directory")}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {t("home.players.privacy")}
              </p>
            </div>
          </div>

          <Link
            href="/players"
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 border border-orange-400 bg-orange-500 px-5 py-3 text-sm font-black text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
          >
            {t("home.players.browse")}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </ScrollReveal>
    </section>
  );
}

function CompetitionPathSection({ copy }: { copy: PublicDictionary }) {
  const t = (path: string) => translate(copy, path);

  return (
    <section
      className="relative isolate overflow-hidden bg-cover bg-center px-5 py-28 sm:px-8 lg:px-12"
      style={{
        backgroundImage: "url('/images/sfondi/2.jpg')",
        backgroundPosition: "center 48%",
      }}
      aria-labelledby="competition-path-title"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-orange-500/35"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.92),rgba(0,0,0,0.84)_42%,rgba(0,0,0,0.95)),linear-gradient(100deg,rgba(0,0,0,0.86),rgba(249,115,22,0.1),rgba(0,0,0,0.9))]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:84px_84px]"
      />

      <ScrollReveal className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-10">
          <SectionHeading
            eyebrow={t("home.path.eyebrow")}
            title={t("home.path.title")}
            text={t("home.path.description")}
            titleId="competition-path-title"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {competitionPaths.map((path, index) => (
            <CompetitionPathCard
              key={path.titleKey}
              path={path}
              index={index}
              copy={copy}
            />
          ))}
        </div>

      </ScrollReveal>

    </section>
  );
}

function CompetitionPathCard({
  path,
  index,
  copy,
}: {
  path: (typeof competitionPaths)[number];
  index: number;
  copy: PublicDictionary;
}) {
  const Icon = path.icon;
  const t = (translationPath: string) => translate(copy, translationPath);

  return (
    <Link
      href={path.href}
      className="group relative block min-h-72 overflow-hidden border border-white/12 bg-zinc-950/72 p-6 transition hover:-translate-y-1 hover:border-orange-400/50 hover:bg-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-orange-500/75"
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-0 transition group-hover:opacity-100"
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(249,115,22,0.12),transparent_50%)]" />
      </div>

      <div className="relative z-10 flex min-h-60 flex-col">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-12 w-12 place-items-center border border-orange-400/35 bg-orange-500/10 text-orange-200">
            <Icon size={22} aria-hidden="true" />
          </span>

          <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        <h3 className="mt-6 text-2xl font-black leading-tight text-white">
          {t(path.titleKey)}
        </h3>

        <p className="mt-4 text-sm leading-6 text-zinc-400">
          {t(path.textKey)}
        </p>

        <span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-black text-orange-300 transition group-hover:text-orange-200">
          {t(path.ctaKey)}
          <ArrowRight size={16} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
  titleId,
}: {
  eyebrow: string;
  title: string;
  text: string;
  titleId: string;
}) {
  return (
    <div className="max-w-4xl">
      <p className="text-sm font-black uppercase text-orange-300">{eyebrow}</p>
      <h2
        id={titleId}
        className="mt-4 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl"
      >
        {title}
      </h2>
      <p className="mt-6 max-w-3xl text-base leading-8 text-zinc-300">
        {text}
      </p>
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
        className="absolute inset-0 bg-[linear-gradient(125deg,transparent_0%,transparent_43%,rgba(249,115,22,0.14)_43%,transparent_57%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute top-1/4 right-8 hidden h-24 w-px bg-orange-400/50 lg:block"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-1/4 left-8 hidden h-px w-36 bg-orange-400/45 lg:block"
      />

    </>
  );
}
