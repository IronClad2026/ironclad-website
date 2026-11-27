import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import deliveryManifest from "@/content/legal-document-delivery.json";
import { getLegalDocument } from "@/lib/legal-corpus-publication";
import { answerKnowledgeTopic } from "@/lib/ready/knowledge";
import { publishedReadyVersions, readyDocument } from "@/lib/ready/knowledge-sources";

describe("Ready answers with approved sources", () => {
  it.each([
    ["registration", /free/, "Rulebook v3.2", "5.1"],
    ["eligibility", /18 or older/, "Agreement v3.2", "3.1"],
    ["division", /highest verified current 1v1 faction ELO/, "Rulebook v3.2", "4.4"],
    ["waitlist", /first-come waitlist/, "Rulebook v3.2", "5.3"],
    ["events", /select the event/, "Rulebook v3.2", "6.1"],
    ["format", /semifinals are best-of-three/, "Rulebook v3.2", "3.3"],
    ["final", /grand final is best-of-five/, "Rulebook v3.2", "3.3"],
    ["scheduling", /displayed on your Match page/, "Rulebook v3.2", "9.1"],
    ["results", /final score/, "Rulebook v3.2", "11.1"],
    ["replays", /one unique CoH3 .rec.*10 MiB/, "Rulebook v3.2", "11.2"],
    ["disconnects", /does not award a win/, "Rulebook v3.2", "10.4"],
    ["disputes", /before the displayed deadline/, "Rulebook v3.2", "12.1"],
    ["no-shows", /request Admin Assistance/, "Rulebook v3.2", "9.4"],
    ["withdrawal", /withdraw through the platform.*After launch, use Admin Assistance/, "Rulebook v3.2", "5.8"],
    ["decisions", /configured outcome/, "Rulebook v3.2", "6.10"],
    ["prizes", /published Prize Terms/, "Agreement v3.2", "13.1"],
    ["rules", /rules hub/, "IronClad Competition Rules", "Official Documents"],
    ["terms", /use of the IronClad platform/, "Terms of Service v1.1", "§§ 2 and 4"],
    ["privacy", /private operational information/, "Privacy Policy v1.3", "§§ 11 and 13"],
    ["agreement", /conditions for taking part/, "Agreement v3.2", "§§ 1–2"],
    ["governing-versions", /recorded document versions/, "Rulebook v3.2", "21.3"],
    ["discord", /optional for registration/, "Rulebook v3.2", "4.8"],
    ["lobby", /575 victory points/, "Rulebook v3.2", "8.1"],
    ["maps", /opponent picks the other/, "Rulebook v3.2", "7.3"],
    ["factions", /faction within your assigned side/, "Rulebook v3.2", "7.1"],
    ["dice", /2d6 roll/, "Rulebook v3.2", "7.3"],
    ["pauses", /up to five minutes/, "Rulebook v3.2", "10.1"],
    ["submission-help", /your own active match/, "Rulebook v3.2", "11.1"],
  ] as const)("grounds %s", (topic, text, title, section) => {
    const reply = answerKnowledgeTopic(topic);
    expect(reply?.text).toMatch(text);
    expect(reply?.sources?.[0].title).toContain(title);
    expect(reply?.sources?.[0].section).toContain(section);
  });

  it.each(["3.0", "3.1"])("uses the event's historical Rulebook %s and the combined division", (version) => {
    const result = answerKnowledgeTopic("division", {
      kind: "known",
      eventTitle: "Legacy Event",
      versions: { rulebook: version, ppa: version, terms: "1.1", privacy: "1.2" },
    }, { eventSlug: "legacy-event" });
    expect(result?.text).toContain("Main / Pro (1400 or above)");
    expect(result?.text).not.toContain("1700");
    expect(result?.sources?.[0].url).toBe(`/documents-rules-ppa/ironclad-official-tournament-rulebook-v${version}.pdf#page=5`);
    expect(result?.actions).toContainEqual(expect.objectContaining({
      actionId: "find-tournament", href: "/tournaments?tournament=legacy-event",
    }));
  });

  it("shows the current four-division threshold only as general four-division guidance", () => {
    const result = answerKnowledgeTopic("division");
    expect(result?.text).toContain("Four-division events");
    expect(result?.text).toContain("Pro 1700");
    expect(result?.sources?.[0].url).toContain("v3.2.pdf#page=5");
  });

  it("lists the exact versions together for an owned historical event", () => {
    const result = answerKnowledgeTopic("governing-versions", {
      kind: "known", eventTitle: "Legacy Event",
      versions: { rulebook: "3.0", ppa: "3.0", terms: "1.0", privacy: "1.1" },
    });
    expect(result?.sources?.map((source) => source.title)).toEqual([
      "Official Tournament Rulebook v3.0", "Player Participation Agreement v3.0",
      "Terms of Service v1.0", "Privacy Policy v1.1",
    ]);
  });

  it("offers admin help when an event has no verified governing version", () => {
    const result = answerKnowledgeTopic("replays", {
      kind: "unconfirmed", eventTitle: "Historical Event",
    }, { eventSlug: "unknown" });
    expect(result?.sources).toBeUndefined();
    expect(result?.text).toContain("can’t confirm");
    expect(result?.actions).toContainEqual({
      label: "Get admin help", intent: { kind: "action", id: "support-options" }, context: { eventSlug: "unknown", topic: "replays" },
    });
  });

  it("makes the player pick an event before opening decisions or prize terms", () => {
    expect(answerKnowledgeTopic("decisions").actions).toContainEqual(expect.objectContaining({
      intent: { kind: "action", id: "event-decisions" },
    }));
    expect(answerKnowledgeTopic("prizes", { kind: "general" }, { eventSlug: "selected-event" }).actions).toContainEqual(expect.objectContaining({
      intent: { kind: "action", id: "event-prizes" }, context: { eventSlug: "selected-event", topic: "prizes" },
    }));
  });

  it("cites the same current edition as the Production rules hub", () => {
    for (const kind of ["rulebook", "ppa", "terms", "privacy"] as const) {
      const document = getLegalDocument(kind);
      expect(readyDocument(kind, publishedReadyVersions[kind])).toMatchObject({
        version: document.version, url: document.publicPath, status: "published-current",
      });
    }
    expect(answerKnowledgeTopic("privacy").sources?.[0].url).toBe("/documents-rules-ppa/ironclad-privacy-policy-v1.3.pdf");
  });

  it.each([
    ["waitlist", 5, 6], ["disputes", 9, 10], ["pauses", 8, 9],
  ] as const)("opens %s at the section's edition-specific page", (topic, legacyPage, currentPage) => {
    for (const rulebook of ["3.0", "3.1", "3.2"]) {
      const reply = answerKnowledgeTopic(topic, {
        kind: "known", eventTitle: "Audit event", versions: { ...publishedReadyVersions, rulebook },
      });
      expect(reply.sources?.[0].url).toBe(
        `/documents-rules-ppa/ironclad-official-tournament-rulebook-v${rulebook}.pdf#page=${rulebook === "3.2" ? currentPage : legacyPage}`,
      );
    }
  });

  it("validates every delivered version against byte-verified immutable artifacts", () => {
    for (const { kind, version, publicPath, sha256 } of deliveryManifest.documents) {
      expect(readyDocument(kind as Parameters<typeof readyDocument>[0], version)?.url).toBe(publicPath);
      const pdf = readFileSync(resolve(process.cwd(), `public${publicPath}`));
      expect(createHash("sha256").update(pdf).digest("hex")).toBe(sha256);
    }
    expect(readyDocument("rulebook", "3.3")).toBeNull();
    expect(readyDocument("ppa", "draft")).toBeNull();
  });
});
