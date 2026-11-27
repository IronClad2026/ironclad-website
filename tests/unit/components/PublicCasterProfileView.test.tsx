// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicCasterProfileView from "@/components/caster/PublicCasterProfileView";
import { getPublicCasterCopy } from "@/lib/caster/public-copy";
import type { PublicCasterProfile } from "@/lib/caster/publication";

const copy = getPublicCasterCopy("en");
const profile: PublicCasterProfile = {
  slug: "fixture-caster", publication_id: "30000000-0000-4000-8000-000000000001", display_name: "Fixture Caster",
  avatar: "10000000-0000-4000-8000-000000000001", banner: null, languages: ["English"], games: ["Company of Heroes 3"],
  platforms: ["youtube"], country: null, experience: "Commentary and analysis.",
  links: [{ label: "Caster’s channel", url: "https://www.youtube.com/@fixture-caster" }],
  bio: { version: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Live commentary 🎙️" }] }] } },
  gallery: ["20000000-0000-4000-8000-000000000001"],
  videos: ["https://www.youtube.com/watch?v=abcdefghijk"],
};

class ViewerSize {
  constructor(private report: (items: { contentRect: { width: number } }[]) => void) {}
  observe() { this.report([{ contentRect: { width: 350 } }]); }
  disconnect() {}
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public caster profile", () => {
  it("renders only the public projection and uses revision-scoped gallery links", () => {
    const extra = { ...profile, email: "private@example.test", discord: "private-contact", feedback: "moderation notes" };
    render(<PublicCasterProfileView caster={extra} copy={copy} locale="en" />);
    expect(screen.getByRole("heading", { name: "Fixture Caster" })).toBeVisible();
    expect(screen.getByText("Live commentary 🎙️")).toBeVisible();
    expect(screen.queryByText(/private@|private-contact|moderation notes|Country/)).toBeNull();
    expect(screen.getByRole("link", { name: "Caster’s channel" })).toHaveAttribute("href", "https://www.youtube.com/@fixture-caster");
    expect(screen.getByRole("link", { name: "Gallery image 1" })).toHaveAttribute("href", `/api/caster/public-media/${profile.slug}/${profile.publication_id}/${profile.gallery[0]}`);
  });

  it("shows an explicitly published country and collapses absent optional sections", () => {
    render(<PublicCasterProfileView caster={{ ...profile, country: "AU", experience: "", gallery: [], links: [], videos: [] }} copy={copy} locale="en" />);
    expect(screen.getByText("Australia")).toBeVisible();
    for (const heading of [copy.featured, copy.gallery, copy.links, copy.experience]) {
      expect(screen.queryByRole("heading", { name: heading })).toBeNull();
    }
  });

  it("only loads an opted-in provider player and retains a watch link for mobile Twitch", () => {
    vi.stubGlobal("ResizeObserver", ViewerSize);
    render(<PublicCasterProfileView caster={{ ...profile, videos: [...profile.videos, "https://www.twitch.tv/videos/1234"] }} copy={copy} locale="en" />);
    expect(screen.queryByTitle("YouTube player")).toBeNull();
    expect(screen.getByRole("link", { name: "Watch on Twitch" })).toHaveAttribute("href", "https://www.twitch.tv/videos/1234");
    expect(screen.queryByRole("button", { name: "Load Twitch player" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load YouTube player" }));
    expect(screen.getByTitle("YouTube player")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abcdefghijk");
    fireEvent.click(screen.getByRole("button", { name: "Hide player" }));
    expect(screen.queryByTitle("YouTube player")).toBeNull();
  });
});
