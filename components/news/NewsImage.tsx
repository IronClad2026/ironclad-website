"use client";

import Image from "next/image";
import { Radio } from "lucide-react";
import { useState } from "react";

export default function NewsImage({ src, fallbackLabel }: {
  src: string | null;
  fallbackLabel: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showImage = src !== null && failedSource !== src;
  return (
    <div className="relative aspect-video w-full overflow-hidden border-b border-white/10 bg-zinc-950" data-news-image>
      {showImage ? (
        <Image src={src} alt="" fill unoptimized loading="lazy" referrerPolicy="no-referrer" sizes="(min-width: 1024px) 520px, (min-width: 768px) 45vw, 90vw" className="object-contain" onError={() => setFailedSource(src)} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,#151a1d,#090b0d)] p-3" role="img" aria-label={fallbackLabel} data-news-fallback>
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:28px_28px]" />
          <span aria-hidden="true" className="relative grid h-10 w-10 place-items-center border border-orange-400/25 bg-orange-400/[0.04] text-orange-300/70"><Radio size={20} /></span>
          <span aria-hidden="true" className="relative text-center text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">IronClad</span>
        </div>
      )}
    </div>
  );
}
