import { IdleGlance } from './idle-glance.js';
import { Euler, Quaternion } from './vendor/build/three.module.min.js';

export const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(value, high));

const radians = Math.PI / 180;
const talkIn = 0.19;
const talkOut = 0.29;
const reactionOut = 0.38;
const defaultReaction = { enter: .52, hold: 1.85, return: 1.25 };
const reactionTimings = {
  Ghigno: { enter: .55, hold: 1.8, return: 1.24 },
  Sad: { enter: .62, hold: 2.15, return: 1.42 },
};

export function sample(keys, time) {
  if (!keys?.length) return 0;
  if (time <= keys[0][0]) return keys[0][1];
  let low = 0;
  let high = keys.length - 1;
  if (time >= keys[high][0]) return keys[high][1];
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (keys[mid][0] <= time) low = mid;
    else high = mid;
  }
  const [t0, v0] = keys[low];
  const [t1, v1] = keys[high];
  return v0 + (v1 - v0) * (time - t0) / (t1 - t0);
}

function ease(time) {
  const fraction = clamp(time);
  return fraction * fraction * (3 - 2 * fraction);
}

function weightAt(layer, now) {
  if (layer.end === undefined) return ease((now - layer.start) / layer.fadeIn);
  return layer.releaseWeight * (1 - ease((now - layer.end) / layer.fadeOut));
}

function release(layer, now) {
  if (layer.end !== undefined) return;
  layer.releaseWeight = weightAt(layer, now);
  layer.end = now;
}

function mixWeights(from, to, fraction) {
  const weights = {};
  for (const [name, value] of Object.entries(from)) {
    const weight = value * (1 - fraction);
    if (weight > 0.00005) weights[name] = weight;
  }
  for (const [name, value] of Object.entries(to)) {
    const weight = value * fraction;
    if (weight > 0.00005) weights[name] = (weights[name] ?? 0) + weight;
  }
  return weights;
}

function accumulate(clip, at, weight, motion, layer) {
  const time = clip.loop ? at % clip.duration : Math.min(at, clip.duration);
  for (const [name, keys] of Object.entries(clip.channels)) {
    const value = sample(keys, time) * weight;
    if (name === 'jaw') {
      motion.jawOpen += Math.max(0, value);
      motion.jawClose += Math.min(0, value);
    } else if (name === 'left' || name === 'right') {
      if (layer.side === 'both' || layer.side === name) motion[name] = Math.max(motion[name], value);
    } else {
      motion[name] = (motion[name] ?? 0) + value;
    }
  }
}

export class PoseController {
  constructor(config, random = Math.random) {
    this.config = config;
    this.neutral = Object.hasOwn(config.expressions, 'Neutral') ? 'Neutral' : Object.keys(config.expressions)[0];
    this.expression = this.neutral;
    this.intensity = 1;
    this.expressionPhase = 'idle';
    this.expressionWeights = {};
    this.expressionTransition = null;
    this.now = 0;
    this.style = null;
    this.fields = { ...config.expressions[this.neutral] };
    this.fieldKeys = [...new Set(Object.values(config.expressions).flatMap(Object.keys))];
    this.talking = [];
    this.reactions = [];
    this.blinks = [];
    this.idle = new IdleGlance(random);
    this.headEuler = new Euler(0, 0, 0, 'YZX');
    this.activityRotation = new Quaternion();
    this.headRotation = new Quaternion();
  }

  setExpression(name, intensity = 1, immediate = false) {
    if (!Object.hasOwn(this.config.expressions, name)) throw Error(`Unknown expression: ${name}`);
    this.intensity = clamp(intensity);
    for (const layer of this.reactions) release(layer, this.now);
    const target = name === this.neutral || !this.intensity ? {} : { [name]: this.intensity };
    if (name === this.neutral && !Object.keys(this.expressionWeights).length) {
      this.expression = name;
      this.expressionPhase = 'idle';
      this.expressionTransition = null;
      return;
    }
    const timing = reactionTimings[name] ?? defaultReaction;
    this.expression = name;
    this.expressionTransition = {
      start: immediate ? this.now - timing.enter : this.now,
      from: this.expressionWeights,
      target,
      timing,
    };
    this.stepExpression(immediate);
  }

  stepExpression(immediate = false) {
    const transition = this.expressionTransition;
    if (!transition) return;
    const { start, timing, from, target } = transition;
    const age = this.now - start;
    if (immediate) {
      this.expressionWeights = target;
      this.expressionPhase = this.expression === this.neutral ? 'idle' : 'holding';
    } else if (age < timing.enter) {
      this.expressionWeights = mixWeights(from, target, ease(age / timing.enter));
      this.expressionPhase = this.expression === this.neutral ? 'returning' : 'entering';
    } else if (this.expression === this.neutral) {
      this.expressionWeights = {};
      this.expressionPhase = 'idle';
      this.expressionTransition = null;
    } else if (age < timing.enter + timing.hold) {
      this.expressionWeights = target;
      this.expressionPhase = 'holding';
    } else if (age < timing.enter + timing.hold + timing.return) {
      this.expressionWeights = mixWeights(target, {}, ease((age - timing.enter - timing.hold) / timing.return));
      this.expressionPhase = 'returning';
    } else {
      this.expression = this.neutral;
      this.expressionWeights = {};
      this.expressionPhase = 'idle';
      this.expressionTransition = null;
    }

    const neutral = this.config.expressions[this.neutral];
    const weights = Object.entries(this.expressionWeights);
    for (const key of this.fieldKeys) {
      const resting = neutral[key] ?? 0;
      let value = resting;
      for (const [name, weight] of weights) value += weight * ((this.config.expressions[name][key] ?? 0) - resting);
      this.fields[key] = value;
    }
  }

  playTalk(style, gain = 1) {
    const clip = this.config.clips[style];
    if (!clip) throw Error(`Unknown talking style: ${style}`);
    if (this.style === style) {
      this.setTalkGain(gain);
      return;
    }
    this.stopTalk();
    this.style = style;
    this.talking.push({ start: this.now, fadeIn: talkIn, fadeOut: talkOut, clip, time: 0, gain: clamp(gain), targetGain: clamp(gain) });
  }

  setTalkGain(gain) {
    if (!this.style) return;
    this.talking.at(-1).targetGain = clamp(gain);
  }

  stopTalk() {
    this.style = null;
    for (const layer of this.talking) release(layer, this.now);
  }

  playReaction(name) {
    const clip = this.config.clips[name];
    if (!clip) throw Error(`Unknown reaction: ${name}`);
    for (const layer of this.reactions) release(layer, this.now);
    this.reactions.push({ start: this.now, fadeIn: 0.07, fadeOut: reactionOut, clip });
  }

  blink(side = 'both') {
    this.blinks.push({ start: this.now, fadeIn: 0.03, fadeOut: 0.13, clip: this.config.clips.Blink, side });
  }

  reset() {
    this.stopTalk();
    this.setExpression(this.neutral, 1);
    for (const layer of this.reactions) release(layer, this.now);
    for (const layer of this.blinks) release(layer, this.now);
  }

  step(delta, waitingWeight = 1, { dragging = false, changingMode = false, reducedMotion = false,
    mode = 'floating', getAttentionTarget } = {}) {
    this.now += delta;
    this.stepExpression();

    const motion = { jawOpen: 0, jawClose: 0, left: 0, right: 0, pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 };
    let talkWeight = 0;
    let talkGain = 0;
    const collect = layers => layers.filter(layer => {
      const age = this.now - layer.start;
      if ((layer.end !== undefined && this.now - layer.end >= layer.fadeOut) || (!layer.clip.loop && age >= layer.clip.duration)) return false;
      let weight = weightAt(layer, this.now);
      let time = age;
      if (layers === this.talking) {
        if (layer.end === undefined) {
          const response = layer.targetGain > layer.gain ? .046 : .065;
          layer.gain += (layer.targetGain - layer.gain) * (1 - Math.exp(-delta / response));
          talkGain = layer.gain;
        }
        // A gentle cadence change avoids repeating an identical loop on long messages.
        layer.time += delta * (1 + .14 * Math.sin(age * 1.65) + .05 * Math.sin(age * 3.8));
        weight *= layer.gain;
        talkWeight += weight;
        time = layer.time;
      }
      accumulate(layer.clip, time, weight, motion, layer);
      return true;
    });
    this.talking = collect(this.talking);
    this.reactions = collect(this.reactions);
    this.blinks = collect(this.blinks);
    // A punctuation pause still belongs to a speaking clip, including its release tail.
    const acting = this.talking.length || this.reactions.length ||
      this.expression !== this.neutral || this.expressionPhase !== 'idle';
    const eligible = !dragging && !changingMode && !acting;
    const { interactionWeight, quaternion, ...idleGlance } = this.idle.step(this.now, eligible, reducedMotion, { mode, getAttentionTarget });
    motion.pitch += (this.fields.Pitch_Espressivo ?? 0) * radians;
    motion.yaw += (this.fields.Yaw_Espressivo ?? 0) * radians;
    motion.roll += (this.fields.Roll_Espressivo ?? 0) * radians;
    const waiting = this.config.clips.Waiting;
    if (waiting && acting && waitingWeight > 0 && interactionWeight > 0) {
      const { x, y, z } = motion;
      accumulate(waiting, this.now, waitingWeight * (1 - 0.72 * clamp(talkWeight)), motion, {});
      motion.x = x + (motion.x - x) * interactionWeight;
      motion.y = y + (motion.y - y) * interactionWeight;
      motion.z = z + (motion.z - z) * interactionWeight;
    }
    // The head gets one composed local quaternion. Jaw, blinks and expressions keep their own timing.
    this.activityRotation.setFromEuler(this.headEuler.set(motion.pitch, motion.yaw, -motion.roll));
    this.headRotation.copy(quaternion).slerp(this.activityRotation, interactionWeight);
    this.headEuler.setFromQuaternion(this.headRotation);
    motion.pitch = this.headEuler.x || 0;
    motion.yaw = this.headEuler.y || 0;
    motion.roll = -this.headEuler.z || 0;
    const restingJaw = clamp(this.fields.Apertura_Espressiva ?? 0);
    const jaw = clamp(restingJaw + motion.jawOpen * (1 - restingJaw) + motion.jawClose * restingJaw);
    return { fields: this.fields, motion, headRotation: this.headRotation.toArray(), idleGlance, restingJaw, jaw,
      talkWeight: clamp(talkWeight), talkGain };
  }
}

export function morphBinding(role, name, value) {
  const lid = /^Palpebra_(Alta|Bassa)[._]([LR])$/.exec(role);
  if (!lid) return name.startsWith('V5_') ? clamp(value.fields[name] ?? 0, -1, 1) : 0;

  const [, region, side] = lid;
  const { fields, motion } = value;
  const orbita = clamp(fields[`Orbita_${side}_${region}`] ?? 0);
  const rest = region === 'Alta' ? orbita : Math.max(0, (orbita - 0.14) / 0.86);
  const blink = clamp(motion[side === 'L' ? 'left' : 'right']);
  const amount = blink + (1 - blink) * rest;
  const phase = {
    Aperta: Math.max(0, 1 - 2 * amount),
    Semichiusa: 1 - Math.abs(2 * amount - 1),
    Chiusa: Math.max(0, 2 * amount - 1),
  };

  if (name === 'V4 - Inclinazione palpebra') {
    return clamp(fields[`Inclinazione_Orbita_${side}`] ?? 0, -1, 1) * Math.min(1, 3 * amount) * (1 - amount);
  }
  if (Object.hasOwn(phase, name)) return phase[name];
  const [field, state] = name.split(' / ');
  return clamp(fields[field] ?? 0, -1, 1) * (phase[state] ?? 0);
}
