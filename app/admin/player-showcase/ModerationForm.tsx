"use client";

import { useActionState } from "react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { ShowcaseModerationRow } from "@/lib/player-showcase/moderation";
import { moderateThought } from "./actions";

export default function ModerationForm({ row }: { row: ShowcaseModerationRow }) {
  const t = useTranslations("account-dashboard");
  const [result, action, pending] = useActionState(moderateThought, null);
  return (
    <form action={action} className="mt-6 space-y-4 border border-zinc-800 bg-zinc-950 p-5">
      <input type="hidden" name="playerId" value={row.playerId} />
      <input type="hidden" name="revision" value={row.revision} />
      <input type="hidden" name="hidden" value={String(!row.hidden)} />
      <p className="text-sm font-bold text-zinc-400">{t("showcase.thoughtTitle")}</p>
      <p className="whitespace-pre-wrap break-words text-base leading-7 [overflow-wrap:anywhere]">{row.currentThought ?? "—"}</p>
      {row.hidden && <p className="text-sm text-amber-200">{t("showcase.thoughtHidden")}</p>}
      <button disabled={pending} className="min-h-11 border border-zinc-600 px-4 py-2 font-bold text-zinc-100 hover:border-orange-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-400 disabled:opacity-50">
        {t(pending ? "showcase.saving" : row.hidden ? "showcase.restoreThought" : "showcase.hideThought")}
      </button>
      {result && <p role={result.status === "error" ? "alert" : "status"} className="text-sm text-zinc-300">{t(`showcase.${result.code}`)}</p>}
    </form>
  );
}
