import { ArrowLeft, ClipboardList, FileCheck2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import CasterApplicationPreview from "@/components/caster/CasterApplicationPreview";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { casterRpc } from "@/lib/caster/server";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import CasterAdminNavigation from "../../CasterAdminNavigation";
import { loadCasterAdminAccount } from "../../admin-clerk-account";
import {
  CASTER_APPLICATIONS_ADMIN_PATH,
  applicationStatuses,
  casterAdminDate,
  isCasterApplicationId,
  type CasterAdminApplicationDetail,
} from "../../admin-application-contracts";
import { casterAdminFrame, casterAdminPanel, casterAdminSecondary } from "../../admin-application-styles";
import ApplicationReviewForm from "./ApplicationReviewForm";

export const dynamic = "force-dynamic";

const historyLabels: Record<CasterAdminApplicationDetail["history"][number]["decision"], string> = {
  submitted: "Submitted",
  approve: "Approved",
  reject: "Rejected",
  request_changes: "Changes requested",
  reopen: "Reopened",
  grant: "Caster access granted",
};
const countries = new Intl.DisplayNames(["en"], { type: "region" });

export default async function CasterApplicationReviewPage({ params }: {
  params: Promise<{ applicationId: string }>;
}) {
  if (!isCasterProgramEnabled()) notFound();
  let actor: string;
  try {
    actor = await requireCurrentPatch2Admin();
  } catch {
    return <AdminAccessRequired />;
  }
  const { applicationId } = await params;
  if (!isCasterApplicationId(applicationId)) notFound();
  const detail = await casterRpc<CasterAdminApplicationDetail>("caster_phase2_admin_detail", {
    p_actor: actor, p_application_id: applicationId,
  });
  if (detail?.status === "not_found") notFound();
  if (detail?.status !== "ok") {
    return (
      <main className={casterAdminFrame}>
        <h1 className="text-3xl font-black">Caster application review</h1>
        <CasterAdminNavigation current="applications" />
        <p role="alert" className="text-orange-200">This application could not be loaded. Reload to retry.</p>
      </main>
    );
  }
  const { application, history, invitation } = detail;
  if (!application) notFound();

  const account = await loadCasterAdminAccount(application.owner_clerk_user_id);
  const selectedRevision = application.revision;
  const canReview = application.owner_clerk_user_id !== actor &&
    (application.status === "submitted" || application.status === "rejected") &&
    selectedRevision?.id === application.submitted_revision_id;

  return (
    <main className={casterAdminFrame}>
      <CasterAdminNavigation current="applications" />
      <header className={`${casterAdminPanel} flex min-w-0 flex-wrap items-end justify-between gap-4 border-t-orange-400/60`}>
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-black sm:text-4xl">
            {application.revision?.draft.displayName || "Caster application review"}
          </h1>
          <p className="mt-3 inline-flex items-center border border-orange-400/35 bg-orange-500/10 px-3 py-1 text-sm font-bold text-orange-200">
            {applicationStatuses[application.status]}
          </p>
        </div>
        <Link href={CASTER_APPLICATIONS_ADMIN_PATH} prefetch={false} className={`${casterAdminSecondary} gap-2`}>
          <ArrowLeft size={17} aria-hidden="true" />Back to applications
        </Link>
      </header>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
        <section className={`${casterAdminPanel} min-w-0`} aria-labelledby="account-invitation">
          <h2 id="account-invitation" className="mb-3 flex items-center gap-2 text-xl font-bold">
            <ShieldCheck size={20} aria-hidden="true" className="shrink-0 text-orange-300" />Account and invitation
          </h2>
          <dl className="grid gap-4 divide-y divide-white/10 text-sm [&>div+div]:pt-4">
            <div className="min-w-0">
              <dt className="font-bold">IronClad account</dt>
              {account && <dd className="break-words text-zinc-300">{account.name}</dd>}
              <dd className="break-all text-zinc-400">{application.owner_clerk_user_id}</dd>
            </div>
            <div className="min-w-0">
              <dt className="font-bold">Primary email</dt>
              {account?.email && <dd className="break-all text-zinc-300">{account.email}</dd>}
              <dd className={`mt-1 text-xs font-semibold ${account?.verified ? "text-emerald-200" : "text-orange-200"}`}>
                {account ? (account.verified ? "Verified" : "Verification required") : "Could not check account"}
                {account && !account.available ? " · Account unavailable" : ""}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="font-bold">Invitation</dt>
              {invitation ? (
                <>
                  <dd className="break-words text-zinc-300">{invitation.reference || "Individual invitation"}</dd>
                  <dd className="break-all text-zinc-400">{invitation.id}</dd>
                  <dd className="mt-1 space-y-1 text-zinc-400">
                    <span className="block">Issued {casterAdminDate(invitation.created_at)}</span>
                    <span className="block">Claimed {casterAdminDate(invitation.claimed_at)}</span>
                  </dd>
                </>
              ) : <dd className="text-zinc-400">No invitation associated with this application.</dd>}
            </div>
            <div className="min-w-0">
              <dt className="font-bold">Official caster access</dt>
              <dd className="text-zinc-400">{application.membership_active ? "Active" : "Not active"}</dd>
            </div>
          </dl>
        </section>

        <section className={`${casterAdminPanel} min-w-0`} aria-labelledby="frozen-submission">
          <h2 id="frozen-submission" className="flex items-center gap-2 text-xl font-bold">
            <FileCheck2 size={20} aria-hidden="true" className="shrink-0 text-orange-300" />Submitted profile preview
          </h2>
          {selectedRevision ? (
            <>
              <p className="mt-2 inline-flex border border-white/15 bg-black/40 px-2.5 py-1 text-xs font-semibold text-zinc-300">
                Revision {selectedRevision.version} · Submitted {casterAdminDate(selectedRevision.submitted_at)}
              </p>
              <dl className="mt-4 grid gap-3 border border-white/10 bg-black/30 p-3 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="font-bold">Country</dt>
                  <dd className="break-words text-zinc-300">
                    {selectedRevision.draft.country ? countries.of(selectedRevision.draft.country) : "Not supplied"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-bold">Private Discord contact</dt>
                  <dd className="break-all text-zinc-300">{selectedRevision.draft.discord || "Not supplied"}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <CasterApplicationPreview
                  data={selectedRevision.draft}
                  approved={application.status === "approved" && application.membership_active}
                />
              </div>
            </>
          ) : <p className="mt-3 text-zinc-400">No profile revision has been submitted.</p>}
        </section>
      </div>

      <div className={`grid min-w-0 items-start gap-5 ${canReview ? "lg:grid-cols-2" : ""}`}>
        {canReview && selectedRevision && (application.status === "submitted" || application.status === "rejected") && (
          <ApplicationReviewForm
            key={`${selectedRevision.id}:${application.status}`}
            applicationId={application.id}
            revisionId={selectedRevision.id}
            revisionVersion={selectedRevision.version}
            status={application.status}
            canApprove={Boolean(account?.verified && account.available)}
          />
        )}

        <section className={`${casterAdminPanel} min-w-0`} aria-labelledby="review-history">
          <h2 id="review-history" className="flex items-center gap-2 text-xl font-bold">
            <ClipboardList size={20} aria-hidden="true" className="shrink-0 text-orange-300" />Application history
          </h2>
          {history.length ? (
            <ol className="mt-4 border-l border-orange-400/30 pl-4">
              {history.map((event) => (
                <li key={event.id} className="relative border-b border-white/10 py-3 text-sm last:border-b-0">
                  <span aria-hidden="true" className="absolute top-5 -left-[1.23rem] size-2 bg-orange-400" />
                  <p className="font-bold text-orange-200">{historyLabels[event.decision]}</p>
                  <p className="mt-1 break-all text-zinc-400">{casterAdminDate(event.created_at)} · {event.actor}</p>
                  {event.revision_id && (
                    <p className="mt-1 break-all text-xs text-zinc-400">
                      Revision {event.revision_id === selectedRevision?.id ? selectedRevision.version : event.revision_id}
                    </p>
                  )}
                  {event.feedback && <p className="mt-2 break-words whitespace-pre-wrap text-zinc-300">{event.feedback}</p>}
                </li>
              ))}
            </ol>
          ) : <p className="mt-3 text-zinc-400">No review activity yet.</p>}
        </section>
      </div>
    </main>
  );
}
