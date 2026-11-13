"use client";

import { useActionState } from "react";
import { saveLegacyGamingProfilePublication } from "@/app/profile/gaming-profile-publication-action";
import type { GamingProfilePublication } from "@/lib/gaming-profile-publication";
import type { getGamingProfilePublicationCopy } from "@/lib/i18n/gaming-profile-publication";

type GamingProfilePublicationCardProps = {
  publication: GamingProfilePublication;
  copy: ReturnType<typeof getGamingProfilePublicationCopy>;
  hasProfile: boolean;
};

export default function GamingProfilePublicationCard({
  publication,
  copy,
  hasProfile,
}: GamingProfilePublicationCardProps) {
  const [result, action, pending] = useActionState(saveLegacyGamingProfilePublication, { status: "idle" });
  const current = result.publication && result.publication.revision >= publication.revision
    ? result.publication
    : publication;
  const canPublish = !current.public && !current.objectionOpen;

  return (
    <section className="mb-6 border border-white/12 bg-zinc-950/85 p-5 sm:p-6" aria-labelledby="gaming-profile-visibility">
      <h2 id="gaming-profile-visibility" className="text-xl font-semibold text-white">{copy.heading}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{copy.description}</p>
      <p className="mt-2 text-sm font-semibold text-zinc-100">
        {hasProfile ? (current.public ? copy.publicationStatus : copy.privateStatus) : copy.newProfileDisclosure}
      </p>
      {current.mode === "legacy" && (
        <>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{copy.legacyDescription}</p>
          {current.objectionOpen && <p className="mt-2 text-sm text-amber-200">{copy.objectionStatus}</p>}
          <form action={action} key={`${current.revision}:${canPublish}`} className="mt-4 space-y-3">
            <input type="hidden" name="revision" value={current.revision} />
            <input type="hidden" name="publication" value={canPublish ? "public" : "private"} />
            {canPublish && (
              <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-zinc-100">
                <input type="checkbox" name="confirmPublication" value="yes" required disabled={pending} className="mt-1 h-5 w-5 shrink-0 accent-orange-400" />
                {copy.confirmationLabel}
              </label>
            )}
            <button type="submit" disabled={pending} className="min-h-11 border border-orange-500/40 px-4 text-sm font-semibold text-orange-100 hover:bg-orange-500/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-60">
              {pending ? copy.saving : canPublish ? copy.publish : copy.keepPrivate}
            </button>
          </form>
          {result.status !== "idle" && <p role="status" className="mt-3 text-sm text-zinc-200">{copy[result.status]}</p>}
        </>
      )}
    </section>
  );
}
