import * as THREE from './vendor/build/three.module.min.js';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';

const aviators = 'eyewear_smoked_aviators';
const cigarette = 'mouth_cigarette';
const clown = 'face_clown_makeup';

async function fetchWearable(item, file, signal) {
  const response = await fetch('/api/ready/wardrobe/assets/' + item + '/' + file, {
    signal, cache: 'no-store', credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Wardrobe asset is unavailable.');
  return response;
}

export function createWardrobe(runtime, nodeNamed, disposeAsset) {
  const { nodes } = runtime.config;
  const skull = nodeNamed(runtime.model, nodes.headMesh);
  const jaw = nodeNamed(runtime.model, nodes.jawMesh);
  const stock = { geometry: skull.geometry, skull: skull.material, jaw: jaw.material };
  let equipped;

  function restore() {
    skull.geometry = stock.geometry;
    skull.material = stock.skull;
    jaw.material = stock.jaw;
    equipped?.release();
    equipped = undefined;
  }

  return {
    clear() {
      restore();
      runtime.smoke.retarget(runtime.cigar);
    },
    async prepare(ids, signal) {
      const resources = [];
      let used = false;
      let released = false;
      function releaseResources() {
        if (released) return;
        released = true;
        for (const release of resources.reverse()) release();
      }
      async function model(item, file) {
        const data = await (await fetchWearable(item, file, signal)).arrayBuffer();
        signal.throwIfAborted();
        const asset = await new GLTFLoader().parseAsync(data, '');
        resources.push(() => disposeAsset(asset.scene));
        return asset.scene;
      }
      async function paint(file, original) {
        const blob = await (await fetchWearable(clown, file, signal)).blob();
        signal.throwIfAborted();
        const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const map = original.map.clone();
        // Replace the Source too. A cloned texture otherwise shares the stock image source.
        map.source = new THREE.Source(bitmap);
        map.needsUpdate = true;
        const material = original.clone();
        material.map = map;
        resources.push(() => {
          material.dispose();
          map.dispose();
          bitmap.close();
        });
        return material;
      }

      const loading = await Promise.allSettled([
        ids.includes(aviators) ? model(aviators, 'wearable.glb') : null,
        ids.includes(cigarette) ? model(cigarette, 'wearable.glb') : null,
        ids.includes(cigarette) ? model(cigarette, 'repaired-bite.glb') : null,
        ids.includes(clown) ? paint('upper-basecolor.png', stock.skull) : null,
        ids.includes(clown) ? paint('lower-basecolor.png', stock.jaw) : null,
      ]);
      try {
        signal.throwIfAborted();
        const [glasses, prop, bite, upper, lower] = loading.map(result => {
          if (result.status === 'rejected') throw result.reason;
          return result.value;
        });
        const tip = prop ? nodeNamed(prop, 'SmokeTip') : null;
        if (prop) {
          nodeNamed(prop, 'PORTABLE_SMOKE').visible = false;
          prop.position.set(-.168, -.277, .526);
        }
        const replacement = bite ? nodeNamed(bite, nodes.headMesh) : null;
        const palate = bite ? nodeNamed(bite, 'Preview bite repair | inset palatal lining') : null;
        const shelf = bite ? nodeNamed(bite, 'Preview bite repair | mirrored lower tooth shelf') : null;
        const shelfMaterial = shelf?.material;
        if (replacement && (
          !replacement.geometry || !replacement.position.equals(skull.position) ||
          JSON.stringify(replacement.morphTargetDictionary) !== JSON.stringify(skull.morphTargetDictionary)
        )) throw new Error('The repaired bite does not match this Ready rig.');

        return {
          commit() {
            signal.throwIfAborted();
            if (used) return;
            used = true;
            restore();
            if (glasses) runtime.head.add(glasses);
            if (prop && replacement && palate && shelf) {
              skull.geometry = replacement.geometry;
              shelf.material = lower ?? stock.jaw;
              runtime.head.add(prop, palate);
              runtime.jaw.add(shelf);
            }
            if (upper && lower) {
              skull.material = upper;
              jaw.material = lower;
            }
            runtime.smoke.retarget(tip ?? runtime.cigar);
            equipped = {
              release() {
                if (bite && palate && shelf) {
                  shelf.material = shelfMaterial;
                  bite.add(palate, shelf);
                }
                releaseResources();
              },
            };
          },
          discard() {
            if (used) return;
            used = true;
            releaseResources();
          },
        };
      } catch (error) {
        releaseResources();
        throw error;
      }
    },
  };
}
