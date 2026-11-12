import { readFileSync } from "node:fs";
import { imageOptimizerTransform } from "next/dist/server/image-optimizer/transform";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { MAX_AVATAR_UPLOAD_SIZE_BYTES } from "@/lib/avatar";

const SELECTED_NEXT_PATCH = "16.4.5";
const SELECTED_SHARP_PATCH = "0.35.5";
const MEBIBYTE_BYTES = 1024 * 1024;
const NEXT_REQUEST_LIMIT_BYTES = 4_400_000;
const VERCEL_FUNCTION_PAYLOAD_CEILING_BYTES = 4_500_000;

type PackageManifest = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  overrides: Record<string, Record<string, string>>;
};

type PackageLock = {
  packages: Record<
    string,
    {
      version?: string;
    }
  >;
};

type NextPackageManifest = {
  optionalDependencies: Record<string, string>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function maxLengthText(length: number) {
  // U+0800 occupies three UTF-8 bytes while counting as one JavaScript
  // character, conservatively exercising the profile validators' limits.
  return "\u0800".repeat(length);
}

function createMaximumValidProfileForm() {
  const formData = new FormData();
  formData.set("displayName", maxLengthText(80));
  formData.set("inGameName", maxLengthText(80));
  formData.set("discordUsername", maxLengthText(100));
  formData.set("country", maxLengthText(100));
  formData.set("region", maxLengthText(100));
  formData.set("timezone", maxLengthText(100));
  formData.set("bio", maxLengthText(500));

  const pngSignature = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const avatar = new File(
    [
      pngSignature,
      new Uint8Array(MAX_AVATAR_UPLOAD_SIZE_BYTES - pngSignature.length),
    ],
    `${"a".repeat(249)}.png`,
    { type: "image/png" }
  );
  formData.set("avatar", avatar);

  return formData;
}

describe("Phase 7 runtime security and Server Action payload contract", () => {
  it("pins the reviewed patched Next release and matching ESLint config", () => {
    const manifest = readJson<PackageManifest>("package.json");
    const lock = readJson<PackageLock>("package-lock.json");

    expect(manifest.dependencies.next).toBe(SELECTED_NEXT_PATCH);
    expect(manifest.devDependencies["eslint-config-next"]).toBe(
      SELECTED_NEXT_PATCH
    );
    expect(lock.packages["node_modules/next"]?.version).toBe(
      SELECTED_NEXT_PATCH
    );
    expect(lock.packages["node_modules/eslint-config-next"]?.version).toBe(
      SELECTED_NEXT_PATCH
    );
  });

  it("replaces Next's optional Sharp runtime with one exact patched release", () => {
    const manifest = readJson<PackageManifest>("package.json");
    const lock = readJson<PackageLock>("package-lock.json");
    const sharpPackages = Object.entries(lock.packages)
      .filter(
        ([path]) =>
          path === "node_modules/sharp" || path.endsWith("/node_modules/sharp")
      )
      .map(([path, dependency]) => ({ path, version: dependency.version }));

    expect(manifest.overrides[`next@${SELECTED_NEXT_PATCH}`]?.sharp).toBe(
      SELECTED_SHARP_PATCH
    );
    expect(sharpPackages).toEqual([
      { path: "node_modules/sharp", version: SELECTED_SHARP_PATCH },
    ]);
  });

  it("uses patched libheif and librsvg with Next's compatible Sharp runtime", () => {
    const nextManifest = readJson<NextPackageManifest>(
      "node_modules/next/package.json"
    );
    expect(nextManifest.optionalDependencies.sharp).toBe(`^${SELECTED_SHARP_PATCH}`);
    expect(sharp.versions.sharp).toBe(SELECTED_SHARP_PATCH);
    // This Next release uses the patched decoders instead of the old temporary AVIF bypass.
    expect(sharp.versions.heif).toBe("1.23.5");
    expect(sharp.versions.rsvg).toBe("2.63.2");
  });

  it("rejects an SVG with a misleading AVIF marker before decoding", async () => {
    const buffer = Buffer.from('<!--ftypavif--><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    const images = { minimumCacheTTL: 60, ...nextConfig.images };
    expect(images.dangerouslyAllowSVG).not.toBe(true);

    await expect(imageOptimizerTransform(
      { buffer, contentType: "image/avif", cacheControl: null, etag: "test-svg" },
      { href: "/test-avatar.avif", width: 64, quality: 75, mimeType: "image/webp" },
      { experimental: {}, images: { minimumCacheTTL: images.minimumCacheTTL, dangerouslyAllowSVG: false } },
    )).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("image type is not allowed") });
  });

  it("keeps the application avatar boundary at exactly 4 MiB", () => {
    expect(MAX_AVATAR_UPLOAD_SIZE_BYTES).toBe(4 * MEBIBYTE_BYTES);
  });

  it("fits a measured maximum valid avatar FormData request below both Next request limits", async () => {
    const serverActionBodySizeLimit =
      nextConfig.experimental?.serverActions?.bodySizeLimit;
    const proxyClientMaxBodySize =
      nextConfig.experimental?.proxyClientMaxBodySize;
    const request = new Request("http://localhost/profile", {
      method: "POST",
      body: createMaximumValidProfileForm(),
    });
    const encodedBytes = (await request.arrayBuffer()).byteLength;
    const headroomBytes = NEXT_REQUEST_LIMIT_BYTES - encodedBytes;

    expect(serverActionBodySizeLimit).toBe(NEXT_REQUEST_LIMIT_BYTES);
    expect(proxyClientMaxBodySize).toBe(NEXT_REQUEST_LIMIT_BYTES);
    expect(serverActionBodySizeLimit).toBeLessThan(
      VERCEL_FUNCTION_PAYLOAD_CEILING_BYTES
    );
    expect(proxyClientMaxBodySize).toBeLessThan(
      VERCEL_FUNCTION_PAYLOAD_CEILING_BYTES
    );
    expect(serverActionBodySizeLimit).not.toBe("22mb");
    expect(serverActionBodySizeLimit).not.toBe("11mb");
    expect(encodedBytes).toBeGreaterThan(MAX_AVATAR_UPLOAD_SIZE_BYTES);
    expect(encodedBytes).toBeLessThan(NEXT_REQUEST_LIMIT_BYTES);
    expect(headroomBytes).toBeGreaterThan(190_000);
  });
});
