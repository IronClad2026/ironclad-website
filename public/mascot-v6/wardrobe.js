import * as THREE from './vendor/build/three.module.min.js';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';
import { createItemAdapter } from './wardrobe-items.js';

const idleAssetLimit = 8;
const idleByteLimit = 112 * 1024 * 1024;
const sessionPools = new Map();
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

function createResourceCache(disposeAsset) {
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
      entry.bytes = bitmap.width * bitmap.height * 4 * 4 / 3;
      entry.release = () => bitmap.close();
      return bitmap;
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
      let released = false;
      return {
        key,
        kind,
        promise: entry.promise,
        release() {
          if (released) return;
          released = true;
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

function scopedResources(scope, disposeAsset) {
  const prior = scope && sessionPools.get(scope);
  if (prior) return prior;
  const pool = { cache: createResourceCache(disposeAsset), views: new Set() };
  if (scope) sessionPools.set(scope, pool);
  return pool;
}

function clonePaint(bitmap, original) {
  const map = original.map.clone();
  // The bitmap is shared, but each viewer needs a Source and material owned by its stock model.
  map.source = new THREE.Source(bitmap);
  map.needsUpdate = true;
  const material = original.clone();
  material.map = map;
  return {
    material,
    release() {
      material.dispose();
      map.dispose();
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

export function createWardrobe(runtime, nodeNamed, disposeAsset, scope) {
  const { nodes } = runtime.config;
  const skull = nodeNamed(runtime.model, nodes.headMesh);
  const jaw = nodeNamed(runtime.model, nodes.jawMesh);
  const stock = { geometry: skull.geometry, skull: skull.material, jaw: jaw.material };
  const adapter = createItemAdapter(runtime, nodeNamed);
  const session = typeof scope === 'string' && scope.length ? scope : null;
  const pool = scopedResources(session, disposeAsset);
  const { cache, views } = pool;
  const equipped = new Map();
  const preparations = new Set();
  let disposed = false;
  let available = 0;
  let visibility = new Map();
  let ids = [];
  let time = 0;

  function unmount(entry) {
    for (const { object } of entry.item.mounts ?? []) object.removeFromParent();
  }

  function release(entry) {
    entry.item?.dispose?.();
    for (const paint of entry.paints) paint.release();
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

  function reset() {
    available++;
    const removed = [...equipped.values()];
    const abandoned = [...preparations];
    for (const entry of removed) unmount(entry);
    equipped.clear();
    ids = [];
    apply();
    return () => {
      for (const entry of removed) release(entry);
      for (const discard of abandoned) discard(true);
    };
  }

  const viewer = { reset, notify: () => runtime.onWardrobeReset?.() };
  views.add(viewer);

  return {
    clear() {
      if (disposed) return;
      // Restore stock on every canvas before any shared decoded object can be released.
      const attached = [...views];
      const releaseAll = attached.map(view => view.reset());
      for (const finalize of releaseAll) finalize();
      cache.clear();
      for (const view of attached) view.notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const finalize = reset();
      finalize();
      views.delete(viewer);
      if (!views.size) {
        cache.clear();
        if (session) sessionPools.delete(session);
      }
    },
    async prepare(next, signal) {
      signal.throwIfAborted();
      if (disposed) throw new Error('The wardrobe preview is unavailable.');
      const generation = available;
      const additions = next.filter(id => !equipped.has(id))
        .map(id => ({ id, resources: adapter.resources(id).map(resource => cache.acquire(resource)), paints: [] }));
      let settled = false;
      let invalidated = false;
      const discard = (invalidate = false) => {
        if (settled) return;
        settled = true;
        invalidated = invalidate;
        preparations.delete(discard);
        for (const entry of additions) release(entry);
      };
      const current = () => {
        signal.throwIfAborted();
        if (generation !== available) throw new Error('The wardrobe selection is no longer current.');
      };
      preparations.add(discard);
      try {
        const pending = additions.flatMap(entry => entry.resources.map(resource => resource.promise));
        const values = await abortable(Promise.all(pending), signal);
        current();
        let offset = 0;
        for (const entry of additions) {
          const byKey = new Map(entry.resources.map(({ key, kind }) => {
            const resource = values[offset++];
            if (kind !== 'upperPaint' && kind !== 'lowerPaint') return [key, resource];
            const paint = clonePaint(resource, kind === 'upperPaint' ? stock.skull : stock.jaw);
            entry.paints.push(paint);
            return [key, paint.material];
          }));
          entry.item = adapter.create(entry.id, (owner, file) => byKey.get(owner + '/' + file));
        }
        return {
          commit() {
            if (settled && !invalidated) return;
            current();
            settled = true;
            preparations.delete(discard);
            available++;
            const removed = [];
            for (const [id, entry] of equipped) {
              if (next.includes(id)) continue;
              unmount(entry);
              removed.push(entry);
              equipped.delete(id);
            }
            for (const entry of additions) {
              for (const { parent, object } of entry.item.mounts ?? []) parent.add(object);
              equipped.set(entry.id, entry);
            }
            apply();
            for (const entry of removed) release(entry);
            ids = [...next];
          },
          discard: () => discard(),
        };
      } catch (error) {
        discard();
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
