"use client";

import { useActionState, useState } from "react";
import { ExternalLink, Save } from "lucide-react";
import {
  updateEloVerificationSupportLink,
  type EloVerificationSupportLinkActionState,
} from "@/app/admin/elo-verification-actions";
import type { EloVerificationSupportLinkSetting } from "@/lib/platform-settings";

type AdminEloVerificationSupportLinkFormProps = {
  setting: EloVerificationSupportLinkSetting;
};

export default function AdminEloVerificationSupportLinkForm({
  setting,
}: AdminEloVerificationSupportLinkFormProps) {
  const [url, setUrl] = useState(setting.url);
  const [state, formAction, pending] = useActionState(
    updateEloVerificationSupportLink,
    {
      status: "idle",
      message: "",
      url: setting.url,
    } satisfies EloVerificationSupportLinkActionState
  );
  const currentSavedUrl =
    state.status === "success" && state.url ? state.url : setting.url;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur transition hover:-translate-y-1 hover:border-orange-500/60 hover:bg-orange-500/10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-black text-white">
            ELO Verification Support Link
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            This Discord link appears when an enabled ELO check blocks a
            registration.
          </p>
        </div>

        <a
          href={currentSavedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-200 transition hover:border-orange-300/60 hover:text-white"
        >
          Open
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
            Discord URL
          </span>
          <input
            type="url"
            name="supportUrl"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
            aria-invalid={state.status === "error"}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-orange-300"
            placeholder="https://discord.gg/ZQSQjBNRm3"
          />
        </label>

        {state.status !== "idle" && state.message && (
          <p
            className={`rounded-xl border p-3 text-xs font-semibold leading-5 ${
              state.status === "success"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-400/30 bg-red-500/10 text-red-200"
            }`}
          >
            {state.message}
          </p>
        )}

        {setting.error && state.status === "idle" && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs font-semibold leading-5 text-red-200">
            {setting.error}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-zinc-500">
            Last updated: {formatDateTime(setting.updatedAt)}
          </p>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-orange-100 transition hover:border-orange-300/60 hover:bg-orange-500/20 disabled:cursor-wait disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {pending ? "Saving..." : "Save Link"}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "System default";
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
