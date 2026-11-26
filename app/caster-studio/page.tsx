import { SignOutButton, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CASTER_SIGN_IN_PATH, CASTER_STUDIO_PATH, INVITATION_PATH, type CasterApplication } from "@/lib/caster/contracts";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { CONTINUATION_COOKIE, readInvitationContinuation } from "@/lib/caster/invitation-secret";
import { casterRpc, loadCurrentCasterAccount } from "@/lib/caster/server";
import { getCasterStudioCopy } from "@/lib/caster/studio-copy";
import { getRequestLocale } from "@/lib/i18n/request";
import { VERIFIED_DISCORD_TICKET_URL } from "@/lib/support";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Caster application · IronClad", robots: { index: false, follow: false }, referrer: "same-origin" };

const button = "inline-flex min-h-12 items-center justify-center border px-5 py-3 text-sm font-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300";
const primary = `${button} border-orange-400 bg-orange-500 text-black hover:bg-orange-300`;
const secondary = `${button} border-white/20 bg-white/[0.035] text-white hover:border-orange-300/70`;

export default async function CasterStudio({ searchParams }: { searchParams: Promise<{ claim?: string }> }) {
  if (!isCasterProgramEnabled()) notFound();
  const account = await loadCurrentCasterAccount();
  if (account.status === "signed_out") redirect(CASTER_SIGN_IN_PATH);

  const [locale, jar, query] = await Promise.all([getRequestLocale(), cookies(), searchParams]);
  const copy = getCasterStudioCopy(locale);
  const snapshot = account.status === "open"
    ? await casterRpc<{ status: "open" | "closed"; application: CasterApplication | null }>("caster_phase1_get_application", { p_actor: account.id })
    : null;
  const application = snapshot?.status === "open" ? snapshot.application : null;
  const mayClaim = snapshot?.status === "open" && Boolean(readInvitationContinuation(jar.get(CONTINUATION_COOKIE)?.value));
  const retry = ["account_changed", "rate_limited", "legal_required", "legal_unavailable", "service_unavailable"].includes(query.claim ?? "");

  return (
    <main className="mx-auto min-h-svh max-w-3xl px-5 py-16 text-white sm:px-8">
      <section className="border border-white/10 border-t-orange-500 bg-zinc-950 px-6 py-8 sm:px-10 sm:py-12">
        <p className="mb-3 text-sm font-black uppercase text-orange-300">{copy.programme}</p>
        <h1 className="mb-6 text-3xl font-black sm:text-4xl">{copy.title}</h1>
        {application ? (
          <div className="space-y-4">
            <p className="font-bold text-orange-300" role="status">{copy.draft}</p>
            <p>{copy.opened}</p>
            <p className="text-sm text-zinc-400">{copy.next}</p>
          </div>
        ) : account.status === "open" && mayClaim ? (
          <div className="space-y-5">
            <p className="break-all"><span className="text-zinc-400">{copy.account}</span> {account.email ?? account.id}</p>
            {retry && <p role="alert" className="text-orange-200">{copy.unavailable}</p>}
            {account.emailVerified ? (
              <form action="/api/caster/invitation/claim" method="post" className="space-y-5">
                <input type="hidden" name="account" value={account.id} />
                <label className="flex items-start gap-3">
                  <input className="mt-1 size-5 shrink-0 accent-orange-500" type="checkbox" name="accept" value="yes" required />
                  <span>{copy.consent}</span>
                </label>
                <button className={primary} type="submit">{copy.confirm}</button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <p role="status">{copy.verify}</p>
                <UserButton />
              </div>
            )}
          </div>
        ) : (
          <p role="status" className="text-zinc-300">
            {snapshot?.status === "open" ? copy.lost : copy.unavailable}
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
          {!application && <a href={INVITATION_PATH} className={secondary}>{copy.recover}</a>}
          {account.status === "open" && mayClaim && !account.emailVerified && (
            <a href={CASTER_STUDIO_PATH} className={secondary}>{copy.retry}</a>
          )}
          <SignOutButton redirectUrl={CASTER_SIGN_IN_PATH}>
            <button type="button" className={secondary}>{mayClaim && !application ? copy.switchAccount : copy.signout}</button>
          </SignOutButton>
          {VERIFIED_DISCORD_TICKET_URL && <a className="min-h-12 px-2 py-3 text-orange-200 underline" href={VERIFIED_DISCORD_TICKET_URL} rel="noreferrer">{copy.support}</a>}
        </div>
      </section>
    </main>
  );
}
