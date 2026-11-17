export type Point = { x: number; y: number };
export type Bounds = { left: number; top: number; right: number; bottom: number };
export type Rect = Point & { width: number; height: number };
export type Side = "below" | "left" | "above" | "right";

const gap = 19;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, value));

export function placeSkull(area: Bounds, preferred: Point | null): Rect {
  const usableWidth = area.right - area.left;
  const usableHeight = area.bottom - area.top;
  const compact = usableWidth < 620;
  const width = Math.round(Math.min(compact ? 228 : 324, usableWidth * (compact ? .67 : .33),
    Math.max(115, usableHeight * (compact ? .48 : .72)), usableWidth, usableHeight));
  const height = Math.round(width * .94);
  const defaultX = area.right - width - (compact ? 7 : 18);
  // Reserve room below the default pose for the two-column phone menu.
  const reserveBelow = compact ? Math.min(342, usableHeight * .54) : Math.min(191, usableHeight * .39);
  const defaultY = area.bottom - height - reserveBelow;
  return { x: Math.round(clamp(preferred?.x ?? defaultX, area.left, area.right - width)),
    y: Math.round(clamp(preferred?.y ?? defaultY, area.top, area.bottom - height)), width, height };
}

export function placeCloud(
  area: Bounds,
  skull: Rect,
  cloudHeight: number,
  controls: readonly Rect[] = [],
  options: { width?: number; minWidth?: number; minHeight?: number } = {},
) {
  const maxWidth = Math.min(options.width ?? 344, area.right - area.left);
  const right = skull.x + skull.width;
  const bottom = skull.y + skull.height;
  const candidates = [
    { side: "below", width: maxWidth, height: area.bottom - bottom - gap },
    { side: "left", width: Math.min(maxWidth, skull.x - area.left - gap), height: area.bottom - area.top },
    { side: "above", width: maxWidth, height: skull.y - area.top - gap },
    { side: "right", width: Math.min(maxWidth, area.right - right - gap), height: area.bottom - area.top },
  ] as const;
  const targetHeight = Math.max(72, cloudHeight);
  // Use the actual reserved copy and choices when picking a side with room to reflow.
  const score = ({ side, width, height }: typeof candidates[number]) => {
    if (width < (options.minWidth ?? Math.min(180, maxWidth)) || height < (options.minHeight ?? 46)) {
      return -1000 + width * height / 100000;
    }
    const displayedHeight = Math.min(height, targetHeight);
    const { penalty } = cloudPosition(area, skull, side, width, displayedHeight, controls);
    const room = Math.min(1, height / targetHeight);
    const readability = room * (.76 + room * .36);
    return Math.min(1, width / maxWidth) * .24 + readability - penalty;
  };
  let best: (typeof candidates)[number] = candidates[0];
  let bestScore = score(best);
  for (const candidate of candidates.slice(1)) {
    const candidateScore = score(candidate);
    if (candidateScore <= bestScore + .015) continue;
    best = candidate;
    bestScore = candidateScore;
  }
  const width = Math.max(1, Math.floor(best.width));
  const maxHeight = Math.max(1, Math.floor(best.height));
  return { side: best.side, width, maxHeight };
}

function cloudPosition(area: Bounds, skull: Rect, side: Side, width: number, height: number, controls: readonly Rect[]) {
  const centeredX = skull.x + skull.width * .53 - width * .53;
  const centeredY = skull.y + skull.height * .68 - Math.min(55, height * .3);
  const anchor = {
    x: Math.round(clamp(side === "left" ? skull.x - width - gap : side === "right" ? skull.x + skull.width + gap : centeredX,
      area.left, area.right - width)),
    y: Math.round(clamp(side === "above" ? skull.y - height - gap : side === "below" ? skull.y + skull.height + gap : centeredY,
      area.top, area.bottom - height)),
  };
  const penalty = (point: Point) => {
    const obscured = controls.reduce((total, control) => {
      const overlapWidth = Math.max(0, Math.min(point.x + width, control.x + control.width) - Math.max(point.x, control.x));
      const overlapHeight = Math.max(0, Math.min(point.y + height, control.y + control.height) - Math.max(point.y, control.y));
      return total + overlapWidth * overlapHeight / (control.width * control.height);
    }, 0);
    const distance = Math.abs(point.x - anchor.x) + Math.abs(point.y - anchor.y);
    return Math.min(.58, obscured * .6) + Math.min(.15, distance / 650);
  };
  let best = anchor;
  let bestPenalty = penalty(anchor);
  if (bestPenalty === 0) return { point: best, penalty: bestPenalty };

  // Slide along the skull's side to clear nearby controls without moving or covering the mascot.
  const vertical = side === "left" || side === "right";
  const clearance = 8;
  for (const control of controls) {
    const offsets = vertical
      ? [control.y - height - clearance, control.y + control.height + clearance]
      : [control.x - width - clearance, control.x + control.width + clearance];
    for (const offset of offsets) {
      const point = vertical
        ? { x: anchor.x, y: Math.round(clamp(offset, area.top, area.bottom - height)) }
        : { x: Math.round(clamp(offset, area.left, area.right - width)), y: anchor.y };
      const candidatePenalty = penalty(point);
      if (candidatePenalty >= bestPenalty) continue;
      best = point;
      bestPenalty = candidatePenalty;
    }
  }
  return { point: best, penalty: bestPenalty };
}

export function cloudOrigin(area: Bounds, skull: Rect, side: Side, width: number, height: number, controls: readonly Rect[] = []): Point {
  return cloudPosition(area, skull, side, width, height, controls).point;
}

export function placeCompactCloud(area: Bounds, skull: Rect, cloudHeight: number, controls: readonly Rect[]) {
  const maxWidth = Math.min(370, area.right - area.left);
  const minWidth = Math.min(214, maxWidth);
  const minHeight = 72;
  const clearance = 8;
  const targetHeight = Math.max(minHeight, cloudHeight);
  const sides: Record<Side, Bounds> = {
    below: { ...area, top: skull.y + skull.height + gap },
    left: { ...area, right: skull.x - gap },
    above: { ...area, bottom: skull.y - gap },
    right: { ...area, left: skull.x + skull.width + gap },
  };
  let best: { side: Side; x: number; width: number; top: number; bottom: number } | undefined;
  let bestScore = -Infinity;

  for (const [side, space] of Object.entries(sides) as [Side, Bounds][]) {
    const availableWidth = Math.min(maxWidth, space.right - space.left);
    if (availableWidth < minWidth || space.bottom - space.top < minHeight) continue;
    const obstacles = controls.filter((control) =>
      control.x - clearance < space.right && control.x + control.width + clearance > space.left &&
      control.y - clearance < space.bottom && control.y + control.height + clearance > space.top,
    ).sort((a, b) => a.y - b.y);

    for (const width of new Set([Math.floor(availableWidth), Math.floor(minWidth)])) {
      const maxX = space.right - width;
      const anchor = cloudOrigin(area, skull, side, width, targetHeight);
      const xs = new Set([anchor.x, space.left, maxX]);
      for (const control of obstacles) {
        xs.add(control.x - clearance - width);
        xs.add(control.x + control.width + clearance);
      }

      for (const x of new Set(Array.from(xs, (value) => clamp(value, space.left, maxX)))) {
        // Each control crossing this column splits it into usable vertical bands.
        let top = space.top;
        const fit = (bottom: number) => {
          const capacity = bottom - top;
          if (capacity < minHeight) return;
          const height = Math.min(capacity, targetHeight);
          const preferredY = cloudOrigin(area, skull, side, width, height).y;
          const y = clamp(preferredY, top, bottom - height);
          const distance = Math.hypot(x - anchor.x, y - preferredY);
          const score = height + width * .26 - distance * .3;
          if (score <= bestScore) return;
          best = { side, width, x, top, bottom };
          bestScore = score;
        };
        for (const control of obstacles) {
          if (x + width <= control.x - clearance || x >= control.x + control.width + clearance) continue;
          fit(Math.min(space.bottom, control.y - clearance));
          top = Math.max(top, control.y + control.height + clearance);
        }
        fit(space.bottom);
      }
    }
  }

  return best;
}

export function placeContextMenu(
  area: Bounds,
  skull: Rect,
  button: Pick<Rect, "width" | "height">,
  spacing: number,
  avoid: readonly Rect[],
  pageControls: readonly Rect[] = [],
): (Rect & { direction: "row" | "column" }) | null {
  const clearance = 6;
  const obstacles = [skull, ...avoid];
  const nearby = [...obstacles, ...pageControls];
  const anchor = { x: skull.x + skull.width / 2, y: skull.y + skull.height * .39 };
  let best: (Rect & { direction: "row" | "column" }) | null = null;
  let bestCost = Infinity;

  const overlap = (a: Rect, b: Rect) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

  for (const direction of ["column", "row"] as const) {
    const width = direction === "row" ? button.width * 2 + spacing : button.width;
    const height = direction === "column" ? button.height * 2 + spacing : button.height;
    const maxX = area.right - width;
    const maxY = area.bottom - height;
    if (maxX < area.left || maxY < area.top) continue;

    // The closest clear positions are next to an obstacle edge or aligned with the face.
    const xs = new Set([area.left, maxX, clamp(anchor.x - width / 2, area.left, maxX)]);
    const ys = new Set([area.top, maxY, clamp(anchor.y - height / 2, area.top, maxY)]);
    for (const rect of nearby) {
      xs.add(clamp(rect.x - width - clearance, area.left, maxX));
      xs.add(clamp(rect.x + rect.width + clearance, area.left, maxX));
      ys.add(clamp(rect.y - height - clearance, area.top, maxY));
      ys.add(clamp(rect.y + rect.height + clearance, area.top, maxY));
    }

    for (const x of xs) {
      for (const y of ys) {
        const menu = { x, y, width, height, direction };
        if (obstacles.some((rect) => overlap(menu, rect) > 0)) continue;
        const dx = Math.max(0, skull.x - x - width, x - skull.x - skull.width);
        const dy = Math.max(0, skull.y - y - height, y - skull.y - skull.height);
        const alongside = x + width <= skull.x || x >= skull.x + skull.width;
        const offCenter = alongside ? Math.abs(y + height / 2 - anchor.y) : Math.abs(x + width / 2 - anchor.x);
        const alignment = (alongside ? direction === "row" : direction === "column") ? 8 : 0;
        const covered = pageControls.reduce((sum, rect) => sum + overlap(menu, rect), 0);
        const cost = Math.hypot(dx, dy) + offCenter * .26 + alignment + (alongside ? 0 : 8)
          + Math.min(110, covered / (width * height) * 135);
        if (cost < bestCost) {
          best = menu;
          bestCost = cost;
        }
      }
    }
  }
  return best;
}

export function cloudTip(bubble: Rect, side: Side, mouth: Point): Point {
  const edge = 14;
  return {
    x: side === "left" ? bubble.x + bubble.width : side === "right" ? bubble.x :
      clamp(mouth.x, bubble.x + edge, bubble.x + bubble.width - edge),
    y: side === "above" ? bubble.y + bubble.height : side === "below" ? bubble.y :
      clamp(mouth.y, bubble.y + edge, bubble.y + bubble.height - edge),
  };
}

export function thoughtTrail(skull: Rect, bubble: Rect, side: Side, mouth: Point): Point[] {
  const end = cloudTip(bubble, side, mouth);
  const dx = end.x - mouth.x;
  const dy = end.y - mouth.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 26) return [];

  const x = dx / distance;
  const y = dy / distance;
  const inset = Math.min(skull.width, skull.height) * .1;
  const faceEdgeX = x < 0 ? skull.x + inset : skull.x + skull.width - inset;
  const faceEdgeY = y < 0 ? skull.y + inset : skull.y + skull.height - inset;
  const edge = Math.max(0, Math.min(x ? (faceEdgeX - mouth.x) / x : Infinity,
    y ? (faceEdgeY - mouth.y) / y : Infinity));

  // Let the first bead slip behind the face, then leave a little air before the cloud.
  const last = Math.min(distance - 8, edge + 37);
  const first = Math.max(7, Math.min(edge - 3, last - 26));
  return [0, .48, 1].map((progress) => {
    const along = first + (last - first) * progress;
    const curve = Math.sin(progress * Math.PI) * 4;
    return { x: mouth.x + x * along - y * curve, y: mouth.y + y * along + x * curve };
  });
}
