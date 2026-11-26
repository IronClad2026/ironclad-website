import Link from "next/link";
import { notFound } from "next/navigation";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import CasterApplicationPreview from "@/components/caster/CasterApplicationPreview";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { emptyCasterDraft } from "@/lib/caster/application";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { casterPublicProfilePath } from "@/lib/caster/publication";
import { casterRpc } from "@/lib/caster/server";
import { formatRegionName } from "@/lib/i18n/format";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import CasterAdminNavigation from "../../CasterAdminNavigation";
import { casterAdminDate, isCasterApplicationId } from "../../admin-application-contracts";
import { casterAdminFrame, casterAdminPanel, casterAdminSecondary } from "../../admin-application-styles";
import { CASTER_MODERATION_PATH, membershipLabels, moderationLabels, type CasterModerationDetail } from "../../moderation-contracts";
import ModerationForm from "./ModerationForm";

export const dynamic = "force-dynamic";

export default async function CasterModerationDetailPage({ params }: { params: Promise<{ applicationId: string }> }) {
  if (!isCasterProgramEnabled()) notFound();
  let actor: string;
  try {
    actor = await requireCurrentPatch2Admin();
    await requireCurrentAccountLegalAcceptance();
  } catch {
    return <AdminAccessRequired />;
  }
  const { applicationId } = await params;
  if (!isCasterApplicationId(applicationId)) notFound();

  const detail = await casterRpc<CasterModerationDetail>("caster_phase3_admin_detail", {
    p_actor: actor, p_application_id: applicationId,
  });
  if (detail?.status === "not_found") notFound();
  if (detail?.status !== "ok" || !detail.caster) {
    return (
      <main className={casterAdminFrame}>
        <h1 className="text-3xl font-black">Caster moderation</h1>
        <CasterAdminNavigation current="moderation" />
        <p role="alert" className="text-orange-200">The caster record could not be loaded. Reload to retry.</p>
      </main>
    );
  }

  const { caster, publication, history, publications } = detail;
  const live = !caster.closed && !caster.hidden && caster.membership_status === "active" && publication;

  return (
    <main className={casterAdminFrame}>
      <CasterAdminNavigation current="moderation" />
      <Link href={CASTER_MODERATION_PATH} prefetch={false} className={casterAdminSecondary}>Back to caster moderation</Link>
      <div className="min-w-0">
        <h1 className="break-words text-3xl font-black sm:text-4xl">{caster.display_name || "Approved caster"}</h1>
        <p className="mt-2 break-all text-sm text-zinc-400">{caster.owner_clerk_user_id}</p>
      </div>
      <section className={casterAdminPanel} aria-labelledby="caster-record-status">
        <h2 id="caster-record-status" className="text-xl font-bold">Status</h2>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="font-bold">Membership</dt><dd className="mt-1 text-orange-200">{membershipLabels[caster.membership_status]}</dd></div>
          <div><dt className="font-bold">Visibility setting</dt><dd className="mt-1 text-zinc-300">{caster.hidden ? "Hidden" : "Visible"}</dd></div>
          <div><dt className="font-bold">Public profile</dt><dd className="mt-1 text-zinc-300">
            {caster.closed ? "Account closed" : live ? "Live" : publication ? "Unavailable to visitors" : "Publication pending"}
          </dd></div>
        </dl>
        {live ? <Link href={casterPublicProfilePath(live.slug)} prefetch={false} className={`${casterAdminSecondary} mt-4`}>View live profile</Link> : null}
      </section>

      <section className={casterAdminPanel} aria-labelledby="caster-current-publication">
        <h2 id="caster-current-publication" className="mb-4 text-xl font-bold">Current published revision</h2>
        {publication ? <CasterApplicationPreview approved={caster.membership_status === "active"}
          publicCountry={publication.country ? formatRegionName(publication.country, "en", publication.country) : undefined}
          data={{
            ...emptyCasterDraft(),
            displayName: publication.display_name,
            avatar: publication.avatar,
            banner: publication.banner,
            languages: publication.languages,
            games: publication.games,
            bio: publication.bio,
            experience: publication.experience,
            links: publication.links,
            videos: publication.videos,
            gallery: publication.gallery,
          }} /> : <p className="text-sm text-zinc-400">This caster has yet to publish a profile.</p>}
      </section>

      {!caster.closed && caster.owner_clerk_user_id !== actor ? <ModerationForm caster={caster} /> : null}
      {!caster.closed && caster.owner_clerk_user_id === actor ? (
        <p className="text-sm text-zinc-300">Your caster record requires a decision from another administrator.</p>
      ) : null}

      <section className={casterAdminPanel} aria-labelledby="caster-audit-history">
        <h2 id="caster-audit-history" className="text-xl font-bold">Moderation history</h2>
        {history.length ? <ol className="mt-3 divide-y divide-white/10">
          {history.map((event) => <li key={event.id} className="py-3 text-sm">
            <p className="font-bold text-orange-200">{moderationLabels[event.action]}</p>
            <p className="mt-1 break-all text-zinc-400">{casterAdminDate(event.created_at)} · {event.actor}</p>
            <p className="mt-2 break-words whitespace-pre-wrap text-zinc-300">{event.reason}</p>
            {event.publication_id ? <p className="mt-1 break-all text-xs text-zinc-400">Revision {event.publication_id}</p> : null}
          </li>)}
        </ol> : <p className="mt-3 text-sm text-zinc-400">No moderation decisions recorded.</p>}
      </section>

      <section className={casterAdminPanel} aria-labelledby="caster-publication-history">
        <h2 id="caster-publication-history" className="text-xl font-bold">Publication history</h2>
        {publications.length ? <ol className="mt-3 divide-y divide-white/10">
          {publications.map((revision) => <li key={revision.id} className="py-3 text-sm">
            <p className="break-words font-bold">{revision.display_name}{revision.id === caster.publication_id ? " · Current revision" : ""}</p>
            <p className="mt-1 text-zinc-400">Draft version {revision.version} · {casterAdminDate(revision.created_at)}</p>
          </li>)}
        </ol> : <p className="mt-3 text-sm text-zinc-400">No published revisions recorded.</p>}
      </section>
    </main>
  );
}
