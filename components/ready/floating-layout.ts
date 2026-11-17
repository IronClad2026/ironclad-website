export type Point = { x: number; y: number };
export type Bounds = { left: number; top: number; right: number; bottom: number };
export type Rect = Point & { width: number; height: number };
export type Side = "below" | "left" | "above" | "right";
export type ReadyPosition = Point & { width?: number };
export type DialogueSlot = Point & { side: Side; width: number; maxHeight: number; oval: boolean };

type DialogueSize = { height: number; bubbleHeight: number; main: boolean };
type Placement = { skull: Rect; dialogue: DialogueSlot };
type Scored = { clear: boolean; score: number };

const gap = 16;
const controlClearance = 8;
const minCloudWidth = 210;
const ovalWidth = 540;
const minOvalHeight = 248;
const minCloudHeight = 96;
const alignmentRoom = 44;
const sides: readonly Side[] = ["below", "left", "above", "right"];
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, value));
const bottom = (rect: Rect) => rect.y + rect.height;
const right = (rect: Rect) => rect.x + rect.width;

function overlap(a: Rect, b: Rect) {
  return Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));
}

function keepSkullInside(area: Bounds, position: Point, width: number): Rect {
  const height = Math.round(width * .94);
  return {
    x: clamp(Math.round(position.x), Math.ceil(area.left), Math.floor(area.right - width)),
    y: clamp(Math.round(position.y), Math.ceil(area.top), Math.floor(area.bottom - height)),
    width, height,
  };
}

function placeSkull(area: Bounds, preferred: ReadyPosition | null): Rect {
  const usableWidth = area.right - area.left;
  const usableHeight = area.bottom - area.top;
  const compact = usableWidth < 620;
  const normalWidth = Math.round(Math.min(compact ? 228 : 324, usableWidth * (compact ? .67 : .33),
    Math.max(115, usableHeight * (compact ? .48 : .72)), usableWidth, usableHeight));
  const width = preferred?.width ? Math.min(normalWidth, preferred.width) : normalWidth;
  const reserveBelow = compact ? Math.min(342, usableHeight * .54) : Math.min(191, usableHeight * .39);
  return keepSkullInside(area, preferred ?? {
    x: area.right - width - (compact ? 7 : 18), y: area.bottom - width * .94 - reserveBelow,
  }, width);
}

function occupied(rect: Rect, controls: readonly Rect[]) {
  return controls.reduce((sum, control) => sum + overlap(rect, control) / (control.width * control.height), 0);
}

function improves(candidate: Scored, previous?: Scored) {
  return !previous || (candidate.clear !== previous.clear ? candidate.clear : candidate.score > previous.score);
}

function clearHeight(area: Bounds, controls: readonly Rect[], x: number, width: number, y: number, above: boolean) {
  let height = above ? y - area.top : area.bottom - y;
  for (const control of controls) {
    if (x >= right(control) + controlClearance || x + width <= control.x - controlClearance) continue;
    if (above && control.y - controlClearance < y) height = Math.min(height, y - bottom(control) - controlClearance);
    if (!above && bottom(control) + controlClearance > y) height = Math.min(height, control.y - controlClearance - y);
  }
  return Math.max(0, height);
}

function chooseDialogue(area: Bounds, skull: Rect, size: DialogueSize, controls: readonly Rect[], previous?: DialogueSlot) {
  const available = area.right - area.left;
  // Keep room for a stacked phone cloud to track the skull across the screen.
  const stackedWidth = available < 480 ? Math.max(minCloudWidth, available - 42) : available;
  const normalWidth = Math.floor(Math.min(370, available, stackedWidth));
  const compactWidth = Math.floor(Math.min(minCloudWidth, available));
  const allowOval = size.main && available >= 820 && area.bottom - area.top >= 420;
  let best: { slot: DialogueSlot } & Scored | undefined;

  for (const side of sides) {
    const beside = side === "left" || side === "right";
    const above = side === "above";
    const maxWidth = side === "left" ? skull.x - gap - area.left
      : side === "right" ? area.right - right(skull) - gap : available;
    const widths = [...new Set([normalWidth, compactWidth, ...(allowOval ? [ovalWidth] : [])])];
    for (const width of widths) {
      const oval = width === ovalWidth;
      const ovalEntering = oval && previous && !previous.oval;
      if (width + (ovalEntering ? 26 : 0) > maxWidth || width < 1) continue;
      if (beside && width === normalWidth && previous?.width === compactWidth && width !== compactWidth && maxWidth < width + 22) continue;
      const targetHeight = oval ? Math.max(size.height, minOvalHeight) : Math.max(minCloudHeight, size.height);
      const minimumHeight = oval ? minOvalHeight + (ovalEntering ? 24 : 0) : minCloudHeight;
      // Above the head, keep the message itself close even if its controls need scrolling.
      const limitAbove = oval ? minOvalHeight + 33 : clamp(size.bubbleHeight + 76, 125, 202);
      const idealX = side === "left" ? skull.x - gap - width : side === "right" ? right(skull) + gap
        : skull.x + (skull.width - width) * .5;
      const x = clamp(Math.round(idealX), Math.ceil(area.left), Math.floor(area.right - width));
      const startY = above ? skull.y - gap : side === "below" ? bottom(skull) + gap
        : clamp(skull.y + skull.height * .64 - (oval ? 110 : 45), area.top, area.bottom - minimumHeight);
      const minY = above ? startY - alignmentRoom
        : beside ? Math.max(area.top, startY - alignmentRoom, skull.y - (oval ? 120 : 36)) : startY;
      const maxY = above ? startY : beside
        ? Math.min(area.bottom, startY + alignmentRoom, bottom(skull) - (oval ? 110 : 45)) : startY + alignmentRoom;
      const ys = new Set([startY]);
      for (const control of controls) {
        if (x >= right(control) + controlClearance || x + width <= control.x - controlClearance) continue;
        const y = above ? control.y - controlClearance : bottom(control) + controlClearance;
        if (y >= minY && y <= maxY) ys.add(y);
      }

      for (const y of ys) {
        const fullHeight = Math.min(above ? y - area.top : area.bottom - y, above ? limitAbove : Infinity);
        const free = Math.min(fullHeight, clearHeight(area, controls, x, width, y, above));
        for (const capacity of new Set([Math.floor(fullHeight), Math.floor(free)])) {
          if (capacity < (oval ? minimumHeight : 1)) continue;
          const height = Math.min(capacity, targetHeight);
          const rect = { x, y: above ? y - height : y, width, height };
          const covered = occupied(rect, controls);
          // When there's room for the message and several choices, keep the default
          // group clear of actionable page controls before rewarding a wider layout.
          const clear = controls.length > 0 && !covered && height >= Math.min(targetHeight, size.main ? 186 : 130);
          const maxHeight = clear && free >= height ? Math.floor(free) : capacity;
          const clipped = height / targetHeight;
          const score = clipped * 112 + width / normalWidth * 17 + (oval ? 26 : 0) + (beside ? 4 : 0) +
            (previous?.side === side ? 11 : 0) + (previous?.width === width ? 4 : 0) -
            (maxHeight < minCloudHeight ? 55 : 0) - Math.abs(y - startY) * .35 -
            Math.min(190, covered * 94);
          const candidate = { slot: { side, x, y: above ? y - maxHeight : y, width, maxHeight, oval }, clear, score };
          if (improves(candidate, best)) best = candidate;
        }
      }
    }
  }

  return best;
}

export function placeReady(area: Bounds, preferred: ReadyPosition | null, size: DialogueSize,
  controls: readonly Rect[] = [], previous?: Placement): Placement {
  const initial = placeSkull(area, preferred);
  const obstacles = preferred ? [] : controls;
  const initialDialogue = chooseDialogue(area, initial, size, obstacles, previous?.dialogue);
  const initialCovered = occupied(initial, obstacles);
  let best = initialDialogue ? {
    skull: initial, dialogue: initialDialogue.slot, clear: initialDialogue.clear && !initialCovered,
    score: initialDialogue.score - initialCovered * 96,
  } : undefined;
  const compact = area.right - area.left < 620 || area.bottom - area.top < 420;
  if (!preferred && obstacles.length &&
    (!initialDialogue || initialCovered ||
      occupied(dialogueRect(initialDialogue.slot, size.height), obstacles) ||
      (compact && initialDialogue.slot.maxHeight < Math.min(205, size.height)))) {
    // Fit the entire default group into nearby space. A deliberate drag keeps the user's position.
    const adjacentWidth = Math.floor(area.right - area.left - minCloudWidth - gap);
    const compactWidth = Math.min(initial.width, Math.max(115, adjacentWidth));
    const localShift = compact ? Infinity : 122;
    for (const width of new Set(compact ? [initial.width, compactWidth] : [initial.width])) {
      const height = Math.round(width * .94);
      const xs = [initial.x, Math.min(area.right - width, initial.x + localShift), Math.max(area.left, initial.x - localShift)];
      const ys = [initial.y, area.top, area.bottom - height];
      for (const control of obstacles) {
        ys.push(control.y - controlClearance - height, bottom(control) + controlClearance);
      }
      const minY = Math.max(area.top, initial.y - localShift);
      const maxY = Math.min(area.bottom - height, initial.y + localShift);
      for (const y of new Set(ys.map((value) => clamp(Math.round(value), Math.ceil(minY), Math.floor(maxY))))) {
        for (const x of xs) {
          const skull = keepSkullInside(area, { x, y }, width);
          const result = chooseDialogue(area, skull, size, obstacles, previous?.dialogue);
          if (!result) continue;
          const shift = Math.hypot(skull.x - initial.x, skull.y - initial.y);
          const covered = occupied(skull, obstacles);
          const candidate = {
            skull, dialogue: result.slot, clear: result.clear && !covered,
            score: result.score - covered * 96 - shift * .046 - (initial.width - width) * .24,
          };
          if (improves(candidate, best)) best = candidate;
        }
      }
    }
  }
  if (best) return { skull: best.skull, dialogue: best.dialogue };

  // A very shallow visual viewport can leave almost no space below the header.
  const width = Math.max(1, Math.floor(area.right - area.left));
  const height = Math.max(1, area.bottom - area.top);
  const skull = keepSkullInside(area, { x: initial.x, y: area.top },
    Math.min(initial.width, Math.max(1, Math.floor(height * .48))));
  const y = Math.min(area.bottom - 1, bottom(skull) + Math.min(gap, height * .10));
  return { skull, dialogue: { x: area.left, y, side: "below", oval: false, width, maxHeight: Math.max(1, area.bottom - y) } };
}

export function dialogueRect(slot: DialogueSlot, contentHeight: number): Rect {
  const height = Math.min(slot.maxHeight, contentHeight);
  return { x: slot.x, y: slot.side === "above" ? slot.y + slot.maxHeight - height : slot.y, width: slot.width, height };
}

export function placeContextMenu(
  area: Bounds, skull: Rect, button: Pick<Rect, "width" | "height">, spacing: number, avoid: readonly Rect[],
  pageControls: readonly Rect[] = [],
): (Rect & { direction: "row" | "column" }) | null {
  const separation = 7;
  let best: (Rect & { direction: "row" | "column" }) | null = null;
  let bestScore = Infinity;
  for (const direction of ["column", "row"] as const) {
    const width = direction === "row" ? button.width * 2 + spacing : button.width;
    const height = direction === "column" ? button.height * 2 + spacing : button.height;
    if (area.right - area.left < width || area.bottom - area.top < height) continue;
    const across = [skull.x, skull.x + (skull.width - width) / 2, right(skull) - width];
    const down = [skull.y, skull.y + (skull.height - height) * .40, bottom(skull) - height];
    const points = [
      ...across.flatMap((x) => [{ x, y: skull.y - height - separation }, { x, y: bottom(skull) + separation }]),
      ...down.flatMap((y) => [{ x: skull.x - width - separation, y }, { x: right(skull) + separation, y }]),
      // When a corner leaves no exterior slot, keep the controls on the helmet edge, clear of X.
      { x: skull.x, y: skull.y - height + Math.min(30, height) },
    ];
    for (const { x, y } of points) {
      const menu = {
        x: clamp(x, area.left, area.right - width), y: clamp(y, area.top, area.bottom - height), width, height, direction,
      };
      if (avoid.some((rect) => overlap(menu, rect) > 0)) continue;
      const intrudes = overlap(menu, skull);
      if (intrudes > width * Math.min(30, height)) continue;
      const offset = Math.abs(menu.x + width / 2 - skull.x - skull.width / 2) +
        Math.abs(menu.y + height / 2 - skull.y - skull.height * .4);
      const score = offset + intrudes * .28 + occupied(menu, pageControls) * 22;
      if (score < bestScore) { best = menu; bestScore = score; }
    }
  }
  return best;
}

export function thoughtTrail(skull: Rect, bubble: Rect, side: Side, mouth: Point): Point[] {
  const edgePadding = 12;
  const end = {
    x: side === "left" ? right(bubble) : side === "right" ? bubble.x : clamp(mouth.x, bubble.x + edgePadding, right(bubble) - edgePadding),
    y: side === "above" ? bottom(bubble) : side === "below" ? bubble.y : clamp(mouth.y, bubble.y + edgePadding, bottom(bubble) - edgePadding),
  };
  const dx = end.x - mouth.x, dy = end.y - mouth.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 26) return [];
  const x = dx / distance, y = dy / distance;
  const inset = Math.min(skull.width, skull.height) * .12;
  const faceEdgeX = x < 0 ? skull.x + inset : right(skull) - inset;
  const faceEdgeY = y < 0 ? skull.y + inset : bottom(skull) - inset;
  const faceEdge = Math.max(0, Math.min(x ? (faceEdgeX - mouth.x) / x : Infinity,
    y ? (faceEdgeY - mouth.y) / y : Infinity));
  const last = Math.min(distance - 7, faceEdge + 79);
  const first = Math.max(7, Math.min(faceEdge + 5, last - 16));
  return [0, .49, 1].map((progress) => {
    const along = first + (last - first) * progress;
    const curve = Math.sin(progress * Math.PI) * 3.5;
    return { x: mouth.x + x * along - y * curve, y: mouth.y + y * along + x * curve };
  });
}
