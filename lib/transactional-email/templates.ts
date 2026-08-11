import "server-only";

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

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

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

export function formatTransactionalEmailDeadlineUtc(value: string | Date) {
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

  const day = date.getUTCDate();
  const month = MONTH_NAMES[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
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
  heading,
  intro,
  details,
  actionLabel,
  actionUrl,
}: {
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
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#18181b;color:#f4f4f5;font-family:Arial,sans-serif;"><main style="max-width:600px;margin:0 auto;padding:32px 24px;"><h1 style="color:#f97316;font-size:24px;">${escapeHtml(
      heading
    )}</h1><p>${escapeHtml(
      intro
    )}</p><section style="margin:24px 0;">${htmlDetails}</section><p><a href="${escapeHtml(
      actionUrl
    )}" style="display:inline-block;background:#f97316;color:#18181b;padding:12px 18px;text-decoration:none;font-weight:bold;">${escapeHtml(
      actionLabel
    )}</a></p><p style="color:#a1a1aa;font-size:13px;">This is a transactional tournament notification from IronClad Tournaments.</p></main></body></html>`,
    text: `${heading}\n\n${intro}\n\n${textDetails}\n\n${actionLabel}: ${actionUrl}\n\nThis is a transactional tournament notification from IronClad Tournaments.`,
  };
}

function renderRegistrationApproved(
  data: RegistrationApprovedTemplateData,
  config: TransactionalEmailTemplateConfig
) {
  const tournamentName = normalizeDisplayText(data.tournamentName);
  const divisionName = normalizeDisplayText(data.divisionName);
  const actionUrl = buildRegistrationUrl(
    config.appOrigin,
    data.registrationId
  );

  return {
    subject: `Registration approved: ${tournamentName}`,
    ...renderLayout({
      heading: "Your registration is approved",
      intro: "Your tournament registration has been approved.",
      details: [
        ["Tournament", tournamentName],
        ["Division", divisionName],
      ],
      actionLabel: "View registration",
      actionUrl,
    }),
  };
}

function normalizeMatchData(data: MatchTemplateData) {
  return {
    tournamentName: normalizeDisplayText(data.tournamentName),
    divisionName: normalizeDisplayText(data.divisionName),
    roundName: normalizeDisplayText(data.roundName),
    opponentName: normalizeDisplayText(data.opponentName),
    deadline: formatTransactionalEmailDeadlineUtc(data.deadlineAt),
  };
}

function renderMatchEmail({
  data,
  config,
  subject,
  heading,
  intro,
}: {
  data: MatchTemplateData;
  config: TransactionalEmailTemplateConfig;
  subject: (normalized: ReturnType<typeof normalizeMatchData>) => string;
  heading: string;
  intro: string;
}) {
  const normalized = normalizeMatchData(data);
  const actionUrl = buildMatchUrl(
    config.appOrigin,
    data.tournamentId,
    data.matchId
  );

  return {
    subject: subject(normalized),
    ...renderLayout({
      heading,
      intro,
      details: [
        ["Tournament", normalized.tournamentName],
        ["Division", normalized.divisionName],
        ["Round", normalized.roundName],
        ["Opponent", normalized.opponentName],
        ["Deadline", normalized.deadline],
      ],
      actionLabel: "View matchup",
      actionUrl,
    }),
  };
}

export function renderTransactionalEmail(
  data: TransactionalEmailTemplateData,
  config: TransactionalEmailTemplateConfig
): RenderedTransactionalEmail {
  let rendered: Omit<RenderedTransactionalEmail, "from" | "replyTo">;

  switch (data.templateKey) {
    case "registration_approved":
      rendered = renderRegistrationApproved(data, config);
      break;
    case "division_started_first_match":
      rendered = renderMatchEmail({
        data,
        config,
        subject: ({ tournamentName }) =>
          `Division started - your first matchup is ready: ${tournamentName}`,
        heading: "Your division has started",
        intro: "Your first matchup is ready to play.",
      });
      break;
    case "later_round_match_ready":
      rendered = renderMatchEmail({
        data,
        config,
        subject: ({ roundName, tournamentName }) =>
          `${roundName} matchup ready: ${tournamentName}`,
        heading: "Your next matchup is ready",
        intro: "Both official participants are set for this matchup.",
      });
      break;
    case "deadline_reminder_72h":
      rendered = renderMatchEmail({
        data,
        config,
        subject: ({ tournamentName }) =>
          `72 hours remaining for your match: ${tournamentName}`,
        heading: "Match deadline reminder",
        intro: "Your current match deadline is within 72 hours.",
      });
      break;
    case "deadline_reminder_24h":
      rendered = renderMatchEmail({
        data,
        config,
        subject: ({ tournamentName }) =>
          `24 hours remaining for your match: ${tournamentName}`,
        heading: "Final match deadline reminder",
        intro: "Your current match deadline is within 24 hours.",
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
