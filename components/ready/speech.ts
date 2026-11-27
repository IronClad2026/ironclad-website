type SpeechBeat = {
  visibleCount: number;
  timeMs: number;
  strength: number;
  pauseMs: number;
};

export type SpeechPlan = {
  durationMs: number;
  beats: readonly SpeechBeat[];
};

export type SpeechSample = { visibleCount: number; gain: number; done: boolean };

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const words = new Intl.Segmenter("en", { granularity: "word" });
const punctuation = /^[,;:.!?…–—]+$/u;
const closingMarks = /^[’”"')\]}]+$/u;
const digit = /^\p{Nd}$/u;

function accent(word: string, index: number) {
  const onset = word.codePointAt(0) ?? 0;
  const stress = Math.min(word.length, 13) * 0.012;
  return 0.66 + stress + ((onset + index * 29) % 11) * 0.015;
}

function pauseFor(mark: string) {
  if (/[.!?…]/u.test(mark)) return 250;
  if (/[;:–—]/u.test(mark)) return 175;
  return 115;
}

function smooth(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/** Compile one clock for the visible characters and the jaw's speech envelope. */
export function compileSpeech(text: string): SpeechPlan {
  const parts = [...graphemes.segment(text)];
  const lexical = [...words.segment(text)].filter((part) => part.isWordLike);
  const beats: SpeechBeat[] = [];
  let timeMs = 0;
  let wordIndex = 0;
  let strength = 0.76;

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    let visibleCount = part.index + part.segment.length;
    let pauseMs = 0;

    if (lexical[wordIndex]?.index === part.index) {
      strength = accent(lexical[wordIndex].segment, wordIndex);
      wordIndex++;
    }

    const decimalPoint = part.segment === "." &&
      digit.test(parts[index - 1]?.segment ?? "") && digit.test(parts[index + 1]?.segment ?? "");
    if (!decimalPoint && punctuation.test(part.segment)) {
      let mark = part.segment;
      while (punctuation.test(parts[index + 1]?.segment ?? "")) {
        mark += parts[++index].segment;
      }
      while (closingMarks.test(parts[index + 1]?.segment ?? "")) index++;
      visibleCount = parts[index].index + parts[index].segment.length;
      if (index < parts.length - 1) pauseMs = pauseFor(mark);
    }

    beats.push({ visibleCount, timeMs, strength, pauseMs });
    const whitespace = /^\s+$/u.test(part.segment);
    timeMs += (whitespace ? 22 : 29 + ((part.index * 7) % 9)) + pauseMs;
  }

  const durationMs = beats.length === 1 ? 100 : beats.at(-1)?.timeMs ?? 0;
  return { durationMs, beats };
}

export function sampleSpeech(plan: SpeechPlan, elapsedMs: number): SpeechSample {
  const last = plan.beats.at(-1);
  if (!last || elapsedMs >= plan.durationMs) return { visibleCount: last?.visibleCount ?? 0, gain: 0, done: true };

  const time = Math.max(0, elapsedMs);
  let low = 0;
  let high = plan.beats.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (plan.beats[middle].timeMs <= time) low = middle;
    else high = middle - 1;
  }

  const beat = plan.beats[low];
  const next = plan.beats[low + 1];
  const fraction = (time - beat.timeMs) / ((next?.timeMs ?? plan.durationMs) - beat.timeMs);
  const accentGain = beat.strength + ((next?.strength ?? beat.strength) - beat.strength) * smooth(fraction);
  const pauseGain = beat.pauseMs ? 1 - smooth(fraction / 0.30) + smooth((fraction - 0.79) / 0.21) : 1;
  return { visibleCount: beat.visibleCount, gain: accentGain * pauseGain, done: false };
}
