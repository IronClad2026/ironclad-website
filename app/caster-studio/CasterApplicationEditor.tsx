"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, Clock3, Eye, PencilLine, Save, Send } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import CasterApplicationPreview from "@/components/caster/CasterApplicationPreview";
import PublicCasterProfileView from "@/components/caster/PublicCasterProfileView";
import { hasAnnouncementDocumentText } from "@/lib/announcement-document";
import {
  CASTER_APPLICATION_LIMITS as limits,
  CASTER_APPLICATION_PATH,
  CASTER_MEDIA_PATH,
  casterMediaPath,
  emptyCasterDraft,
  type CasterApplicationDraft,
  type CasterApplicationResult,
  type CasterMediaKind,
  type CasterPhase2Application,
} from "@/lib/caster/application";
import type { CasterApplicationCopy } from "@/lib/caster/application-copy";
import type { CasterCoverageAssignment } from "@/lib/caster/coverage";
import type { CasterProfileCopy } from "@/lib/caster/profile-copy";
import { getPublicCasterCopy } from "@/lib/caster/public-copy";
import { CASTER_PROFILE_PATH, casterPublicProfilePath, type CasterWorkingProfile, type CasterWorkingResult } from "@/lib/caster/publication";
import type { CasterTournamentVideo } from "@/lib/caster/tournament-video";
import type { Locale } from "@/lib/i18n/config";
import type { StudioEditorPanel, StudioWorkingState } from "./CasterStudioWorkspace";
import type { StudioWorkspaceCopy } from "./studio-workspace-copy";

const AnnouncementEditor = dynamic(() => import("@/components/AnnouncementEditor"));
const button = "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 border px-4 py-2 text-sm font-black [overflow-wrap:anywhere] transition focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-45";
const primary = `${button} border-orange-400 bg-orange-500 text-black hover:bg-orange-300`;
const secondary = `${button} border-white/20 bg-white/5 text-white hover:border-orange-300/70`;
const fieldClass = "min-h-12 w-full min-w-0 border border-white/15 bg-black/50 px-3 py-2 text-white outline-none focus:border-orange-400 focus-visible:ring-1 focus-visible:ring-orange-400 placeholder:text-zinc-500";
const imageTypes = "image/jpeg,image/png,image/webp";
const imageSize = { avatar: limits.avatar, banner: limits.banner, gallery: limits.galleryImage };

type View = "profile" | "content" | "preview";
type EditorAction = "save" | "submit" | "publish";
type Operation = EditorAction | CasterMediaKind;
type ResultMessage = keyof CasterApplicationCopy["result"] | "published";
type OrderControl = { copy: CasterProfileCopy; index: number; count: number; move: (direction: -1 | 1) => void };

function listEntries(value: string) {
  return value.split(/[,，、]/u).map((entry) => entry.trim()).filter(Boolean);
}

function failureMessage(status: string): keyof CasterApplicationCopy["result"] {
  switch (status) {
    case "invalid":
    case "invalid_fields":
      return "invalid";
    case "incomplete":
      return "incomplete";
    case "conflict":
      return "conflict";
    case "legal_required":
    case "legal_unavailable":
      return "legal";
    case "locked":
    case "closed":
    case "hidden":
      return "locked";
    default:
      return "failed";
  }
}

async function persistEditor<Result extends { status: string }>(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as Result;
  return { result, succeeded: response.ok && result.status === "ok" };
}

export default function CasterApplicationEditor({
  initial, copy, locale, email, countries, retryLabel, profile, workspace, applicationSteps,
}: {
  initial: CasterPhase2Application;
  copy: CasterApplicationCopy;
  locale: string;
  email: string;
  countries: { code: string; label: string }[];
  retryLabel: string;
  profile?: { initial: CasterWorkingProfile; copy: CasterProfileCopy };
  workspace?: {
    panel: StudioEditorPanel;
    local: Locale;
    copy: StudioWorkspaceCopy;
    onWorkingChange: (state: StudioWorkingState) => void;
    portfolioCoverage: CasterCoverageAssignment[];
    portfolioVideos: CasterTournamentVideo[];
  };
  applicationSteps?: Pick<StudioWorkspaceCopy, "about" | "review" | "decisionSupport">;
}) {
  const [application, setApplication] = useState(initial);
  const [workingProfile, setWorkingProfile] = useState(profile?.initial);
  const profileCopy = profile?.copy;
  const [showCountry, setShowCountry] = useState(profile?.initial.show_country ?? false);
  const [draft, setDraft] = useState(() => ({ ...emptyCasterDraft(), ...(profile?.initial.draft ?? initial.draft) }));
  const [languageText, setLanguageText] = useState(() => draft.languages.join(", "));
  const [gameText, setGameText] = useState(() => draft.games.join(", "));
  const [view, setView] = useState<View>("profile");
  const [studioPreview, setStudioPreview] = useState<StudioEditorPanel | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [message, setMessage] = useState<{ key: ResultMessage; error: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const busy = useRef(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const approved = workingProfile ? workingProfile.membership_status === "active" : application.status === "approved" && application.membership_active;
  const directlyApproved = approved && !application.revision;
  const editable = workingProfile ? approved : application.status === "draft" || application.status === "changes_requested" || directlyApproved;
  const onWorkingChange = workspace?.onWorkingChange;
  const candidate = { ...draft, languages: listEntries(languageText), games: listEntries(gameText) };
  const complete = Boolean(candidate.displayName.trim() && candidate.languages.length && candidate.avatar &&
    candidate.bio && hasAnnouncementDocumentText(candidate.bio) && ((workingProfile && !showCountry) || candidate.country));
  const unpublished = workingProfile ? dirty || workingProfile.version !== workingProfile.published_version : false;
  const canPublish = Boolean(workingProfile && editable && !workingProfile.hidden && unpublished);

  useEffect(() => {
    if (workingProfile && onWorkingChange) onWorkingChange({ profile: workingProfile, dirty });
  }, [workingProfile, dirty, onWorkingChange]);

  useEffect(() => {
    if (!dirty) return;
    function confirmLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", confirmLeaving);
    return () => window.removeEventListener("beforeunload", confirmLeaving);
  }, [dirty]);

  function selectView(next: View) {
    setView(next);
    setOrderMessage("");
    requestAnimationFrame(() => stepHeading.current?.focus());
  }

  function toggleStudioPreview() {
    setStudioPreview((current) => current === workspace?.panel ? null : workspace?.panel ?? null);
    requestAnimationFrame(() => stepHeading.current?.focus());
  }

  function updateField<Key extends keyof CasterApplicationDraft>(key: Key, value: CasterApplicationDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage(null);
    setOrderMessage("");
  }

  function moveItem<Key extends "links" | "videos" | "gallery">(key: Key, index: number, direction: -1 | 1, label: string) {
    if (!profileCopy) return;
    const next = index + direction;
    const values = [...draft[key]];
    if (next < 0 || next >= values.length) return;
    const [item] = values.splice(index, 1);
    values.splice(next, 0, item);
    updateField(key, values as CasterApplicationDraft[Key]);
    setOrderMessage(`${direction === -1 ? profileCopy.moveUp : profileCopy.moveDown} · ${label} ${next + 1}`);
  }

  function begin(next: Operation) {
    if (busy.current) return false;
    busy.current = true;
    setOperation(next);
    setMessage(null);
    return true;
  }

  function finish() {
    busy.current = false;
    setOperation(null);
  }

  function acceptDraft(savedDraft: Partial<CasterApplicationDraft>) {
    const next = { ...emptyCasterDraft(), ...savedDraft };
    setDraft(next);
    setLanguageText(next.languages.join(", "));
    setGameText(next.games.join(", "));
    setDirty(false);
  }

  async function persist(action: EditorAction) {
    if (!editable || busy.current) return;
    if ((action === "publish" && !canPublish) || (action === "submit" && workingProfile)) return;
    if (action !== "save" && !complete) {
      if (workspace) setStudioPreview(null);
      else selectView("profile");
      setMessage({ key: "incomplete", error: true });
      return;
    }
    if (!begin(action)) return;
    const payload: CasterApplicationDraft = {
      ...candidate,
      links: candidate.links.filter(({ label, url }) => label.trim() || url.trim()),
      videos: candidate.videos.filter((url) => url.trim()),
    };
    try {
      if (workingProfile) await persistProfile(action, payload, workingProfile);
      else await persistApplication(action, payload);
    } catch {
      setMessage({ key: "failed", error: true });
    } finally {
      finish();
    }
  }

  async function persistApplication(action: EditorAction, payload: CasterApplicationDraft) {
    let version = application.draft_version;
    if (dirty || action === "save") {
      const { result, succeeded } = await persistEditor<CasterApplicationResult>(CASTER_APPLICATION_PATH, { action: "save", version, draft: payload });
      if (!succeeded || !result.application) {
        setMessage({ key: failureMessage(result.status), error: true });
        return;
      }
      setApplication(result.application);
      acceptDraft(result.application.draft);
      version = result.application.draft_version;
    }
    if (action === "submit") {
      const { result, succeeded } = await persistEditor<CasterApplicationResult>(CASTER_APPLICATION_PATH, { action: "submit", version });
      if (!succeeded || !result.application) {
        setMessage({ key: failureMessage(result.status), error: true });
        return;
      }
      setApplication(result.application);
      acceptDraft(result.application.draft);
      if (!workspace) selectView("preview");
    }
    setMessage({ key: action === "submit" ? "submitted" : "saved", error: false });
  }

  async function persistProfile(action: EditorAction, payload: CasterApplicationDraft, profile: CasterWorkingProfile) {
    let version = profile.version;
    if (dirty || action === "save") {
      const { result, succeeded } = await persistEditor<CasterWorkingResult>(CASTER_PROFILE_PATH, { action: "save", version, draft: payload, showCountry });
      if (!succeeded || !result.profile) {
        setMessage({ key: failureMessage(result.status), error: true });
        return;
      }
      setWorkingProfile(result.profile);
      acceptDraft(result.profile.draft);
      setShowCountry(result.profile.show_country);
      version = result.profile.version;
      if (action === "publish" && (result.profile.hidden || result.profile.membership_status !== "active")) {
        setMessage({ key: "locked", error: true });
        return;
      }
    }
    if (action === "publish") {
      const { result, succeeded } = await persistEditor<CasterWorkingResult>(CASTER_PROFILE_PATH, { action: "publish", version });
      if (!succeeded || !result.profile) {
        setMessage({ key: failureMessage(result.status), error: true });
        return;
      }
      setWorkingProfile(result.profile);
      acceptDraft(result.profile.draft);
      setShowCountry(result.profile.show_country);
      if (!workspace) selectView("preview");
    }
    setMessage({ key: action === "publish" ? "published" : "saved", error: false });
  }

  async function upload(kind: CasterMediaKind, file: File) {
    if (!editable || !begin(kind)) return;
    try {
      if (!imageTypes.split(",").includes(file.type) || file.size > imageSize[kind]) {
        setMessage({ key: "media", error: true });
        return;
      }
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const response = await fetch(CASTER_MEDIA_PATH, { method: "POST", body });
      const result = await response.json() as { id?: string; status: string };
      if (!response.ok || result.status !== "ok" || !result.id) {
        const error = failureMessage(result.status);
        setMessage({ key: error === "failed" ? "media" : error, error: true });
        return;
      }
      if (kind === "gallery") updateField("gallery", [...draft.gallery, result.id]);
      else updateField(kind, result.id);
    } catch {
      setMessage({ key: "media", error: true });
    } finally {
      finish();
    }
  }

  const statusHelp = directlyApproved ? copy.help.direct
    : approved ? copy.help.approved
    : application.status === "approved" ? copy.help.inactive
    : application.status === "submitted" ? copy.result.submitted
    : application.status === "rejected" ? applicationSteps?.decisionSupport ?? copy.help.private
    : copy.help.private;
  const messageText = !message ? null : message.key === "published" ? profileCopy?.publishedMessage : copy.result[message.key];
  const retry = message?.error && ["legal", "locked", "conflict"].includes(message.key);
  const saveDisabled = Boolean(operation) || !dirty;
  const useFullPreview = workspace ? studioPreview === workspace.panel : view === "preview";
  const editorView = workspace ? workspace.panel === "profile" ? "profile" : "content" : view;
  const step = workspace ? workspace.copy[workspace.panel]
    : editorView === "profile" ? applicationSteps?.about ?? copy.steps.profile : copy.steps.content;
  const showPreview = useFullPreview || (!editable && !workingProfile);
  const previewData = editable ? candidate : application.revision?.draft ?? draft;
  const publicCountry = workingProfile && showCountry ? countries.find(({ code }) => code === previewData.country)?.label : undefined;
  const portfolio = workspace && previewData.bio && previewData.avatar && previewData.displayName.trim()
    ? {
      slug: "", publication_id: "", display_name: previewData.displayName, avatar: previewData.avatar,
      languages: previewData.languages, games: previewData.games, platforms: [], banner: previewData.banner,
      bio: previewData.bio, experience: previewData.experience, country: showCountry ? previewData.country : null,
      links: previewData.links, videos: previewData.videos, gallery: previewData.gallery,
    } : null;
  const StatusIcon = application.status === "submitted" ? Clock3 : approved ? CheckCircle2 : PencilLine;
  const displayNameField = <Input label={copy.fields.displayName} required={copy.help.required} value={draft.displayName} maxLength={limits.displayName} onChange={(value) => updateField("displayName", value)} />;
  const countryField = (
    <label className="grid min-w-0 gap-2">
      <FieldLabel name={copy.fields.country} required={!workingProfile || showCountry ? copy.help.required : undefined} />
      <select className={fieldClass} aria-required={!workingProfile || showCountry} autoComplete="country" value={draft.country} onChange={(event) => updateField("country", event.target.value)}>
        <option value="">{copy.help.country}</option>
        {countries.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
  );
  const languageField = <Input label={copy.fields.languages} required={copy.help.required} help={copy.help.list} value={languageText} onChange={(value) => {
    setLanguageText(value); setDirty(true); setMessage(null);
  }} />;
  const gameField = <Input label={copy.fields.games} help={copy.help.list} value={gameText} onChange={(value) => {
    setGameText(value); setDirty(true); setMessage(null);
  }} />;
  const experienceField = (
    <label className="grid gap-2">
      <FieldLabel name={copy.fields.experience} />
      <textarea className={fieldClass} rows={4} value={draft.experience} maxLength={limits.experience} onChange={(event) => updateField("experience", event.target.value)} />
    </label>
  );
  const avatarField = <MediaField label={copy.fields.avatar} required={copy.help.required} kind="avatar" ids={draft.avatar ? [draft.avatar] : []} copy={copy}
    busy={operation === "avatar"} onUpload={upload} onRemove={() => updateField("avatar", null)} />;
  const bannerField = <MediaField label={copy.fields.banner} kind="banner" ids={draft.banner ? [draft.banner] : []} copy={copy}
    busy={operation === "banner"} onUpload={upload} onRemove={() => updateField("banner", null)} />;
  const biographyField = (
    <div>
      <FieldLabel name={copy.fields.bio} required={copy.help.required} />
      <AnnouncementEditor value={draft.bio} onChange={(bio) => updateField("bio", bio)} disabled={Boolean(operation)}
        copy={copy.editor} maxLength={limits.biography} allowLinks={false} countCodePoints locale={locale} />
    </div>
  );
  const countryVisibility = profileCopy ? (
    <label className="flex min-h-12 items-center gap-3 text-sm font-bold text-zinc-300">
      <input type="checkbox" checked={showCountry} className="size-5 shrink-0 accent-orange-500 focus-visible:outline-2 focus-visible:outline-orange-300" onChange={(event) => {
        setShowCountry(event.target.checked); setDirty(true); setMessage(null);
      }} />
      <span>{profileCopy.showCountry}</span>
    </label>
  ) : null;

  if (workingProfile && profileCopy && !editable) {
    return (
      <div className="border border-white/10 bg-white/[0.035] px-4 py-3 sm:px-5">
        <p className="font-bold text-orange-300" role="status">
          {workingProfile.membership_status === "suspended" ? profileCopy.suspended : profileCopy.inactive}
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-300">{profileCopy.inactiveHelp}</p>
      </div>
    );
  }

  const publicUrl = workingProfile?.slug && workingProfile.publication_id && !workingProfile.hidden
    ? casterPublicProfilePath(workingProfile.slug) : null;
  const publicationState = workingProfile && profileCopy
    ? workingProfile.hidden ? profileCopy.hidden : publicUrl ? profileCopy.published : complete ? profileCopy.draft : profileCopy.incomplete
    : null;
  const publicationHelp = workingProfile && profileCopy
    ? workingProfile.hidden ? profileCopy.hiddenHelp : publicUrl ? unpublished ? profileCopy.unpublishedChanges : profileCopy.publishedHelp : profileCopy.draftHelp
    : null;

  return (
    <div className="space-y-7">
      {!workspace || workingProfile?.hidden ? (
        <div className="flex min-w-0 items-start gap-3 border border-white/12 border-l-orange-400/80 bg-white/[0.035] px-4 py-4 sm:px-5">
          <StatusIcon size={19} aria-hidden="true" className="mt-0.5 shrink-0 text-orange-300" />
          <div className="min-w-0">
            <p className="font-bold text-orange-300" role="status">{publicationState ?? copy.status[application.status]}</p>
            <p className="mt-1 text-sm leading-6 text-zinc-300">{publicationHelp ?? statusHelp}</p>
            {publicUrl && profileCopy && !complete ? <p className="mt-1 text-sm text-orange-200">{profileCopy.incomplete}</p> : null}
            {publicUrl && profileCopy ? <a className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-200 underline focus-visible:outline-2" href={publicUrl}>{profileCopy.publicProfile}<ArrowRight aria-hidden="true" size={15} /></a> : null}
          </div>
        </div>
      ) : null}
      {application.feedback ? (
        <section className="border border-orange-400/30 bg-orange-500/10 px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 font-black text-orange-200"><PencilLine size={17} aria-hidden="true" className="shrink-0" />{copy.result.feedback}</h2>
          <p className="mt-1 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{application.feedback}</p>
        </section>
      ) : null}
      {message?.error ? (
        <div className="border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          <p>{messageText}</p>
          {retry ? <a className="inline-flex min-h-11 items-center underline" href="/caster-studio">{retryLabel}</a> : null}
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {operation === "publish" ? profileCopy?.publishing : operation ? copy.result[operation === "save" || operation === "submit" ? "pending" : "uploading"] : message?.error ? "" : messageText || orderMessage}
      </p>
      {messageText && !message?.error ? <p className="text-sm text-orange-200">{messageText}</p> : null}

      {editable && !workspace ? (
        <ol className={`grid border-b border-white/15 ${workingProfile ? "grid-cols-2" : "grid-cols-3"}`}>
          {(workingProfile ? ["profile", "content"] as const : ["profile", "content", "preview"] as const).map((item, index) => {
            const active = item === (workingProfile && view === "preview" ? "content" : view);
            const label = item === "profile" ? applicationSteps?.about ?? copy.steps.profile
              : item === "content" ? copy.steps.content : applicationSteps?.review ?? copy.preview.profile;
            return (
              <li key={item}>
                <button type="button" aria-current={active ? "step" : undefined} disabled={Boolean(operation)} onClick={() => selectView(item)}
                  className={`min-h-12 w-full border-b-2 px-2 py-2 text-left text-sm font-bold [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-orange-300 sm:px-4 ${active ? "border-orange-400 text-orange-200" : "border-transparent text-zinc-400 hover:text-white"}`}>
                  <span aria-hidden="true" className="mr-2 tabular-nums text-orange-300">{index + 1}.</span>{label}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className={workspace && !showPreview ? "grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.96fr)]" : "grid min-w-0 gap-5"}>
        {!showPreview ? (
          <section className={`min-w-0 space-y-4 ${workspace ? "border border-white/12 border-t-orange-400/75 bg-zinc-950 p-4 sm:p-5" : ""}`}>
            <h2 ref={stepHeading} tabIndex={-1} className="text-2xl font-black">{step}</h2>
            {workspace?.panel === "media" ? <p className="text-sm leading-6 text-zinc-300">{workspace.copy.privateMedia}</p> : null}
            <fieldset disabled={Boolean(operation)} className="grid min-w-0 gap-5">
              {editorView === "profile" && workspace ? (
                <>
                  <section className="grid gap-4" aria-labelledby="caster-profile-brand">
                    <h3 id="caster-profile-brand" className="border-b border-white/10 pb-2 text-base font-bold text-orange-200">{workspace.copy.branding}</h3>
                    {displayNameField}
                    {avatarField}
                    {bannerField}
                  </section>
                  <section className="grid gap-4" aria-labelledby="caster-profile-about">
                    <h3 id="caster-profile-about" className="border-b border-white/10 pb-2 text-base font-bold text-orange-200">{workspace.copy.aboutProfile}</h3>
                    {biographyField}
                    {languageField}
                    {gameField}
                    {experienceField}
                  </section>
                  <section className="grid gap-4" aria-labelledby="caster-profile-privacy">
                    <h3 id="caster-profile-privacy" className="border-b border-white/10 pb-2 text-base font-bold text-orange-200">{workspace.copy.privacy}</h3>
                    {countryField}
                    {countryVisibility}
                  </section>
                </>
              ) : editorView === "profile" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {displayNameField}
                    {countryField}
                    {languageField}
                    {workingProfile ? countryVisibility : <div className="min-w-0 space-y-2 text-sm">
                      <p className="font-bold">{copy.fields.email}</p>
                      <p className="flex min-h-12 items-center border border-white/10 bg-white/[0.035] px-3 text-zinc-300 [overflow-wrap:anywhere]">{email}</p>
                    </div>}
                  </div>
                  {avatarField}
                  {biographyField}
                  {!workingProfile ? <Input label={copy.fields.discord} value={draft.discord} maxLength={limits.discord} onChange={(value) => updateField("discord", value)} help={copy.help.discord} /> : null}
                </>
              ) : (
                <>
                  {!workspace ? bannerField : null}
                  <MediaField label={copy.fields.gallery} kind="gallery" ids={draft.gallery} copy={copy}
                    busy={operation === "gallery"} onUpload={upload} onRemove={(id) => updateField("gallery", draft.gallery.filter((item) => item !== id))}
                    order={profileCopy ? { copy: profileCopy, move: (index, direction) => moveItem("gallery", index, direction, copy.fields.gallery) } : undefined} />
                  <RepeatableFields title={copy.fields.links} limit={limits.links} count={draft.links.length} copy={copy}
                    onAdd={() => updateField("links", [...draft.links, { label: "", url: "" }])}>
                    {draft.links.map((link, index) => (
                      <RepeatedRow key={index} index={index} label={copy.fields.linkName} copy={copy}
                        order={profileCopy ? { copy: profileCopy, index, count: draft.links.length, move: (direction) => moveItem("links", index, direction, copy.fields.linkName) } : undefined}
                        onRemove={() => updateField("links", draft.links.filter((_, row) => row !== index))}>
                        <Input label={copy.fields.linkName} value={link.label} onChange={(label) => updateField("links", draft.links.map((item, row) => row === index ? { ...item, label } : item))} />
                        <Input label={copy.fields.linkUrl} value={link.url} type="url" onChange={(url) => updateField("links", draft.links.map((item, row) => row === index ? { ...item, url } : item))} />
                      </RepeatedRow>
                    ))}
                  </RepeatableFields>
                  <RepeatableFields title={copy.fields.videos} limit={limits.videos} count={draft.videos.length} copy={copy}
                    onAdd={() => updateField("videos", [...draft.videos, ""])}>
                    {draft.videos.map((video, index) => (
                      <RepeatedRow key={index} index={index} label={copy.fields.videoUrl} copy={copy}
                        order={profileCopy ? { copy: profileCopy, index, count: draft.videos.length, move: (direction) => moveItem("videos", index, direction, copy.fields.videoUrl) } : undefined}
                        onRemove={() => updateField("videos", draft.videos.filter((_, row) => row !== index))}>
                        <Input label={copy.fields.videoUrl} value={video} type="url" onChange={(value) => updateField("videos", draft.videos.map((item, row) => row === index ? value : item))} />
                      </RepeatedRow>
                    ))}
                  </RepeatableFields>
                  {!workspace ? <>{gameField}{experienceField}</> : null}
                </>
              )}
            </fieldset>
          </section>
        ) : null}
        {showPreview || workspace ? (
          <section className={`min-w-0 space-y-4 ${workspace && !showPreview ? "hidden xl:block" : ""}`}>
            <h2 ref={showPreview ? stepHeading : undefined} tabIndex={-1} className="text-2xl font-black">{copy.preview.profile}</h2>
            <p className="text-sm leading-6 text-zinc-400">{profileCopy?.preview ?? copy.help.preview}</p>
            {portfolio && workspace ? (
              <PublicCasterProfileView caster={portfolio} copy={getPublicCasterCopy(workspace.local)} locale={workspace.local}
                coverage={workspace.portfolioCoverage} tournamentVideos={workspace.portfolioVideos} mode="draft" />
            ) : <CasterApplicationPreview data={previewData} copy={copy} approved={approved} publicCountry={publicCountry} />}
            {!workingProfile && editable && !directlyApproved ? <p className="text-sm leading-6 text-zinc-300">{copy.help.submit}</p> : null}
          </section>
        ) : null}
      </div>
      {editable && !workingProfile && application.status === "changes_requested" && application.revision ? (
        <details className="space-y-3 border border-white/12 bg-zinc-950 p-4">
          <summary className="min-h-11 cursor-pointer font-bold leading-10 text-orange-200 focus-visible:outline-2">{copy.preview.profile} · {copy.status.submitted}</summary>
          <CasterApplicationPreview data={application.revision.draft} copy={copy} />
        </details>
      ) : null}

      {editable ? (
        <div className="space-y-3 border-t border-white/15 pt-4">
          {dirty ? <p className="text-xs text-zinc-400">{copy.result.unsaved}</p> : null}
          <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center">
            {!workspace && (view === "content" || view === "preview") ? (
              <button type="button" className={secondary} disabled={Boolean(operation)} onClick={() => selectView(view === "preview" ? "content" : "profile")}>
                <ArrowLeft size={17} aria-hidden="true" className="shrink-0" />{view === "preview" ? copy.actions.edit : copy.actions.previous}
              </button>
            ) : null}
            <button type="button" className={secondary} disabled={saveDisabled} onClick={() => void persist("save")}>
              <Save size={17} aria-hidden="true" className="shrink-0" />{operation === "save" ? copy.result.pending : copy.actions.save}
            </button>
            {workspace ? (
              <>
                <button type="button" className={secondary} disabled={Boolean(operation)} onClick={toggleStudioPreview}>
                  {useFullPreview ? <ArrowLeft size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                  {useFullPreview ? copy.actions.edit : copy.actions.preview}
                </button>
                {workingProfile && profileCopy && !workingProfile.hidden ? (
                  <button type="button" className={primary} disabled={Boolean(operation) || !canPublish} onClick={() => void persist("publish")}>
                    <Send size={17} aria-hidden="true" className="shrink-0" />
                    {operation === "publish" ? profileCopy.publishing : workingProfile.publication_id ? profileCopy.publishUpdate : profileCopy.publish}
                  </button>
                ) : null}
              </>
            ) : view === "profile" ? (
              <button type="button" className={primary} disabled={Boolean(operation)} onClick={() => selectView("content")}>
                {copy.actions.next}<ArrowRight size={17} aria-hidden="true" className="shrink-0" />
              </button>
            ) : view === "content" ? (
              <button type="button" className={primary} disabled={Boolean(operation)} onClick={() => selectView("preview")}>
                <Eye size={17} aria-hidden="true" className="shrink-0" />{copy.actions.preview}
              </button>
            ) : workingProfile && profileCopy ? (
              !workingProfile.hidden ? (
                <button type="button" className={primary} disabled={Boolean(operation) || !canPublish} onClick={() => void persist("publish")}>
                  <Send size={17} aria-hidden="true" className="shrink-0" />
                  {operation === "publish" ? profileCopy.publishing : workingProfile.publication_id ? profileCopy.publishUpdate : profileCopy.publish}
                </button>
              ) : null
            ) : !directlyApproved ? (
              <button type="button" className={primary} disabled={Boolean(operation)} onClick={() => void persist("submit")}>
                <Send size={17} aria-hidden="true" className="shrink-0" />
                {operation === "submit" ? copy.result.pending : application.status === "changes_requested" ? copy.actions.resubmit : copy.actions.submit}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FieldLabel({ name, required }: { name: string; required?: string }) {
  return (
    <span className="text-sm font-bold">
      {name}{required ? <span className="ml-2 text-xs font-normal text-orange-200">· {required}</span> : null}
    </span>
  );
}

function Input({ label, value, onChange, required, help, maxLength, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: string;
  help?: string;
  maxLength?: number;
  type?: "text" | "url";
}) {
  return (
    <label className="grid min-w-0 content-start gap-2">
      <FieldLabel name={label} required={required} />
      <input type={type} autoComplete="off" className={fieldClass} value={value} aria-required={Boolean(required)} maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)} />
      {help ? <span className="text-xs leading-5 text-zinc-400">{help}</span> : null}
    </label>
  );
}

function MediaField({ label, required, kind, ids, copy, busy, onUpload, onRemove, order }: {
  label: string;
  required?: string;
  kind: CasterMediaKind;
  ids: string[];
  copy: CasterApplicationCopy;
  busy: boolean;
  onUpload: (kind: CasterMediaKind, file: File) => Promise<void>;
  onRemove: (id: string) => void;
  order?: { copy: CasterProfileCopy; move: (index: number, direction: -1 | 1) => void };
}) {
  const canUpload = kind !== "gallery" || ids.length < limits.gallery;
  return (
    <section className="space-y-3 border border-white/10 bg-black/35 p-3 sm:p-4">
      {canUpload ? (
        <label className="grid gap-2">
          <FieldLabel name={label} required={required} />
          <input type="file" accept={imageTypes} aria-required={Boolean(required) && ids.length === 0}
            className="min-h-11 min-w-0 border border-white/15 bg-black/45 px-2 py-2 text-sm text-zinc-300 file:mr-3 file:bg-orange-500 file:px-3 file:py-1 file:font-bold file:text-black focus-visible:outline-2 focus-visible:outline-orange-300"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onUpload(kind, file);
              event.target.value = "";
            }} />
          <span className="text-xs leading-5 text-zinc-400">{copy.help.uploads} {imageSize[kind] / 1024 / 1024} MiB.</span>
        </label>
      ) : <FieldLabel name={label} />}
      {busy ? <p className="text-sm text-orange-200">{copy.result.uploading}</p> : null}
      {ids.length ? (
        <ul className={kind === "gallery" ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "max-w-52"}>
          {ids.map((id, index) => (
            <li key={id} className="min-w-0 border border-white/10">
              <div className={`relative overflow-hidden bg-zinc-950 ${kind === "avatar" ? "aspect-square max-h-32" : "aspect-video"}`}>
                <Image src={casterMediaPath(id)} alt="" fill unoptimized sizes="(max-width: 640px) 44vw, 220px" className="object-cover" />
              </div>
              <div className={order && ids.length > 1 ? "flex flex-wrap items-center justify-center gap-1 px-2 py-1" : undefined}>
                {order && ids.length > 1 ? (
                  <MoveControls label={label} order={{ copy: order.copy, index, count: ids.length, move: (direction) => order.move(index, direction) }} />
                ) : null}
                <button type="button" className={`min-h-11 px-2 text-sm font-bold text-orange-200 underline focus-visible:outline-2 focus-visible:outline-orange-300 ${order && ids.length > 1 ? "" : "w-full"}`}
                  aria-label={`${copy.actions.remove} · ${label}${kind === "gallery" ? ` ${index + 1}` : ""}`} onClick={() => onRemove(id)}>{copy.actions.remove}</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RepeatableFields({ title, limit, count, copy, onAdd, children }: {
  title: string;
  limit: number;
  count: number;
  copy: CasterApplicationCopy;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border border-white/10 bg-black/35 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{title} <span className="ml-2 font-normal tabular-nums text-zinc-400">{count} / {limit}</span></h3>
        <button type="button" disabled={count >= limit} className={secondary} aria-label={`${copy.actions.add} · ${title}`} onClick={onAdd}>{copy.actions.add}</button>
      </div>
      {children}
    </section>
  );
}

function RepeatedRow({ index, label, copy, onRemove, order, children }: {
  index: number;
  label: string;
  copy: CasterApplicationCopy;
  onRemove: () => void;
  order?: OrderControl;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">{children}</div>
      <div className="flex min-w-0 flex-wrap gap-2">
        {order && order.count > 1 ? <MoveControls label={label} order={order} /> : null}
        <button className={secondary} type="button" aria-label={`${copy.actions.remove} · ${label} ${index + 1}`} onClick={onRemove}>{copy.actions.remove}</button>
      </div>
    </div>
  );
}

function MoveControls({ label, order }: { label: string; order: OrderControl }) {
  const buttonClass = "inline-flex size-11 shrink-0 items-center justify-center border border-white/15 text-orange-200 hover:border-orange-400/60 focus-visible:outline-2 focus-visible:outline-orange-300 aria-disabled:opacity-40";
  return <>
    <button type="button" className={buttonClass} aria-label={`${order.copy.moveUp} · ${label} ${order.index + 1}`}
      aria-disabled={order.index === 0} onClick={() => order.move(-1)}><ArrowUp aria-hidden="true" size={16} /></button>
    <button type="button" className={buttonClass} aria-label={`${order.copy.moveDown} · ${label} ${order.index + 1}`}
      aria-disabled={order.index === order.count - 1} onClick={() => order.move(1)}><ArrowDown aria-hidden="true" size={16} /></button>
  </>;
}
