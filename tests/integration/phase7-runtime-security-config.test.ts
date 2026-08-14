import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { MAX_AVATAR_UPLOAD_SIZE_BYTES } from "@/lib/avatar";

const SELECTED_NEXT_PATCH = "16.2.12";
const MEBIBYTE_BYTES = 1024 * 1024;

type PackageManifest = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
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

function parseConfiguredMebibytes(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("Server Action body size must use an explicit mb value.");
  }

  const match = /^(\d+)mb$/.exec(value);

  if (!match) {
    throw new TypeError("Server Action body size must use an explicit mb value.");
  }

  return Number(match[1]) * MEBIBYTE_BYTES;
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

  it("keeps the application avatar boundary at exactly 10 MiB", () => {
    expect(MAX_AVATAR_UPLOAD_SIZE_BYTES).toBe(10 * MEBIBYTE_BYTES);
  });

  it("fits a measured maximum valid avatar FormData request below the 11 MiB action limit", async () => {
    const bodySizeLimit =
      nextConfig.experimental?.serverActions?.bodySizeLimit;
    const configuredBytes = parseConfiguredMebibytes(bodySizeLimit);
    const request = new Request("http://localhost/profile", {
      method: "POST",
      body: createMaximumValidProfileForm(),
    });
    const encodedBytes = (await request.arrayBuffer()).byteLength;

    expect(bodySizeLimit).toBe("11mb");
    expect(bodySizeLimit).not.toBe("22mb");
    expect(encodedBytes).toBeGreaterThan(MAX_AVATAR_UPLOAD_SIZE_BYTES);
    expect(encodedBytes).toBeLessThan(configuredBytes);
    expect(configuredBytes - encodedBytes).toBeGreaterThan(1_000_000);
  });
});
