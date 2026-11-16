import { Euler, Quaternion } from './vendor/build/three.module.min.js';

const radians = Math.PI / 180;
const origin = [0, 0, 0];
const profiles = {
  dock: { yaw: 22, up: 13, down: 15, tilt: 2.4, turnBase: .78, turnPerDegree: .029, maxTurn: 1.65,
    initial: [2.2, 4.2], quiet: [3.8, 7.1], hold: [.43, 1.05], pageChance: .88, detailChance: .21 },
  floating: { yaw: 44, up: 19, down: 29, tilt: 5, turnBase: .59, turnPerDegree: .023, maxTurn: 1.57,
    initial: [2, 3.8], quiet: [3.1, 6], hold: [.35, 1.07], pageChance: .77, detailChance: .36 },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Interpolate in the neutral quaternion's tangent space. Quintic segments match orientation,
// velocity and acceleration at the retarget point, then settle with no remaining motion.
class Trajectory {
  constructor(value) {
    this.reset(value);
  }

  reset(value) {
    this.goal = value;
    this.curve = null;
  }

  sample(now) {
    const curve = this.curve;
    if (!curve || now >= curve.ends) return this.goal.map(value => ({ value, velocity: 0, acceleration: 0 }));
    const t = Math.max(0, (now - curve.start) / curve.duration);
    return curve.coefficients.map(([a, b, c, d, e, f]) => ({
      value: a + t * (b + t * (c + t * (d + t * (e + t * f)))),
      velocity: (b + t * (2 * c + t * (3 * d + t * (4 * e + 5 * t * f)))) / curve.duration,
      acceleration: (2 * c + t * (6 * d + t * (12 * e + 20 * t * f))) / curve.duration ** 2,
    }));
  }

  retarget(now, goal, duration) {
    const coefficients = this.sample(now).map(({ value, velocity, acceleration }, index) => {
      const difference = goal[index] - value;
      const b = velocity * duration;
      const c = acceleration * duration ** 2 / 2;
      return [value, b, c, 10 * difference - 6 * b - 3 * c, -15 * difference + 8 * b + 3 * c, 6 * difference - 3 * b - c];
    });
    this.goal = goal;
    this.curve = { start: now, ends: now + duration, duration, coefficients };
    return this.curve.ends;
  }
}

function rotationVector(quaternion) {
  const sine = Math.hypot(quaternion.x, quaternion.y, quaternion.z);
  const factor = sine > .000001 ? 2 * Math.atan2(sine, quaternion.w) / sine : 2;
  return [quaternion.x * factor, quaternion.y * factor, quaternion.z * factor];
}

function directionOf(pitch, yaw) {
  if (Math.abs(pitch) > Math.abs(yaw)) return pitch > 0 ? 'down' : 'up';
  return yaw > 0 ? 'right' : 'left';
}

export class IdleGlance {
  constructor(random = Math.random) {
    this.random = random;
    this.turn = new Trajectory(origin);
    this.blend = new Trajectory([0]);
    this.euler = new Euler(0, 0, 0, 'YZX');
    this.quaternion = new Quaternion();
    this.mode = null;
    this.attentive = null;
    this.gesture = null;
    this.phase = 'waiting';
    this.nextAt = 0;
    this.sequence = 0;
  }

  range(a, b) {
    return a + (b - a) * this.random();
  }

  anglesToVector({ pitch, yaw, roll }, profile) {
    this.euler.set(clamp(pitch, -profile.up * radians, profile.down * radians),
      clamp(yaw, -profile.yaw * radians, profile.yaw * radians),
      -clamp(roll, -profile.tilt * radians, profile.tilt * radians));
    return rotationVector(this.quaternion.setFromEuler(this.euler));
  }

  freeLook(profile) {
    // Mostly short surveys, with rarer wide turns in the floating mode.
    const kinds = ['side', 'side', 'down', 'up'];
    const kind = kinds[Math.floor(this.random() * kinds.length)];
    const side = this.previousDirection === 'left' ? 1 : this.previousDirection === 'right' ? -1 : this.random() < .5 ? -1 : 1;
    const broad = this.mode === 'floating' && this.random() < .18;
    const yaw = kind === 'side' ? side * this.range(broad ? profile.yaw * .82 : profile.yaw * .40,
      broad ? profile.yaw : profile.yaw * .76) : this.range(-5, 5);
    const pitch = kind === 'side' ? this.range(-3.8, 4.6) : kind === 'down'
      ? this.range(profile.down * .37, profile.down * (broad ? 1 : .65))
      : -this.range(profile.up * .35, profile.up * (broad ? 1 : .71));
    const roll = kind === 'side' ? -side * this.range(.6, profile.tilt * .80) : this.range(-1, 1);
    return { pitch: pitch * radians, yaw: yaw * radians, roll: roll * radians };
  }

  duration(now, goal, profile, factor = 1) {
    const start = this.turn.sample(now);
    const distance = Math.hypot(...goal.map((value, index) => value - start[index].value)) / radians;
    return clamp((profile.turnBase + distance * profile.turnPerDegree) * this.range(.91, 1.12) * factor,
      .48, profile.maxTurn * factor);
  }

  begin(now, profile, getAttentionTarget) {
    const tryPage = Boolean(getAttentionTarget) && this.random() < profile.pageChance;
    const page = tryPage ? getAttentionTarget() : null;
    const usable = page && Number.isFinite(page.pitch) && Number.isFinite(page.yaw) && Math.hypot(page.pitch, page.yaw) >= .06;
    if (tryPage && !usable && this.random() < .45) {
      // Scrolling, resizing, and narrow pages may leave nothing worth looking at.
      this.nextAt = now + this.range(...profile.quiet);
      return;
    }
    const angles = usable ? { pitch: page.pitch, yaw: page.yaw, roll: Number.isFinite(page.roll) ? page.roll : 0 } : this.freeLook(profile);
    const direction = directionOf(angles.pitch, angles.yaw);
    const goal = this.anglesToVector(angles, profile);
    const length = this.duration(now, goal, profile);
    this.previousDirection = direction;
    this.sequence++;
    this.gesture = {
      target: usable ? { id: page.id, label: page.label, screenPoint: page.screenPoint } : null,
      direction,
      angles,
      detail: this.random() < profile.detailChance,
      hold: this.range(...profile.hold),
    };
    this.phase = 'entering';
    const ends = this.turn.retarget(now, goal, length);
    this.nextAt = this.gesture.detail ? now + length * this.range(.73, .86) : ends;
  }

  advanceSchedule(now, profile, getAttentionTarget) {
    // Use the scheduled breakpoint when advancing a segment, rather than the first frame after it.
    // DOM target selection itself observes the current displayed layout only once per episode.
    while (now >= this.nextAt) {
      const at = this.nextAt;
      if (this.phase === 'waiting') {
        this.begin(now, profile, getAttentionTarget);
        return;
      }
      if (this.phase === 'entering') {
        if (this.gesture.detail) {
          this.gesture.detail = false;
          const { pitch, yaw, roll } = this.gesture.angles;
          const detail = this.gesture.target ? (this.mode === 'dock' ? 1.15 : 2.25) : (this.mode === 'dock' ? 2.7 : 5.4);
          const goal = this.anglesToVector({ pitch: pitch + this.range(-detail, detail) * radians,
            yaw: yaw + this.range(-detail, detail) * radians, roll }, profile);
          this.nextAt = this.turn.retarget(at, goal, this.duration(at, goal, profile, .75));
        } else {
          this.phase = 'holding';
          this.nextAt = at + this.gesture.hold;
        }
      } else if (this.phase === 'holding') {
        const { pitch, yaw } = this.gesture.angles;
        const goal = this.anglesToVector({ pitch: pitch * this.range(.035, .12), yaw: yaw * this.range(.045, .15), roll: 0 }, profile);
        this.phase = 'returning';
        this.gesture.target = null;
        this.nextAt = this.turn.retarget(at, goal, this.duration(at, goal, profile, 1.13));
      } else {
        this.phase = 'waiting';
        this.gesture = null;
        this.nextAt = at + this.range(...profile.quiet);
      }
    }
  }

  step(now, eligible, reducedMotion, { mode = 'floating', getAttentionTarget } = {}) {
    const profile = profiles[mode] ?? profiles.floating;
    const changedMode = this.mode !== null && this.mode !== mode;
    this.mode = mode;
    if (reducedMotion) {
      this.turn.reset(origin);
      this.blend.reset([1]);
      this.gesture = null;
      this.attentive = false;
      this.phase = 'waiting';
      return this.read(now);
    }

    const attentive = eligible && !changedMode;
    if (attentive !== this.attentive) {
      const firstStart = this.attentive === null;
      const glancing = this.phase !== 'waiting';
      this.attentive = attentive;
      this.gesture = null;
      if (attentive) {
        const settled = firstStart ? now : this.blend.retarget(now, [0], .87);
        const home = firstStart ? now : this.turn.retarget(now, origin, .90);
        this.phase = 'waiting';
        this.nextAt = Math.max(settled, home) + this.range(...profile.initial);
      } else {
        // Brake in the current direction without extending the abandoned look. One quaternion
        // crossfade hands the head over to the authored action while the brake settles.
        const brakingTime = .25;
        const before = this.turn.sample(now);
        const away = Math.hypot(...before.map(sample => sample.value)) > .09;
        const brake = before.map(({ value, velocity, acceleration }) =>
          clamp(value + velocity * brakingTime * .42 + acceleration * brakingTime ** 2 * .055,
            value - .052, value + .052));
        const ends = this.turn.retarget(now, brake, brakingTime);
        this.phase = 'interrupting';
        if (firstStart) this.blend.reset([1]);
        this.nextAt = firstStart ? now : this.blend.retarget(now, [1], glancing || away
          ? profile === profiles.dock ? .83 : .73
          : .42);
        // The neutral tangent is ready for the next idle when the authored pose owns the head.
        this.resetAt = Math.max(ends, this.nextAt);
      }
    }

    if (!this.attentive && this.phase === 'interrupting' && now >= this.resetAt) {
      this.nextAt = this.turn.retarget(now, origin, .70);
      this.phase = 'waiting';
    }
    if (this.attentive) this.advanceSchedule(now, profile, getAttentionTarget);
    return this.read(now);
  }

  read(now) {
    const [x, y, z] = this.turn.sample(now).map(({ value }) => value);
    const angle = Math.hypot(x, y, z);
    const factor = angle > .000001 ? Math.sin(angle / 2) / angle : .5;
    this.quaternion.set(x * factor, y * factor, z * factor, Math.cos(angle / 2));
    this.euler.setFromQuaternion(this.quaternion);
    const interactionWeight = clamp(this.blend.sample(now)[0].value, 0, 1);
    const idleVisibility = 1 - interactionWeight;
    return { direction: this.gesture?.direction ?? null, target: this.gesture?.target ?? null,
      phase: this.phase, sequence: this.sequence, pitch: this.euler.x * idleVisibility, yaw: this.euler.y * idleVisibility,
      roll: -this.euler.z * idleVisibility, quaternion: this.quaternion, interactionWeight };
  }
}
