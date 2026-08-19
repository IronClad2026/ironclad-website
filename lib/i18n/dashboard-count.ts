import type { Locale } from "@/lib/i18n/config";
import { formatNumber, selectPlural } from "@/lib/i18n/format";
import type { MessageValues } from "@/lib/i18n/types";

type DashboardCountTranslator = (
  path: string,
  values?: MessageValues
) => string;

export function formatDashboardRegistrationCount(
  count: number,
  locale: Locale,
  translate: DashboardCountTranslator
) {
  const category =
    count === 0 && (locale === "fr" || locale === "pt-BR")
      ? "other"
      : selectPlural(count, locale);
  const suffix =
    category === "one" || category === "few" || category === "many"
      ? `${category[0].toUpperCase()}${category.slice(1)}`
      : "Other";

  return translate(`dashboard.registrations.count${suffix}`, {
    count: formatNumber(count, locale),
  });
}
