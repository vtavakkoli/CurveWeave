const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAWABLE = new Set(['path','rect','circle','ellipse','line','polyline','polygon','text','g']);

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

export function repairSvgText(svgText, { precision = 3 } = {}) {
  const before = estimateSvgStats(svgText);
  let text = sanitizeSvgText(svgText)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, '')
    .replace(/<title>\s*<\/title>/gi, '')
    .replace(/<desc>\s*<\/desc>/gi, '')
    .replace(/\s+xmlns:xlink=("|")http:\/\/www\.w3\.org\/1999\/xlink\1/gi, '')
    .replace(/\s+(?:data-name|sodipodi:[\w-]+|inkscape:[\w-]+)=("[^"]*"|'[^']*')/gi, '');

  text = compactNumbers(text, precision)
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\/>/g, '/>')
    .trim();

  const after = estimateSvgStats(text);
  return { text, before, after, savedBytes: Math.max(0, before.bytes - after.bytes) };
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
