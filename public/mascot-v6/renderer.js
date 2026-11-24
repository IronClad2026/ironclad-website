import * as THREE from './vendor/build/three.module.min.js';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';
import { createAttentionTargetPicker } from './attention-targets.js';
import { clamp, morphBinding, PoseController } from './pose.js';
import { Smoke, Tears } from './effects.js';
import { VisibleFrameMetrics } from './metrics.js';

const assetPath = new URL('./assets/', import.meta.url);
const views = { front: 0, 'three-quarter': THREE.MathUtils.degToRad(36) };
const blinkIntervals = [4.2, 6.6, 5.1, 7.4];

function illuminate(scene) {
  scene.add(new THREE.HemisphereLight('#f2f4ff', '#b5a396', 1.70));
  const lights = [
    ['#fff0df', 2.38, [-3, 5, 6]],
    ['#dce9ff', 1.20, [4, 1, 3]],
    ['#bdcee3', 1.65, [1, 3, -5]],
  ];
  for (const [color, intensity, position] of lights) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...position);
    scene.add(light);
  }
}

function nodeNamed(root, name) {
  let found;
  root.traverse(node => {
    if (!found && [node.name, node.userData.name, node.userData.ironcladRole].includes(name)) found = node;
  });
  found ??= root.getObjectByName(name.replaceAll('.', ''));
  if (!found) throw new Error('IronClad glTF is missing ' + name);
  return found;
}

function disposeAsset(model) {
  if (!model) return;
  const geometry = new Set();
  const materials = new Set();
  const textures = new Set();
  model.traverse(node => {
    if (node.geometry) geometry.add(node.geometry);
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const object of geometry) object.dispose();
  for (const object of materials) object.dispose();
  const decoded = new Set();
  for (const texture of textures) {
    texture.dispose();
    if (texture.source?.data?.close) decoded.add(texture.source.data);
  }
  for (const image of decoded) image.close();
  model.removeFromParent();
}

async function fetchAsset(name, signal) {
  const response = await fetch(new URL(name, assetPath), { signal });
  if (!response.ok) throw new Error(name + ' returned HTTP ' + response.status);
  return response;
}

export function idleFramingPadding({ pitch, yaw }) {
  const { radToDeg, smootherstep } = THREE.MathUtils;
  const tilt = radToDeg(pitch);
  const turn = radToDeg(yaw);
  // A downward look lowers the cigar toward the edge. Its own side also needs extra lateral room.
  return Math.hypot(
    .43 * smootherstep(tilt, 5, 26),
    .22 * smootherstep(-tilt, 5, 17),
    .25 * smootherstep(-turn, 11, 35),
    .14 * smootherstep(turn, 14, 37)
  );
}

function projectPoint(point, camera) {
  point.project(camera);
  return { x: point.x * .5 + .5, y: -.5 * point.y + .5 };
}

class MascotScene {
  constructor(canvas, afterAnchor, getMode) {
    this.afterAnchor = afterAnchor;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.17;
    this.renderer.setClearColor(0x000000, 0);
    this.metrics = new VisibleFrameMetrics(this.renderer, getMode);
    this.attention = createAttentionTargetPicker(canvas);
    this.scene = new THREE.Scene();
    illuminate(this.scene);
    this.camera = new THREE.PerspectiveCamera(35, 1, .02, 100);
    this.angle = 0;
    this.framing = 0;
    this.width = 1;
    this.height = 1;
    this.ratio = 1;
    this.jawDelta = new THREE.Quaternion();
    this.axisX = new THREE.Vector3(1, 0, 0);
    this.point = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.availableMorphs = [];
    this.lastAnchor = null;
  }

  setup(config, asset) {
    this.config = config;
    this.model = asset.scene;
    this.scene.add(this.model);
    const { nodes } = config;
    this.head = nodeNamed(this.model, nodes.head);
    this.jaw = nodeNamed(this.model, nodes.jaw);
    this.mouth = nodeNamed(this.model, nodes.text);
    this.cigar = nodeNamed(this.model, nodes.cigar);
    this.restPosition = this.head.position.clone();
    this.restHead = this.head.quaternion.clone();
    this.restJaw = this.jaw.quaternion.clone();
    const extent = new THREE.Box3().setFromObject(this.model);
    this.size = extent.getSize(new THREE.Vector3());
    this.center = extent.getCenter(new THREE.Vector3());
    for (const role of [nodes.headMesh, nodes.jawMesh, ...Object.keys(nodes.lids)]) {
      nodeNamed(this.model, role).traverse(node => {
        if (!node.morphTargetDictionary) return;
        node.frustumCulled = false;
        for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
          this.availableMorphs.push({ node, role, name, index });
        }
      });
    }
    this.pose = new PoseController(config);
    this.tears = new Tears(this.head, config.tears?.routes);
    this.smoke = new Smoke(this.scene, this.cigar);
    this.clips = asset.animations.map(clip => clip.name);
  }

  resize(width, height, mode) {
    const maxRatio = mode === 'dock' ? 2.25 : 1.85;
    const ratio = Math.min(window.devicePixelRatio || 1, maxRatio, 960 / Math.max(width, height));
    if (width !== this.width || height !== this.height || ratio !== this.ratio) {
      this.width = width;
      this.height = height;
      this.ratio = ratio;
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.lastAnchor = null;
    }
  }

  frame(timestamp, delta, options) {
    const { mode, view, dragging, reducedMotion, smoke, tears } = options;
    const blend = reducedMotion ? 1 : 1 - Math.exp(-delta / .135);
    const targetFraming = Number(mode === 'floating');
    const targetAngle = mode === 'dock' ? 0 : views[view];
    this.framing = THREE.MathUtils.lerp(this.framing, targetFraming, blend);
    this.angle = THREE.MathUtils.lerp(this.angle, targetAngle, blend);
    const gain = reducedMotion ? 0 : .26 + .74 * this.framing;
    const changingMode = Math.abs(this.framing - targetFraming) > .035 || Math.abs(this.angle - targetAngle) > .018;
    const current = this.pose.step(delta, gain, {
      mode,
      dragging,
      reducedMotion,
      changingMode,
      getAttentionTarget: previousId => this.attention.pick({ mode, previousId, cameraYaw: this.angle }),
    });
    this.current = current;
    const { motion } = current;
    this.head.position.copy(this.restPosition).add(this.point.set(motion.x, motion.z, -motion.y));
    this.head.quaternion.fromArray(current.headRotation).premultiply(this.restHead);
    this.jaw.quaternion.copy(this.restJaw).multiply(this.jawDelta.setFromAxisAngle(this.axisX, this.config.jaw.radiansSweep * current.jaw));
    for (const { node, role, name, index } of this.availableMorphs) {
      node.morphTargetInfluences[index] = morphBinding(role, name, current);
    }

    // Fit the skull closely in a square surface while leaving space to the cigar side for its smoke.
    const horizontal = this.size.x * (.5 + .028 * this.framing + .05 * Math.sin(this.angle));
    const vertical = this.size.y * (.50 - .01 * this.framing);
    // At logo size, use one steady fit for the whole attention range. Extra clearance for large looks is floating-only.
    const depthMargin = THREE.MathUtils.lerp(.275, .188 + idleFramingPadding(current.idleGlance), this.framing);
    const wardrobeFraming = this.wardrobe?.framing();
    const stockDistance = Math.max(vertical, horizontal / this.camera.aspect) /
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) + this.size.z * depthMargin;
    const distance = stockDistance * (1 + (wardrobeFraming?.padding ?? 0));
    this.cameraTarget.copy(this.center);
    this.cameraTarget.y += this.size.y * (wardrobeFraming?.rise ?? 0);
    this.cameraTarget.x -= this.size.x * .035 * this.framing * Math.cos(this.angle);
    this.cameraTarget.z += this.size.x * .035 * this.framing * Math.sin(this.angle);
    this.camera.position.set(Math.sin(this.angle) * distance, this.size.y * .034, Math.cos(this.angle) * distance).add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld();

    const tearIntensity = tears === 'auto' ? clamp(current.fields.Pianto_Espressivo ?? 0) : Number(tears === 'on');
    this.tearEmission = tearIntensity;
    this.wardrobe?.update(delta, options);
    this.tears.update(delta, current.fields, tearIntensity, reducedMotion, this.wardrobe?.tearMask());
    this.smoke.visible = smoke && !reducedMotion && (this.wardrobe?.smokeVisible() ?? true);
    const smokeClearance = this.wardrobe?.smokeScale() ?? 1;
    const smokeIntensity = (.51 + .49 * this.framing) * smokeClearance;
    this.smoke.update(delta, this.smoke.visible ? smokeIntensity : 0, this.camera, smokeClearance);

    if (this.afterAnchor) {
      const projected = projectPoint(this.mouth.getWorldPosition(this.point), this.camera);
      const prior = this.lastAnchor;
      if (!prior || Math.hypot((prior.x - projected.x) * this.width, (prior.y - projected.y) * this.height) >= .3) {
        this.lastAnchor = projected;
        this.afterAnchor(projected);
      }
    }
    const start = performance.now();
    this.renderer.render(this.scene, this.camera);
    if (this.wardrobe) {
      const canvas = this.renderer.domElement;
      const items = this.wardrobe.ids.join(',');
      if (canvas.dataset.wardrobeDrawn !== items) canvas.dataset.wardrobeDrawn = items;
      const caption = this.wardrobe.caption();
      if (this.wardrobeCaption !== caption) {
        this.wardrobeCaption = caption;
        this.onWardrobeCaption?.(caption);
      }
    }
    this.metrics.record(timestamp, performance.now() - start);
  }

  snapshot() {
    const { pitch, yaw, roll, x, y, z } = this.current?.motion ?? {};
    const newestSmoke = this.smoke.cursor ? this.smoke.points[(this.smoke.cursor - 1) % this.smoke.points.length] : null;
    return {
      clips: this.clips,
      expression: this.pose.expression,
      expressionPhase: this.pose.expressionPhase,
      expressionWeight: this.pose.expressionWeights[this.pose.expression] ?? 0,
      expressionWeights: { ...this.pose.expressionWeights },
      style: this.pose.style,
      talkWeight: this.current?.talkWeight ?? 0,
      talkGain: this.current?.talkGain ?? 0,
      jaw: this.current?.jaw ?? 0,
      restingJaw: this.current?.restingJaw ?? 0,
      poseTime: this.pose.now,
      idleGlance: this.current?.idleGlance ?? { direction: null, target: null, phase: 'waiting', sequence: 0, pitch: 0, yaw: 0, roll: 0 },
      headPose: { pitch: pitch ?? 0, yaw: yaw ?? 0, roll: roll ?? 0, x: x ?? 0, y: y ?? 0, z: z ?? 0 },
      headForward: this.point.set(0, 0, 1).transformDirection(this.head.matrixWorld).toArray(),
      leftBlink: this.current?.motion.left ?? 0,
      rightBlink: this.current?.motion.right ?? 0,
      tearOpacity: this.tears.visible,
      tearDrops: this.tears.activeCount,
      tearEmission: this.tearEmission ?? 0,
      smokeParticles: this.smoke.points.filter(point => point.sprite.visible).length,
      cigar: projectPoint(this.cigar.getWorldPosition(this.point), this.camera),
      smokeOrigin: newestSmoke ? projectPoint(this.point.copy(newestSmoke.origin), this.camera) : null,
      mouth: this.lastAnchor,
      totalDraws: this.metrics.totalDraws,
    };
  }

  dispose() {
    this.metrics.cancel('The mascot renderer was disposed.');
    this.attention.dispose();
    this.wardrobe?.clear();
    this.smoke?.dispose();
    this.tears?.dispose();
    disposeAsset(this.model);
    this.renderer.dispose();
  }
}

export function createMascotRenderer({ canvas, onStatus, onAnchor, onWardrobeCaption, wardrobe = false }) {
  const options = { mode: 'dock', view: 'front', dragging: false, reducedMotion: false, smoke: true, tears: 'auto' };
  const abort = new AbortController();
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  options.reducedMotion = motionQuery.matches;
  let runtime;
  let loaded = false;
  let frame = 0;
  let lastFrame = 0;
  let width = canvas.clientWidth;
  let height = canvas.clientHeight;
  let requestedVisibility = true;
  // The initial canvas is offscreen at 1px until the assistant positions it.
  let intersecting = false;
  let needsPresentation = true;
  let contextLost = false;
  let disposed = false;
  let blinkIndex = 0;
  let nextBlink = 2.8;
  let activeExpression = 'Neutral';
  let expressionIntensity = 1;
  let activeTalk = null;
  let reducedExpressionTimer;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // Consumers may use either the status callback or the ready promise.
  ready.catch(() => {});

  function visible() {
    return loaded && !disposed && !contextLost && requestedVisibility && intersecting && width > 0 && height > 0 && !document.hidden;
  }

  function schedule() {
    if (visible() && !frame) frame = requestAnimationFrame(draw);
  }

  function pause(reason) {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    runtime?.metrics.cancel(reason);
  }

  function reconcile() {
    if (visible()) schedule();
    else pause('The mascot left the visible viewport.');
  }

  function fail(error) {
    const reason = error instanceof Error ? error : new Error(String(error));
    loaded = false;
    abort.abort();
    pause(reason.message);
    runtime?.dispose();
    runtime = undefined;
    rejectReady(reason);
    onStatus?.('error', reason);
  }

  function draw(timestamp) {
    frame = 0;
    if (!visible()) return;
    const delta = lastFrame ? clamp((timestamp - lastFrame) / 1000, 0, .075) : 0;
    lastFrame = timestamp;
    try {
      runtime.resize(width, height, options.mode);
      if (!options.reducedMotion && runtime.pose.now >= nextBlink) {
        runtime.pose.blink();
        nextBlink = runtime.pose.now + blinkIntervals[blinkIndex++ % blinkIntervals.length];
      }
      runtime.frame(timestamp, delta, options);
    } catch (error) {
      fail(error);
      return;
    }
    if (needsPresentation) {
      if (runtime.renderer.getContext().isContextLost()) return;
      if (!runtime.renderer.info.render.calls) {
        fail(new Error('The Ready model did not draw.'));
        return;
      }
      needsPresentation = false;
      resolveReady();
      onStatus?.('ready');
    }
    if (!options.reducedMotion) schedule();
  }

  function setReducedMotion(value) {
    if (options.reducedMotion === value) return;
    options.reducedMotion = value;
    clearTimeout(reducedExpressionTimer);
    if (runtime?.pose) {
      if (value) {
        runtime.metrics.cancel('Reduced motion uses event-driven redraws.');
        runtime.pose.stopTalk();
        runtime.pose.talking = [];
        runtime.pose.reactions = [];
        runtime.pose.blinks = [];
        const { expression, expressionWeights } = runtime.pose;
        showExpression(expression, expressionWeights[expression] ?? 1);
      } else if (activeTalk) {
        runtime.pose.playTalk(activeTalk.style, activeTalk.gain);
      }
    }
    schedule();
  }

  const onMotionChange = event => setReducedMotion(event.matches);
  const onContextLost = event => {
    event.preventDefault();
    contextLost = true;
    needsPresentation = true;
    const error = new Error('The WebGL drawing context was lost.');
    pause(error.message);
    onStatus?.('error', error);
  };
  const onContextRestored = () => {
    contextLost = false;
    reconcile();
  };
  const sizing = new ResizeObserver(entries => {
    const { width: w, height: h } = entries[0].contentRect;
    width = Math.round(w);
    height = Math.round(h);
    reconcile();
  });
  const observer = new IntersectionObserver(entries => {
    intersecting = entries[0].isIntersecting;
    reconcile();
  });
  sizing.observe(canvas);
  observer.observe(canvas);
  document.addEventListener('visibilitychange', reconcile);
  motionQuery.addEventListener('change', onMotionChange);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  function showExpression(name, intensity = 1) {
    clearTimeout(reducedExpressionTimer);
    activeExpression = name;
    expressionIntensity = intensity;
    runtime?.pose?.setExpression(name, intensity, options.reducedMotion);
    if (options.reducedMotion && name !== 'Neutral' && runtime?.pose) {
      // Reduced motion keeps a static expression briefly, with no running animation loop.
      reducedExpressionTimer = setTimeout(() => showExpression('Neutral'), 2050);
    }
    schedule();
  }

  void (async () => {
    onStatus?.('loading');
    const loader = new GLTFLoader();
    try {
      runtime = new MascotScene(canvas, onAnchor, () => options.mode);
      const [config, bytes] = await Promise.all([
        fetchAsset('interaction.json', abort.signal).then(response => response.json()),
        fetchAsset('ironclad.glb', abort.signal).then(response => response.arrayBuffer()),
      ]);
      const asset = await loader.parseAsync(bytes, assetPath.href);
      if (disposed) {
        disposeAsset(asset.scene);
        return;
      }
      runtime.setup(config, asset);
      if (wardrobe) {
        const { createWardrobe } = await import('./wardrobe.js');
        if (disposed) return;
        runtime.wardrobe = createWardrobe(runtime, nodeNamed, disposeAsset);
        runtime.onWardrobeCaption = onWardrobeCaption;
      }
      showExpression(activeExpression, expressionIntensity);
      if (activeTalk && !options.reducedMotion) runtime.pose.playTalk(activeTalk.style, activeTalk.gain);
      loaded = true;
      reconcile();
    } catch (error) {
      if (!disposed) fail(error);
    }
  })();

  function stopTalk() {
    activeTalk = null;
    runtime?.pose?.stopTalk();
    schedule();
  }

  return {
    ready,
    setMode(mode) {
      if (mode === 'dock' && options.mode !== 'dock') {
        stopTalk();
        showExpression('Neutral');
      }
      options.mode = mode;
      schedule();
    },
    setView(view) { options.view = view; schedule(); },
    setDragging(dragging) { options.dragging = dragging; schedule(); },
    setExpression: showExpression,
    startTalk(style, gain = 1) {
      activeTalk = { style, gain };
      if (!options.reducedMotion) runtime?.pose?.playTalk(style, gain);
      schedule();
    },
    setTalkGain(gain) {
      if (!activeTalk) return;
      activeTalk.gain = clamp(gain);
      if (!options.reducedMotion) runtime?.pose?.setTalkGain(activeTalk.gain);
    },
    stopTalk,
    react(name) {
      if (!options.reducedMotion) runtime?.pose?.playReaction(name);
      schedule();
    },
    blink(side = 'both') {
      if (!options.reducedMotion) runtime?.pose?.blink(side);
      schedule();
    },
    setSmoke(value) { options.smoke = value; schedule(); },
    setTears(value) { options.tears = value; schedule(); },
    setReducedMotion,
    setVisible(value) { requestedVisibility = value; reconcile(); },
    async prepareWardrobe(items, signal) {
      await ready;
      if (!runtime?.wardrobe || disposed) throw new Error('The wardrobe preview is unavailable.');
      const prepared = await runtime.wardrobe.prepare(items, signal);
      return {
        commit() {
          if (disposed) {
            prepared.discard();
            return;
          }
          prepared.commit();
          schedule();
        },
        discard: prepared.discard,
      };
    },
    clearWardrobe() { runtime?.wardrobe?.clear(); schedule(); },
    commandWardrobe(action) { runtime?.wardrobe?.command(action); schedule(); },
    snapshot() { return loaded ? runtime.snapshot() : null; },
    async measure(durationMs = 3500) {
      await ready;
      if (!visible() || options.reducedMotion) throw new Error('Measurement requires a visible, animating mascot.');
      return runtime.metrics.measure(durationMs);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rejectReady(new Error('The mascot renderer was disposed.'));
      clearTimeout(reducedExpressionTimer);
      abort.abort();
      pause('The mascot renderer was disposed.');
      sizing.disconnect();
      observer.disconnect();
      document.removeEventListener('visibilitychange', reconcile);
      motionQuery.removeEventListener('change', onMotionChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      runtime?.dispose();
    },
  };
}

globalThis.IronCladMascotV6 = { createMascotRenderer };
