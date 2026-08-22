import { describe, expect, it } from "vitest";

import {
  loadWebPushConfig,
  WebPushConfigurationError,
} from "@/lib/web-push/config";

const PUBLIC_KEY = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.alloc(64, 0x11),
]).toString("base64url");
const PRIVATE_KEY = Buffer.alloc(32, 0x22).toString("base64url");

describe("Web Push configuration", () => {
  it("is disabled only when all three VAPID values are absent", () => {
    expect(loadWebPushConfig({})).toEqual({ mode: "disabled" });
    expect(
      loadWebPushConfig({
        WEB_PUSH_VAPID_PUBLIC_KEY: "",
        WEB_PUSH_VAPID_PRIVATE_KEY: "",
        WEB_PUSH_VAPID_SUBJECT: "",
      })
    ).toEqual({ mode: "disabled" });
  });

  it("loads an exact complete server-only configuration", () => {
    expect(
      loadWebPushConfig({
        WEB_PUSH_VAPID_PUBLIC_KEY: PUBLIC_KEY,
        WEB_PUSH_VAPID_PRIVATE_KEY: PRIVATE_KEY,
        WEB_PUSH_VAPID_SUBJECT: "mailto:operations@example.test",
      })
    ).toEqual({
      mode: "enabled",
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      subject: "mailto:operations@example.test",
    });
  });

  it.each([
    { WEB_PUSH_VAPID_PUBLIC_KEY: PUBLIC_KEY },
    {
      WEB_PUSH_VAPID_PUBLIC_KEY: PUBLIC_KEY,
      WEB_PUSH_VAPID_PRIVATE_KEY: PRIVATE_KEY,
    },
    {
      WEB_PUSH_VAPID_PUBLIC_KEY: ` ${PUBLIC_KEY}`,
      WEB_PUSH_VAPID_PRIVATE_KEY: PRIVATE_KEY,
      WEB_PUSH_VAPID_SUBJECT: "mailto:operations@example.test",
    },
    {
      WEB_PUSH_VAPID_PUBLIC_KEY: PUBLIC_KEY,
      WEB_PUSH_VAPID_PRIVATE_KEY: "invalid",
      WEB_PUSH_VAPID_SUBJECT: "mailto:operations@example.test",
    },
    {
      WEB_PUSH_VAPID_PUBLIC_KEY: PUBLIC_KEY,
      WEB_PUSH_VAPID_PRIVATE_KEY: PRIVATE_KEY,
      WEB_PUSH_VAPID_SUBJECT: "http://example.test",
    },
  ])("fails closed for partial or malformed VAPID configuration", (environment) => {
    expect(() => loadWebPushConfig(environment)).toThrow(
      WebPushConfigurationError
    );
  });
});
