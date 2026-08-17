"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";
import styles from "./PhysicalDice.module.css";

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

type DiceOrientation = {
  rotateX: number;
  rotateY: number;
  rotateZ: number;
};

export const DICE_FACE_ORIENTATIONS: Record<DiceValue, DiceOrientation> = {
  1: { rotateX: 90, rotateY: 0, rotateZ: 0 },
  2: { rotateX: 0, rotateY: 0, rotateZ: 0 },
  3: { rotateX: 0, rotateY: 0, rotateZ: -90 },
  4: { rotateX: 0, rotateY: 0, rotateZ: 90 },
  5: { rotateX: 180, rotateY: 0, rotateZ: 0 },
  6: { rotateX: -90, rotateY: 0, rotateZ: 0 },
};

export type DiceAnimation = {
  x: number[];
  y: number[];
  scale: number[];
  opacity: number[];
  rotateX: number[];
  rotateY: number[];
  rotateZ: number[];
  duration: number;
  times: number[];
};

const DICE_FACES: Array<{ value: DiceValue; position: string }> = [
  { value: 1, position: "front" },
  { value: 6, position: "back" },
  { value: 3, position: "right" },
  { value: 4, position: "left" },
  { value: 2, position: "top" },
  { value: 5, position: "bottom" },
];

function hashAnimationKey(value: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

export function getDiceAnimation(
  value: DiceValue,
  animationKey: string,
  dieIndex: 0 | 1,
  reduceMotion: boolean
): DiceAnimation {
  const final = DICE_FACE_ORIENTATIONS[value];

  if (reduceMotion) {
    return {
      x: [0],
      y: [0],
      scale: [1],
      opacity: [1],
      rotateX: [final.rotateX],
      rotateY: [final.rotateY],
      rotateZ: [final.rotateZ],
      duration: 0.16,
      times: [1],
    };
  }

  const hash = hashAnimationKey(`${animationKey}:${dieIndex}`);
  const direction = (hash & 1) === 0 ? 1 : -1;
  const opposingDirection = dieIndex === 0 ? direction : -direction;
  const xOffset = (dieIndex === 0 ? -1 : 1) * (28 + (hash % 13));
  const fullTurnsX = 720 + ((hash >>> 3) % 2) * 360;
  const fullTurnsY = 720 + ((hash >>> 5) % 2) * 360;
  const fullTurnsZ = 720 + ((hash >>> 7) % 2) * 360;

  return {
    x: [xOffset, -xOffset * 0.08, 0, 0],
    y: [-30, 7, -3, 0],
    scale: [0.86, 1.04, 0.98, 1],
    opacity: [0, 1, 1, 1],
    rotateX: [
      final.rotateX + opposingDirection * fullTurnsX,
      final.rotateX + opposingDirection * 360,
      final.rotateX + opposingDirection * 18,
      final.rotateX,
    ],
    rotateY: [
      final.rotateY - opposingDirection * fullTurnsY,
      final.rotateY - opposingDirection * 360,
      final.rotateY - opposingDirection * 12,
      final.rotateY,
    ],
    rotateZ: [
      final.rotateZ + opposingDirection * fullTurnsZ,
      final.rotateZ + opposingDirection * 180,
      final.rotateZ + opposingDirection * 8,
      final.rotateZ,
    ],
    duration: 1.12,
    times: [0, 0.76, 0.88, 1],
  };
}

export default function PhysicalDice({
  value,
  label,
  animationKey,
  dieIndex = 0,
}: {
  value: DiceValue;
  label: string;
  animationKey: string | null;
  dieIndex?: 0 | 1;
}) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const shouldAnimate = animationKey !== null;
  const animation = getDiceAnimation(
    value,
    animationKey ?? `settled:${value}`,
    dieIndex,
    !shouldAnimate || prefersReducedMotion
  );
  const orientation = DICE_FACE_ORIENTATIONS[value];
  const style = {
    "--dice-final-rotate-x": `${orientation.rotateX}deg`,
    "--dice-final-rotate-y": `${orientation.rotateY}deg`,
    "--dice-final-rotate-z": `${orientation.rotateZ}deg`,
  } as CSSProperties;

  return (
    <span className={styles.dieScene} aria-hidden={false}>
      <motion.span
        key={animationKey ?? `settled:${value}`}
        role="img"
        aria-label={`${label}: ${value}`}
        className={styles.dieFlight}
        data-animating={
          shouldAnimate && !prefersReducedMotion ? "true" : "false"
        }
        data-die-flight="true"
        data-motion={prefersReducedMotion ? "reduced" : "full"}
        data-top-face={value}
        style={style}
        initial={
          shouldAnimate && !prefersReducedMotion
            ? {
                x: animation.x[0],
                y: animation.y[0],
                scale: animation.scale[0],
                opacity: animation.opacity[0],
              }
            : false
        }
        animate={{
          x: animation.x,
          y: animation.y,
          scale: animation.scale,
          opacity: animation.opacity,
        }}
        transition={{
          duration: animation.duration,
          times: animation.times,
          ease: [0.22, 0.78, 0.2, 1],
        }}
      >
        <span
          aria-hidden="true"
          className={styles.dieShadow}
          data-die-shadow="true"
        />
        <span
          aria-hidden="true"
          className={styles.dieMount}
          data-die-mount="true"
        >
          <motion.span
            className={styles.die}
            data-die-cube="true"
            initial={
              shouldAnimate && !prefersReducedMotion
                ? {
                    rotateX: animation.rotateX[0],
                    rotateY: animation.rotateY[0],
                    rotateZ: animation.rotateZ[0],
                  }
                : false
            }
            animate={{
              rotateX: animation.rotateX,
              rotateY: animation.rotateY,
              rotateZ: animation.rotateZ,
            }}
            transition={{
              duration: animation.duration,
              times: animation.times,
              ease: [0.22, 0.78, 0.2, 1],
            }}
          >
            {DICE_FACES.map((face) => (
              <span
                key={face.value}
                aria-hidden="true"
                className={`${styles.face} ${styles[face.position]} ${styles[`pips${face.value}`]}`}
                data-die-face="true"
                data-face-value={face.value}
              >
                {Array.from({ length: face.value }, (_, pipIndex) => (
                  <span key={pipIndex} className={styles.pip} />
                ))}
              </span>
            ))}
          </motion.span>
        </span>
      </motion.span>
    </span>
  );
}
