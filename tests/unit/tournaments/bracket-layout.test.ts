import { describe, expect, it } from "vitest";
import {
  calculateBracketLayout,
  type BracketCardMeasurement,
} from "@/components/tournaments/bracket-layout";

function mixedRounds(slots: number): BracketCardMeasurement[][] {
  return Array.from({ length: Math.log2(slots) }, (_, roundIndex) =>
    Array.from({ length: slots / 2 ** (roundIndex + 1) }, (_, matchIndex) => {
      const anchorOffset = 70 + roundIndex * 13 + (matchIndex % 3) * 4.25;
      return {
        id: `round-${roundIndex}-match-${matchIndex}`,
        anchorOffset,
        height: anchorOffset * 2 + ((roundIndex + matchIndex) % 4) * 45.5,
      };
    })
  );
}

function assertGeometry(rounds: BracketCardMeasurement[][]) {
  const layout = calculateBracketLayout(rounds);
  expect(Object.keys(layout.positions)).toHaveLength(rounds.flat().length);
  rounds.forEach((cards, roundIndex) => {
    cards.forEach((card, matchIndex) => {
      const position = layout.positions[card.id];
      expect(position.top).toBeGreaterThanOrEqual(0);
      expect(position.anchor).toBeCloseTo(position.top + card.anchorOffset, 8);
      expect(position.top + card.height).toBeLessThanOrEqual(layout.height);
      // The layout moves cards; it never supplies a replacement height.
      expect(Object.keys(position).sort()).toEqual(["anchor", "top"]);
      const previous = cards[matchIndex - 1];
      if (previous) {
        const previousBottom = layout.positions[previous.id].top + previous.height;
        expect(position.top - previousBottom).toBeGreaterThanOrEqual(24 - 1e-8);
      }
      if (roundIndex > 0) {
        const feeders = rounds[roundIndex - 1].slice(matchIndex * 2, matchIndex * 2 + 2);
        expect(feeders).toHaveLength(2);
        const midpoint = feeders.reduce((sum, feeder) => sum + layout.positions[feeder.id].anchor, 0) / 2;
        expect(position.anchor).toBeCloseTo(midpoint, 8);
      }
    });
  });
  return layout;
}

describe("single-elimination bracket core layout", () => {
  it.each([8, 16])("aligns every feeder pair in a %i-player bracket with mixed natural heights", (slots) => {
    const rounds = mixedRounds(slots);
    const snapshot = structuredClone(rounds);
    for (const cards of rounds) {
      cards.forEach(Object.freeze);
      Object.freeze(cards);
    }
    Object.freeze(rounds);

    const layout = assertGeometry(rounds);

    expect(rounds).toEqual(snapshot);
    expect(calculateBracketLayout(rounds)).toEqual(layout);
  });

  it.each([2, 4])("supports the smaller %i-player bracket without negative tops or artificial matches", (slots) => {
    const rounds = mixedRounds(slots);
    const layout = assertGeometry(rounds);
    expect(Object.keys(layout.positions)).toHaveLength(slots - 1);
  });

  it.each([0, 1, 2, 3])("reflows a late large footer and changed core measurement in round %i", (roundIndex) => {
    const rounds = mixedRounds(16);
    const initial = assertGeometry(rounds);
    const card = rounds[roundIndex].at(-1)!;
    const updated = rounds.map((cards) => cards.map((item) => item.id === card.id
      ? { ...item, height: item.height + 2400.75, anchorOffset: item.anchorOffset + 37.125 }
      : { ...item }));

    const resized = assertGeometry(updated);

    expect(resized.height).toBeGreaterThan(initial.height);
    expect(rounds[roundIndex].at(-1)).toEqual(card);
    expect(updated[roundIndex].at(-1)?.height).toBe(card.height + 2400.75);
  });

  it("keeps a final-only core fixed when its footer grows", () => {
    const card = { id: "final", height: 200, anchorOffset: 73.5 };
    const before = calculateBracketLayout([[card]]);
    const after = calculateBracketLayout([[{ ...card, height: 1200 }]]);

    expect(after.positions.final).toEqual(before.positions.final);
    expect(after.positions.final.anchor).toBe(73.5);
    expect(after.height).toBe(1200);
    expect(card.height).toBe(200);
  });
});
