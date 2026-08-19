import "server-only";

import emailEnglish, {
  type EmailDictionary,
} from "@/lib/i18n/dictionaries/en/email";
import {
  DEFAULT_LOCALE,
  toIntlLocale,
  type Locale,
} from "@/lib/i18n/config";
import { interpolateMessage } from "@/lib/i18n/translate";

export const TRANSACTIONAL_EMAIL_TEMPLATE_KEYS = [
  "registration_approved",
  "division_started_first_match",
  "later_round_match_ready",
  "deadline_reminder_72h",
  "deadline_reminder_24h",
] as const;

export type TransactionalEmailTemplateKey =
  (typeof TRANSACTIONAL_EMAIL_TEMPLATE_KEYS)[number];

export type RegistrationApprovedTemplateData = {
  templateKey: "registration_approved";
  tournamentName: string;
  divisionName: string;
  registrationId: string;
};

export type MatchTemplateData = {
  tournamentName: string;
  tournamentId: string;
  divisionName: string;
  roundName: string;
  opponentName: string;
  matchId: string;
  deadlineAt: string;
};

export type DivisionStartedTemplateData = MatchTemplateData & {
  templateKey: "division_started_first_match";
};

export type LaterRoundTemplateData = MatchTemplateData & {
  templateKey: "later_round_match_ready";
};

export type DeadlineReminder72hTemplateData = MatchTemplateData & {
  templateKey: "deadline_reminder_72h";
};

export type DeadlineReminder24hTemplateData = MatchTemplateData & {
  templateKey: "deadline_reminder_24h";
};

export type TransactionalEmailTemplateData =
  | RegistrationApprovedTemplateData
  | DivisionStartedTemplateData
  | LaterRoundTemplateData
  | DeadlineReminder72hTemplateData
  | DeadlineReminder24hTemplateData;

export type TransactionalEmailTemplateConfig = {
  appOrigin: string;
  from: string;
  replyTo: string;
};

export type RenderedTransactionalEmail = {
  subject: string;
  html: string;
  text: string;
  from: string;
  replyTo: string;
};

function invalidTemplateData(): never {
  throw new Error("Transactional email template data is invalid.");
}

function normalizeDisplayText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    invalidTemplateData();
  }

  return normalized;
}

function requireIdentifier(value: string) {
  const normalized = value.trim();

  if (!normalized || normalized !== value || /[\r\n]/.test(normalized)) {
    invalidTemplateData();
  }

  return normalized;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatTransactionalEmailDeadlineUtc(
  value: string | Date,
  locale: Locale = DEFAULT_LOCALE
) {
  if (
    typeof value === "string" &&
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  ) {
    invalidTemplateData();
  }

  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    invalidTemplateData();
  }

  const formatted = new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  })
    .format(date)
    .replace(" at ", ", ");

  return `${formatted} UTC`;
}

function buildRegistrationUrl(appOrigin: string, registrationId: string) {
  return `${appOrigin}/dashboard#registration-${encodeURIComponent(
    requireIdentifier(registrationId)
  )}`;
}

function buildMatchUrl(
  appOrigin: string,
  tournamentId: string,
  matchId: string
) {
  const url = new URL("/tournaments", appOrigin);
  url.searchParams.set("tournament", requireIdentifier(tournamentId));
  url.searchParams.set("tab", "brackets");
  url.searchParams.set("match", requireIdentifier(matchId));
  return url.toString();
}

function renderLayout({
  locale,
  dictionary,
  heading,
  intro,
  details,
  actionLabel,
  actionUrl,
}: {
  locale: Locale;
  dictionary: EmailDictionary;
  heading: string;
  intro: string;
  details: Array<[label: string, value: string]>;
  actionLabel: string;
  actionUrl: string;
}) {
  const htmlDetails = details
    .map(
      ([label, value]) =>
        `<p style="margin: 6px 0;"><strong>${escapeHtml(
          label
        )}:</strong> ${escapeHtml(value)}</p>`
    )
    .join("");
  const textDetails = details
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");

  return {
    html: `<!doctype html><html lang="${locale}"><body style="margin:0;background:#18181b;color:#f4f4f5;font-family:Arial,sans-serif;"><main style="max-width:600px;margin:0 auto;padding:32px 24px;"><h1 style="color:#f97316;font-size:24px;">${escapeHtml(
      heading
    )}</h1><p>${escapeHtml(
      intro
    )}</p><section style="margin:24px 0;">${htmlDetails}</section><p><a href="${escapeHtml(
      actionUrl
    )}" style="display:inline-block;background:#f97316;color:#18181b;padding:12px 18px;text-decoration:none;font-weight:bold;">${escapeHtml(
      actionLabel
    )}</a></p><p style="color:#a1a1aa;font-size:13px;">${escapeHtml(
      dictionary.layout.footer
    )}</p></main></body></html>`,
    text: `${heading}\n\n${intro}\n\n${textDetails}\n\n${actionLabel}: ${actionUrl}\n\n${dictionary.layout.footer}`,
  };
}

function renderRegistrationApproved(
  data: RegistrationApprovedTemplateData,
  config: TransactionalEmailTemplateConfig,
  locale: Locale,
  dictionary: EmailDictionary
) {
  const tournamentName = normalizeDisplayText(data.tournamentName);
  const divisionName = normalizeDisplayText(data.divisionName);
  const actionUrl = buildRegistrationUrl(
    config.appOrigin,
    data.registrationId
  );

  return {
    subject: interpolateMessage(dictionary.registrationApproved.subject, {
      tournamentName,
    }),
    ...renderLayout({
      locale,
      dictionary,
      heading: dictionary.registrationApproved.heading,
      intro: dictionary.registrationApproved.intro,
      details: [
        [dictionary.labels.tournament, tournamentName],
        [dictionary.labels.division, divisionName],
      ],
      actionLabel: dictionary.registrationApproved.action,
      actionUrl,
    }),
  };
}

function normalizeMatchData(data: MatchTemplateData, locale: Locale) {
  return {
    tournamentName: normalizeDisplayText(data.tournamentName),
    divisionName: normalizeDisplayText(data.divisionName),
    roundName: normalizeDisplayText(data.roundName),
    opponentName: normalizeDisplayText(data.opponentName),
    deadline: formatTransactionalEmailDeadlineUtc(data.deadlineAt, locale),
  };
}

function renderMatchEmail({
  data,
  config,
  locale,
  dictionary,
  subject,
  heading,
  intro,
  actionLabel,
}: {
  data: MatchTemplateData;
  config: TransactionalEmailTemplateConfig;
  locale: Locale;
  dictionary: EmailDictionary;
  subject: (normalized: ReturnType<typeof normalizeMatchData>) => string;
  heading: string;
  intro: string;
  actionLabel: string;
}) {
  const normalized = normalizeMatchData(data, locale);
  const actionUrl = buildMatchUrl(
    config.appOrigin,
    data.tournamentId,
    data.matchId
  );

  return {
    subject: subject(normalized),
    ...renderLayout({
      locale,
      dictionary,
      heading,
      intro,
      details: [
        [dictionary.labels.tournament, normalized.tournamentName],
        [dictionary.labels.division, normalized.divisionName],
        [dictionary.labels.round, normalized.roundName],
        [dictionary.labels.opponent, normalized.opponentName],
        [dictionary.labels.deadline, normalized.deadline],
      ],
      actionLabel,
      actionUrl,
    }),
  };
}

export function renderTransactionalEmail(
  data: TransactionalEmailTemplateData,
  config: TransactionalEmailTemplateConfig,
  locale: Locale = DEFAULT_LOCALE,
  dictionary: EmailDictionary = emailEnglish
): RenderedTransactionalEmail {
  let rendered: Omit<RenderedTransactionalEmail, "from" | "replyTo">;

  switch (data.templateKey) {
    case "registration_approved":
      rendered = renderRegistrationApproved(data, config, locale, dictionary);
      break;
    case "division_started_first_match":
      rendered = renderMatchEmail({
        data,
        config,
        locale,
        dictionary,
        subject: ({ tournamentName }) =>
          interpolateMessage(dictionary.divisionStarted.subject, {
            tournamentName,
          }),
        heading: dictionary.divisionStarted.heading,
        intro: dictionary.divisionStarted.intro,
        actionLabel: dictionary.divisionStarted.action,
      });
      break;
    case "later_round_match_ready":
      rendered = renderMatchEmail({
        data,
        config,
        locale,
        dictionary,
        subject: ({ roundName, tournamentName }) =>
          interpolateMessage(dictionary.laterRound.subject, {
            roundName,
            tournamentName,
          }),
        heading: dictionary.laterRound.heading,
        intro: dictionary.laterRound.intro,
        actionLabel: dictionary.laterRound.action,
      });
      break;
    case "deadline_reminder_72h":
      rendered = renderMatchEmail({
        data,
        config,
        locale,
        dictionary,
        subject: ({ tournamentName }) =>
          interpolateMessage(dictionary.deadline72h.subject, {
            tournamentName,
          }),
        heading: dictionary.deadline72h.heading,
        intro: dictionary.deadline72h.intro,
        actionLabel: dictionary.deadline72h.action,
      });
      break;
    case "deadline_reminder_24h":
      rendered = renderMatchEmail({
        data,
        config,
        locale,
        dictionary,
        subject: ({ tournamentName }) =>
          interpolateMessage(dictionary.deadline24h.subject, {
            tournamentName,
          }),
        heading: dictionary.deadline24h.heading,
        intro: dictionary.deadline24h.intro,
        actionLabel: dictionary.deadline24h.action,
      });
      break;
    default: {
      const exhaustive: never = data;
      return exhaustive;
    }
  }

  return {
    ...rendered,
    from: config.from,
    replyTo: config.replyTo,
  };
}
