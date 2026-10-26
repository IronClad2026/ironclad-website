import { timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { authorizePartnerApiRequest } from "@/lib/partner-api/auth";

vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return { ...crypto, timingSafeEqual: vi.fn(crypto.timingSafeEqual) };
});

const token = "A".repeat(64);
const environment = { COH3STATS_API_TOKEN: token };
const request = (value: string | null) => ({
  headers: {
    get: (name: string) => (name === "x-api-token" ? value : null),
  } as Headers,
});

describe("named partner API token authorization", () => {
  it("returns only the configured partner identity for the exact token", () => {
    expect(authorizePartnerApiRequest(request(token), environment)).toEqual({
      id: "coh3stats",
    });
  });

  it("reads only the dedicated server token at request time", () => {
    try {
      vi.stubEnv("COH3STATS_API_TOKEN", token);
      expect(authorizePartnerApiRequest(request(token))).toEqual({
        id: "coh3stats",
      });
      const replacement = "B".repeat(64);
      vi.stubEnv("COH3STATS_API_TOKEN", replacement);
      expect(authorizePartnerApiRequest(request(token))).toBeNull();
      expect(authorizePartnerApiRequest(request(replacement))).toEqual({
        id: "coh3stats",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([32, 256])(
    "accepts bounded visible ASCII tokens of length %s",
    (length) => {
      const value = "a".repeat(length);
      expect(
        authorizePartnerApiRequest(request(value), {
          COH3STATS_API_TOKEN: value,
        }),
      ).toEqual({ id: "coh3stats" });
    },
  );

  it("accepts visible ASCII punctuation without trimming or case folding", () => {
    const value = "Abcd0123!#$%&()*+-./:;<=>?@[]^_`{|}~";
    expect(
      authorizePartnerApiRequest(request(value), {
        COH3STATS_API_TOKEN: value,
      }),
    ).toEqual({ id: "coh3stats" });
    expect(
      authorizePartnerApiRequest(request(value.toLowerCase()), {
        COH3STATS_API_TOKEN: value,
      }),
    ).toBeNull();
  });

  it.each([
    undefined,
    "",
    " ",
    "x".repeat(31),
    "x".repeat(257),
    "x".repeat(32) + " ",
    "x".repeat(32) + ",",
    "x".repeat(32) + "é",
  ])(
    "fails closed for absent or malformed configuration",
    (configuredToken) => {
      expect(
        authorizePartnerApiRequest(request(token), {
          COH3STATS_API_TOKEN: configuredToken,
        }),
      ).toBeNull();
    },
  );

  it.each([
    null,
    "",
    "a".repeat(31),
    "a".repeat(257),
    " " + token,
    token + " ",
    token + "\t",
    token + "\n",
    token + "\u0000",
    token + "\u007f",
    token + "é",
    token + ",",
    token + ", " + token,
    "Bearer " + token,
    "wrong".repeat(13),
  ])(
    "rejects malformed or incorrect request credentials without details",
    (value) => {
      expect(
        authorizePartnerApiRequest(request(value), environment),
      ).toBeNull();
    },
  );

  it("uses only X-Api-Token and never falls back to bearer, query, cookies or Clerk", () => {
    const value = new Request(
      `https://example.test/api/partners/v1/tournaments?token=${token}`,
      {
        headers: { Authorization: `Bearer ${token}`, Cookie: `token=${token}` },
      },
    );
    expect(authorizePartnerApiRequest(value, environment)).toBeNull();
  });

  it("uses HTTP case-insensitive header lookup and rejects duplicate token headers", () => {
    const headers = new Headers({ "X-Api-Token": token });
    expect(authorizePartnerApiRequest({ headers }, environment)).toEqual({
      id: "coh3stats",
    });
    headers.append("X-Api-Token", token);
    expect(authorizePartnerApiRequest({ headers }, environment)).toBeNull();
  });

  it("compares fixed-length SHA-256 digests rather than raw credentials", () => {
    expect(authorizePartnerApiRequest(request(token), environment)).toEqual({
      id: "coh3stats",
    });
    const [expected, supplied] = vi.mocked(timingSafeEqual).mock.calls.at(-1)!;
    expect(expected.byteLength).toBe(32);
    expect(supplied.byteLength).toBe(32);
    expect(expected).not.toEqual(Buffer.from(token));
    expect(
      authorizePartnerApiRequest(request("different".repeat(8)), environment),
    ).toBeNull();
  });
});
