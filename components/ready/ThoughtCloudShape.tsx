"use client";

import { useId, useLayoutEffect, useRef } from "react";

type Variant = "main" | "answer";

// Keep the crown and the lower lobes shallow as lines wrap. The side curves absorb extra height.
function cloudContour(width: number, height: number, variant: Variant): string {
  const x = (fraction: number) => (1 + (width - 2) * fraction).toFixed(1);
  const top = Math.min(variant === "main" ? 19 : 13, (height - 2) * .22);
  const bottom = height - 1;
  const upper = (offset: number) => (1 + offset * top).toFixed(1);
  const lower = (offset: number) => (bottom - offset * top).toFixed(1);

  if (variant === "answer") {
    return `M ${x(.065)} ${upper(1.6)}
      C ${x(.031)} ${upper(1.33)} ${x(.062)} ${upper(.56)} ${x(.148)} ${upper(.59)}
      C ${x(.162)} ${upper(.06)} ${x(.302)} ${upper(-.01)} ${x(.352)} ${upper(.38)}
      C ${x(.41)} ${upper(-.11)} ${x(.585)} ${upper(-.05)} ${x(.653)} ${upper(.46)}
      C ${x(.713)} ${upper(.14)} ${x(.849)} ${upper(.35)} ${x(.856)} ${upper(.96)}
      C ${x(.968)} ${upper(.87)} ${x(.995)} ${upper(1.58)} ${x(.968)} ${upper(2)}
      C ${x(.997)} ${lower(1.52)} ${x(.972)} ${lower(.79)} ${x(.889)} ${lower(.76)}
      C ${x(.862)} ${lower(.15)} ${x(.731)} ${lower(.01)} ${x(.681)} ${lower(.36)}
      C ${x(.599)} ${lower(-.03)} ${x(.477)} ${lower(-.06)} ${x(.407)} ${lower(.33)}
      C ${x(.318)} ${lower(.02)} ${x(.204)} ${lower(.11)} ${x(.169)} ${lower(.67)}
      C ${x(.067)} ${lower(.58)} ${x(.024)} ${lower(1.18)} ${x(.049)} ${lower(1.71)}
      C ${x(-.005)} ${lower(2.13)} ${x(.009)} ${upper(2.02)} ${x(.065)} ${upper(1.6)} Z`;
  }

  return `M ${x(.048)} ${upper(1.58)}
    C ${x(.019)} ${upper(1.27)} ${x(.046)} ${upper(.63)} ${x(.125)} ${upper(.7)}
    C ${x(.136)} ${upper(.12)} ${x(.246)} ${upper(-.08)} ${x(.31)} ${upper(.4)}
    C ${x(.366)} ${upper(-.09)} ${x(.478)} ${upper(-.13)} ${x(.536)} ${upper(.34)}
    C ${x(.587)} ${upper(.035)} ${x(.677)} ${upper(.133)} ${x(.711)} ${upper(.58)}
    C ${x(.777)} ${upper(.245)} ${x(.862)} ${upper(.485)} ${x(.884)} ${upper(.97)}
    C ${x(.939)} ${upper(.87)} ${x(.984)} ${upper(1.2)} ${x(.985)} ${upper(1.82)}
    C ${x(1.003)} ${lower(1.78)} ${x(.995)} ${lower(1.1)} ${x(.95)} ${lower(.98)}
    C ${x(.922)} ${lower(.24)} ${x(.849)} ${lower(.08)} ${x(.791)} ${lower(.36)}
    C ${x(.747)} ${lower(-.025)} ${x(.659)} ${lower(-.035)} ${x(.605)} ${lower(.29)}
    C ${x(.551)} ${lower(-.04)} ${x(.449)} ${lower(-.07)} ${x(.4)} ${lower(.4)}
    C ${x(.345)} ${lower(.12)} ${x(.247)} ${lower(.08)} ${x(.207)} ${lower(.61)}
    C ${x(.138)} ${lower(.428)} ${x(.075)} ${lower(.76)} ${x(.068)} ${lower(1.26)}
    C ${x(.023)} ${lower(1.27)} ${x(-.001)} ${lower(1.72)} ${x(.019)} ${lower(2.2)}
    C ${x(.002)} ${lower(2.53)} ${x(.001)} ${upper(2.03)} ${x(.048)} ${upper(1.58)} Z`;
}

export default function ThoughtCloudShape({ variant }: { variant: Variant }) {
  const gradientId = useId();
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const [width, height] = variant === "main" ? [300, 100] : [142, 56];

  useLayoutEffect(() => {
    const decorative = svg.current;
    const outline = path.current;
    const host = decorative?.parentElement;
    if (!host || !decorative || !outline) return;
    let measuredWidth = 0;
    let measuredHeight = 0;

    const updateSize = () => {
      const { clientWidth, clientHeight } = host;
      if (clientWidth < 5 || clientHeight < 5 ||
        (clientWidth === measuredWidth && clientHeight === measuredHeight)) return;
      measuredWidth = clientWidth;
      measuredHeight = clientHeight;
      decorative.setAttribute("viewBox", `0 0 ${clientWidth} ${clientHeight}`);
      outline.setAttribute("d", cloudContour(clientWidth, clientHeight, variant));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, [variant]);

  return <svg aria-hidden="true" data-thought-cloud-shape={variant} focusable="false" preserveAspectRatio="none"
    ref={svg} viewBox={`0 0 ${width} ${height}`}>
    <defs>
      <linearGradient id={gradientId} x1="18%" y1="0%" x2="76%" y2="100%">
        <stop stopColor="var(--cloud-top)" />
        <stop offset="100%" stopColor="var(--cloud-bottom)" />
      </linearGradient>
    </defs>
    <path ref={path} data-cloud-contour={variant} d={cloudContour(width, height, variant)}
      fill={`url(#${gradientId})`} vectorEffect="non-scaling-stroke" />
  </svg>;
}
