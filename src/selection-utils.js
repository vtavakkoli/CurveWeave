export function normalizeRect(a, b) {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

export function rectIntersects(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function rectContains(container, item, epsilon = 0.5) {
  return item.left >= container.left - epsilon && item.right <= container.right + epsilon &&
    item.top >= container.top - epsilon && item.bottom <= container.bottom + epsilon;
}

export function distributionOffsets(items, axis = 'x') {
  if (!Array.isArray(items) || items.length < 3) return new Map();
  const horizontal = axis === 'x';
  const sorted = [...items].sort((a, b) => {
    const ac = horizontal ? a.left + a.width / 2 : a.top + a.height / 2;
    const bc = horizontal ? b.left + b.width / 2 : b.top + b.height / 2;
    return ac - bc;
  });
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = horizontal ? first.left + first.width / 2 : first.top + first.height / 2;
  const end = horizontal ? last.left + last.width / 2 : last.top + last.height / 2;
  const step = (end - start) / (sorted.length - 1);
  const offsets = new Map();
  sorted.forEach((item, index) => {
    const current = horizontal ? item.left + item.width / 2 : item.top + item.height / 2;
    offsets.set(item.id, step * index + start - current);
  });
  return offsets;
}

export function alignmentOffset(item, bounds, mode) {
  switch (mode) {
    case 'left': return { dx: bounds.left - item.left, dy: 0 };
    case 'hcenter': return { dx: (bounds.left + bounds.right) / 2 - (item.left + item.right) / 2, dy: 0 };
    case 'right': return { dx: bounds.right - item.right, dy: 0 };
    case 'top': return { dx: 0, dy: bounds.top - item.top };
    case 'vcenter': return { dx: 0, dy: (bounds.top + bounds.bottom) / 2 - (item.top + item.bottom) / 2 };
    case 'bottom': return { dx: 0, dy: bounds.bottom - item.bottom };
    default: return { dx: 0, dy: 0 };
  }
}

// Keep pure selection utilities Node-testable while loading browser-only editor suites.
if (typeof document !== 'undefined') {
  import('./pro-vector.js')
    .then(() => import('./special-layer-support.js'))
    .then(() => import('./advanced-studio.js'))
    .catch(error => console.error('CurveWeave professional editor suites failed to load', error));
}
