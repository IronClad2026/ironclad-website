import "server-only";

import type { WardrobeItemId } from "./catalogue";

export const wardrobeBucket = "ready-wardrobe-pilot";
const previewFiles = ["standalone.webp", "fitted.webp", "standalone-blur.webp", "fitted-blur.webp"];
const runtimeFiles: Record<WardrobeItemId, readonly string[]> = {
  eyewear_smoked_aviators: ["wearable.glb"],
  mouth_cigarette: ["wearable.glb", "repaired-bite.glb"],
  face_clown_makeup: ["upper-basecolor.png", "lower-basecolor.png"],
};

export function getWardrobeAsset(item: WardrobeItemId, name: string) {
  if (!previewFiles.includes(name) && !runtimeFiles[item].includes(name)) return null;
  return {
    path: `v1/${item}/${name}`,
    isPublicTeaser: name === "standalone-blur.webp" || name === "fitted-blur.webp",
    contentType: name.endsWith(".webp") ? "image/webp" : name.endsWith(".png") ? "image/png" : "model/gltf-binary",
  };
}
