import { normalizeAnnouncementHref } from "@/lib/announcement-document";

export type CasterFeaturedVideo = {
  kind: "youtube" | "twitch-video" | "twitch-clip";
  id: string;
  watchUrl: string;
};

export function parseCasterHttpsUrl(value: unknown): URL | null {
  const normalized = normalizeAnnouncementHref(value);
  if (!normalized?.startsWith("https://")) return null;
  const url = new URL(normalized);
  return url.port || !url.hostname.includes(".") || url.hostname.endsWith(".local") ? null : url;
}

export function parseCasterFeaturedVideo(value: unknown): CasterFeaturedVideo | null {
  const url = parseCasterHttpsUrl(value);
  if (!url) return null;

  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname)) {
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1)
      : url.pathname === "/watch" ? url.searchParams.get("v")
      : /^\/(?:shorts|live|embed)\/([^/]+)$/.exec(url.pathname)?.[1];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? { kind: "youtube", id, watchUrl: `https://www.youtube.com/watch?v=${id}` }
      : null;
  }

  if (["twitch.tv", "www.twitch.tv", "m.twitch.tv"].includes(url.hostname)) {
    const id = /^\/videos\/(\d{1,24})$/.exec(url.pathname)?.[1];
    return id ? { kind: "twitch-video", id, watchUrl: `https://www.twitch.tv/videos/${id}` } : null;
  }

  const id = /^\/([A-Za-z0-9_-]{1,120})$/.exec(url.pathname)?.[1];
  return url.hostname === "clips.twitch.tv" && id
    ? { kind: "twitch-clip", id, watchUrl: `https://clips.twitch.tv/${id}` }
    : null;
}

export function casterFeaturedEmbedUrl(video: CasterFeaturedVideo, parent: string): string | null {
  if (video.kind === "youtube") return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}`;

  // Twitch accepts a bare domain as the parent. It comes from the current page,
  // never from a caster's supplied URL or its query parameters.
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(parent)) return null;
  const query = new URLSearchParams({ parent, autoplay: "false" });
  if (video.kind === "twitch-video") {
    query.set("video", `v${video.id}`);
    return `https://player.twitch.tv/?${query}`;
  }
  query.set("clip", video.id);
  return `https://clips.twitch.tv/embed?${query}`;
}
