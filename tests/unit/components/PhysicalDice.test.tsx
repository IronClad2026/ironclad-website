// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PhysicalDice, {
  DICE_FACE_ORIENTATIONS,
  getDiceAnimation,
  type DiceValue,
} from "@/components/PhysicalDice";

describe("PhysicalDice", () => {
  afterEach(cleanup);

  it("maps every authoritative value to a fixed top-face orientation", () => {
    expect(DICE_FACE_ORIENTATIONS).toEqual({
      1: { rotateX: 90, rotateY: 0, rotateZ: 0 },
      2: { rotateX: 0, rotateY: 0, rotateZ: 0 },
      3: { rotateX: 0, rotateY: 0, rotateZ: -90 },
      4: { rotateX: 0, rotateY: 0, rotateZ: 90 },
      5: { rotateX: 180, rotateY: 0, rotateZ: 0 },
      6: { rotateX: -90, rotateY: 0, rotateZ: 0 },
    });
  });

  it.each([1, 2, 3, 4, 5, 6] as const)(
    "settles on the exact server-provided face %s",
    (value) => {
      render(
        <PhysicalDice
          value={value}
          label="Authoritative first die"
          animationKey={null}
        />
      );

      const die = screen.getByRole("img", {
        name: `Authoritative first die: ${value}`,
      });
      expect(die).toHaveAttribute("data-top-face", String(value));
      expect(die).toHaveStyle({
        "--dice-final-rotate-x": `${DICE_FACE_ORIENTATIONS[value].rotateX}deg`,
        "--dice-final-rotate-y": `${DICE_FACE_ORIENTATIONS[value].rotateY}deg`,
        "--dice-final-rotate-z": `${DICE_FACE_ORIENTATIONS[value].rotateZ}deg`,
      });
      expect(die).toHaveAttribute("data-die-flight", "true");
      expect(die.querySelector('[data-die-shadow="true"]')).not.toBeNull();
      expect(die.querySelector('[data-die-mount="true"]')).not.toBeNull();
      expect(die.querySelector('[data-die-cube="true"]')).not.toBeNull();
      expect(die.querySelectorAll('[data-die-face="true"]')).toHaveLength(6);
    }
  );

  it("keeps grouping properties off the preserve-3d cube", () => {
    const css = readFileSync(
      resolve(process.cwd(), "components/PhysicalDice.module.css"),
      "utf8"
    );
    const cubeRule = css.match(/\.die\s*\{([^}]*)\}/)?.[1];
    const shadowRule = css.match(/\.dieShadow\s*\{([^}]*)\}/)?.[1];

    expect(cubeRule).toContain("transform-style: preserve-3d");
    expect(cubeRule).not.toMatch(/(?:^|\s)(?:filter|opacity)\s*:/);
    expect(shadowRule).toContain("filter: blur(8px)");
  });

  it("uses deterministic whole turns and the same final orientation", () => {
    const first = getDiceAnimation(5, "match-1:1:3:2:player_one", 0, false);
    const repeated = getDiceAnimation(5, "match-1:1:3:2:player_one", 0, false);
    const secondDie = getDiceAnimation(
      5,
      "match-1:1:3:2:player_one",
      1,
      false
    );

    expect(first).toEqual(repeated);
    expect(first).not.toEqual(secondDie);
    expect(first.rotateX.at(-1)).toBe(DICE_FACE_ORIENTATIONS[5].rotateX);
    expect(first.rotateY.at(-1)).toBe(DICE_FACE_ORIENTATIONS[5].rotateY);
    expect(first.rotateZ.at(-1)).toBe(DICE_FACE_ORIENTATIONS[5].rotateZ);
  });

  it("removes tumble, bounce, and entry motion for reduced motion", () => {
    const motion = getDiceAnimation(
      4 as DiceValue,
      "match-1:1:1:1:player_two",
      1,
      true
    );

    expect(motion.x).toEqual([0]);
    expect(motion.y).toEqual([0]);
    expect(motion.rotateX).toEqual([DICE_FACE_ORIENTATIONS[4].rotateX]);
    expect(motion.rotateY).toEqual([DICE_FACE_ORIENTATIONS[4].rotateY]);
    expect(motion.rotateZ).toEqual([DICE_FACE_ORIENTATIONS[4].rotateZ]);
    expect(motion.duration).toBeLessThanOrEqual(0.18);
  });
});
