const COH3_STATS_PROFILE_HOSTS = new Set(["coh3stats.com", "www.coh3stats.com"]);

export function normalizeCoh3StatsProfileUrl(
  value: string | null | undefined
) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length > 500) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const pathSegments = url.pathname.split("/").filter(Boolean);

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !COH3_STATS_PROFILE_HOSTS.has(host) ||
      pathSegments[0]?.toLowerCase() !== "players" ||
      !pathSegments[1]
    ) {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isValidCoh3StatsProfileUrl(
  value: string | null | undefined
) {
  return normalizeCoh3StatsProfileUrl(value) !== null;
}
