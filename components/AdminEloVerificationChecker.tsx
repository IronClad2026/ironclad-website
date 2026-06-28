import { Search, ShieldCheck } from "lucide-react";
import { updateEloVerificationMode } from "@/app/admin/elo-verification-actions";
import AdminEloVerificationSupportLinkForm from "@/components/AdminEloVerificationSupportLinkForm";
import type {
  EloVerificationSetting,
  EloVerificationSupportLinkSetting,
} from "@/lib/platform-settings";
import { DEFAULT_ELO_VERIFICATION_SUPPORT_URL } from "@/lib/platform-settings";

type AdminEloVerificationCheckerProps = {
  setting: EloVerificationSetting;
  supportLinkSetting?: EloVerificationSupportLinkSetting;
};

export default function AdminEloVerificationChecker({
  setting,
  supportLinkSetting,
}: AdminEloVerificationCheckerProps) {
  const enabled = setting.enabled;
  const resolvedSupportLinkSetting = supportLinkSetting ?? {
    url: DEFAULT_ELO_VERIFICATION_SUPPORT_URL,
    updatedAt: null,
    updatedByClerkUserId: null,
    error: null,
  };

  return (
    <div className="grid gap-5">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur transition hover:-translate-y-1 hover:border-orange-500/60 hover:bg-orange-500/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Search className="h-8 w-8 text-orange-400" />
            <h3 className="mt-4 text-xl font-bold">
              ELO Verification Checker
            </h3>
          </div>

          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
              enabled
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"
            }`}
          >
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {enabled
            ? "Players must provide a COH3 Stats profile URL. The system will verify the highest ELO across factions for the tournament mode."
            : "Fake/test ELO profiles are allowed. Registrations work normally and no COH3 Stats check is required."}
        </p>

        <form
          action={updateEloVerificationMode}
          className="mt-4 grid gap-2 sm:grid-cols-2"
        >
          <button
            type="submit"
            name="mode"
            value="disabled"
            disabled={!enabled}
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-300 transition hover:border-zinc-300/50 hover:text-white disabled:cursor-default disabled:border-zinc-500/30 disabled:bg-zinc-500/10 disabled:text-zinc-300"
          >
            Disabled
          </button>
          <button
            type="submit"
            name="mode"
            value="enabled"
            disabled={enabled}
            className="rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-orange-100 transition hover:border-orange-300/60 hover:bg-orange-500/20 disabled:cursor-default disabled:border-emerald-400/30 disabled:bg-emerald-500/10 disabled:text-emerald-200"
          >
            Enabled
          </button>
        </form>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-zinc-500">
          <p>
            <span className="font-black uppercase tracking-wider text-zinc-400">
              Last Updated:
            </span>{" "}
            {formatDateTime(setting.updatedAt)}
          </p>
          <p className="mt-1">
            <span className="font-black uppercase tracking-wider text-zinc-400">
              Updated By:
            </span>{" "}
            {setting.updatedByClerkUserId ?? "System default"}
          </p>
          {setting.error && (
            <p className="mt-2 font-semibold text-red-300">{setting.error}</p>
          )}
        </div>

        <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-orange-300">
          Registration verification setting
          <ShieldCheck className="h-4 w-4" />
        </div>
      </div>

      <AdminEloVerificationSupportLinkForm
        setting={resolvedSupportLinkSetting}
      />
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not updated yet";
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
