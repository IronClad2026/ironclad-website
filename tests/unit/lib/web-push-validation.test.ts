import { describe, expect, it } from "vitest";

import {
  parseVapidPublicKey,
  parseWebPushEndpoint,
  parseWebPushSubscription,
} from "@/lib/web-push/validation";

const P256DH = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.alloc(64, 0x01),
]).toString("base64url");
const AUTH = Buffer.alloc(16, 0x02).toString("base64url");
const NOW = Date.UTC(2026, 7, 21, 0, 0, 0);

describe("Web Push input validation", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/capability",
    "https://updates.push.services.mozilla.com/wpush/v2/capability?key=value",
    "https://web.push.apple.com/QWERTY",
    "https://api.push.apple.com/alternate-capability",
    "https://db5p.notify.windows.com/w/?token=capability",
  ])("accepts an approved HTTPS Push service endpoint: %s", (endpoint) => {
    expect(parseWebPushEndpoint(endpoint)).toBe(endpoint);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/capability",
    "https://user@fcm.googleapis.com/fcm/send/capability",
    "https://fcm.googleapis.com:443/fcm/send/capability",
    "https://fcm.googleapis.com/fcm/send/capability#fragment",
    "https://push.fcm.googleapis.com/fcm/send/capability",
    "https://push.apple.com/capability",
    "https://region.web.push.apple.com/capability",
    "https://bad_label.push.apple.com/capability",
    "https://fcm.googleapis.com.example.test/fcm/send/capability",
    "https://notify.windows.com/w/capability",
    "https://region.db5p.notify.windows.com/w/capability",
    "https://bad_label.notify.windows.com/w/capability",
    "https://-bad.notify.windows.com/w/capability",
    "https://localhost/w/capability",
    "https://127.0.0.1/w/capability",
    "https://[::1]/w/capability",
    " https://fcm.googleapis.com/fcm/send/capability",
    "https://fcm.googleapis.com/fcm/send/capability\n",
    "not a URL",
  ])("rejects an unsafe or unapproved Push endpoint: %s", (endpoint) => {
    expect(parseWebPushEndpoint(endpoint)).toBeNull();
  });

  it("rejects an endpoint above the bounded storage length", () => {
    const endpoint = `https://fcm.googleapis.com/${"a".repeat(2_049)}`;
    expect(parseWebPushEndpoint(endpoint)).toBeNull();
  });

  it("canonicalizes the endpoint authority before persistence", () => {
    expect(
      parseWebPushEndpoint("https://FCM.GOOGLEAPIS.COM/fcm/send/capability")
    ).toBe("https://fcm.googleapis.com/fcm/send/capability");
  });

  it("normalizes a valid subscription into trusted storage arguments", () => {
    const expirationTime = NOW + 60_000;

    expect(
      parseWebPushSubscription(
        {
          endpoint: "https://web.push.apple.com/capability",
          expirationTime,
          keys: { p256dh: P256DH, auth: AUTH },
        },
        NOW
      )
    ).toEqual({
      endpoint: "https://web.push.apple.com/capability",
      expiresAt: new Date(expirationTime).toISOString(),
      p256dh: P256DH,
      auth: AUTH,
    });
  });

  it.each([undefined, null])(
    "maps a %s subscription expiration to null",
    (expirationTime) => {
      expect(
        parseWebPushSubscription(
          {
            endpoint: "https://fcm.googleapis.com/fcm/send/capability",
            expirationTime,
            keys: { p256dh: P256DH, auth: AUTH },
          },
          NOW
        )
      ).toMatchObject({ expiresAt: null });
    }
  );

  it.each([
    null,
    undefined,
    [],
    "subscription",
    42,
    {},
    { endpoint: "https://fcm.googleapis.com/capability", keys: null },
    {
      endpoint: "https://example.test/capability",
      keys: { p256dh: P256DH, auth: AUTH },
    },
    {
      endpoint: "https://fcm.googleapis.com/capability",
      keys: { p256dh: "invalid", auth: AUTH },
    },
    {
      endpoint: "https://fcm.googleapis.com/capability",
      keys: { p256dh: P256DH, auth: "invalid" },
    },
    {
      endpoint: "https://fcm.googleapis.com/capability",
      expirationTime: NOW,
      keys: { p256dh: P256DH, auth: AUTH },
    },
    {
      endpoint: "https://fcm.googleapis.com/capability",
      expirationTime: "never",
      keys: { p256dh: P256DH, auth: AUTH },
    },
  ])("rejects a malformed subscription shape", (input) => {
    expect(parseWebPushSubscription(input, NOW)).toBeNull();
  });

  it("requires canonical uncompressed P-256 public keys", () => {
    const wrongPoint = Buffer.alloc(65, 0x01).toString("base64url");
    const wrongLength = Buffer.alloc(64, 0x04).toString("base64url");

    expect(parseVapidPublicKey(P256DH)).toBe(P256DH);
    expect(parseVapidPublicKey(wrongPoint)).toBeNull();
    expect(parseVapidPublicKey(wrongLength)).toBeNull();
    expect(parseVapidPublicKey(`${P256DH}=`)).toBeNull();
  });
});
