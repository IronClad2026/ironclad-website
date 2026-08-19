"use client";

import { useActionState, useEffect, useState } from "react";
import { Camera, UserRound } from "lucide-react";
import { savePlayerProfile } from "@/app/profile/actions";
import ActiveTournamentEloSnapshotIndicator, {
  type ActiveTournamentEloSnapshot,
} from "@/components/ActiveTournamentEloSnapshotIndicator";
import SearchableProfileSelect from "@/components/SearchableProfileSelect";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  getPlayerAvatarDisplayUrl,
  MAX_AVATAR_UPLOAD_SIZE_BYTES,
  MAX_AVATAR_UPLOAD_SIZE_LABEL,
} from "@/lib/avatar";
import {
  initialProfileActionState,
  type PlayerProfile,
  type ProfileField,
} from "@/lib/player-profile";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import { getLocalizedCountrySelectOptions } from "@/lib/countries";
import englishAccountDictionary from "@/lib/i18n/dictionaries/en/account-dashboard";

type PlayerProfileFormProfile = Omit<
  PlayerProfile,
  "coh3_player_card_url" | "current_elo"
>;

type PlayerProfileFormProps = {
  profile: PlayerProfileFormProfile | null;
  verifiedCurrentElo: number | null;
  activeTournamentEloSnapshots: ActiveTournamentEloSnapshot[];
};

const regions = [
  "Europe",
  "North America",
  "South America",
  "Oceania",
  "Asia",
  "Middle East",
  "Africa",
  "Global",
];
function getExactRegionOption(
  value: string,
  options: Array<{ label: string; value: string }>
) {
  const normalizedValue = value.trim().toLowerCase();

  return options.find(
    (option) =>
      option.label.toLowerCase() === normalizedValue ||
      option.value.toLowerCase() === normalizedValue
  );
}

const timezones = [
  "UTC",
  "Pacific/Honolulu (UTC-10:00)",
  "America/Anchorage (UTC-09:00)",
  "America/Los_Angeles (UTC-08:00)",
  "America/Denver (UTC-07:00)",
  "America/Chicago (UTC-06:00)",
  "America/New_York (UTC-05:00)",
  "America/Halifax (UTC-04:00)",
  "America/St_Johns (UTC-03:30)",
  "America/Sao_Paulo (UTC-03:00)",
  "Atlantic/South_Georgia (UTC-02:00)",
  "Atlantic/Azores (UTC-01:00)",
  "Europe/London (UTC+00:00)",
  "Europe/Paris (UTC+01:00)",
  "Europe/Berlin (UTC+01:00)",
  "Europe/Warsaw (UTC+01:00)",
  "Europe/Athens (UTC+02:00)",
  "Europe/Helsinki (UTC+02:00)",
  "Europe/Kyiv (UTC+02:00)",
  "Europe/Istanbul (UTC+03:00)",
  "Europe/Moscow (UTC+03:00)",
  "Asia/Dubai (UTC+04:00)",
  "Asia/Kabul (UTC+04:30)",
  "Asia/Karachi (UTC+05:00)",
  "Asia/Kolkata (UTC+05:30)",
  "Asia/Kathmandu (UTC+05:45)",
  "Asia/Dhaka (UTC+06:00)",
  "Asia/Yangon (UTC+06:30)",
  "Asia/Bangkok (UTC+07:00)",
  "Asia/Singapore (UTC+08:00)",
  "Asia/Shanghai (UTC+08:00)",
  "Asia/Seoul (UTC+09:00)",
  "Asia/Tokyo (UTC+09:00)",
  "Australia/Darwin (UTC+09:30)",
  "Australia/Brisbane (UTC+10:00)",
  "Australia/Sydney (UTC+10:00)",
  "Pacific/Guadalcanal (UTC+11:00)",
  "Pacific/Auckland (UTC+12:00)",
  "Pacific/Chatham (UTC+12:45)",
  "Pacific/Tongatapu (UTC+13:00)",
  "Pacific/Kiritimati (UTC+14:00)",
];

const profilePanelClass =
  "group relative isolate border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] p-6 shadow-2xl shadow-black/30 backdrop-blur transition hover:border-orange-400/35 md:p-8";

const profilePanelGridOverlayClass =
  "pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:56px_56px] opacity-10";

const profilePanelHoverOverlayClass =
  "pointer-events-none absolute inset-0 z-0 opacity-0 transition group-hover:opacity-100";

const profileInputClass =
  "mt-3 w-full border bg-black/55 px-4 py-3 text-white shadow-inner shadow-black/20 outline-none transition placeholder:text-zinc-600 focus:border-orange-400 focus:bg-black/70 focus:shadow-[0_0_0_1px_rgba(251,146,60,0.24)]";

export default function PlayerProfileForm({
  profile,
  verifiedCurrentElo,
  activeTournamentEloSnapshots,
}: PlayerProfileFormProps) {
  const t = useOptionalTranslations("account-dashboard", englishAccountDictionary);
  const locale = useOptionalLocale();
  const [state, formAction, pending] = useActionState(
    savePlayerProfile,
    initialProfileActionState
  );
  const regionLabels = [
    "europe",
    "northAmerica",
    "southAmerica",
    "oceania",
    "asia",
    "middleEast",
    "africa",
    "global",
  ] as const;
  const regionSelectOptions = regions.map((region, index) => ({
    label: t(`regions.${regionLabels[index]}`),
    value: region,
  }));
  const countryOptions = getLocalizedCountrySelectOptions(locale);
  const fieldLabels: Record<ProfileField, string> = {
    avatar: t("profileForm.avatarTitle"),
    displayName: t("profileActions.displayName"),
    inGameName: t("profileActions.inGameName"),
    discordUsername: t("profileActions.discordUsername"),
    country: t("profileActions.country"),
    region: t("profileActions.region"),
    timezone: t("profileActions.timezone"),
    bio: t("profileActions.bio"),
  };
  const getFieldError = (field: ProfileField) => {
    const error = state.errorCodes?.[field];

    if (!error) return state.errors[field];

    switch (error.code) {
      case "required":
        return t("profileActions.required", { field: fieldLabels[field] });
      case "too-long":
        return t("profileActions.tooLong", {
          field: fieldLabels[field],
          count: error.count ?? 0,
        });
      case "avatar-type":
        return t("profileForm.invalidAvatarType");
      case "avatar-too-large":
        return t("profileForm.avatarTooLarge", {
          size: error.size ?? MAX_AVATAR_UPLOAD_SIZE_LABEL,
        });
      case "avatar-invalid":
        return t("profileActions.avatarInvalid");
      case "avatar-upload-failed":
        return t("profileActions.avatarUploadFailed");
    }
  };
  const actionMessage = state.code
    ? t(
        {
          "session-expired": "profileActions.sessionExpired",
          "review-fields": "profileActions.reviewFields",
          "save-failed": "profileActions.saveFailed",
          "avatar-upload-failed": "profileActions.avatarUploadFailed",
          saved: "profileActions.saved",
        }[state.code]
      )
    : state.message;
  const [country, setCountry] = useState(profile?.country ?? "");
  const [region, setRegion] = useState(profile?.region ?? "");
  const [timezone, setTimezone] = useState(profile?.timezone ?? "");
  const [avatarPreview, setAvatarPreview] = useState(
    getPlayerAvatarDisplayUrl(profile) ?? ""
  );
  const [avatarClientError, setAvatarClientError] = useState("");

  useEffect(() => {
    return () => {
      if (avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  return (
    <form action={formAction} className="space-y-8">
      <section className={`${profilePanelClass} overflow-hidden`}>
        <div className={profilePanelGridOverlayClass} />
        <div className={profilePanelHoverOverlayClass}>
          <div className="absolute inset-x-0 top-0 h-px bg-orange-300/55" />
        </div>

        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
            {t("profileForm.avatarEyebrow")}
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white">
            {t("profileForm.avatarTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {t("profileForm.avatarDescription")}
          </p>
        </div>

        <div className="relative z-10 mt-7 flex flex-col gap-6 sm:flex-row sm:items-center">
          <div
            role="img"
            aria-label={t("profileForm.avatarPreview")}
            className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-orange-500/50 bg-black/60 bg-cover bg-center shadow-[0_0_35px_rgba(249,115,22,0.2)]"
            style={
              avatarPreview
                ? { backgroundImage: `url("${avatarPreview}")` }
                : undefined
            }
          >
            {!avatarPreview && <UserRound size={48} className="text-zinc-600" />}
          </div>

          <div className="min-w-0 flex-1">
            <label className="inline-flex cursor-pointer items-center gap-2 border border-orange-400 bg-orange-500 px-5 py-3 text-sm font-bold text-black transition hover:border-orange-300 hover:bg-orange-300 focus-within:outline focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-orange-300">
              <Camera size={18} />
              {avatarPreview
                ? t("profileForm.replaceAvatar")
                : t("profileForm.chooseAvatar")}
              <input
                name="avatar"
                type="file"
                accept={ALLOWED_AVATAR_MIME_TYPES.join(",")}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  setAvatarClientError("");

                  if (!file) {
                    return;
                  }

                  if (
                    !ALLOWED_AVATAR_MIME_TYPES.some(
                      (contentType) => contentType === file.type
                    )
                  ) {
                    event.target.value = "";
                    setAvatarClientError(
                      t("profileForm.invalidAvatarType")
                    );
                    return;
                  }

                  if (file.size > MAX_AVATAR_UPLOAD_SIZE_BYTES) {
                    event.target.value = "";
                    setAvatarClientError(
                      t("profileForm.avatarTooLarge", {
                        size: MAX_AVATAR_UPLOAD_SIZE_LABEL,
                      })
                    );
                    return;
                  }

                  setAvatarPreview(URL.createObjectURL(file));
                }}
              />
            </label>

            <p className="mt-3 text-xs leading-5 text-zinc-500">
              {t("profileForm.avatarHelp", {
                size: MAX_AVATAR_UPLOAD_SIZE_LABEL,
              })}
            </p>
            <FieldError
              message={avatarClientError || getFieldError("avatar")}
            />
          </div>
        </div>
      </section>

      <section className={`${profilePanelClass} overflow-hidden`}>
        <div className={profilePanelGridOverlayClass} />
        <div className={profilePanelHoverOverlayClass}>
          <div className="absolute inset-x-0 top-0 h-px bg-orange-300/55" />
        </div>

        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
            {t("profileForm.identityEyebrow")}
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white">
            {t("profileForm.identityTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {t("profileForm.identityDescription")}
          </p>
        </div>

        <div className="relative z-10 mt-7 grid gap-5 md:grid-cols-2">
          <ProfileInput
            label={t("profileForm.displayName")}
            name="displayName"
            defaultValue={profile?.display_name}
            error={getFieldError("displayName")}
            required
          />
          <ProfileInput
            label={t("profileForm.inGameName")}
            name="inGameName"
            defaultValue={profile?.in_game_name}
            error={getFieldError("inGameName")}
            required
          />
          <ProfileInput
            label={t("profileForm.discordUsername")}
            name="discordUsername"
            defaultValue={profile?.discord_username}
            error={getFieldError("discordUsername")}
            description={t("profileForm.discordDescription")}
            maxLength={100}
          />
          <div>
            <span className="text-sm font-bold text-white">
              {t("profileForm.steamDisplayName")}
            </span>
            <output
              aria-label={t("profileForm.steamDisplayName")}
              className={`${profileInputClass} flex min-h-12 items-center border-white/10 text-zinc-200`}
            >
              {profile?.steam_username?.trim() || t("profileForm.notSynced")}
            </output>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">
              {t("profileForm.steamSyncHelp")}
            </span>
          </div>
        </div>
      </section>

      <section className={`${profilePanelClass} z-30 overflow-visible focus-within:z-[1300]`}>
        <div className={profilePanelGridOverlayClass} />
        <div className={profilePanelHoverOverlayClass}>
          <div className="absolute inset-x-0 top-0 h-px bg-orange-300/55" />
        </div>

        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
            {t("profileForm.competitiveEyebrow")}
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white">
            {t("profileForm.competitiveTitle")}
          </h2>
        </div>

        <div className="relative z-10 mt-7 grid gap-5 md:grid-cols-2">
          <SearchableProfileSelect
            label={t("profileForm.country")}
            name="country"
            value={country}
            submittedValue={country}
            options={countryOptions}
            onSelect={(option) => setCountry(option.value)}
            error={getFieldError("country")}
            noResultsLabel={t("profileForm.noResults")}
            savedValueTemplate={t("profileForm.savesValue")}
            required
            variant="ironclad"
          />
          <SearchableProfileSelect
            label={t("profileForm.region")}
            name="region"
            value={region}
            submittedValue={region}
            options={regionSelectOptions}
            onCustomValueChange={(value) => {
              setRegion(
                getExactRegionOption(value, regionSelectOptions)?.value ?? ""
              );
            }}
            onSelect={(option) => setRegion(option.value)}
            error={getFieldError("region")}
            placeholder={t("profileForm.searchRegions")}
            noResultsLabel={t("profileForm.noResults")}
            savedValueTemplate={t("profileForm.savesValue")}
            required
            variant="ironclad"
          />
          <SearchableProfileSelect
            label={t("profileForm.timezone")}
            name="timezone"
            value={timezone}
            submittedValue={timezone}
            options={timezones.map((timezoneOption) => ({
              label: timezoneOption,
              value: timezoneOption,
            }))}
            onSelect={(option) => setTimezone(option.value)}
            error={getFieldError("timezone")}
            placeholder={t("profileForm.searchTimezone")}
            noResultsLabel={t("profileForm.noResults")}
            savedValueTemplate={t("profileForm.savesValue")}
            required
            variant="ironclad"
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">
                {t("profileForm.currentElo")}
              </span>
              <ActiveTournamentEloSnapshotIndicator
                snapshots={activeTournamentEloSnapshots}
              />
            </div>
            <output
              aria-label={t("profileForm.currentElo")}
              className={`${profileInputClass} block border-white/10 text-zinc-200`}
            >
              {verifiedCurrentElo ?? t("profileForm.notAvailable")}
            </output>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">
              {t("profileForm.eloHelp")}
            </span>
          </div>
        </div>
      </section>

      <section className={`${profilePanelClass} overflow-hidden`}>
        <div className={profilePanelGridOverlayClass} />
        <div className={profilePanelHoverOverlayClass}>
          <div className="absolute inset-x-0 top-0 h-px bg-orange-300/55" />
        </div>

        <label htmlFor="bio" className="relative z-10 block">
          <span className="text-sm font-bold text-white">
            {t("profileForm.shortBio")}
          </span>
          <span className="ml-2 text-xs uppercase tracking-wider text-zinc-500">
            {t("profileForm.optional")}
          </span>
        </label>
        <textarea
          id="bio"
          name="bio"
          maxLength={500}
          defaultValue={profile?.bio ?? ""}
          rows={5}
          className={`relative z-10 ${profileInputClass} ${
            getFieldError("bio") ? "border-red-500/70" : "border-white/10"
          }`}
          placeholder={t("profileForm.bioPlaceholder")}
        />
        <FieldError message={getFieldError("bio")} />
      </section>

      {actionMessage && (
        <div
          aria-live="polite"
          className={`border p-4 text-sm shadow-xl shadow-black/20 backdrop-blur ${
            state.status === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {actionMessage}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500">
          {t("profileForm.protected")}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="border border-orange-400 bg-orange-500 px-6 py-3 font-bold text-black transition hover:border-orange-300 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
        >
          {pending
            ? t("profileForm.saving")
            : profile
              ? t("profileForm.saveChanges")
              : t("profileForm.completeProfile")}
        </button>
      </div>
    </form>
  );
}

function ProfileInput({
  label,
  name,
  defaultValue,
  error,
  description,
  className,
  ...inputProps
}: {
  label: string;
  name: ProfileField;
  defaultValue?: string | number | null;
  error?: string;
  description?: string;
  className?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "name"
>) {
  return (
    <label className={className}>
      <span className="text-sm font-bold text-white">{label}</span>
      {description && (
        <span className="mt-1 block text-xs leading-5 text-zinc-500">
          {description}
        </span>
      )}
      <input
        {...inputProps}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-invalid={Boolean(error)}
        className={`${profileInputClass} ${
          error ? "border-red-500/70" : "border-white/10"
        }`}
      />
      <FieldError message={error} />
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <span className="relative z-10 mt-2 block text-xs text-red-300">
      {message}
    </span>
  );
}
