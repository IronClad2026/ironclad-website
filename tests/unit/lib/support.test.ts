import { describe, expect, it } from "vitest";
import { OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL } from "@/lib/support";

describe("official Discord Support channel", () => {
  it("uses the exact Owner-approved direct channel URL", () => {
    expect(OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL).toBe(
      "https://discord.com/channels/1440092095619662105/1440201093110960137"
    );

    const url = new URL(OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("discord.com");
    expect(url.pathname).toMatch(/^\/channels\/\d+\/\d+$/);
  });
});
