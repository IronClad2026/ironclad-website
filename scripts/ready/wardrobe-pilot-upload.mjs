import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  STAGING_SUPABASE_REF,
  assertClerkDevelopmentInstance,
  loadFixtureEnvironment,
  validateRuntimeGuards,
} from "../lib/staging-synthetic-uat.mjs";

const bucketName = "ready-wardrobe-pilot";
const files = {
  eyewear_smoked_aviators: ["wearable.glb"],
  mouth_cigarette: ["wearable.glb", "repaired-bite.glb"],
  face_clown_makeup: ["upper-basecolor.png", "lower-basecolor.png"],
};
const previews = ["standalone.webp", "fitted.webp", "standalone-blur.webp", "fitted-blur.webp"];
const paths = Object.entries(files).flatMap(([item, runtime]) =>
  [...runtime, ...previews].map(file => `${item}/${file}`));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const contentType = file => file.endsWith(".webp") ? "image/webp"
  : file.endsWith(".png") ? "image/png" : "model/gltf-binary";

async function main() {
  const [assetDirectory, environmentDirectory, approval] = process.argv.slice(2);
  assert.equal(approval, "--verified-staging");
  const root = resolve(assetDirectory);
  const drive = /^[A-Z](?=:\\)/i.exec(root)?.[0];
  assert(drive, "The runtime asset directory must be on HDD 1T.");
  const volume = execFileSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    `(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${drive}:'").VolumeName`,
  ], { encoding: "utf8" }).trim();
  assert.equal(volume, "HDD 1T");
  const manifest = JSON.parse(await readFile(resolve(root, "Runtime_Assets.json"), "utf8"));
  const entries = new Map(manifest.assets.map(asset => [asset.path, asset]));
  assert.equal(entries.size, paths.length);

  const env = await loadFixtureEnvironment({ rootDir: environmentDirectory, processEnv: {} });
  const config = validateRuntimeGuards(env, "TestAcademy2");
  assert.equal(config.supabaseUrl, `https://${STAGING_SUPABASE_REF}.supabase.co`);
  await assertClerkDevelopmentInstance(config);
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = await client.storage.getBucket(bucketName);
  assert(!bucket.error && bucket.data?.id === bucketName && bucket.data.public === false, "Expected the private Staging pilot bucket.");
  const storage = client.storage.from(bucketName);

  for (const file of paths) {
    const meta = entries.get(file);
    const bytes = await readFile(resolve(root, file));
    assert(meta && bytes.length === meta.size && sha256(bytes) === meta.sha256, `HDD digest mismatch for ${file}.`);
  }
  for (const file of paths) {
    const meta = entries.get(file);
    const path = `v1/${file}`;
    const bytes = await readFile(resolve(root, file));
    const uploaded = await storage.upload(path, bytes, {
      upsert: false, contentType: contentType(file), cacheControl: "0",
    });
    // A retry can reuse an object only if readback proves its exact bytes.
    const downloaded = await storage.download(path, {}, { cache: "no-store" });
    assert(!downloaded.error && downloaded.data, `Staging asset unavailable for ${file}.`);
    const hash = sha256(Buffer.from(await downloaded.data.arrayBuffer()));
    assert.equal(hash, meta.sha256, `Staging digest mismatch for ${file}.`);
    console.log(`${uploaded.error ? "Verified existing" : "Uploaded and verified"} ${path}`);
  }
}

await main().catch(error => {
  console.error(error instanceof Error ? error.message : "Wardrobe upload failed.");
  process.exitCode = 1;
});
