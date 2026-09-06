"use client";

import Image from "next/image";
import { ImageIcon, Maximize2 } from "lucide-react";
import { useState } from "react";
import ReferenceDialog from "@/components/ui/ReferenceDialog";

export default function TournamentArtwork({ src, title, viewLabel, closeLabel, prominent = false }: {
  src: string; title: string; viewLabel: string; closeLabel: string; prominent?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [unavailable, setUnavailable] = useState(!src);
  return (
    <>
      <div data-tournament-banner className="relative aspect-video max-h-[420px] min-w-0 self-start overflow-hidden bg-black">
        {unavailable ? (
          <div role="img" aria-label={title} className="absolute inset-0 grid place-items-center text-zinc-500"><ImageIcon size={32} aria-hidden="true" /></div>
        ) : (
          <Image src={src} alt={title} fill unoptimized sizes="(min-width: 1280px) 720px, (min-width: 768px) 50vw, 100vw" loading={prominent ? "eager" : "lazy"} className="object-contain" onError={() => setUnavailable(true)} />
        )}
      </div>
      {!unavailable ? <button type="button" onClick={() => setExpanded(true)} className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-white/10 bg-zinc-950 px-3 text-xs font-semibold text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-300"><Maximize2 size={14} aria-hidden="true" />{viewLabel}</button> : null}
      {expanded ? <ReferenceDialog title={title} closeLabel={closeLabel} onClose={() => setExpanded(false)}><div className="relative h-[min(65dvh,640px)]"><Image src={src} alt={title} fill unoptimized sizes="100vw" className="object-contain" /></div></ReferenceDialog> : null}
    </>
  );
}
