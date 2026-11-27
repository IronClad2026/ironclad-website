"use client";

import { ArrowUpRight, Camera, Film, History, LayoutGrid, LogOut, Mic2, PencilLine, Plus, UserRound } from "lucide-react";
import Image from "next/image";
import { useRef, useState, type ReactNode } from "react";
import { casterMediaPath, type CasterPhase2Application } from "@/lib/caster/application";
import type { CasterApplicationCopy } from "@/lib/caster/application-copy";
import { parseCasterFeaturedVideo } from "@/lib/caster/featured-video";
import type { CasterProfileCopy } from "@/lib/caster/profile-copy";
import { casterPublicProfilePath, type CasterWorkingProfile } from "@/lib/caster/publication";
import { CASTER_SIGN_OUT_PATH } from "@/lib/caster/routes";
import type { CasterCoverageAssignment } from "@/lib/caster/coverage";
import type { CasterTournamentVideo } from "@/lib/caster/tournament-video";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import CasterApplicationEditor from "./CasterApplicationEditor";
import type { StudioWorkspaceCopy } from "./studio-workspace-copy";

const sections = [
  { key: "overview", Icon: LayoutGrid },
  { key: "profile", Icon: UserRound },
  { key: "media", Icon: Camera },
  { key: "videos", Icon: Film },
  { key: "history", Icon: History },
] as const;
type Section = typeof sections[number]["key"];
export type StudioEditorPanel = "profile" | "media";
export type StudioWorkingState = { profile: CasterWorkingProfile; dirty: boolean };
export type StudioVideoActivity = {
  publishedCount: number;
  tournamentIds: string[];
  recent: { id: string; title: string; tournamentTitle: string; tournamentHref: string; publishedAt: string }[];
};

const panel = "min-w-0 border border-white/12 bg-zinc-950";
const button = "inline-flex min-h-11 min-w-0 max-w-full items-center justify-center gap-2 border px-3 py-2 text-sm font-bold [overflow-wrap:anywhere] transition focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-orange-300";
const primary = `${button} border-orange-400 bg-orange-500 text-black hover:bg-orange-300`;
const secondary = `${button} border-white/15 bg-white/5 text-white hover:border-orange-300/60 hover:bg-white/10`;

type Props = {
  initialSection?: string;
  application: CasterPhase2Application;
  profile: CasterWorkingProfile;
  locale: Locale;
  intlLocale: string;
  email: string;
  countries: { code: string; label: string }[];
  copy: StudioWorkspaceCopy;
  applicationCopy: CasterApplicationCopy;
  profileCopy: CasterProfileCopy;
  actionCopy: { programme: string; signOut: string; support: string; retry: string };
  signOutFailed: boolean;
  supportUrl?: string;
  activity: StudioVideoActivity | null;
  verifiedTournamentIds: string[] | null;
  portfolioCoverage: CasterCoverageAssignment[];
  portfolioVideos: CasterTournamentVideo[];
  videos: ReactNode;
  history: ReactNode;
  notifications: ReactNode;
};

export default function CasterStudioWorkspace(props: Props) {
  const {
    application, profile, locale, intlLocale, email, countries, copy, applicationCopy, profileCopy, actionCopy,
    supportUrl, signOutFailed, activity, verifiedTournamentIds, portfolioCoverage, portfolioVideos, videos, history, notifications,
  } = props;
  const [section, setSection] = useState<Section>(() => sections.find(({ key }) => key === props.initialSection)?.key ?? "overview");
  const [editorPanel, setEditorPanel] = useState<StudioEditorPanel>(() => props.initialSection === "media" ? "media" : "profile");
  const [openedEditor, setOpenedEditor] = useState(props.initialSection === "profile" || props.initialSection === "media");
  const [working, setWorking] = useState<StudioWorkingState>({ profile, dirty: false });
  const main = useRef<HTMLElement>(null);
  const draft = working.profile.draft;
  const publicUrl = working.profile.slug && working.profile.publication_id && !working.profile.hidden
    ? casterPublicProfilePath(working.profile.slug) : null;
  const publicationStatus = working.profile.hidden ? profileCopy.hidden : publicUrl ? profileCopy.published : profileCopy.draft;
  const unpublished = working.dirty || (working.profile.published_version === null
    ? working.profile.version > 0 : working.profile.version !== working.profile.published_version);
  const featuredCount = (draft.gallery?.length ?? 0) + (draft.videos?.filter((video) => parseCasterFeaturedVideo(video)).length ?? 0);
  const coverageCount = activity && verifiedTournamentIds ? new Set([...activity.tournamentIds, ...verifiedTournamentIds]).size : null;
  const number = new Intl.NumberFormat(intlLocale);
  const editing = section === "profile" || section === "media";

  function open(next: Section, compose = false) {
    setSection(next);
    if (next === "profile" || next === "media") {
      setEditorPanel(next);
      setOpenedEditor(true);
    }
    const address = new URL(window.location.href);
    if (next === "overview") address.searchParams.delete("section");
    else address.searchParams.set("section", next);
    window.history.replaceState(window.history.state, "", address);
    requestAnimationFrame(() => {
      const composer = compose ? main.current?.querySelector<HTMLElement>("#publish-tournament-video") : null;
      if (composer) {
        if (composer instanceof HTMLButtonElement && !composer.disabled) {
          composer.click();
          main.current?.focus({ preventScroll: true });
        } else {
          composer.focus();
        }
      } else {
        main.current?.focus({ preventScroll: true });
      }
    });
  }

  return (
    <main id="application" className="mx-auto min-h-svh max-w-[1440px] px-4 py-6 text-white sm:px-8 sm:py-10 lg:px-10">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5 sm:pb-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Image src="/caster-invitation/logo.webp" alt="" width={104} height={144}
            className="h-10 w-auto shrink-0 sm:h-14" />
          <div className="min-w-0">
            <p className="mb-1 text-xs font-black tracking-wider text-orange-300 uppercase">{actionCopy.programme}</p>
            <h1 className="text-3xl font-black [overflow-wrap:anywhere] sm:text-4xl">{profileCopy.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {section !== "overview" && publicUrl ? <a href={publicUrl} className={secondary}>{profileCopy.publicProfile}<ArrowUpRight aria-hidden="true" size={16} className="shrink-0" /></a> : null}
          <form action={CASTER_SIGN_OUT_PATH} method="post">
            <button className={secondary} type="submit"><LogOut aria-hidden="true" size={16} className="shrink-0" />{actionCopy.signOut}</button>
          </form>
        </div>
      </header>
      {signOutFailed ? <p className="mt-3 text-sm text-orange-200" role="alert">{actionCopy.retry}</p> : null}

      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)] lg:gap-7">
        <div className="min-w-0 lg:sticky lg:top-5 lg:self-start">
          <nav aria-label={copy.navigation} className={`${panel} p-1.5 sm:p-2`}>
            <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
              {sections.map(({ key, Icon }) => (
                <li key={key} className="min-w-0 last:col-span-2 sm:last:col-span-1">
                  <button type="button" aria-current={section === key ? "page" : undefined} onClick={() => open(key)}
                    className={`flex min-h-11 w-full min-w-0 items-center gap-2 border px-2 py-2 text-start text-sm font-bold [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-orange-300 sm:px-3 ${section === key ? "border-orange-400/50 bg-orange-500/10 text-orange-200" : "border-transparent text-zinc-300 hover:bg-white/5 hover:text-white"}`}>
                    <Icon size={17} aria-hidden="true" className="shrink-0" />{copy[key]}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {supportUrl ? <a href={supportUrl} rel="noreferrer" className="mt-3 hidden min-h-11 items-center px-2 text-sm font-bold text-orange-200 underline focus-visible:outline-2 focus-visible:outline-orange-300 lg:inline-flex">{actionCopy.support}</a> : null}
        </div>

        <section ref={main} tabIndex={-1} aria-label={copy[section]} className="min-w-0 focus:outline-none">
          {section === "overview" ? (
            <div className="space-y-5">
              <section className={`${panel} relative isolate overflow-hidden border-t-orange-400/80 p-4 sm:p-6`}>
                {draft.banner ? <Image alt="" src={casterMediaPath(draft.banner)} fill unoptimized sizes="(max-width: 1023px) 100vw, 900px" className="-z-20 object-cover opacity-45" /> : null}
                <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-r from-black/95 via-zinc-950/90 to-zinc-950/65" />
                <h2 className="mb-4 text-lg font-bold text-zinc-300">{copy.overview}</h2>
                <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
                  <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden border border-orange-400/45 bg-zinc-950 text-orange-300 sm:size-20">
                    {draft.avatar ? <Image alt="" src={casterMediaPath(draft.avatar)} fill unoptimized sizes="80px" className="object-cover" /> : <UserRound size={30} aria-hidden="true" />}
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-orange-300 sm:text-sm"><Mic2 size={16} aria-hidden="true" className="shrink-0" />{applicationCopy.preview.designation}</p>
                    <h3 className="mt-1 text-2xl font-black [overflow-wrap:anywhere] sm:text-3xl">{draft.displayName?.trim() || copy.noName}</h3>
                  </div>
                </div>
                <ul className="mt-4 flex min-w-0 flex-wrap gap-2 text-xs font-bold">
                  <li className="border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5 text-emerald-200">{copy.active}</li>
                  <li className="border border-white/15 bg-black/45 px-2.5 py-1.5 text-zinc-200">{publicationStatus}</li>
                  <li className={`border px-2.5 py-1.5 ${unpublished ? "border-orange-400/40 bg-orange-500/10 text-orange-200" : "border-white/15 bg-black/45 text-zinc-300"}`}>
                    {unpublished ? copy.unpublished : copy.noUnpublishedChanges}
                  </li>
                </ul>
                <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
                  <button className={primary} type="button" onClick={() => open("videos", true)}><Plus size={17} aria-hidden="true" className="shrink-0" />{copy.publishVideo}</button>
                  {publicUrl ? <a href={publicUrl} className={secondary}>{profileCopy.publicProfile}<ArrowUpRight aria-hidden="true" size={16} className="shrink-0" /></a> : null}
                  <button className={secondary} type="button" onClick={() => open("profile")}><PencilLine size={16} aria-hidden="true" className="shrink-0" />{copy.editProfile}</button>
                  <button className={secondary} type="button" onClick={() => open("media")}><Camera size={16} aria-hidden="true" className="shrink-0" />{copy.manageMedia}</button>
                </div>
              </section>
              <dl className="grid min-w-0 gap-2 sm:grid-cols-3 sm:gap-3">
                {[
                  { label: copy.publishedVideos, value: activity?.publishedCount ?? null, Icon: Film },
                  { label: copy.distinctTournaments, value: coverageCount, Icon: History },
                  { label: copy.featuredMedia, value: featuredCount, Icon: Camera },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className={`${panel} flex min-w-0 items-start justify-between gap-3 p-3.5 sm:min-h-28 sm:p-4`}>
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold text-zinc-300 [overflow-wrap:anywhere] sm:text-sm">{label}</dt>
                      <dd className="mt-1 text-2xl font-black tabular-nums">{value === null ? "—" : number.format(value)}</dd>
                    </div>
                    <Icon aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-orange-300" />
                  </div>
                ))}
              </dl>
              <section className={`${panel} p-4 sm:p-5`}>
                <h3 className="text-lg font-black">{copy.recent}</h3>
                {!activity ? <p className="mt-2 text-sm text-zinc-300">{copy.activityUnavailable}</p> : activity.recent.length ? (
                  <ul className="mt-3 divide-y divide-white/10">
                    {activity.recent.map((item) => (
                      <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                        <div className="min-w-0">
                          <a href={item.tournamentHref} className="inline-flex min-h-11 max-w-full items-center gap-2 text-sm font-bold text-orange-200 [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-orange-300">
                            {item.title}<ArrowUpRight size={14} aria-hidden="true" className="shrink-0" />
                          </a>
                          <p className="text-xs text-zinc-400 [overflow-wrap:anywhere]">{item.tournamentTitle}</p>
                        </div>
                        <time dateTime={item.publishedAt} className="text-xs text-zinc-400">{formatDateTime(item.publishedAt, locale, { kind: "utc" })} UTC</time>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 max-w-prose text-sm leading-6 text-zinc-300">{copy.noVideos}</p>}
              </section>
              {notifications}
            </div>
          ) : null}
          {openedEditor ? <div hidden={!editing} className="min-w-0">
            <CasterApplicationEditor
              initial={application} copy={applicationCopy} locale={intlLocale} email={email}
              countries={countries} retryLabel={actionCopy.retry} profile={{ initial: profile, copy: profileCopy }}
              workspace={{ panel: editorPanel, local: locale, copy, onWorkingChange: setWorking, portfolioCoverage, portfolioVideos }}
            />
          </div> : null}
          <div hidden={section !== "videos"} className="min-w-0">{videos}</div>
          <div hidden={section !== "history"} className="min-w-0 space-y-5">{history}</div>
        </section>
      </div>
      {supportUrl ? <a href={supportUrl} rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-orange-200 underline focus-visible:outline-2 focus-visible:outline-orange-300 lg:hidden">{actionCopy.support}</a> : null}
    </main>
  );
}
