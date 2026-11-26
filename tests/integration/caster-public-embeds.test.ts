import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { casterFeaturedEmbedUrl, parseCasterFeaturedVideo } from "@/lib/caster/featured-video";

describe("caster public embeds", () => {
  it("only accepts supported provider identifiers and ignores supplied frame parameters", () => {
    expect(parseCasterFeaturedVideo("https://www.youtube.com.evil.test/watch?v=abcdefghijk")).toBeNull();
    expect(parseCasterFeaturedVideo("https://www.youtube.com@evil.test/watch?v=abcdefghijk")).toBeNull();
    expect(parseCasterFeaturedVideo("https://www.youtube.com/watch?v=nope")).toBeNull();
    expect(parseCasterFeaturedVideo("https://player.twitch.tv/?video=v42")).toBeNull();
    const video = parseCasterFeaturedVideo("https://www.twitch.tv/videos/42?parent=evil.test&autoplay=true")!;
    expect(video.watchUrl).toBe("https://www.twitch.tv/videos/42");
    expect(casterFeaturedEmbedUrl(video, "staging.example.test")).toBe("https://player.twitch.tv/?parent=staging.example.test&autoplay=false&video=v42");
    expect(casterFeaturedEmbedUrl(video, "evil.test&autoplay=true")).toBeNull();
    const clip = parseCasterFeaturedVideo("https://clips.twitch.tv/OfficialCaster-clip")!;
    expect(casterFeaturedEmbedUrl(clip, "staging.example.test")).toBe("https://clips.twitch.tv/embed?parent=staging.example.test&autoplay=false&clip=OfficialCaster-clip");
  });

  it("scopes the frame allowlist to public profiles while keeping the invitation and homepage policies", async () => {
    const [profile, invitation, home] = await Promise.all(["/casters/fixture", "/casters/invitation", "/"].map((path) =>
      unstable_getResponseFromNextConfig({ url: `https://example.test${path}`, nextConfig }),
    ));
    const header = "content-security-policy";
    expect(profile.headers.get(header)).toBe("frame-ancestors 'none'; base-uri 'self'; object-src 'none'; frame-src 'self' https://www.youtube-nocookie.com https://player.twitch.tv https://clips.twitch.tv");
    expect(invitation.headers.get(header)).toContain("default-src 'none'");
    expect(invitation.headers.get(header)).not.toContain("youtube-nocookie.com");
    expect(home.headers.get(header)).toBe("frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  });
});
