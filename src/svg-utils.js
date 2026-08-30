const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAWABLE = new Set(['path','rect','circle','ellipse','line','polyline','polygon','text','g']);
const PATH_PARAMS = { M:2, L:2, H:1, V:1, C:6, S:4, Q:4, T:2, A:7, Z:0 };

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function roundNumber(value, precision = 3) {
  const factor = 10 ** precision;
  const rounded = Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function compactNumbers(text, precision = 3) {
  return String(text).replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, token => {
    const n = Number(token);
    return Number.isFinite(n) ? String(roundNumber(n, precision)) : token;
  });
}

function point(x, y) { return { x, y }; }
function samePoint(a, b, epsilon = 1e-9) { return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return dist(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return dist(p, point(a.x + t * dx, a.y + t * dy));
}

function rdp(points, tolerance) {
  if (points.length <= 2) return points.slice();
  let maxDistance = -1, index = -1;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = distanceToSegment(points[i], points[0], points[points.length - 1]);
    if (d > maxDistance) { maxDistance = d; index = i; }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  const left = rdp(points.slice(0, index + 1), tolerance);
  const right = rdp(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

function tokenizePathData(d) {
  return String(d || '').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || [];
}

function isCommand(token) { return /^[a-zA-Z]$/.test(token); }

function parsePathData(d) {
  const tokens = tokenizePathData(d);
  const segments = [];
  let i = 0, command = null, current = point(0, 0), subpathStart = point(0, 0);
  let previousCurve = null;

  const numberAt = index => {
    const value = Number(tokens[index]);
    return Number.isFinite(value) ? value : null;
  };

  while (i < tokens.length) {
    if (isCommand(tokens[i])) command = tokens[i++];
    else if (!command) return null;

    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (!(upper in PATH_PARAMS)) return null;

    if (upper === 'Z') {
      segments.push({ type:'Z', start:{ ...current }, end:{ ...subpathStart } });
      current = { ...subpathStart };
      previousCurve = null;
      command = null;
      continue;
    }

    const count = PATH_PARAMS[upper];
    if (i + count > tokens.length || isCommand(tokens[i])) return null;
    const values = [];
    for (let j = 0; j < count; j += 1) {
      if (isCommand(tokens[i + j])) return null;
      const value = numberAt(i + j);
      if (value === null) return null;
      values.push(value);
    }
    i += count;
    const start = { ...current };
    const absX = value => relative ? start.x + value : value;
    const absY = value => relative ? start.y + value : value;

    if (upper === 'M') {
      current = point(absX(values[0]), absY(values[1]));
      subpathStart = { ...current };
      segments.push({ type:'M', start:{ ...start }, end:{ ...current } });
      previousCurve = null;
      command = relative ? 'l' : 'L';
      continue;
    }

    if (upper === 'L') {
      current = point(absX(values[0]), absY(values[1]));
      segments.push({ type:'L', start, end:{ ...current } });
      previousCurve = null;
      continue;
    }

    if (upper === 'H') {
      current = point(absX(values[0]), start.y);
      segments.push({ type:'L', start, end:{ ...current } });
      previousCurve = null;
      continue;
    }

    if (upper === 'V') {
      current = point(start.x, absY(values[0]));
      segments.push({ type:'L', start, end:{ ...current } });
      previousCurve = null;
      continue;
    }

    if (upper === 'C') {
      const seg = {
        type:'C', start,
        c1:point(absX(values[0]), absY(values[1])),
        c2:point(absX(values[2]), absY(values[3])),
        end:point(absX(values[4]), absY(values[5]))
      };
      segments.push(seg); current = { ...seg.end }; previousCurve = seg;
      continue;
    }

    if (upper === 'S') {
      const reflected = previousCurve?.type === 'C'
        ? point(2 * start.x - previousCurve.c2.x, 2 * start.y - previousCurve.c2.y)
        : { ...start };
      const seg = {
        type:'C', start, c1:reflected,
        c2:point(absX(values[0]), absY(values[1])),
        end:point(absX(values[2]), absY(values[3]))
      };
      segments.push(seg); current = { ...seg.end }; previousCurve = seg;
      continue;
    }

    if (upper === 'Q') {
      const seg = {
        type:'Q', start,
        c:point(absX(values[0]), absY(values[1])),
        end:point(absX(values[2]), absY(values[3]))
      };
      segments.push(seg); current = { ...seg.end }; previousCurve = seg;
      continue;
    }

    if (upper === 'T') {
      const reflected = previousCurve?.type === 'Q'
        ? point(2 * start.x - previousCurve.c.x, 2 * start.y - previousCurve.c.y)
        : { ...start };
      const seg = { type:'Q', start, c:reflected, end:point(absX(values[0]), absY(values[1])) };
      segments.push(seg); current = { ...seg.end }; previousCurve = seg;
      continue;
    }

    if (upper === 'A') {
      const seg = {
        type:'A', start,
        rx:Math.abs(values[0]), ry:Math.abs(values[1]), rotation:values[2],
        largeArc:values[3] ? 1 : 0, sweep:values[4] ? 1 : 0,
        end:point(absX(values[5]), absY(values[6]))
      };
      segments.push(seg); current = { ...seg.end }; previousCurve = null;
    }
  }

  return segments;
}

function evalCubic(seg, t) {
  const mt = 1 - t;
  const b0 = mt * mt * mt;
  const b1 = 3 * mt * mt * t;
  const b2 = 3 * mt * t * t;
  const b3 = t * t * t;
  return point(
    b0 * seg.start.x + b1 * seg.c1.x + b2 * seg.c2.x + b3 * seg.end.x,
    b0 * seg.start.y + b1 * seg.c1.y + b2 * seg.c2.y + b3 * seg.end.y
  );
}

function fitMergedCubic(first, second, tolerance) {
  if (tolerance <= 0 || first.type !== 'C' || second.type !== 'C' || !samePoint(first.end, second.start, 1e-6)) return null;
  const samples = [];
  for (let i = 1; i < 16; i += 1) {
    const t = i / 16;
    const p = t <= 0.5 ? evalCubic(first, t * 2) : evalCubic(second, (t - 0.5) * 2);
    samples.push({ t, p });
  }

  let a11 = 0, a12 = 0, a22 = 0, bx1 = 0, bx2 = 0, by1 = 0, by2 = 0;
  for (const { t, p } of samples) {
    const mt = 1 - t;
    const b0 = mt * mt * mt, b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t, b3 = t * t * t;
    const rx = p.x - b0 * first.start.x - b3 * second.end.x;
    const ry = p.y - b0 * first.start.y - b3 * second.end.y;
    a11 += b1 * b1; a12 += b1 * b2; a22 += b2 * b2;
    bx1 += b1 * rx; bx2 += b2 * rx; by1 += b1 * ry; by2 += b2 * ry;
  }
  const determinant = a11 * a22 - a12 * a12;
  if (Math.abs(determinant) < 1e-12) return null;
  const solve = (v1, v2) => [
    (v1 * a22 - v2 * a12) / determinant,
    (a11 * v2 - a12 * v1) / determinant
  ];
  const [c1x, c2x] = solve(bx1, bx2);
  const [c1y, c2y] = solve(by1, by2);
  const candidate = { type:'C', start:{ ...first.start }, c1:point(c1x,c1y), c2:point(c2x,c2y), end:{ ...second.end } };

  let maxError = 0;
  for (let i = 0; i <= 32; i += 1) {
    const t = i / 32;
    const source = t <= 0.5 ? evalCubic(first, t * 2) : evalCubic(second, (t - 0.5) * 2);
    maxError = Math.max(maxError, dist(source, evalCubic(candidate, t)));
    if (maxError > tolerance) return null;
  }
  return candidate;
}

function simplifyLineRun(start, lines, tolerance) {
  if (!lines.length) return [];
  const points = [start, ...lines.map(line => line.end)];
  const simplified = rdp(points, Math.max(1e-9, tolerance));
  return simplified.slice(1).map((end, index) => ({
    type:'L', start:{ ...simplified[index] }, end:{ ...end }
  }));
}

function simplifySegments(segments, tolerance) {
  const normalized = [];
  for (const seg of segments) {
    if (seg.type === 'L' && samePoint(seg.start, seg.end)) continue;
    if (seg.type === 'C') {
      const threshold = Math.max(1e-9, tolerance);
      if (distanceToSegment(seg.c1, seg.start, seg.end) <= threshold && distanceToSegment(seg.c2, seg.start, seg.end) <= threshold) {
        normalized.push({ type:'L', start:{ ...seg.start }, end:{ ...seg.end } });
      } else normalized.push(seg);
      continue;
    }
    if (seg.type === 'Q') {
      const threshold = Math.max(1e-9, tolerance);
      if (distanceToSegment(seg.c, seg.start, seg.end) <= threshold) normalized.push({ type:'L', start:{ ...seg.start }, end:{ ...seg.end } });
      else normalized.push(seg);
      continue;
    }
    normalized.push(seg);
  }

  const merged = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const current = normalized[i];
    const next = normalized[i + 1];
    const candidate = next ? fitMergedCubic(current, next, tolerance) : null;
    if (candidate) { merged.push(candidate); i += 1; }
    else merged.push(current);
  }

  const output = [];
  let lineRun = [];
  let runStart = null;
  const flushLines = () => {
    if (lineRun.length) output.push(...simplifyLineRun(runStart, lineRun, tolerance));
    lineRun = []; runStart = null;
  };

  for (const seg of merged) {
    if (seg.type === 'L') {
      if (!lineRun.length) runStart = { ...seg.start };
      lineRun.push(seg);
    } else {
      flushLines();
      output.push(seg);
    }
  }
  flushLines();
  return output;
}

function fmt(value, precision) { return String(roundNumber(value, precision)); }
function fmtPoint(p, precision) { return `${fmt(p.x, precision)} ${fmt(p.y, precision)}`; }

function serializePathSegments(segments, precision = 3) {
  let result = '';
  let previous = null;
  for (const seg of segments) {
    if (seg.type === 'M') {
      result += `M${fmtPoint(seg.end, precision)}`;
    } else if (seg.type === 'L') {
      if (Math.abs(seg.start.y - seg.end.y) <= 1e-9) result += `H${fmt(seg.end.x, precision)}`;
      else if (Math.abs(seg.start.x - seg.end.x) <= 1e-9) result += `V${fmt(seg.end.y, precision)}`;
      else result += `L${fmtPoint(seg.end, precision)}`;
    } else if (seg.type === 'C') {
      const reflected = previous?.type === 'C'
        ? point(2 * seg.start.x - previous.c2.x, 2 * seg.start.y - previous.c2.y)
        : null;
      if (reflected && samePoint(reflected, seg.c1, 10 ** (-precision))) {
        result += `S${fmtPoint(seg.c2, precision)} ${fmtPoint(seg.end, precision)}`;
      } else {
        result += `C${fmtPoint(seg.c1, precision)} ${fmtPoint(seg.c2, precision)} ${fmtPoint(seg.end, precision)}`;
      }
    } else if (seg.type === 'Q') {
      const reflected = previous?.type === 'Q'
        ? point(2 * seg.start.x - previous.c.x, 2 * seg.start.y - previous.c.y)
        : null;
      if (reflected && samePoint(reflected, seg.c, 10 ** (-precision))) result += `T${fmtPoint(seg.end, precision)}`;
      else result += `Q${fmtPoint(seg.c, precision)} ${fmtPoint(seg.end, precision)}`;
    } else if (seg.type === 'A') {
      result += `A${fmt(seg.rx,precision)} ${fmt(seg.ry,precision)} ${fmt(seg.rotation,precision)} ${seg.largeArc} ${seg.sweep} ${fmtPoint(seg.end,precision)}`;
    } else if (seg.type === 'Z') result += 'Z';
    previous = seg;
  }
  return result;
}

export function simplifyPathData(d, { tolerance = 0.75, precision = 3 } = {}) {
  const parsed = parsePathData(d);
  if (!parsed?.length) return String(d || '');
  const simplified = simplifySegments(parsed, Math.max(0, Number(tolerance) || 0));
  const output = serializePathSegments(simplified, precision);
  return output || String(d || '');
}

function parsePointList(value) {
  const values = (String(value || '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
  if (values.length < 4 || values.length % 2) return null;
  const points = [];
  for (let i = 0; i < values.length; i += 2) points.push(point(values[i], values[i + 1]));
  return points;
}

export function simplifyPointList(value, { tolerance = 0.75, precision = 3, closed = false } = {}) {
  const points = parsePointList(value);
  if (!points) return String(value || '');
  const source = points.slice();
  if (closed && !samePoint(source[0], source[source.length - 1])) source.push({ ...source[0] });
  let simplified = rdp(source, Math.max(1e-9, Number(tolerance) || 0));
  if (closed && simplified.length > 1 && samePoint(simplified[0], simplified[simplified.length - 1])) simplified = simplified.slice(0, -1);
  return simplified.map(p => `${fmt(p.x, precision)},${fmt(p.y, precision)}`).join(' ');
}

export function estimateSvgStats(svgText) {
  const text = String(svgText || '');
  const count = tag => (text.match(new RegExp(`<${tag}(?:\\s|/?>)`, 'gi')) || []).length;
  const paths = count('path');
  const shapes = ['rect','circle','ellipse','line','polyline','polygon','text'].reduce((sum, t) => sum + count(t), 0);
  const groups = count('g');
  const nodes = [...text.matchAll(/\sd=(?:"([^"]*)"|'([^']*)')/gi)].reduce((sum, match) => sum + ((match[1] || match[2] || '').match(/[MLHVCSQTAZ]/gi) || []).length, 0);
  return {
    bytes: new TextEncoder().encode(text).length,
    paths,
    shapes,
    groups,
    nodes,
    elements: paths + shapes + groups
  };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B','KB','MB','GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** i);
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

export function sanitizeSvgText(svgText) {
  let text = String(svgText || '').trim();
  if (!/<svg[\s>]/i.test(text)) throw new Error('The document does not contain an <svg> root element.');
  text = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, '');
  return text;
}

export function repairSvgText(svgText, { precision = 3, tolerance = 0.75 } = {}) {
  const before = estimateSvgStats(svgText);
  let text = sanitizeSvgText(svgText)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, '')
    .replace(/<title>\s*<\/title>/gi, '')
    .replace(/<desc>\s*<\/desc>/gi, '')
    .replace(/\s+xmlns:xlink=(["'])http:\/\/www\.w3\.org\/1999\/xlink\1/gi, '')
    .replace(/\s+(?:data-name|sodipodi:[\w-]+|inkscape:[\w-]+)=(["'][^"']*["'])/gi, '');

  text = text.replace(/\sd=(["'])([\s\S]*?)\1/gi, (whole, quote, d) => {
    const simplified = simplifyPathData(d, { tolerance, precision });
    return ` d=${quote}${simplified}${quote}`;
  });

  text = text.replace(/<(polyline|polygon)\b([^>]*?)\spoints=(["'])(.*?)\3([^>]*)>/gi, (whole, tag, beforeAttrs, quote, pointsValue, afterAttrs) => {
    const simplified = simplifyPointList(pointsValue, { tolerance, precision, closed: tag.toLowerCase() === 'polygon' });
    return `<${tag}${beforeAttrs} points=${quote}${simplified}${quote}${afterAttrs}>`;
  });

  text = compactNumbers(text, precision)
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\/>/g, '/>')
    .trim();

  const after = estimateSvgStats(text);
  return {
    text,
    before,
    after,
    savedBytes: Math.max(0, before.bytes - after.bytes),
    removedNodes: Math.max(0, before.nodes - after.nodes)
  };
}

export function prettyPrintSvg(svgText) {
  const text = sanitizeSvgText(svgText).replace(/>\s*</g, '><').trim();
  const tokens = text.replace(/></g, '>\n<').split('\n');
  let depth = 0;
  return tokens.map(raw => {
    const token = raw.trim();
    if (/^<\//.test(token)) depth = Math.max(0, depth - 1);
    const line = `${'  '.repeat(depth)}${token}`;
    if (/^<[^!?/][^>]*[^/]?>$/.test(token) && !/^<(?:path|rect|circle|ellipse|line|polyline|polygon|stop|use|image|input|br|hr)\b/i.test(token)) depth += 1;
    return line;
  }).join('\n');
}

export function createStarterSvg() {
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 960 600" width="960" height="600">
  <defs>
    <linearGradient id="cwGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7257ff"/>
      <stop offset="1" stop-color="#2dc7bd"/>
    </linearGradient>
  </defs>
  <rect width="960" height="600" rx="28" fill="#10131a"/>
  <path d="M188 376 C 282 120, 456 484, 598 248 S 794 310, 812 196" fill="none" stroke="url(#cwGradient)" stroke-width="28" stroke-linecap="round"/>
  <circle cx="188" cy="376" r="18" fill="#ffffff"/>
  <circle cx="598" cy="248" r="18" fill="#ffffff"/>
  <text x="64" y="92" fill="#ffffff" font-size="34" font-family="system-ui, sans-serif" font-weight="700">CurveWeave</text>
  <text x="64" y="128" fill="#98a2b3" font-size="16" font-family="system-ui, sans-serif">Edit · Inspect · Repair · Optimize · Export</text>
</svg>`;
}

export function getDrawableElements(root) {
  return [...root.querySelectorAll('*')].filter(el => DRAWABLE.has(el.tagName.toLowerCase()) && !el.closest('defs'));
}

export function serializeSvg(svg) {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svg)
    .replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')
    .replace(/^<svg/, `<svg xmlns="${SVG_NS}"`);
}

export function safeFileName(name = 'curveweave-artwork') {
  return String(name).trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'curveweave-artwork';
}
