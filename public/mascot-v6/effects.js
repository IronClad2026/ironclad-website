import * as THREE from './vendor/build/three.module.min.js';

const spherical = new THREE.Vector3(0, -1, 0);
const target = new THREE.Vector3();
const tangent = new THREE.Vector3();
const origin = new THREE.Vector3();
const screen = new THREE.Vector3();

function tearGeometry() {
  const geometry = new THREE.SphereGeometry(1, 14, 10);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const y = positions.getY(index);
    const profile = 0.72 - 0.20 * y;
    positions.setXYZ(index, positions.getX(index) * profile, y, positions.getZ(index) * profile);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function shapedRoute(points) {
  return points.map(point => ({
    origin: new THREE.Vector3(...point.position),
    shifts: Object.entries(point.fields ?? {}).map(([name, delta]) => [name, new THREE.Vector3(...delta)]),
    current: new THREE.Vector3(),
  }));
}

function routeAt(route, amount, result) {
  const pointer = THREE.MathUtils.clamp(amount, 0, 1) * (route.length - 1);
  const sample = Math.min(route.length - 2, Math.floor(pointer));
  return result.copy(route[sample].current).lerp(route[sample + 1].current, pointer - sample);
}

export class Tears {
  constructor(head, paths) {
    this.visible = 0;
    this.activeCount = 0;
    this.reduced = false;
    this.group = new THREE.Group();
    this.group.name = 'Browser_Tear_Lenses';
    head.add(this.group);
    this.routes = [];
    this.geometry = tearGeometry();
    for (const [index, side] of ['L', 'R'].entries()) {
      const points = paths?.[side];
      if (!points || points.length < 2) continue;
      const drops = Array.from({ length: 4 }, () => {
        const mesh = new THREE.Mesh(this.geometry, new THREE.MeshPhysicalMaterial({
          color: '#91d8f2', emissive: '#286780', emissiveIntensity: 0.32,
          roughness: 0.17, metalness: 0.04, clearcoat: 0.90,
          transparent: true, opacity: 0, depthWrite: false,
        }));
        mesh.visible = false;
        this.group.add(mesh);
        return { mesh, age: Infinity, life: 1, strength: 0 };
      });
      this.routes.push({ points: shapedRoute(points), drops, wait: index * 0.12, sequence: index });
    }
    this.group.visible = false;
  }

  update(delta, fields, intensity, reducedMotion = false) {
    if (this.reduced !== reducedMotion) {
      this.reduced = reducedMotion;
      for (const route of this.routes) {
        route.wait = 0;
        for (const drop of route.drops) {
          drop.age = Infinity;
          drop.mesh.visible = false;
        }
      }
    }
    this.visible = 0;
    this.activeCount = 0;
    for (const route of this.routes) {
      const { points, drops } = route;
      if (!reducedMotion && intensity > .19) {
        // Ease down births as Sad releases. Existing drops keep their own age and opacity.
        route.wait -= delta * intensity;
        const available = drops.find((drop) => drop.age >= drop.life);
        if (route.wait <= 0 && available) {
          const seed = route.sequence++ * 2.39996;
          available.age = 0;
          available.life = 1.23 + .15 * Math.sin(seed);
          available.strength = .52 + .48 * intensity;
          route.wait = .35 + .07 * Math.sin(seed + 1);
        }
      }
      if (!reducedMotion && intensity <= .19 && drops.every((drop) => drop.age >= drop.life)) {
        route.wait = 0;
        continue;
      }
      for (const { origin, shifts, current } of points) {
        current.copy(origin);
        for (const [name, channel] of shifts) current.addScaledVector(channel, fields[name] ?? 0);
      }
      for (const [index, drop] of drops.entries()) {
        drop.age += delta;
        const life = reducedMotion ? .33 + .2 * index : drop.age / drop.life;
        const strength = reducedMotion ? intensity : drop.strength;
        const emergence = THREE.MathUtils.smoothstep(life, 0, .13);
        const ending = 1 - THREE.MathUtils.smoothstep(life, .65, 1);
        const opacity = strength * emergence * ending * .9;
        const { mesh } = drop;
        mesh.visible = opacity > .006;
        if (!mesh.visible) continue;
        const travel = life * (.58 + .08 * life);
        routeAt(points, travel, mesh.position);
        routeAt(points, travel + .018, target);
        tangent.copy(target).sub(mesh.position).normalize();
        if (tangent.lengthSq()) mesh.quaternion.setFromUnitVectors(spherical, tangent);
        const radius = (.028 + .003 * (index % 3)) * emergence * (.76 + .24 * strength);
        mesh.scale.set(radius, radius * 1.72, radius * .59);
        mesh.material.opacity = opacity;
        this.visible = Math.max(this.visible, opacity);
        this.activeCount++;
      }
    }
    this.group.visible = this.activeCount > 0;
  }

  dispose() {
    this.group.removeFromParent();
    this.geometry.dispose();
    for (const { drops } of this.routes) for (const { mesh } of drops) mesh.material.dispose();
  }
}

function smokeTexture(phase) {
  const canvas = document.createElement('canvas');
  const size = 96;
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = 2 * x / (size - 1) - 1;
      const v = 2 * y / (size - 1) - 1;
      const r = Math.hypot(u, v);
      const strands = .56 + .20 * Math.sin(7 * u + 3 * v * v + phase + Math.sin(5 * v)) +
        .12 * Math.cos(11 * v - 6 * u + 1.9 * phase) + .07 * Math.sin(20 * u + 15 * v + phase);
      const fade = 1 - THREE.MathUtils.smoothstep(r, 0.14, 0.97);
      const i = (y * size + x) * 4;
      image.data.set([248, 249, 247, Math.round(210 * fade * fade * strands)], i);
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Smoke {
  constructor(scene, anchor) {
    this.anchor = anchor;
    this.visible = true;
    this.emission = 0;
    this.cursor = 0;
    this.points = [];
    this.style = new THREE.Group();
    this.style.name = 'Browser_Cigar_Smoke';
    scene.add(this.style);
    this.maps = [0, 1.9, 4.1].map(smokeTexture);
    for (let index = 0; index < 24; index++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.maps[index % this.maps.length], color: '#dfe5e7', transparent: true, opacity: 0, depthWrite: false,
      }));
      sprite.visible = false;
      this.style.add(sprite);
      this.points.push({ sprite, age: Infinity, seed: index * 2.39996, origin: new THREE.Vector3() });
    }
  }

  update(delta, intensity, camera) {
    this.emission += delta;
    const spacing = .071 + .021 * Math.sin(this.cursor * 2.39996);
    if (this.visible && this.emission >= spacing) {
      this.emission %= spacing;
      this.anchor.getWorldPosition(origin);
      const point = this.points[this.cursor++ % this.points.length];
      point.origin.copy(origin);
      point.age = 0;
    }
    for (const point of this.points) {
      const { sprite, seed, origin: start } = point;
      point.age += delta;
      const age = point.age;
      const lifespan = 1.55 + .20 * Math.sin(seed);
      sprite.visible = age < lifespan && intensity > .005;
      if (!sprite.visible) continue;
      const life = age / lifespan;
      const curl = Math.sin(age * 4.8 + seed * 0.16) * (0.008 + 0.047 * life) * life;
      sprite.position.set(start.x - 0.118 * age - 0.022 * age * age + curl,
        start.y + 0.255 * age + 0.081 * age * age, start.z + 0.042 * age);
      sprite.scale.set(0.055 + 0.142 * life, 0.079 + 0.153 * life, 1);
      sprite.material.rotation = seed + age * 0.42;
      const fadeIn = THREE.MathUtils.smoothstep(life, 0, .16);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(life, .28, 1);
      screen.copy(sprite.position).project(camera);
      const edge = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(screen.x), Math.abs(screen.y)), .85, 1.01);
      sprite.material.opacity = intensity * (0.42 + 0.06 * Math.cos(seed)) * fadeIn * fadeOut * edge;
      sprite.visible = sprite.material.opacity > .002;
    }
  }

  dispose() {
    this.style.removeFromParent();
    for (const { sprite } of this.points) sprite.material.dispose();
    for (const map of this.maps) map.dispose();
  }
}
