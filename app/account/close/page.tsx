import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NoticeDialog, NoticeSignOut, NoticeSubmit } from "@/components/legal/PublicProfileNoticeControls";
import { getRequestLocale } from "@/lib/i18n/request";
import { getPublicGamingProfileNoticeCopy } from "@/lib/i18n/public-gaming-profile-notice";
import { VERIFIED_DISCORD_TICKET_URL } from "@/lib/support";
import { ACCOUNT_CLOSE_SAVE_PATH, isPublicProfileNoticeInstalled, PUBLIC_PROFILE_NOTICE_PATH } from "@/lib/public-gaming-profile-notice";

type ClosePageProps = { searchParams: Promise<{ result?: string }> };

export default async function CloseAccountPage({ searchParams }: ClosePageProps) {
  const [{ userId }, query, locale] = await Promise.all([auth(), searchParams, getRequestLocale()]);
  if (!userId) redirect("/sign-in");
  if (!isPublicProfileNoticeInstalled()) redirect("/profile");
  const copy = getPublicGamingProfileNoticeCopy(locale);

  return (
    <NoticeDialog title={copy.closeAccount}>
      <p className="mt-4 text-sm leading-7 text-zinc-300">{copy.closeDescription}</p>
      <form action={ACCOUNT_CLOSE_SAVE_PATH} method="post" className="mt-5 space-y-4">
        <label className="block space-y-1 text-sm">
          <span>{copy.closeConfirmation}</span>
          <input name="confirmation" required pattern="DELETE" autoComplete="off"
            className="block min-h-11 w-full rounded-lg border border-white/20 bg-zinc-900 px-3 py-2" />
        </label>
        {query.result && (
          <p role="alert" className="text-sm text-red-300">
            {query.result === "clerk-failed" ? copy.closeProviderError : copy.closeError}
          </p>
        )}
        <NoticeSubmit label={copy.closeAccount} pendingLabel={copy.pending} />
      </form>
      <nav aria-label={copy.options} className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-orange-200">
        <a href={PUBLIC_PROFILE_NOTICE_PATH} className="inline-flex min-h-11 items-center underline">{copy.returnToNotice}</a>
        <a href="/privacy" className="inline-flex min-h-11 items-center underline">{copy.privacy}</a>
        {VERIFIED_DISCORD_TICKET_URL && <a href={VERIFIED_DISCORD_TICKET_URL} className="inline-flex min-h-11 items-center underline">{copy.support}</a>}
        <NoticeSignOut label={copy.signOut} />
      </nav>
    </NoticeDialog>
  );
}
