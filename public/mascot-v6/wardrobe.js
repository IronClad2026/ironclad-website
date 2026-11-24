import * as THREE from './vendor/build/three.module.min.js';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';
import { createItemAdapter } from './wardrobe-items.js';

const idleAssetLimit = 8;
const idleByteLimit = 112 * 1024 * 1024;
const extraFraming = {
  tankers_crown: [.16, .035],
  headwear_flip_up_welding_mask: [.30, .015],
  headwear_wwii_full_face_helmet: [.10, -.01],
  helmet_trim_lucky_dog_tags: [.04, 0],
  headwear_australian_slouch_hat: [.04, 0],
};

function estimatedBytes(scene, wireBytes) {
  const arrays = new Set();
  const images = new Set();
  scene.traverse(object => {
    const geometry = object.geometry;
    if (geometry) {
      for (const attribute of Object.values(geometry.attributes)) arrays.add(attribute.array);
      if (geometry.index) arrays.add(geometry.index.array);
      for (const targets of Object.values(geometry.morphAttributes)) {
        for (const attribute of targets) arrays.add(attribute.array);
      }
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const texture of Object.values(material)) {
        if (texture?.isTexture && texture.image?.width) images.add(texture.image);
      }
    }
  });
  let bytes = 0;
  for (const array of arrays) bytes += array?.byteLength ?? 0;
  for (const image of images) bytes += image.width * image.height * 4 * 4 / 3;
  return Math.max(wireBytes, bytes);
}

function createResourceCache(stock, disposeAsset) {
  const loader = new GLTFLoader();
  const entries = new Map();

  function retire(entry) {
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    entry.abort.abort();
    entry.release?.();
    entry.release = undefined;
  }

  function trim() {
    const idle = [...entries.values()].filter(entry => !entry.refs && entry.release)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    let total = idle.reduce((sum, entry) => sum + entry.bytes, 0);
    while (idle.length > idleAssetLimit || total > idleByteLimit) {
      const oldest = idle.shift();
      total -= oldest.bytes;
      retire(oldest);
    }
  }

  async function load(entry, item, file, kind) {
    const { signal } = entry.abort;
    const response = await fetch('/api/ready/wardrobe/assets/' + item + '/' + file, {
      signal, cache: 'no-store', credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('Wardrobe asset is unavailable.');
    if (kind === 'upperPaint' || kind === 'lowerPaint') {
      const blob = await response.blob();
      signal.throwIfAborted();
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const original = kind === 'upperPaint' ? stock.skull : stock.jaw;
      const map = original.map.clone();
      map.source = new THREE.Source(bitmap);
      map.needsUpdate = true;
      const material = original.clone();
      material.map = map;
      entry.bytes = bitmap.width * bitmap.height * 4 * 4 / 3;
      entry.release = () => {
        material.dispose();
        map.dispose();
        bitmap.close();
      };
      return material;
    }
    const data = await response.arrayBuffer();
    signal.throwIfAborted();
    const asset = await loader.parseAsync(data, '');
    entry.release = () => disposeAsset(asset.scene);
    entry.bytes = estimatedBytes(asset.scene, data.byteLength);
    return asset;
  }

  return {
    acquire([item, file, kind]) {
      const key = item + '/' + file;
      let entry = entries.get(key);
      if (!entry) {
        entry = { key, abort: new AbortController(), refs: 0, bytes: 0, lastUsed: performance.now() };
        const current = entry;
        entry.promise = load(entry, item, file, kind).then(value => {
          if (current.abort.signal.aborted) {
            retire(current);
            current.abort.signal.throwIfAborted();
          }
          return value;
        }).catch(error => {
          retire(current);
          throw error;
        });
        entries.set(key, entry);
      }
      entry.refs++;
      return {
        key,
        promise: entry.promise,
        release() {
          entry.refs--;
          entry.lastUsed = performance.now();
          if (!entry.refs && !entry.release) retire(entry);
          trim();
        },
      };
    },
    clear() {
      for (const entry of entries.values()) retire(entry);
    },
  };
}

function abortable(promise, signal) {
  signal.throwIfAborted();
  let onAbort;
  return Promise.race([promise, new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  })]).finally(() => signal.removeEventListener('abort', onAbort));
}

export function createWardrobe(runtime, nodeNamed, disposeAsset) {
  const { nodes } = runtime.config;
  const skull = nodeNamed(runtime.model, nodes.headMesh);
  const jaw = nodeNamed(runtime.model, nodes.jawMesh);
  const stock = { geometry: skull.geometry, skull: skull.material, jaw: jaw.material };
  const cache = createResourceCache(stock, disposeAsset);
  const adapter = createItemAdapter(runtime, nodeNamed);
  const equipped = new Map();
  let available = 0;
  let visibility = new Map();
  let ids = [];
  let time = 0;

  function detach(entry) {
    for (const { object } of entry.item.mounts ?? []) object.removeFromParent();
    entry.item.dispose?.();
    for (const resource of entry.resources) resource.release();
  }

  function apply() {
    let geometry = stock.geometry;
    let skullMaterial = stock.skull;
    let jawMaterial = stock.jaw;
    let smoke = runtime.cigar;
    for (const { item } of equipped.values()) {
      geometry = item.skullGeometry ?? geometry;
      skullMaterial = item.skullMaterial ?? skullMaterial;
      jawMaterial = item.jawMaterial ?? jawMaterial;
      if (item.smokeTip !== undefined) smoke = item.smokeTip;
    }
    skull.geometry = geometry;
    skull.material = skullMaterial;
    jaw.material = jawMaterial;
    for (const [node, visible] of visibility) node.visible = visible;
    visibility = new Map();
    for (const { item } of equipped.values()) {
      for (const node of item.hide ?? []) {
        if (!visibility.has(node)) visibility.set(node, node.visible);
        node.visible = false;
      }
      for (const { object, slot } of item.auxiliaryMaterials ?? []) {
        object.material = slot === 'jaw' ? jawMaterial : skullMaterial;
      }
    }
    runtime.smoke.retarget(smoke);
  }

  return {
    clear() {
      available++;
      for (const entry of equipped.values()) detach(entry);
      equipped.clear();
      apply();
      cache.clear();
      ids = [];
    },
    async prepare(next, signal) {
      const generation = available;
      const additions = next.filter(id => !equipped.has(id))
        .map(id => ({ id, resources: adapter.resources(id).map(resource => cache.acquire(resource)) }));
      let settled = false;
      const release = () => {
        for (const entry of additions) {
          entry.item?.dispose?.();
          for (const resource of entry.resources) resource.release();
        }
      };
      try {
        const pending = additions.flatMap(entry => entry.resources.map(resource => resource.promise));
        await abortable(Promise.all(pending), signal);
        for (const entry of additions) {
          const values = await Promise.all(entry.resources.map(resource => resource.promise));
          const byKey = new Map(entry.resources.map(({ key }, index) => [key, values[index]]));
          entry.item = adapter.create(entry.id, (owner, file) => byKey.get(owner + '/' + file));
        }
        return {
          commit() {
            if (settled) return;
            signal.throwIfAborted();
            if (generation !== available) throw new Error('The wardrobe selection is no longer current.');
            settled = true;
            available++;
            for (const [id, entry] of equipped) {
              if (next.includes(id)) continue;
              detach(entry);
              equipped.delete(id);
            }
            for (const entry of additions) {
              for (const { parent, object } of entry.item.mounts ?? []) parent.add(object);
              equipped.set(entry.id, entry);
            }
            apply();
            ids = [...next];
          },
          discard() {
            if (settled) return;
            settled = true;
            release();
          },
        };
      } catch (error) {
        release();
        throw error;
      }
    },
    update(delta, options) {
      time += delta;
      for (const { item } of equipped.values()) item.update?.(delta, time, options);
    },
    command(action) {
      for (const { item } of equipped.values()) item.command?.(action, time);
    },
    caption() {
      for (const { item } of equipped.values()) {
        const text = item.caption?.();
        if (text) return text;
      }
      return '';
    },
    smokeVisible() {
      if (!runtime.smoke.anchor) return false;
      for (const { item } of equipped.values()) if (item.smokeVisible && !item.smokeVisible()) return false;
      return true;
    },
    smokeScale() {
      for (const { item } of equipped.values()) if (item.smokeScale) return item.smokeScale();
      return 1;
    },
    tearMask() {
      let mask = null;
      for (const { item } of equipped.values()) {
        if (item.tearMask === 'all') return 'all';
        mask = item.tearMask ?? mask;
      }
      return mask;
    },
    framing() {
      let padding = 0;
      let rise = 0;
      for (const id of equipped.keys()) {
        const extra = extraFraming[id];
        if (!extra) continue;
        if (extra[0] > padding) [padding, rise] = extra;
      }
      return { padding, rise };
    },
    get ids() { return ids; },
  };
}
