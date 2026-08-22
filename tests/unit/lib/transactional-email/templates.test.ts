import { describe, expect, it } from "vitest";
import {
  formatTransactionalEmailDeadlineUtc,
  renderTransactionalEmail,
  TRANSACTIONAL_EMAIL_TEMPLATE_KEYS,
  type TransactionalEmailTemplateData,
} from "@/lib/transactional-email/templates";
import zhEmail from "@/lib/i18n/dictionaries/zh-CN/email";
import enEmail, {
  type EmailDictionary,
} from "@/lib/i18n/dictionaries/en/email";
import esEmail from "@/lib/i18n/dictionaries/es/email";
import frEmail from "@/lib/i18n/dictionaries/fr/email";
import itEmail from "@/lib/i18n/dictionaries/it/email";
import koEmail from "@/lib/i18n/dictionaries/ko/email";
import ptBrEmail from "@/lib/i18n/dictionaries/pt-BR/email";
import ruEmail from "@/lib/i18n/dictionaries/ru/email";
import type { Locale } from "@/lib/i18n/config";

const TEMPLATE_CONFIG = {
  appOrigin: "https://preview.example.invalid",
  from: "IronClad Tournaments <notifications@example.invalid>",
  replyTo: "operations@example.invalid",
};

const MATCH_DATA = {
  tournamentName: "Winter Championship",
  tournamentId: "tournament-id",
  divisionName: "Veteran Division",
  roundName: "Semifinal",
  opponentName: "Opponent Player",
  matchId: "match-id",
  deadlineAt: "2026-08-18T10:00:00+00:00",
};

const LOCALE_EMAIL_DICTIONARIES = [
  ["en", enEmail],
  ["it", itEmail],
  ["zh-CN", zhEmail],
  ["ru", ruEmail],
  ["es", esEmail],
  ["pt-BR", ptBrEmail],
  ["ko", koEmail],
  ["fr", frEmail],
] as const satisfies ReadonlyArray<readonly [Locale, EmailDictionary]>;

const CASES: Array<{
  data: TransactionalEmailTemplateData;
  subject: string;
  heading: string;
}> = [
  {
    data: {
      templateKey: "registration_approved",
      tournamentName: "Winter Championship",
      divisionName: "Veteran Division",
      registrationId: "registration-id",
    },
    subject: "Registration approved: Winter Championship",
    heading: "Your registration is approved",
  },
  {
    data: {
      templateKey: "division_started_first_match",
      ...MATCH_DATA,
      roundName: "Round 1",
    },
    subject:
      "Division started - your first matchup is ready: Winter Championship",
    heading: "Your division has started",
  },
  {
    data: { templateKey: "later_round_match_ready", ...MATCH_DATA },
    subject: "Semifinals matchup ready: Winter Championship",
    heading: "Your next matchup is ready",
  },
  {
    data: { templateKey: "deadline_reminder_72h", ...MATCH_DATA },
    subject: "72 hours remaining for your match: Winter Championship",
    heading: "Match deadline reminder",
  },
  {
    data: { templateKey: "deadline_reminder_24h", ...MATCH_DATA },
    subject: "24 hours remaining for your match: Winter Championship",
    heading: "Final match deadline reminder",
  },
];

describe("transactional email templates", () => {
  it("defines exactly the five approved template keys", () => {
    expect(TRANSACTIONAL_EMAIL_TEMPLATE_KEYS).toEqual([
      "registration_approved",
      "division_started_first_match",
      "later_round_match_ready",
      "deadline_reminder_72h",
      "deadline_reminder_24h",
    ]);
  });

  it.each(CASES)(
    "renders HTML and text for $data.templateKey",
    ({ data, subject, heading }) => {
      const rendered = renderTransactionalEmail(data, TEMPLATE_CONFIG);

      expect(rendered.subject).toBe(subject);
      expect(rendered.html).toContain("<!doctype html>");
      expect(rendered.html).toContain(heading);
      expect(rendered.text).toContain(heading);
      expect(rendered.html).toContain("Winter Championship");
      expect(rendered.text).toContain("Winter Championship");
      expect(rendered.from).toBe(TEMPLATE_CONFIG.from);
      expect(rendered.replyTo).toBe(TEMPLATE_CONFIG.replyTo);
    }
  );

  it("renders the canonical registration dashboard link", () => {
    const rendered = renderTransactionalEmail(CASES[0].data, TEMPLATE_CONFIG);
    const expectedUrl =
      "https://preview.example.invalid/dashboard#registration-registration-id";

    expect(rendered.html).toContain(expectedUrl);
    expect(rendered.text).toContain(expectedUrl);
  });

  it.each(CASES.slice(1))(
    "renders the canonical match link for $data.templateKey",
    ({ data }) => {
      const rendered = renderTransactionalEmail(data, TEMPLATE_CONFIG);
      const textUrl =
        "https://preview.example.invalid/tournaments?tournament=tournament-id&tab=brackets&match=match-id";
      const htmlUrl = textUrl.replaceAll("&", "&amp;");

      expect(rendered.text).toContain(textUrl);
      expect(rendered.html).toContain(htmlUrl);
    }
  );

  it.each(CASES.slice(1))(
    "includes matchup context and deterministic UTC for $data.templateKey",
    ({ data }) => {
      const rendered = renderTransactionalEmail(data, TEMPLATE_CONFIG);

      for (const value of [
        "Veteran Division",
        data.templateKey === "division_started_first_match"
          ? "Round 1"
          : "Semifinals",
        "Opponent Player",
        "18 August 2026, 10:00 UTC",
      ]) {
        expect(rendered.html).toContain(value);
        expect(rendered.text).toContain(value);
      }
    }
  );

  it("formats UTC independently of the timestamp offset", () => {
    expect(
      formatTransactionalEmailDeadlineUtc("2026-08-18T20:00:00+10:00")
    ).toBe("18 August 2026, 10:00 UTC");
  });

  it("renders selected-locale copy, lang, and UTC presentation without translating dynamic names", () => {
    const rendered = renderTransactionalEmail(
      CASES[0].data,
      TEMPLATE_CONFIG,
      "zh-CN",
      zhEmail
    );

    expect(rendered.subject).toBe("报名已获批准：Winter Championship");
    expect(rendered.html).toContain('<html lang="zh-CN">');
    expect(rendered.html).toContain("Winter Championship");
    expect(rendered.text).toContain("Veteran Division");
  });

  it.each(LOCALE_EMAIL_DICTIONARIES)(
    "renders the complete app-owned email shell for %s",
    (locale, dictionary) => {
      for (const testCase of CASES) {
        const rendered = renderTransactionalEmail(
          testCase.data,
          TEMPLATE_CONFIG,
          locale,
          dictionary
        );

        expect(rendered.subject.trim()).not.toBe("");
        expect(rendered.html).toContain(`<html lang="${locale}">`);
        expect(rendered.html).toContain("Winter Championship");
        expect(rendered.text).toContain("Winter Championship");
      }
    }
  );

  it.each(LOCALE_EMAIL_DICTIONARIES)(
    "localizes a canonical round alias in the %s subject and details",
    (locale, dictionary) => {
      const rendered = renderTransactionalEmail(
        {
          templateKey: "later_round_match_ready",
          ...MATCH_DATA,
          roundName: "Semi-Finals",
        },
        TEMPLATE_CONFIG,
        locale,
        dictionary
      );

      expect(rendered.subject).toContain(dictionary.roundNames.semifinals);
      expect(rendered.subject).not.toContain("Semi-Finals");
      expect(rendered.text).toContain(
        `${dictionary.labels.round}: ${dictionary.roundNames.semifinals}`
      );
      expect(rendered.html).toContain(dictionary.roundNames.semifinals);
      expect(rendered.text).toContain(MATCH_DATA.tournamentName);
      expect(rendered.text).toContain(MATCH_DATA.divisionName);
      expect(rendered.text).toContain(MATCH_DATA.opponentName);
    }
  );

  it.each(LOCALE_EMAIL_DICTIONARIES)(
    "preserves an unknown custom round in the %s subject and details",
    (locale, dictionary) => {
      const customRoundName = "Lower Bracket Round 2";
      const rendered = renderTransactionalEmail(
        {
          templateKey: "later_round_match_ready",
          ...MATCH_DATA,
          roundName: customRoundName,
        },
        TEMPLATE_CONFIG,
        locale,
        dictionary
      );

      expect(rendered.subject).toContain(customRoundName);
      expect(rendered.text).toContain(
        `${dictionary.labels.round}: ${customRoundName}`
      );
      expect(rendered.html).toContain(customRoundName);
      expect(rendered.text).toContain(MATCH_DATA.tournamentName);
      expect(rendered.text).toContain(MATCH_DATA.divisionName);
      expect(rendered.text).toContain(MATCH_DATA.opponentName);
    }
  );

  it("rejects a timezone-less deadline rather than using server-local time", () => {
    expect(() =>
      formatTransactionalEmailDeadlineUtc("2026-08-18T10:00:00")
    ).toThrow("Transactional email template data is invalid.");
  });

  it("escapes display data and links in HTML while keeping readable text", () => {
    const rendered = renderTransactionalEmail(
      {
        templateKey: "later_round_match_ready",
        ...MATCH_DATA,
        tournamentName: '<script>alert("tournament")</script>',
        divisionName: "A & B's <Division>",
        opponentName: 'Player "One" & Two',
        tournamentId: "tournament&unsafe",
        matchId: "match&unsafe",
      },
      TEMPLATE_CONFIG
    );

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain(
      "&lt;script&gt;alert(&quot;tournament&quot;)&lt;/script&gt;"
    );
    expect(rendered.html).toContain("A &amp; B&#39;s &lt;Division&gt;");
    expect(rendered.html).toContain("Player &quot;One&quot; &amp; Two");
    expect(rendered.html).toContain(
      "tournament=tournament%26unsafe&amp;tab=brackets&amp;match=match%26unsafe"
    );
    expect(rendered.text).toContain('<script>alert("tournament")</script>');
  });

  it.each(CASES)(
    "contains no marketing or tracking mechanism for $data.templateKey",
    ({ data }) => {
      const rendered = renderTransactionalEmail(data, TEMPLATE_CONFIG);
      const combined = `${rendered.html}\n${rendered.text}`.toLowerCase();

      expect(combined).not.toContain("unsubscribe");
      expect(combined).not.toContain("tracking pixel");
      expect(combined).not.toContain("utm_");
      expect(combined).not.toContain("social media");
      expect(combined).not.toContain("newsletter");
    }
  );

  it("rejects an invalid deadline without echoing it", () => {
    const invalidDeadline = "private-invalid-deadline";

    expect(() =>
      renderTransactionalEmail(
        {
          templateKey: "deadline_reminder_24h",
          ...MATCH_DATA,
          deadlineAt: invalidDeadline,
        },
        TEMPLATE_CONFIG
      )
    ).toThrow("Transactional email template data is invalid.");

    try {
      formatTransactionalEmailDeadlineUtc(invalidDeadline);
    } catch (error) {
      expect(String(error)).not.toContain(invalidDeadline);
    }
  });
});
