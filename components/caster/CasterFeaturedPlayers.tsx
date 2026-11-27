"use client";

import { ArrowUpRight, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { casterFeaturedEmbedUrl, type CasterFeaturedVideo } from "@/lib/caster/featured-video";
import type { PublicCasterCopy } from "@/lib/caster/public-copy";

type Copy = Pick<PublicCasterCopy, "loadPlayer" | "hidePlayer" | "watch" | "playerLabel">;

export default function CasterFeaturedPlayers({ videos, copy }: { videos: CasterFeaturedVideo[]; copy: Copy }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {videos.map((video) => <VideoPlayerCard key={`${video.kind}-${video.id}`} video={video} copy={copy} />)}
    </ul>
  );
}

function VideoPlayerCard({ video, copy }: { video: CasterFeaturedVideo; copy: Copy }) {
  const playerArea = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ width: 0, parent: "" });
  const [requested, setRequested] = useState(false);
  const isYoutube = video.kind === "youtube";
  const provider = isYoutube ? "YouTube" : "Twitch";
  const embedUrl = casterFeaturedEmbedUrl(video, placement.parent);
  const canEmbed = Boolean(embedUrl) && placement.width >= (isYoutube ? 200 : 400);

  useEffect(() => {
    const element = playerArea.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setPlacement({ width: entry.contentRect.width, parent: window.location.hostname }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const playerSource = canEmbed && requested ? embedUrl : null;
  return (
    <li className="min-w-0 border border-white/15 bg-zinc-950 p-4">
      <div ref={playerArea}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {canEmbed ? (
            <button
              type="button" aria-expanded={Boolean(playerSource)}
              onClick={() => setRequested((current) => !current)}
              className="inline-flex min-h-11 items-center gap-2 border border-white/15 bg-white/5 px-3 text-sm font-bold text-white hover:border-orange-400/50 focus-visible:outline-2 focus-visible:outline-orange-300"
            >
              <Play size={15} aria-hidden="true" />
              {playerSource ? copy.hidePlayer : copy.loadPlayer.replace("{provider}", provider)}
            </button>
          ) : null}
          <a href={video.watchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-300 underline focus-visible:outline-2 focus-visible:outline-orange-300">
            {copy.watch.replace("{provider}", provider)}<ArrowUpRight size={15} aria-hidden="true" className="shrink-0" />
          </a>
        </div>
        {playerSource ? (
          <iframe
            title={copy.playerLabel.replace("{provider}", provider)} src={playerSource}
            loading="lazy" allowFullScreen allow="encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            className={`mt-3 aspect-video w-full border-0 bg-black ${isYoutube ? "min-h-[200px]" : "min-h-[300px]"}`}
          />
        ) : null}
      </div>
    </li>
  );
}
