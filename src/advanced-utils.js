export function distanceTransform(mask, width, height, target = 1) {
  const size = width * height;
  const dist = new Float64Array(size);
  const inf = width + height + 10;
  for (let i = 0; i < size; i++) dist[i] = (mask[i] ? 1 : 0) === target ? 0 : inf;
  const diag = Math.SQRT2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    let d = dist[i];
    if (x > 0) d = Math.min(d, dist[i - 1] + 1);
    if (y > 0) d = Math.min(d, dist[i - width] + 1);
    if (x > 0 && y > 0) d = Math.min(d, dist[i - width - 1] + diag);
    if (x + 1 < width && y > 0) d = Math.min(d, dist[i - width + 1] + diag);
    dist[i] = d;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    let d = dist[i];
    if (x + 1 < width) d = Math.min(d, dist[i + 1] + 1);
    if (y + 1 < height) d = Math.min(d, dist[i + width] + 1);
    if (x + 1 < width && y + 1 < height) d = Math.min(d, dist[i + width + 1] + diag);
    if (x > 0 && y + 1 < height) d = Math.min(d, dist[i + width - 1] + diag);
    dist[i] = d;
  }
  return dist;
}

export function offsetMask(mask, width, height, radius) {
  if (!radius) return new Uint8Array(mask);
  const out = new Uint8Array(mask.length);
  if (radius > 0) {
    const distanceToFill = distanceTransform(mask, width, height, 1);
    for (let i = 0; i < out.length; i++) out[i] = distanceToFill[i] <= radius ? 1 : 0;
  } else {
    const r = Math.abs(radius);
    const distanceToEmpty = distanceTransform(mask, width, height, 0);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const outside = Math.min(x + 1, y + 1, width - x, height - y);
      const distance = Math.min(distanceToEmpty[i], outside);
      out[i] = mask[i] && distance > r ? 1 : 0;
    }
  }
  return out;
}

export function rgbaToHex(r, g, b) {
  const h = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function colorDistanceSq(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function sampleOpaquePixels(data, maxSamples = 6000, alphaThreshold = 16) {
  const count = data.length / 4;
  const step = Math.max(1, Math.floor(count / maxSamples));
  const points = [];
  for (let p = 0; p < count; p += step) {
    const i = p * 4;
    if (data[i + 3] < alphaThreshold) continue;
    points.push([data[i], data[i + 1], data[i + 2]]);
  }
  return points;
}

function initialCenters(points, k) {
  if (!points.length) return [];
  const centers = [points[Math.floor(points.length / 2)].slice()];
  while (centers.length < k) {
    let best = points[0], bestScore = -1;
    for (const p of points) {
      let nearest = Infinity;
      for (const c of centers) nearest = Math.min(nearest, colorDistanceSq(p, c));
      if (nearest > bestScore) { bestScore = nearest; best = p; }
    }
    if (bestScore <= 0) break;
    centers.push(best.slice());
  }
  while (centers.length < k) centers.push(centers.at(-1).slice());
  return centers;
}

export function quantizeRgba(data, k = 4, { iterations = 8, alphaThreshold = 16, maxSamples = 6000 } = {}) {
  k = Math.max(1, Math.min(12, Math.round(k)));
  const points = sampleOpaquePixels(data, maxSamples, alphaThreshold);
  if (!points.length) return { centers: [], labels: new Int16Array(data.length / 4).fill(-1), counts: [] };
  let centers = initialCenters(points, k);
  for (let iter = 0; iter < iterations; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of points) {
      let best = 0, bestD = Infinity;
      centers.forEach((c, idx) => { const d = colorDistanceSq(p, c); if (d < bestD) { bestD = d; best = idx; } });
      sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3]++;
    }
    centers = centers.map((c, idx) => sums[idx][3] ? [sums[idx][0] / sums[idx][3], sums[idx][1] / sums[idx][3], sums[idx][2] / sums[idx][3]] : c);
  }
  const labels = new Int16Array(data.length / 4); labels.fill(-1);
  const counts = new Array(centers.length).fill(0);
  for (let p = 0; p < labels.length; p++) {
    const i = p * 4;
    if (data[i + 3] < alphaThreshold) continue;
    const color = [data[i], data[i + 1], data[i + 2]];
    let best = 0, bestD = Infinity;
    centers.forEach((c, idx) => { const d = colorDistanceSq(color, c); if (d < bestD) { bestD = d; best = idx; } });
    labels[p] = best; counts[best]++;
  }
  const order = centers.map((_, i) => i).sort((a, b) => counts[b] - counts[a]);
  const remap = new Int16Array(centers.length);
  order.forEach((old, next) => remap[old] = next);
  for (let i = 0; i < labels.length; i++) if (labels[i] >= 0) labels[i] = remap[labels[i]];
  centers = order.map(i => centers[i]);
  const sortedCounts = order.map(i => counts[i]);
  return { centers, labels, counts: sortedCounts };
}

export function masksFromLabels(labels, clusterCount, minPixels = 1) {
  const masks = Array.from({ length: clusterCount }, () => new Uint8Array(labels.length));
  const counts = new Array(clusterCount).fill(0);
  labels.forEach((label, index) => { if (label >= 0 && label < clusterCount) { masks[label][index] = 1; counts[label]++; } });
  return masks.map((mask, i) => counts[i] >= minPixels ? mask : new Uint8Array(mask.length));
}

function pointLineDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!dx && !dy) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function simplifyPolyline(points, tolerance = 1) {
  if (!Array.isArray(points) || points.length < 3 || tolerance <= 0) return points ? points.slice() : [];
  const first = points[0], last = points.at(-1);
  let index = -1, maxDistance = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], first, last);
    if (d > maxDistance) { maxDistance = d; index = i; }
  }
  if (maxDistance <= tolerance || index < 0) return [first, last];
  const left = simplifyPolyline(points.slice(0, index + 1), tolerance);
  const right = simplifyPolyline(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

export function simplifyClosedLoop(points, tolerance = 1) {
  if (!Array.isArray(points) || points.length < 4 || tolerance <= 0) return points ? points.slice() : [];
  let farthest = 1, best = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y);
    if (d > best) { best = d; farthest = i; }
  }
  const a = simplifyPolyline(points.slice(0, farthest + 1), tolerance);
  const b = simplifyPolyline(points.slice(farthest).concat([points[0]]), tolerance);
  const merged = a.slice(0, -1).concat(b.slice(0, -1));
  return merged.length >= 3 ? merged : points.slice();
}

export function normalizeAngle(angle) {
  let a = Number(angle) || 0;
  a %= 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

export function easingSpline(name) {
  const map = {
    'ease': '.25 .1 .25 1',
    'ease-in': '.42 0 1 1',
    'ease-out': '0 0 .58 1',
    'ease-in-out': '.42 0 .58 1'
  };
  return map[name] || null;
}
