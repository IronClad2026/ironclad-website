import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NoticeDialog, NoticeSignOut, NoticeSubmit } from "@/components/legal/PublicProfileNoticeControls";
import { getRequestLocale } from "@/lib/i18n/request";
import { getPublicGamingProfileNoticeCopy } from "@/lib/i18n/public-gaming-profile-notice";
import { VERIFIED_DISCORD_TICKET_URL } from "@/lib/support";
import {
  ACCOUNT_CLOSE_PATH,
  isPublicProfileNoticeInstalled,
  noticeReturnPath,
  PUBLIC_PROFILE_NOTICE_PATH,
  PUBLIC_PROFILE_NOTICE_SAVE_PATH,
  PUBLIC_PROFILE_NOTICE_VERSION,
} from "@/lib/public-gaming-profile-notice";
import { loadPublicGamingProfileNotice } from "@/lib/public-gaming-profile-notice-server";

type NoticePageProps = {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
};

export default async function PublicProfileNoticePage({ searchParams }: NoticePageProps) {
  const [{ userId }, query, locale] = await Promise.all([auth(), searchParams, getRequestLocale()]);
  if (!userId) redirect("/sign-in");
  const returnTo = noticeReturnPath(query.returnTo);
  if (!isPublicProfileNoticeInstalled()) redirect(returnTo);
  const notice = await loadPublicGamingProfileNotice(userId);
  if (notice === "inactive" || notice === "satisfied") redirect(returnTo);

  const copy = getPublicGamingProfileNoticeCopy(locale);
  const retry = PUBLIC_PROFILE_NOTICE_PATH + "?" + new URLSearchParams({ returnTo });
  return (
    <NoticeDialog title={copy.title}>
      <div className="mt-4 space-y-3 text-sm leading-7 text-zinc-300 sm:text-base">
        <p>{copy.publicFields}</p>
        <p>{copy.contact}</p>
        <p>{copy.privateFields}</p>
      </div>
      {notice === "required" && (
        <form action={PUBLIC_PROFILE_NOTICE_SAVE_PATH} method="post" className="mt-6 space-y-4">
          <input type="hidden" name="noticeVersion" value={PUBLIC_PROFILE_NOTICE_VERSION} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-white/20 bg-white/5 p-3 text-sm leading-6">
            <input type="checkbox" name="acknowledged" value="yes" required className="mt-1 h-5 w-5 shrink-0 accent-orange-500" />
            <span>{copy.checkbox}</span>
          </label>
          {query.error && <p role="alert" className="text-sm text-red-300">{query.error === "required" ? copy.requiredError : copy.saveError}</p>}
          <NoticeSubmit label={copy.submit} pendingLabel={copy.pending} />
        </form>
      )}
      {notice === "unavailable" && (
        <div className="mt-6">
          <p role="alert" className="text-sm text-red-300">{copy.saveError}</p>
          <a href={retry} className="inline-flex min-h-11 items-center text-orange-200 underline">{copy.retry}</a>
        </div>
      )}
      <nav aria-label={copy.options} className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-orange-200">
        <a href="/privacy" className="inline-flex min-h-11 items-center underline">{copy.privacy}</a>
        {VERIFIED_DISCORD_TICKET_URL && <a href={VERIFIED_DISCORD_TICKET_URL} className="inline-flex min-h-11 items-center underline">{copy.support}</a>}
        <a href={ACCOUNT_CLOSE_PATH} className="inline-flex min-h-11 items-center underline">{copy.closeAccount}</a>
        <NoticeSignOut label={copy.signOut} />
      </nav>
    </NoticeDialog>
  );
}
