"use client";

import { useActionState, useEffect, useState } from "react";
import { Camera, UserRound } from "lucide-react";
import { savePlayerProfile } from "@/app/profile/actions";
import SearchableProfileSelect from "@/components/SearchableProfileSelect";
import { countrySelectOptions } from "@/lib/countries";
import { eloRanges } from "@/lib/elo-options";
import {
  initialProfileActionState,
  type PlayerProfile,
  type ProfileField,
} from "@/lib/player-profile";

type PlayerProfileFormProps = {
  profile: PlayerProfile | null;
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

export default function PlayerProfileForm({
  profile,
}: PlayerProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    savePlayerProfile,
    initialProfileActionState
  );
  const initialElo = profile?.current_elo?.toString() ?? "";
  const [country, setCountry] = useState(profile?.country ?? "");
  const [timezone, setTimezone] = useState(profile?.timezone ?? "");
  const [currentElo, setCurrentElo] = useState(initialElo);
  const [eloSearch, setEloSearch] = useState(
    eloRanges.find((range) => range.value === initialElo)?.label ?? initialElo
  );
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url ?? "");
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
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
            Player Avatar
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white">
            Profile image
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Upload an image that represents you across IronClad player and
            tournament experiences.
          </p>
        </div>

        <div className="mt-7 flex flex-col gap-6 sm:flex-row sm:items-center">
          <div
            role="img"
            aria-label="Player avatar preview"
            className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-orange-500/50 bg-black/50 bg-cover bg-center shadow-[0_0_35px_rgba(249,115,22,0.18)]"
            style={
              avatarPreview
                ? { backgroundImage: `url("${avatarPreview}")` }
                : undefined
            }
          >
            {!avatarPreview && <UserRound size={48} className="text-zinc-600" />}
          </div>

          <div className="min-w-0 flex-1">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-200 transition hover:border-orange-400 hover:bg-orange-500/20">
              <Camera size={18} />
              {avatarPreview ? "Replace Avatar" : "Choose Avatar"}
              <input
                name="avatar"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  setAvatarClientError("");

                  if (!file) {
                    return;
                  }

                  if (
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      file.type
                    )
                  ) {
                    event.target.value = "";
                    setAvatarClientError(
                      "Use a PNG, JPG, JPEG, or WEBP image."
                    );
                    return;
                  }

                  if (file.size > 2 * 1024 * 1024) {
                    event.target.value = "";
                    setAvatarClientError(
                      "Avatar image must be 2 MB or smaller."
                    );
                    return;
                  }

                  setAvatarPreview(URL.createObjectURL(file));
                }}
              />
            </label>

            <p className="mt-3 text-xs leading-5 text-zinc-500">
              PNG, JPG, JPEG, or WEBP. Maximum file size 2 MB.
            </p>
            <FieldError
              message={avatarClientError || state.errors.avatar}
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
            Player Identity
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white">
            Core account details
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            These details will be reused for future IronClad tournament
            registrations.
          </p>
        </div>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <ProfileInput
            label="Display Name"
            name="displayName"
            defaultValue={profile?.display_name}
            error={state.errors.displayName}
            required
          />
          <ProfileInput
            label="In-Game Name / IGN"
            name="inGameName"
            defaultValue={profile?.in_game_name}
            error={state.errors.inGameName}
            required
          />
          <ProfileInput
            label="Discord Username"
            name="discordUsername"
            defaultValue={profile?.discord_username}
            error={state.errors.discordUsername}
            required
          />
          <ProfileInput
            label="Steam Username"
            name="steamUsername"
            defaultValue={profile?.steam_username}
            error={state.errors.steamUsername}
            required
          />
          <ProfileInput
            label="CoH3 Player Card URL"
            name="coh3PlayerCardUrl"
            type="url"
            defaultValue={profile?.coh3_player_card_url}
            error={state.errors.coh3PlayerCardUrl}
            required
            className="md:col-span-2"
          />
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
            Competitive Profile
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white">
            Region and ranking
          </h2>
        </div>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <SearchableProfileSelect
            label="Country"
            name="country"
            value={country}
            submittedValue={country}
            options={countrySelectOptions}
            onSelect={(option) => setCountry(option.value)}
            error={state.errors.country}
            required
          />
          <ProfileInput
            label="Region"
            name="region"
            defaultValue={profile?.region}
            error={state.errors.region}
            list="profile-regions"
            required
          />
          <SearchableProfileSelect
            label="Timezone"
            name="timezone"
            value={timezone}
            submittedValue={timezone}
            options={timezones.map((timezoneOption) => ({
              label: timezoneOption,
              value: timezoneOption,
            }))}
            onSelect={(option) => setTimezone(option.value)}
            error={state.errors.timezone}
            placeholder="Search by city, region, or UTC offset"
            required
          />
          <SearchableProfileSelect
            label="Current ELO"
            name="currentElo"
            value={eloSearch}
            submittedValue={currentElo}
            options={eloRanges}
            onCustomValueChange={(value) => {
              setEloSearch(value);
              setCurrentElo(/^\d+$/.test(value) ? value : "");
            }}
            onSelect={(option) => {
              setEloSearch(option.label);
              setCurrentElo(option.value);
            }}
            error={state.errors.currentElo}
            description="Select an ELO range or type an exact numeric ELO."
            placeholder="Search ranges or enter exact ELO"
            required
          />
        </div>

        <datalist id="profile-regions">
          {regions.map((region) => (
            <option key={region} value={region} />
          ))}
        </datalist>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur md:p-8">
        <label htmlFor="bio" className="block">
          <span className="text-sm font-bold text-white">Short Bio</span>
          <span className="ml-2 text-xs uppercase tracking-wider text-zinc-500">
            Optional
          </span>
        </label>
        <textarea
          id="bio"
          name="bio"
          maxLength={500}
          defaultValue={profile?.bio ?? ""}
          rows={5}
          className={`mt-3 w-full rounded-xl border bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-orange-400 ${
            state.errors.bio ? "border-red-500/70" : "border-white/10"
          }`}
          placeholder="Tell the IronClad community a little about your competitive background."
        />
        <FieldError message={state.errors.bio} />
      </section>

      {state.message && (
        <div
          aria-live="polite"
          className={`rounded-2xl border p-4 text-sm ${
            state.status === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {state.message}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500">
          Your profile data and avatar are protected by your signed-in account.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-orange-500 px-6 py-3 font-bold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? "Saving Profile..."
            : profile
              ? "Save Profile Changes"
              : "Complete Player Profile"}
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
        className={`mt-3 w-full rounded-xl border bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-orange-400 ${
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

  return <span className="mt-2 block text-xs text-red-300">{message}</span>;
}
