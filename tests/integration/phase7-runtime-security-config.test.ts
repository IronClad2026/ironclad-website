import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { MAX_AVATAR_UPLOAD_SIZE_BYTES } from "@/lib/avatar";

const SELECTED_NEXT_PATCH = "16.2.12";
const SELECTED_SHARP_PATCH = "0.35.3";
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
  it("pins the newest stable patched Next 16.2.x release and matching ESLint config", () => {
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

    expect(manifest.overrides["next@16.2.12"]?.sharp).toBe(
      SELECTED_SHARP_PATCH
    );
    expect(sharpPackages).toEqual([
      { path: "node_modules/sharp", version: SELECTED_SHARP_PATCH },
    ]);
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
