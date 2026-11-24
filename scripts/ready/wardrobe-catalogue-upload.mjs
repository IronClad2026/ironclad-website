import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  STAGING_SUPABASE_REF,
  assertClerkDevelopmentInstance,
  loadFixtureEnvironment,
  validateRuntimeGuards,
} from "../lib/staging-synthetic-uat.mjs";

const bucketName = "ready-wardrobe-pilot";
const stagingOrigin = "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app";
const manifestDigest = "d650549dcee93129f5762bc056c96848cefe150f512c17ae6e739a2a81d576eb";
const newItems = [
  "face_swat_cheek_guard",
  "headwear_wwii_full_face_helmet",
  "helmet_trim_wwii_paratrooper_net",
  "headwear_tanker_beret",
  "eyewear_field_veteran_eyepatch",
  "eyewear_protruding_eyes",
  "eyewear_tanker_dust_goggles",
  "headwear_open_cranium",
  "mouth_diamond_grin",
  "helmet_trim_lucky_dog_tags",
  "helmet_trim_ace_of_spades_helmet_band",
  "headwear_australian_slouch_hat",
  "helmet_trim_dynamite_helmet_band",
  "mouth_sparking_dynamite_stick",
  "headwear_flip_up_welding_mask",
  "sergeant_majors_moustache",
  "tankers_crown",
];
const itemFiles = ["wearable.glb", "standalone.webp", "fitted.webp", "standalone-blur.webp", "fitted-blur.webp"];
const approvedPaths = [
  ...newItems.flatMap(item => itemFiles.map(file => `${item}/${file}`)),
  "headwear_tanker_beret/helmet-free-r5.glb",
  "headwear_open_cranium/cranium-r2-fitting.glb",
];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const contentType = file => file.endsWith(".webp") ? "image/webp" : "model/gltf-binary";

async function readApprovedBundle(directory) {
  const root = await realpath(directory);
  const drive = /^[A-Z](?=:\\)/i.exec(root)?.[0];
  assert(drive, "The runtime asset directory must be on HDD 1T.");
  const volume = execFileSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command", `([System.IO.DriveInfo]::new('${drive}')).VolumeLabel`,
  ], { encoding: "utf8" }).trim();
  assert.equal(volume, "HDD 1T", "The runtime asset volume must be HDD 1T.");
  const manifestBytes = await readFile(resolve(root, "Runtime_Assets.json"));
  assert.equal(sha256(manifestBytes), manifestDigest, "Unexpected runtime manifest digest.");
  const manifest = JSON.parse(manifestBytes);
  assert(manifest.version === 2 && manifest.storagePrefix === "v2", "Expected the v2 asset manifest.");
  const entries = new Map(manifest.assets.map(asset => [asset.path, asset]));
  assert(approvedPaths.length === 87 && manifest.assets.length === 87 && entries.size === 87,
    "The v2 manifest must contain 87 unique objects.");

  const verified = [];
  for (const file of approvedPaths) {
    const meta = entries.get(file);
    assert(meta, `Missing approved object: ${file}`);
    const target = await realpath(resolve(root, file));
    const child = relative(root, target);
    assert(child && !isAbsolute(child) && !child.startsWith(".."), `Asset left the bundle folder: ${file}`);
    const bytes = await readFile(target);
    assert(bytes.length === meta.size && sha256(bytes) === meta.sha256, `HDD digest mismatch: ${file}`);
    verified.push({ file, bytes });
  }
  return verified;
}

async function privateStagingStorage(environmentDirectory) {
  const env = await loadFixtureEnvironment({ rootDir: environmentDirectory, processEnv: {} });
  const config = validateRuntimeGuards(env, "TestAcademy2");
  assert.equal(config.supabaseUrl, `https://${STAGING_SUPABASE_REF}.supabase.co`);
  const protection = await fetch(stagingOrigin, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  await protection.body?.cancel();
  const location = protection.headers.get("location");
  const redirect = location ? new URL(location, stagingOrigin) : null;
  const redirectsToVercelSso = protection.status === 302 &&
    redirect?.origin === "https://vercel.com" && redirect.pathname === "/sso-api";
  assert((protection.status === 401 || redirectsToVercelSso) && protection.headers.has("x-vercel-id"),
    "Expected the protected Staging Vercel alias to require authentication.");
  await assertClerkDevelopmentInstance(config);

  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = await client.storage.getBucket(bucketName);
  assert(!bucket.error && bucket.data?.id === bucketName && bucket.data.public === false,
    "Expected the private Staging wardrobe bucket.");
  return client.storage.from(bucketName);
}

async function main() {
  const [assetDirectory, environmentDirectory, mode] = process.argv.slice(2);
  assert(assetDirectory && environmentDirectory && process.argv.length === 5 &&
    ["--verify-only", "--verified-staging"].includes(mode),
  "Usage: wardrobe-catalogue-upload.mjs <HDD bundle> <Staging environment> --verify-only|--verified-staging");
  const assets = await readApprovedBundle(assetDirectory);
  const storage = await privateStagingStorage(environmentDirectory);
  console.log(`Verified the protected Staging alias, development Clerk instance and private ${bucketName} bucket.`);

  let created = 0;
  let reused = 0;
  for (const { file, bytes } of assets) {
    const key = `v2/${file}`;
    const result = mode === "--verified-staging" ? await storage.upload(key, bytes, {
      upsert: false, contentType: contentType(file), cacheControl: "0",
    }) : null;
    const downloaded = await storage.download(key, {}, { cache: "no-store" });
    assert(!downloaded.error && downloaded.data, `Private Staging object unavailable: ${key}`);
    const readback = Buffer.from(await downloaded.data.arrayBuffer());
    assert(readback.equals(bytes), `Staging readback differs from the approved bytes: ${key}`);
    if (result && !result.error) created += 1;
    else reused += 1;
    console.log(`${result && !result.error ? "Created and verified" : "Verified existing"} ${key}`);
  }
  console.log(`Private Staging v2 complete. Created ${created}. Reused ${reused}. Verified ${created + reused} objects.`);
}

await main().catch(error => {
  console.error(error instanceof Error ? error.message : "Wardrobe catalogue upload failed.");
  process.exitCode = 1;
});
