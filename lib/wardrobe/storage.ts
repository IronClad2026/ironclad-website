import "server-only";

import type { WardrobeItemId } from "./catalogue";

export const wardrobeBucket = "ready-wardrobe-pilot";
const previewFiles = ["standalone.webp", "fitted.webp", "standalone-blur.webp", "fitted-blur.webp"];
const pilotFiles: Partial<Record<WardrobeItemId, readonly string[]>> = {
  eyewear_smoked_aviators: ["wearable.glb"],
  mouth_cigarette: ["wearable.glb", "repaired-bite.glb"],
  face_clown_makeup: ["upper-basecolor.png", "lower-basecolor.png"],
};
const fittingFiles: Partial<Record<WardrobeItemId, string>> = {
  headwear_tanker_beret: "helmet-free-r5.glb",
  headwear_open_cranium: "cranium-r2-fitting.glb",
};

export function getWardrobeAsset(item: WardrobeItemId, name: string) {
  const original = pilotFiles[item];
  const runtimeFiles = original ?? ["wearable.glb", fittingFiles[item]];
  if (!previewFiles.includes(name) && !runtimeFiles.includes(name)) return null;
  return {
    path: `${original ? "v1" : "v2"}/${item}/${name}`,
    isPublicTeaser: name === "standalone-blur.webp" || name === "fitted-blur.webp",
    contentType: name.endsWith(".webp") ? "image/webp" : name.endsWith(".png") ? "image/png" : "model/gltf-binary",
  };
}
