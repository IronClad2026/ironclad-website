import { describe, expect, it } from "vitest";
import { dialogueRect, placeContextMenu, placeReady, thoughtTrail } from "@/components/ready/floating-layout";
import type { Bounds, Rect } from "@/components/ready/floating-layout";

const desktop = { left: 10, right: 1270, top: 88, bottom: 790 };
const portrait = { left: 10, right: 380, top: 101, bottom: 770 };
const main = { main: true, height: 290, bubbleHeight: 56 };
const answer = { main: false, height: 352, bubbleHeight: 93 };

function gap(a: Rect, b: Rect) {
  return Math.hypot(Math.max(0, a.x - b.x - b.width, b.x - a.x - a.width),
    Math.max(0, a.y - b.y - b.height, b.y - a.y - a.height));
}

function inside(rect: Rect, bounds: Bounds) {
  expect(rect.x).toBeGreaterThanOrEqual(bounds.left);
  expect(rect.y).toBeGreaterThanOrEqual(bounds.top);
  expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.right);
  expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.bottom);
}

function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("Ready floating placement", () => {
  it("keeps the speech and the surrounding six clouds with the moving skull on a crowded dashboard", () => {
    const controls = Array.from({ length: 6 }, (_, index) => ({
      x: 140, y: 130 + index * 95, width: 1050, height: 88,
    }));
    let last = placeReady(desktop, { x: 45, y: 300 }, main, controls);
    expect(last.dialogue.side).toBe("right");
    for (const x of [142, 290, 470, 650, 840, 1030, 1170]) {
      const requested = { x, y: 300 };
      const result = placeReady(desktop, requested, main, controls, last);
      expect(result).toEqual(placeReady(desktop, requested, main, [], last));
      expect(gap(result.skull, dialogueRect(result.dialogue, main.height))).toBeLessThanOrEqual(16);
      last = result;
    }
    expect(last.dialogue.side).toBe("left");
    expect(last.dialogue.oval).toBe(true);
    const center = dialogueRect(last.dialogue, main.height);
    const inset = 8;
    const speech = { x: center.x + inset, width: center.width - 2 * inset,
      y: center.y + 55, height: main.bubbleHeight };
    expect(gap(last.skull, speech)).toBeLessThanOrEqual(26);
    expect(thoughtTrail(last.skull, speech, last.dialogue.side, {
      x: last.skull.x + last.skull.width / 2, y: last.skull.y + last.skull.height * .69,
    })).toHaveLength(3);
  });

  it("keeps the important full-width actions clear in the default portrait placement", () => {
    const controls = [
      { x: 20, y: 440, width: 350, height: 48 },
      { x: 20, y: 500, width: 350, height: 48 },
    ];
    const result = placeReady(portrait, null, main, controls);
    const cloud = dialogueRect(result.dialogue, main.height);
    for (const control of controls) {
      expect(intersects(result.skull, control)).toBe(false);
      expect(intersects(cloud, control)).toBe(false);
    }
    expect(gap(result.skull, cloud)).toBeLessThanOrEqual(30);
  });

  it("places the default dashboard group clear of match controls and Browse Tournaments", () => {
    const controls = [
      { x: 632, y: 525, width: 177, height: 46 },
      { x: 24, y: 376, width: 806, height: 76 },
      { x: 853, y: 328, width: 388, height: 81 },
    ];
    const result = placeReady(desktop, null, main, controls);
    const cloud = dialogueRect(result.dialogue, main.height);
    for (const control of controls) {
      expect(intersects(result.skull, control)).toBe(false);
      expect(intersects(cloud, control)).toBe(false);
    }
    expect(gap(result.skull, cloud)).toBeLessThanOrEqual(60);
  });

  it("lets the stacked portrait menu follow a horizontal drag", () => {
    const start = placeReady(portrait, { x: portrait.left, y: portrait.top }, main);
    const end = placeReady(portrait, { x: portrait.right, y: portrait.top }, main, [], start);
    expect(start.dialogue.side).toBe("below");
    expect(end.dialogue.side).toBe("below");
    expect(end.dialogue.x - start.dialogue.x).toBeGreaterThanOrEqual(40);
    expect(gap(end.skull, dialogueRect(end.dialogue, main.height))).toBeLessThanOrEqual(16);
  });

  it.each([
    portrait,
    { left: 10, right: 350, top: 96, bottom: 730 },
    { left: 10, right: 770, top: 98, bottom: 380 },
    desktop,
  ])("keeps the skull, an expanded answer and quick actions available in every corner of %o", (bounds) => {
    for (const x of [bounds.left - 150, bounds.right + 150]) {
      for (const y of [bounds.top - 150, bounds.bottom + 150]) {
        const { skull, dialogue } = placeReady(bounds, { x, y }, answer);
        const cloud = dialogueRect(dialogue, answer.height);
        inside(skull, bounds);
        inside(cloud, bounds);
        expect(intersects(skull, cloud)).toBe(false);
        expect(cloud.height).toBeGreaterThanOrEqual(96);
        expect(gap(skull, cloud)).toBeLessThanOrEqual(16);
        const close = { x: skull.x + skull.width * .94 - 44, y: skull.y + skull.height * .02, width: 44, height: 44 };
        const actions = placeContextMenu(bounds, skull, { width: 72, height: 47 }, 6, [cloud, close]);
        expect(actions).not.toBeNull();
        inside(actions!, bounds);
        expect(intersects(actions!, cloud) || intersects(actions!, close)).toBe(false);
        expect(gap(actions!, skull)).toBeLessThanOrEqual(8);
      }
    }
  });

  it("keeps the side and width stable while a drag wobbles at the oval breakpoint", () => {
    let last = placeReady(desktop, { x: 555, y: 310 }, main);
    const side = last.dialogue.side;
    for (const x of [566, 568, 564, 569, 565, 570]) {
      last = placeReady(desktop, { x, y: 310 }, main, [], last);
      expect(last.dialogue.oval).toBe(false);
      expect(last.dialogue.width).toBe(370);
      expect(last.dialogue.side).toBe(side);
    }
  });
});
