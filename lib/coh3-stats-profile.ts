const COH3_STATS_PROFILE_HOSTS = new Set(["coh3stats.com", "www.coh3stats.com"]);

export type Coh3StatsProfileParseResult = {
  profileId: string;
  normalizedUrl: string;
};

export function parseCoh3StatsProfileInput(
  value: string | null | undefined
): Coh3StatsProfileParseResult | null {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length > 500) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return {
      profileId: trimmed,
      normalizedUrl: `https://coh3stats.com/players/${trimmed}`,
    };
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const profileId = pathSegments[1] ?? "";

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !COH3_STATS_PROFILE_HOSTS.has(host) ||
      pathSegments[0]?.toLowerCase() !== "players" ||
      !/^\d+$/.test(profileId)
    ) {
      return null;
    }

    url.protocol = "https:";
    url.hostname = "coh3stats.com";
    url.hash = "";
    url.search = "";
    url.pathname = `/players/${profileId}`;

    return {
      profileId,
      normalizedUrl: url.toString(),
    };
  } catch {
    return null;
  }
}

export function parseCoh3StatsProfileUrl(
  value: string | null | undefined
): Coh3StatsProfileParseResult | null {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length > 500 || /^\d+$/.test(trimmed)) {
    return null;
  }

  return parseCoh3StatsProfileInput(trimmed);
}

export function normalizeCoh3StatsProfileUrl(
  value: string | null | undefined
) {
  return parseCoh3StatsProfileUrl(value)?.normalizedUrl ?? null;
}

export function isValidCoh3StatsProfileUrl(
  value: string | null | undefined
) {
  return normalizeCoh3StatsProfileUrl(value) !== null;
}
