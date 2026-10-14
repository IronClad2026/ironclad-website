// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NewsImage from "@/components/news/NewsImage";
import NewsListing from "@/components/news/NewsListing";
import LatestNews from "@/components/news/LatestNews";
import english from "@/lib/i18n/dictionaries/en/public";
import italian from "@/lib/i18n/dictionaries/it/public";
import type { OfficialNewsFeed } from "@/lib/news/types";

const feed: OfficialNewsFeed = {
  fetchedAt: "2026-09-20T00:00:00.000Z",
  sourceLanguage: "en",
  articles: ["Newest hotfix", "Second official article", "Third announcement"].map((title, index) => ({
    id: String(index), source: "relic-steam", externalId: String(index), title,
    publishedAt: `2026-09-${19 - index}T00:00:00.000Z`,
    url: `https://steamcommunity.com/games/1677280/announcements/detail/${index + 100}`,
    excerpt: "English source content remains English.", imageUrl: null, category: "announcement",
  })),
};

afterEach(cleanup);

describe("official news presentation", () => {
  it("attributes and links each article directly to Steam with escaped text", () => {
    const malicious = { ...feed, articles: [{ ...feed.articles[0], excerpt: "<script>bad()</script> & text" }] };
    const { container } = render(<NewsListing feed={malicious} copy={english.news} locale="en" />);
    expect(screen.getByText(english.news.sourceLabel)).toBeInTheDocument();
    expect(screen.getByText("<script>bad()</script> & text")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    const articleLink = screen.getByRole("link", { name: /Read official announcement/ });
    expect(articleLink).toHaveAttribute("href", feed.articles[0].url);
    expect(articleLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(articleLink).toHaveAttribute("target", "_blank");
  });

  it("uses translated chrome while marking official title and excerpt as English", () => {
    render(<NewsListing feed={feed} copy={italian.news} locale="it" />);
    expect(screen.getByRole("heading", { name: feed.articles[0].title })).toHaveAttribute("lang", "en");
    expect(screen.getAllByText(feed.articles[0].excerpt)[0]).toHaveAttribute("lang", "en");
    expect(screen.getAllByText(italian.news.sourceLabel)).toHaveLength(3);
    expect(screen.getByText(italian.news.disclaimer)).toBeInTheDocument();
  });

  it("shows unavailable copy and a source link without a usable feed", () => {
    render(<NewsListing feed={null} copy={english.news} locale="en" />);
    expect(screen.getByRole("heading", { name: english.news.unavailableTitle })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(english.news.moreOnSteam) })).toHaveAttribute("href", "https://steamcommunity.com/games/1677280/announcements/");
  });

  it("distinguishes a successful empty feed from unavailable source", () => {
    render(<NewsListing feed={{ ...feed, articles: [] }} copy={english.news} locale="en" />);
    expect(screen.getByRole("heading", { name: english.news.emptyTitle })).toBeInTheDocument();
    expect(screen.queryByText(english.news.unavailableTitle)).not.toBeInTheDocument();
  });

  it("shows only two newest homepage entries and a link to the listing", () => {
    render(<LatestNews feed={feed} copy={english.news} locale="en" />);
    expect(screen.getByRole("heading", { name: feed.articles[0].title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: feed.articles[1].title })).toBeInTheDocument();
    expect(screen.queryByText(feed.articles[2].title)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: english.news.viewAll })).toHaveAttribute("href", "/news");
  });

  it.each([null, { ...feed, articles: [] }])("omits the optional teaser without articles", (value) => {
    const { container } = render(<LatestNews feed={value} copy={english.news} locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the fallback for missing or failed images, and can render a new source", () => {
    const source = "https://clan.fastly.steamstatic.com/images/40883127/" + "a".repeat(40) + ".jpg";
    const { container, rerender } = render(<NewsImage src={null} fallbackLabel={english.news.fallbackLabel} />);
    expect(screen.getByRole("img", { name: english.news.fallbackLabel })).toBeInTheDocument();
    rerender(<NewsImage src={source} fallbackLabel={english.news.fallbackLabel} />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(img).toHaveAttribute("alt", "");
    expect(img.getAttribute("src")).toBe(source);
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: english.news.fallbackLabel })).toBeInTheDocument();
    rerender(<NewsImage src={source.replace(".jpg", ".png")} fallbackLabel={english.news.fallbackLabel} />);
    expect(container.querySelector("img")).not.toBeNull();
  });
});
