const selector = '[data-mascot-attention]';
const radians = Math.PI / 180;
const settleMs = 360;

const profiles = {
  dock: {
    distance: .98, minDistance: 290, maxDistance: 780,
    yaw: 22, up: 13, down: 15, roll: 1.6,
    nav: 1.65, heading: 1.14, action: 1,
  },
  floating: {
    distance: .66, minDistance: 210, maxDistance: 660,
    yaw: 44, up: 19, down: 29, roll: 3.3,
    nav: .8, heading: 1.35, action: 1.38,
  },
};

function viewportRect(win, doc) {
  const visual = win.visualViewport;
  const left = visual?.offsetLeft ?? 0;
  const top = visual?.offsetTop ?? 0;
  return {
    left, top,
    right: left + (visual?.width ?? doc.documentElement.clientWidth),
    bottom: top + (visual?.height ?? doc.documentElement.clientHeight),
  };
}

function viewportIntersection(rect, viewport) {
  const left = Math.max(rect.left, viewport.left);
  const right = Math.min(rect.right, viewport.right);
  const top = Math.max(rect.top, viewport.top);
  const bottom = Math.min(rect.bottom, viewport.bottom);
  const area = Math.max(0, right - left) * Math.max(0, bottom - top);
  return area >= .55 * rect.width * rect.height ? { left, right, top, bottom } : null;
}

function isVisible(node, win) {
  for (let element = node; element; element = element.parentElement) {
    if (element.hidden || element.inert || element.getAttribute('aria-hidden') === 'true') return false;
    const { display, visibility, opacity } = win.getComputedStyle(element);
    if (display === 'none' || visibility === 'hidden' || visibility === 'collapse' || Number(opacity) <= .02) return false;
  }
  return true;
}

function getTargetRects(node, doc) {
  // A heading's block box extends through empty space. Use its rendered text lines.
  if (/^H[1-6]$/.test(node.tagName)) {
    const content = doc.createRange();
    content.selectNodeContents(node);
    return Array.from(content.getClientRects());
  }
  return Array.from(node.getClientRects());
}

function inside(x, y, box) {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

function findTargetPoint(node, doc, viewport, canvas) {
  const points = [];
  for (const rect of getTargetRects(node, doc)) {
    if (rect.width < 4 || rect.height < 4) continue;
    const box = viewportIntersection(rect, viewport);
    if (!box) continue;
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    const offsets = [[.5, .5], [.25, .5], [.75, .5], [.5, .28], [.5, .72]];
    const exposed = offsets.map(([u, v]) => ({ x: box.left + width * u, y: box.top + height * v }))
      .filter(({ x, y }) => !inside(x, y, canvas) && node.contains(doc.elementFromPoint(x, y)));
    if (exposed.length >= 2) points.push({ ...exposed[0], weight: width * height * exposed.length });
  }
  return points.sort((a, b) => b.weight - a.weight)[0] ?? null;
}

function limitAngle(angle, limit) {
  return limit * Math.tanh(angle / limit);
}

/** Map CSS-pixel offsets into the exported head convention. +Y yaw points right and +X pitch points down. */
export function aimAtPagePoint(point, origin, viewport, mode, cameraYaw = 0) {
  const profile = profiles[mode] ?? profiles.floating;
  const viewportSpan = Math.min(viewport.right - viewport.left, viewport.bottom - viewport.top);
  const depth = Math.max(profile.minDistance, Math.min(profile.maxDistance, viewportSpan * profile.distance));
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const yawLimit = profile.yaw * radians;
  const facingViewer = Math.max(-yawLimit, Math.min(yawLimit, cameraYaw));
  const pageYaw = Math.atan2(dx, depth);
  const pagePitch = Math.atan2(dy, Math.hypot(depth, dx));
  const yawBudget = yawLimit - Math.sign(dx) * facingViewer;
  if (yawBudget <= 0 && pageYaw !== 0) return null;
  const pitchBudget = profile[dy < 0 ? 'up' : 'down'] * radians;
  const reach = Math.hypot(pageYaw / yawBudget, pagePitch / pitchBudget);
  // Scale both axes together so the projected look keeps its direction as it nears an angular limit.
  const weight = reach > 0 ? Math.tanh(reach) / reach : 1;
  const yaw = facingViewer + pageYaw * weight;
  const pitch = pagePitch * weight;
  const roll = limitAngle((-pageYaw * .085 + pagePitch * .028) * weight, profile.roll * radians);
  return { pitch, yaw, roll };
}

/** Call pick only when choosing a new idle target so intermediate frames make no DOM measurements. */
export function createAttentionTargetPicker(canvas, random = Math.random) {
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  const visual = win.visualViewport;
  let settleUntil = 0;
  let previousId;
  const onViewChange = () => { settleUntil = win.performance.now() + settleMs; };

  for (const source of [win, visual].filter(Boolean)) {
    source.addEventListener('scroll', onViewChange, { passive: true });
    source.addEventListener('resize', onViewChange, { passive: true });
  }

  return {
    pick({ mode, cameraYaw = 0, origin, previousId: excluded = previousId }) {
      if (!canvas.isConnected || doc.hidden || win.performance.now() < settleUntil) return null;
      const viewport = viewportRect(win, doc);
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height || !viewportIntersection(bounds, viewport)) return null;
      const from = origin ?? { x: bounds.left + bounds.width * .5, y: bounds.top + bounds.height * .47 };
      const profile = profiles[mode] ?? profiles.floating;
      const diagonal = Math.hypot(viewport.right - viewport.left, viewport.bottom - viewport.top);
      const candidates = [];

      for (const node of doc.querySelectorAll(selector)) {
        const id = node.getAttribute('data-mascot-attention');
        if (!id || !isVisible(node, win)) continue;
        const point = findTargetPoint(node, doc, viewport, bounds);
        if (!point) continue;
        const distance = Math.hypot(point.x - from.x, point.y - from.y);
        const angles = aimAtPagePoint(point, from, viewport, mode, cameraYaw);
        if (!angles || Math.hypot(angles.pitch, angles.yaw) < 4 * radians) continue;
        if (distance < Math.max(26, bounds.width * .13)) continue;
        const kind = id.startsWith('nav-') ? 'nav' : /^H[1-6]$/.test(node.tagName) ? 'heading' : 'action';
        const label = (node.getAttribute('aria-label') ?? node.textContent).replace(/\s+/g, ' ').replace(/\s*[↗→]$/, '').trim();
        const weight = profile[kind] / (.35 + distance / diagonal) ** 1.45;
        candidates.push({ id, label, point, weight, angles });
      }

      if (!candidates.length) return null;
      const hasAlternative = candidates.some(({ id }) => id !== excluded);
      if (hasAlternative) {
        const previous = candidates.find(({ id }) => id === excluded);
        if (previous) previous.weight *= .14;
      }
      let choice = random() * candidates.reduce((total, candidate) => total + candidate.weight, 0);
      const selected = candidates.find(({ weight }) => (choice -= weight) <= 0) ?? candidates.at(-1);
      previousId = selected.id;
      const { id, label, point, angles } = selected;
      return { id, label, screenPoint: { x: point.x, y: point.y }, ...angles };
    },
    dispose() {
      for (const source of [win, visual].filter(Boolean)) {
        source.removeEventListener('scroll', onViewChange);
        source.removeEventListener('resize', onViewChange);
      }
    },
  };
}
