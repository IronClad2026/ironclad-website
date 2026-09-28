export type BracketCardMeasurement = {
  id: string;
  height: number;
  anchorOffset: number;
};

export type BracketCardPosition = { top: number; anchor: number };

// Presentation only: input order is the existing sorted round/match order.
// Cards keep their natural heights; only the space between core anchors is shared.
export function calculateBracketLayout(rounds: BracketCardMeasurement[][]) {
  const gap = 24;
  let pitch = 0;
  let topInset = 0;
  for (const [roundIndex, cards] of rounds.entries()) {
    const above = Math.max(0, ...cards.map((card) => card.anchorOffset));
    const below = Math.max(0, ...cards.map((card) => card.height - card.anchorOffset));
    topInset = Math.max(topInset, above);
    pitch = Math.max(pitch, (above + below + gap) / 2 ** roundIndex);
  }
  pitch = Math.ceil(pitch);

  let height = 0;
  const positions: Record<string, BracketCardPosition> = {};
  rounds.forEach((cards, roundIndex) => {
    const stride = 2 ** roundIndex;
    cards.forEach((card, matchIndex) => {
      const anchor = topInset + pitch * ((stride - 1) / 2 + matchIndex * stride);
      const top = anchor - card.anchorOffset;
      positions[card.id] = { top, anchor };
      height = Math.max(height, top + card.height);
    });
  });
  return { positions, height: Math.ceil(height) };
}
