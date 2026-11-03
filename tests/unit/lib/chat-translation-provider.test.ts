import { describe, expect, it, vi } from "vitest";
import { CHAT_TRANSLATION_MODEL, detectChatSourceLanguage, translateChatText, verifyCloudflareFreePlan,
  type ChatTranslationProviderConfig } from "@/lib/chat-translation-provider";
import { TRANSLATION_LANGUAGES } from "@/lib/chat-translation";

const config: ChatTranslationProviderConfig = { enabled: true, accountId: "1".repeat(32), apiToken: "test-only-not-a-credential" };
// This is a synthetic positive fixture for the fail-closed predicate, not evidence that the account API returns this plan.
const freeSubscription = { rate_plan: { id: "explicit-test-free-record", public_name: "Workers Free", scope: "account" }, price: 0, state: "Provisioned" };
const subscriptions = (result: unknown[] = [freeSubscription]) => ({ success: true, result, result_info: { page: 1, total_count: result.length } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const input = { text: "Do not start the match before 18:30 UTC on 2026-11-08. @Player_1 won 2–0. https://example.test/match?a=1&b=2",
  sourceLanguage: "en" as const, targetLanguage: "it" as const };

describe("translation provider free-only gate", () => {
  it("requires a fresh explicit Workers Free zero-price account plan", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(subscriptions()));
    expect(await verifyCloudflareFreePlan(config, fetchImpl)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/subscriptions`);
    expect(init).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
  });

  it("does not guess a free plan ID, infer Free from absence, or mistake a domain plan for Workers", async () => {
    for (const body of [subscriptions([]), { success: false, result: [freeSubscription] }, subscriptions([{ ...freeSubscription, rate_plan: { id: "workers_free", public_name: "Unknown", scope: "account" } }]),
      subscriptions([{ ...freeSubscription, rate_plan: { id: "free", public_name: "Free", scope: "zone" } }]),
      subscriptions([{ ...freeSubscription, rate_plan: { ...freeSubscription.rate_plan, scope: "zone" } }]),
      subscriptions([{ ...freeSubscription, price: 5 }]), subscriptions([{ ...freeSubscription, price: "0" }]),
      subscriptions([{ ...freeSubscription, state: "Trial" }]), subscriptions([freeSubscription, freeSubscription]),
      { ...subscriptions(), result_info: { page: 1, total_count: 2 } }, { ...subscriptions(), result_info: { page: 2, total_count: 1 } }]) {
      expect(await verifyCloudflareFreePlan(config, vi.fn<typeof fetch>().mockResolvedValue(json(body)))).toBe(false);
    }
  });

  it("rejects active or ambiguous paid/partner Workers plans alongside Free", async () => {
    for (const id of ["WORKERS_PAID", "PARTNERS_WORKERS_ENT", "PARTNERS_WORKERS_SS", "future_workers_tier"]) {
      const body = subscriptions([freeSubscription, { rate_plan: { id, public_name: "Workers", scope: "account" }, state: "Paid", price: 5 }]);
      expect(await verifyCloudflareFreePlan(config, vi.fn<typeof fetch>().mockResolvedValue(json(body)))).toBe(false);
    }
  });

  it("fails closed for permission failures, invalid JSON, oversized results and network errors", async () => {
    for (const response of [json({}, 403), json({}, 500), new Response("not-json"), new Response("x".repeat(65537))]) {
      expect(await verifyCloudflareFreePlan(config, vi.fn<typeof fetch>().mockResolvedValue(response))).toBe(false);
    }
    expect(await verifyCloudflareFreePlan(config, vi.fn<typeof fetch>().mockRejectedValue(new Error("private upstream error")))).toBe(false);
  });
});

describe("translation source-language handling", () => {
  it("supports an explicit source override in every website language", () => {
    for (const language of TRANSLATION_LANGUAGES) expect(detectChatSourceLanguage("gg", language)).toBe(language);
  });

  it("abstains for short, reference-only, unsupported or clearly mixed text", () => {
    for (const text of ["gg", "18:30 UTC 2-0", "https://example.test/verylongusernameandtext?when=tomorrow @LongPlayerName_123", "Bonjour merci hello",
      "明日は日本語で試合の日程について相談したいと思っています。", "الرجاء عدم بدء المباراة قبل الموعد المحدد غداً مساءً",
      "Please do not start the match until we are both ready. Пожалуйста не начинайте матч пока мы оба не готовы."]) {
      expect(detectChatSourceLanguage(text)).toBeNull();
    }
  });

  it("detects actual text conservatively and abstains for close or unsupported alternatives", () => {
    const samples = {
      en: "Please do not start the match before the agreed date and time. We need to confirm the tournament schedule together.",
      it: "Per favore non iniziare la partita prima della data e dell'orario concordati. Dobbiamo confermare insieme il calendario del torneo.",
      "zh-CN": "请不要在我们约定的日期和时间之前开始比赛，我们需要一起确认比赛的具体安排和报名信息。",
      ru: "Пожалуйста не начинайте матч раньше согласованной даты и времени. Нам необходимо вместе подтвердить расписание турнира.",
      es: "Por favor no empieces la partida antes de la fecha y la hora acordadas. Tenemos que confirmar juntos el calendario del torneo.",
      "pt-BR": "Por favor não comece a partida antes da data e do horário combinados. Precisamos confirmar juntos a programação do torneio.",
      ko: "약속한 날짜와 시간 전에 경기를 시작하지 마세요. 토너먼트 경기 일정을 함께 확인하고 상대 선수와 시간을 정해야 합니다.",
      fr: "Veuillez ne pas commencer la partie avant la date et l'heure convenues. Nous devons confirmer ensemble le calendrier du tournoi.",
    } as const;
    const expected = { en: null, it: "it", "zh-CN": "zh-CN", ru: null, es: null, "pt-BR": null, ko: "ko", fr: "fr" } as const;
    for (const language of TRANSLATION_LANGUAGES) expect(detectChatSourceLanguage(samples[language]), language).toBe(expected[language]);
  });
});

describe("direct synchronous Cloudflare translation", () => {
  it("makes no provider request while disabled or missing credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    for (const disabled of [null, { ...config, enabled: false }, { ...config, accountId: "wrong-account" }, { ...config, apiToken: "" }]) {
      expect((await translateChatText(input, { config: disabled, fetch: fetchImpl })).status).toBe("disabled");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires source selection for ambiguity and avoids same-language inference", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect((await translateChatText({ ...input, text: "gg", sourceLanguage: "auto" }, { config, fetch: fetchImpl })).status).toBe("source_required");
    expect((await translateChatText({ ...input, targetLanguage: "en" }, { config, fetch: fetchImpl })).status).toBe("same_language");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks inference when the effective plan cannot be established as Free", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(subscriptions([])));
    expect((await translateChatText(input, { config, fetch: fetchImpl })).status).toBe("disabled");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("uses every target base code and leaves saved dates, times, names, links and scores unchanged in the request", async () => {
    for (const targetLanguage of TRANSLATION_LANGUAGES.filter((language) => language !== "en")) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(subscriptions())).mockResolvedValueOnce(json({ success: true, result: { translated_text: "Unchanged reference 18:30 UTC 2026-11-08 @Player_1 2–0 https://example.test/match?a=1&b=2" } }));
      const result = await translateChatText({ ...input, targetLanguage }, { config, fetch: fetchImpl });
      expect(result.status).toBe("translated");
      const [url, init] = fetchImpl.mock.calls[1];
      expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${CHAT_TRANSLATION_MODEL}`);
      expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
      expect(JSON.parse(init?.body as string)).toEqual({ text: input.text, source_lang: "en", target_lang: targetLanguage === "zh-CN" ? "zh" : targetLanguage === "pt-BR" ? "pt" : targetLanguage });
      expect(Object.keys(JSON.parse(init?.body as string))).toEqual(["text", "source_lang", "target_lang"]);
    }
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(subscriptions())).mockResolvedValueOnce(json({ success: true, result: { translated_text: "Do not start." } }));
    expect((await translateChatText({ ...input, sourceLanguage: "fr", targetLanguage: "en" }, { config, fetch: fetchImpl })).status).toBe("translated");
  });

  it("supports non-English pairs directly and normalizes Chinese output script locally", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(subscriptions())).mockResolvedValueOnce(json({ success: true, result: { translated_text: "請不要開始比賽，確認時間。" } }));
    const result = await translateChatText({ ...input, sourceLanguage: "it", targetLanguage: "zh-CN" }, { config, fetch: fetchImpl });
    expect(result.translatedText).toBe("请不要开始比赛，确认时间。");
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string).source_lang).toBe("it");
  });

  it("returns typed quota, throttling and outage failures without upstream details", async () => {
    for (const [status, body, expected] of [
      [429, { errors: [{ code: 3036, message: "private diagnostic" }] }, "quota_exhausted"],
      [429, { errors: [{ code: 3040 }] }, "rate_limited"],
      [403, { errors: [{ code: 5035 }] }, "unavailable"],
      [500, { message: "private diagnostic" }, "unavailable"],
      [200, { success: false, result: { translated_text: "wrong" } }, "unavailable"],
      [200, { success: true, result: { translated_text: "\u0000invalid" } }, "unavailable"],
    ] as const) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(subscriptions())).mockResolvedValueOnce(json(body, status));
      const result = await translateChatText(input, { config, fetch: fetchImpl });
      expect(result).toEqual({ status: expected, sourceLanguage: "en", translatedText: null });
      expect(JSON.stringify(result)).not.toContain("private diagnostic");
    }
  });

  it("turns timeout/network failures into safe unavailability without retrying", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(subscriptions())).mockRejectedValueOnce(new DOMException("private timeout", "TimeoutError"));
    expect(await translateChatText(input, { config, fetch: fetchImpl })).toEqual({ status: "unavailable", sourceLanguage: "en", translatedText: null });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
