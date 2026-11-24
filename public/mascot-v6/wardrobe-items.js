import * as THREE from './vendor/build/three.module.min.js';

const cigarette = 'mouth_cigarette';
const dynamite = 'mouth_sparking_dynamite_stick';
const makeup = 'face_clown_makeup';
const beret = 'headwear_tanker_beret';
const slouch = 'headwear_australian_slouch_hat';
const cranium = 'headwear_open_cranium';
const fullFace = 'headwear_wwii_full_face_helmet';
const eyes = 'eyewear_protruding_eyes';
const eyepatch = 'eyewear_field_veteran_eyepatch';
const grin = 'mouth_diamond_grin';
const tags = 'helmet_trim_lucky_dog_tags';
const welding = 'headwear_flip_up_welding_mask';
const moustache = 'sergeant_majors_moustache';

const radians = Math.PI / 180;
const limit = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const xAxis = new THREE.Vector3(1, 0, 0);
const yAxis = new THREE.Vector3(0, 1, 0);

function smooth(t) {
  t = limit(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function unsetTransform(node) {
  node.position.set(0, 0, 0);
  node.quaternion.identity();
  node.scale.setScalar(1);
  return node;
}

function headMovement(head) {
  const previous = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();
  const velocity = new THREE.Vector3();
  let measured = false;
  return dt => {
    if (!measured || dt <= 0 || dt > .24) {
      measured = true;
      previous.copy(head.quaternion);
      return velocity.set(0, 0, 0);
    }
    rotation.copy(previous).invert().multiply(head.quaternion);
    previous.copy(head.quaternion);
    velocity.set(rotation.x, rotation.y, rotation.z);
    const length = velocity.length();
    if (length < 1e-10) return velocity.set(0, 0, 0);
    const sign = Math.sign(rotation.w || 1);
    return velocity.multiplyScalar(sign * 2 * Math.atan2(length, Math.abs(rotation.w)) / (length * dt));
  };
}

function spring(frequency, damping, bound) {
  let value = 0;
  let speed = 0;
  const decay = frequency * damping;
  const swing = frequency * Math.sqrt(1 - damping * damping);
  return (target, dt) => {
    const offset = value - target;
    const quadrature = (speed + decay * offset) / swing;
    const cos = Math.cos(swing * dt);
    const sin = Math.sin(swing * dt);
    const envelope = Math.exp(-decay * dt);
    const displacement = offset * cos + quadrature * sin;
    value = limit(target + envelope * displacement, -bound, bound);
    speed = envelope * (swing * (quadrature * cos - offset * sin) - decay * displacement);
    if (Math.abs(target - value) < .00005 && Math.abs(speed) < .0005) {
      value = target;
      speed = 0;
    }
    return value;
  };
}

function morphWeights(root, names) {
  const targets = [];
  root.traverse(node => {
    if (!node.morphTargetInfluences) return;
    const indices = names.map(name => node.morphTargetDictionary?.[name]);
    if (indices.every(index => index !== undefined)) targets.push({ node, indices });
  });
  if (!targets.length) throw new Error('The wearable is missing its motion controls.');
  return values => {
    for (const { node, indices } of targets) {
      indices.forEach((index, channel) => { node.morphTargetInfluences[index] = values[channel]; });
    }
  };
}

function updateSoftAccessory(runtime, root, isBrain) {
  const names = isBrain ? ['Brain_Sway_X', 'Brain_Sway_X_Neg', 'Brain_Sway_Y', 'Brain_Sway_Y_Neg']
    : ['Tip_X_Pos', 'Tip_X_Neg', 'Tip_Y_Pos', 'Tip_Y_Neg'];
  const weights = morphWeights(root, names);
  const velocity = headMovement(runtime.head);
  const lateral = isBrain ? spring(20, .76, .98) : spring(23, .69, .96);
  const vertical = isBrain ? spring(20, .76, .98) : spring(23, .69, .96);
  return (dt, _time, options) => {
    const { x: wx, y: wy, z: wz } = velocity(dt);
    const vx = isBrain ? wy * .25 - wz * .52 : .70 * wy + .16 * wz;
    const vy = isBrain ? wx * .52 - wy * .18 : -.70 * wx;
    const x = lateral(isBrain ? .94 * Math.tanh(-.83 * vx) : .88 * Math.tanh(-.54 * vx), dt);
    const y = vertical(isBrain ? .64 * Math.tanh(-.57 * vy) : .55 * Math.tanh(-1.10 * vy) + .11 * Math.tanh(-vx), dt);
    const max = isBrain ? .94 : .93;
    const multiplier = options?.reducedMotion ? 0 : max / Math.max(max, Math.hypot(x, y));
    weights([Math.max(0, x), Math.max(0, -x), Math.max(0, y), Math.max(0, -y)].map(w => w * multiplier));
  };
}

function updateDogTags(runtime, root, nodeNamed) {
  const velocity = headMovement(runtime.head);
  const orientation = new THREE.Quaternion();
  const restHead = runtime.restHead.clone().invert();
  const gravity = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YZX');
  const delta = new THREE.Quaternion();
  const pivots = [
    ['Lucky_Tags_Swivel', 2, .44, [3.4, 8, 10]],
    ['Lucky_Tag_BAD_Pivot', 3.1, .46, [1.7, 4, 3.8]],
    ['Lucky_Tag_MOTHER_FKR_Pivot', 2.4, .41, [2.2, 5.2, 4.8]],
  ].map(([name, rate, damping, maxAngles]) => {
    const node = nodeNamed(root, name);
    const axes = maxAngles.map(max => {
      const bound = max * radians;
      const step = spring(2 * Math.PI * rate, damping, bound);
      return (target, dt) => step(.88 * bound * Math.tanh(target / (.88 * bound)), dt);
    });
    return { node, rest: node.quaternion.clone(), axes };
  });
  return (dt, _time, options) => {
    const { x: pitch, y: yaw, z: roll } = velocity(dt).clampScalar(-9, 9);
    orientation.copy(restHead).multiply(runtime.head.quaternion).invert();
    gravity.set(0, -1, 0).applyQuaternion(orientation);
    const lean = Math.atan2(gravity.x, -gravity.y);
    const nod = Math.atan2(-gravity.z, -gravity.y);
    const requests = [
      [.40 * nod - .060 * pitch - .010 * yaw, -.091 * yaw, .74 * lean - .050 * roll - .064 * yaw],
      [-.028 * pitch - .009 * yaw, -.037 * yaw + .012 * roll, -.021 * roll - .027 * yaw],
      [-.032 * pitch - .013 * yaw, -.058 * yaw + .008 * roll, -.022 * roll - .042 * yaw],
    ];
    pivots.forEach(({ node, rest, axes }, i) => {
      const [x, y, z] = axes.map((step, axis) => step(options?.reducedMotion ? 0 : requests[i][axis], dt));
      node.quaternion.copy(rest);
      if (!options?.reducedMotion) node.quaternion.multiply(delta.setFromEuler(euler.set(x, y, z)));
    });
  };
}

function randomPause(isLowered, last) {
  const [min, max] = isLowered ? [3, 5.5] : [10, 25];
  if (last == null) return lerp(min, max, Math.random());
  const gap = Math.min(1.6, (max - min) * .34);
  const left = Math.max(0, last - gap - min);
  const right = Math.max(0, max - gap - last);
  const pick = Math.random() * (left + right);
  return pick < left ? min + pick : max - right + pick - left;
}

// Measurements from the approved fitting. The stock smoke may rise farther with the visor up.
const visorClearance = [
  [6, 0], [9, .12], [12, .18], [16, .21], [22, .29], [30, .40],
  [38, .53], [46, .63], [54, .73], [62, .87], [70, 1],
];

function smokeClearance(lift) {
  if (lift <= visorClearance[0][0]) return 0;
  const upper = visorClearance.findIndex(([angle]) => lift <= angle);
  if (upper < 0) return 1;
  const [a, close] = visorClearance[upper - 1];
  const [b, open] = visorClearance[upper];
  return lerp(close, open, (lift - a) / (b - a));
}

function visorController(runtime, scene, animations, nodeNamed) {
  const hinge = nodeNamed(scene, 'Welding_Visor_Hinge');
  const tracks = ['Raise Visor', 'Lower Visor'].map(name => {
    const clip = animations.find(candidate => candidate.name === name);
    if (clip?.tracks.length !== 1 || !clip.tracks[0].name.endsWith('.quaternion')) {
      throw new Error('The welding mask is missing its hinge animation.');
    }
    const curve = clip.tracks[0].createInterpolant();
    return { duration: clip.duration, at: phase => curve.evaluate(phase * clip.duration) };
  });
  const stops = tracks.map(track => new THREE.Quaternion().fromArray(track.at(1)));
  const lastPauses = [null, null];
  const pitch = new THREE.Quaternion();
  let target = 0;
  let due;
  let movement;
  let pendingTarget;
  let elapsed = 0;
  let clearance = 1;
  let blendPitch = 0;

  function schedule() {
    const seconds = randomPause(target === 1, lastPauses[target]);
    lastPauses[target] = seconds;
    due = elapsed + seconds;
  }

  function start(nextTarget, manual) {
    const from = hinge.quaternion.clone();
    const distance = from.angleTo(stops[nextTarget]);
    target = nextTarget;
    movement = null;
    if (distance < .001) {
      schedule();
      return;
    }
    movement = {
      from,
      clock: elapsed,
      completeSwing: from.angleTo(stops[1 - target]) < .001,
      duration: tracks[target].duration * limit(distance / (84 * radians), .32, 1),
      // A manual movement may interrupt ongoing speech, in which case the hinge moves by itself.
      nod: !manual || !(runtime.current?.talkWeight > .05),
      pitchFrom: blendPitch,
    };
  }

  return {
    command(action) {
      if (action === 'lower-visor') pendingTarget = 1;
      else if (action === 'raise-visor') pendingTarget = 0;
      else return false;
      return true;
    },
    smokeVisible: () => clearance > .001,
    smokeScale: () => clearance,
    update(dt, _time, options) {
      if (due == null) schedule();
      elapsed += dt;
      const quiet = !(runtime.current?.talkWeight > .05) && !runtime.pose.style &&
        !runtime.pose.reactions?.length && !options?.dragging;
      if (pendingTarget !== undefined) {
        start(pendingTarget, true);
        pendingTarget = undefined;
      } else if (!movement && quiet && !options?.reducedMotion && elapsed >= due) {
        start(1 - target, false);
      }
      if (movement) {
        const { from, clock, completeSwing, duration, nod, pitchFrom } = movement;
        const lead = nod ? .12 : 0;
        const phase = options?.reducedMotion ? 1 : limit((elapsed - clock - lead) / duration, 0, 1);
        if (completeSwing) hinge.quaternion.fromArray(tracks[target].at(phase));
        else hinge.quaternion.copy(from).slerp(stops[target], smooth(phase));
        if (nod && quiet && !options?.reducedMotion) {
          const peak = lead + duration * .46;
          const age = elapsed - clock;
          blendPitch = age < peak ? lerp(pitchFrom, target ? 5.4 : -3.7, smooth(age / peak))
            : lerp(target ? 5.4 : -3.7, target ? 1.2 : 0, smooth((age - peak) / (duration * .54)));
        }
        if (phase === 1) {
          movement = null;
          schedule();
        }
      }
      if (!quiet || options?.reducedMotion) blendPitch = 0;
      if (quiet && blendPitch) runtime.head.quaternion.multiply(pitch.setFromAxisAngle(xAxis, blendPitch * radians));
      // Clearance measured on the fitted visor, from the raised angle to the closed stop.
      const lift = hinge.quaternion.angleTo(stops[1]) / radians;
      clearance = smokeClearance(lift);
    },
  };
}

// The four approved English lines and their shared eye-before-head timing.
const gazeCues = [
  { start: .30, end: 1.68, text: 'Here we are.', aim: 0, eye: 0, yaw: 0, lead: 0, head: 0, style: 'Talk_Normal' },
  { start: 1.87, end: 3.55, text: 'Movement on the left.', aim: -24, eye: .145, yaw: -16, lead: .305, head: .66, style: 'Talk_Gentle' },
  { start: 3.72, end: 4.93, text: 'Now to the right.', aim: 11.5, eye: .12, yaw: 5.5, lead: .19, head: .69, style: 'Talk_Normal' },
  { start: 5.10, end: 6.86, text: 'Our turn.', aim: 0, eye: .145, yaw: 0, lead: .23, head: .53, style: 'Talk_Enthusiastic' },
];

function gazeController(runtime, scene, nodeNamed) {
  const pivots = ['CTRL_Sguardo_L', 'CTRL_Sguardo_R'].map(name => nodeNamed(scene, name));
  const rests = pivots.map(pivot => pivot.quaternion.clone());
  const rotation = new THREE.Quaternion();
  const headTurn = new THREE.Quaternion();
  let clock;
  let activeText = '';
  let ownedStyle;

  function stopTalk() {
    if (ownedStyle && runtime.pose.style === ownedStyle) runtime.pose.stopTalk();
    ownedStyle = undefined;
  }

  function aim(degrees) {
    rotation.setFromAxisAngle(yAxis, limit(degrees, -30, 30) * radians);
    pivots.forEach((pivot, i) => pivot.quaternion.copy(rests[i]).multiply(rotation));
  }

  return {
    command(action) {
      if (action !== 'play-gaze-cues') return false;
      stopTalk();
      aim(0);
      clock = 0;
      activeText = '';
      return true;
    },
    caption: () => activeText,
    dispose: stopTalk,
    update(dt, _time, options) {
      if (clock === undefined) return;
      clock += dt;
      const index = gazeCues.findLastIndex(cue => cue.start <= clock);
      const cue = gazeCues[index];
      if (!cue) {
        if (!options?.reducedMotion) runtime.head.quaternion.copy(runtime.restHead);
        return;
      }
      const previous = gazeCues[index - 1];
      const eyePhase = cue.eye ? limit((clock - cue.start) / cue.eye, 0, 1) : 1;
      const headPhase = cue.head ? limit((clock - cue.start - cue.lead) / cue.head, 0, 1) : 1;
      const gaze = lerp(previous?.aim ?? 0, cue.aim, eyePhase ** 2 * (6 - 8 * eyePhase + 3 * eyePhase ** 2));
      const turn = lerp(previous?.yaw ?? 0, cue.yaw, headPhase ** 3 * (10 - 15 * headPhase + 6 * headPhase ** 2));
      if (!options?.reducedMotion) {
        runtime.head.quaternion.copy(runtime.restHead).multiply(headTurn.setFromAxisAngle(yAxis, turn * radians));
        aim(gaze - turn);
      } else aim(0);
      const speaking = clock < cue.end;
      activeText = speaking ? cue.text : '';
      if (speaking && !options?.reducedMotion && ownedStyle !== cue.style) {
        ownedStyle = cue.style;
        runtime.pose.playTalk(ownedStyle);
      } else if (!speaking || options?.reducedMotion) stopTalk();
      if (clock > gazeCues.at(-1).end + .35) {
        clock = undefined;
        aim(0);
      }
    },
  };
}

export function createItemAdapter(runtime, nodeNamed) {
  const { nodes } = runtime.config;
  const skull = nodeNamed(runtime.model, nodes.headMesh);
  const lids = Object.keys(nodes.lids).map(name => nodeNamed(runtime.model, name));
  const savedHeadFitting = new Set([beret, slouch]);

  function replacementGeometry(scene) {
    const replacement = nodeNamed(scene, nodes.headMesh);
    if (!replacement.geometry || !replacement.position.equals(skull.position) ||
      JSON.stringify(replacement.morphTargetDictionary) !== JSON.stringify(skull.morphTargetDictionary)) {
      throw new Error('The head replacement does not match this Ready rig.');
    }
    return replacement.geometry;
  }

  return {
    resources(id) {
      if (id === makeup) return [[makeup, 'upper-basecolor.png', 'upperPaint'], [makeup, 'lower-basecolor.png', 'lowerPaint']];
      const wearable = [id, 'wearable.glb'];
      if (id === cigarette || id === dynamite) return [wearable, [cigarette, 'repaired-bite.glb']];
      if (savedHeadFitting.has(id)) return [wearable, [beret, 'helmet-free-r5.glb']];
      if (id === cranium) return [wearable, [cranium, 'cranium-r2-fitting.glb']];
      return [wearable];
    },
    create(id, get) {
      if (id === makeup) return {
        skullMaterial: get(makeup, 'upper-basecolor.png'),
        jawMaterial: get(makeup, 'lower-basecolor.png'),
      };
      const { scene: cached, animations } = get(id, 'wearable.glb');
      // These wearable hierarchies have no skins. Geometry and textures stay shared with the session cache.
      const scene = cached.clone(true);
      const mount = object => ({ parent: runtime.head, object });
      const result = { mounts: [mount(scene)] };

      if (id === cigarette || id === dynamite) {
        const { scene: bite } = get(cigarette, 'repaired-bite.glb');
        const palate = nodeNamed(bite, 'Preview bite repair | inset palatal lining').clone();
        const shelf = nodeNamed(bite, 'Preview bite repair | mirrored lower tooth shelf').clone();
        result.skullGeometry = replacementGeometry(bite);
        result.mounts.push(mount(palate), { parent: runtime.jaw, object: shelf });
        result.auxiliaryMaterials = [{ object: palate, slot: 'skull' }, { object: shelf, slot: 'jaw' }];
        if (id === cigarette) {
          scene.position.set(-.168, -.277, .526);
          nodeNamed(scene, 'PORTABLE_SMOKE').visible = false;
          result.smokeTip = nodeNamed(scene, 'SmokeTip');
        } else {
          // The loop supplies the approved irregular spark bursts. Smoke is emitted only by the live viewer.
          nodeNamed(scene, 'DYNAMITE_PORTABLE_SMOKE').visible = false;
          result.smokeTip = nodeNamed(scene, 'SparkTip');
          const clip = animations.find(candidate => candidate.name === 'Dynamite - Sparks and Smoke');
          if (!clip) throw new Error('The dynamite stick is missing its spark animation.');
          const mixer = new THREE.AnimationMixer(scene);
          mixer.clipAction(clip).play();
          result.update = (dt, _time, options) => { if (!options?.reducedMotion) mixer.update(dt); };
          result.dispose = () => { mixer.stopAllAction(); mixer.uncacheRoot(scene); };
        }
      } else if (savedHeadFitting.has(id)) {
        const { scene: fitting } = get(beret, 'helmet-free-r5.glb');
        result.skullGeometry = replacementGeometry(fitting);
        result.mounts.push(mount(nodeNamed(fitting, 'Fitting repair | under-beret crown').clone()));
      } else if (id === cranium) {
        const { scene: fitting } = get(cranium, 'cranium-r2-fitting.glb');
        result.skullGeometry = replacementGeometry(fitting);
        result.update = updateSoftAccessory(runtime, scene, true);
      } else if (id === fullFace) {
        result.hide = [skull, nodeNamed(runtime.model, nodes.jawMesh), ...lids];
        result.tearMask = 'all';
        result.smokeTip = null;
      } else if (id === eyepatch) {
        result.tearMask = 'L';
      } else if (id === eyes) {
        Object.assign(result, gazeController(runtime, scene, nodeNamed));
        result.hide = lids;
      } else if (id === grin) {
        result.mounts = [
          mount(unsetTransform(nodeNamed(scene, 'Diamond_Grin_Upper'))),
          { parent: runtime.jaw, object: unsetTransform(nodeNamed(scene, 'Diamond_Grin_Lower')) },
        ];
      } else if (id === tags) {
        result.update = updateDogTags(runtime, scene, nodeNamed);
      } else if (id === welding) {
        Object.assign(result, visorController(runtime, scene, animations, nodeNamed));
      } else if (id === moustache) {
        result.update = updateSoftAccessory(runtime, scene, false);
      }

      return result;
    },
  };
}
