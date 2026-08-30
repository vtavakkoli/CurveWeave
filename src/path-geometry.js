const COMMAND_PARAM_COUNTS = { M:2, L:2, H:1, V:1, C:6, S:4, Q:4, T:2, A:7, Z:0 };

export function tokenizePathData(d = '') {
  return String(d).match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
}

export function parsePathData(d = '') {
  const tokens = tokenizePathData(d);
  const out = [];
  let i = 0, command = null;
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) command = tokens[i++];
    if (!command) throw new Error('Path data must start with a command');
    const upper = command.toUpperCase();
    const count = COMMAND_PARAM_COUNTS[upper];
    if (count == null) throw new Error(`Unsupported path command ${command}`);
    if (count === 0) { out.push({ cmd:command, values:[] }); command = null; continue; }
    if (i + count > tokens.length) break;
    const values = tokens.slice(i, i + count).map(Number);
    if (values.some(value => !Number.isFinite(value))) break;
    out.push({ cmd:command, values });
    i += count;
    if (upper === 'M') command = command === 'M' ? 'L' : 'l';
  }
  return out;
}

function reflect(point, about) {
  return point ? { x:2 * about.x - point.x, y:2 * about.y - point.y } : { ...about };
}

export function normalizePathData(d = '') {
  const source = Array.isArray(d) ? d : parsePathData(d);
  const result = [];
  let current = { x:0, y:0 }, subStart = { x:0, y:0 }, previousControl = null;
  for (const segment of source) {
    const relative = segment.cmd === segment.cmd.toLowerCase();
    const cmd = segment.cmd.toUpperCase();
    const v = segment.values;
    const px = n => (relative ? current.x : 0) + n;
    const py = n => (relative ? current.y : 0) + n;
    let next;
    if (cmd === 'M') {
      next = { x:px(v[0]), y:py(v[1]) }; current = next; subStart = { ...next };
      result.push({ cmd:'M', x:next.x, y:next.y }); previousControl = null;
    } else if (cmd === 'L') {
      next = { x:px(v[0]), y:py(v[1]) }; result.push({ cmd:'L', x:next.x, y:next.y }); current = next; previousControl = null;
    } else if (cmd === 'H') {
      next = { x:px(v[0]), y:current.y }; result.push({ cmd:'L', x:next.x, y:next.y }); current = next; previousControl = null;
    } else if (cmd === 'V') {
      next = { x:current.x, y:py(v[0]) }; result.push({ cmd:'L', x:next.x, y:next.y }); current = next; previousControl = null;
    } else if (cmd === 'C') {
      const c1 = { x:px(v[0]), y:py(v[1]) }, c2 = { x:px(v[2]), y:py(v[3]) }, end = { x:px(v[4]), y:py(v[5]) };
      result.push({ cmd:'C', x1:c1.x, y1:c1.y, x2:c2.x, y2:c2.y, x:end.x, y:end.y });
      current = end; previousControl = c2;
    } else if (cmd === 'S') {
      const c1 = reflect(previousControl, current), c2 = { x:px(v[0]), y:py(v[1]) }, end = { x:px(v[2]), y:py(v[3]) };
      result.push({ cmd:'C', x1:c1.x, y1:c1.y, x2:c2.x, y2:c2.y, x:end.x, y:end.y });
      current = end; previousControl = c2;
    } else if (cmd === 'Q') {
      const c = { x:px(v[0]), y:py(v[1]) }, end = { x:px(v[2]), y:py(v[3]) };
      result.push({ cmd:'Q', x1:c.x, y1:c.y, x:end.x, y:end.y }); current = end; previousControl = c;
    } else if (cmd === 'T') {
      const c = reflect(previousControl, current), end = { x:px(v[0]), y:py(v[1]) };
      result.push({ cmd:'Q', x1:c.x, y1:c.y, x:end.x, y:end.y }); current = end; previousControl = c;
    } else if (cmd === 'A') {
      const end = { x:px(v[5]), y:py(v[6]) };
      result.push({ cmd:'A', rx:Math.abs(v[0]), ry:Math.abs(v[1]), rotation:v[2], large:v[3] ? 1 : 0, sweep:v[4] ? 1 : 0, x:end.x, y:end.y });
      current = end; previousControl = null;
    } else if (cmd === 'Z') {
      result.push({ cmd:'Z' }); current = { ...subStart }; previousControl = null;
    }
  }
  return result;
}

const clean = n => Number(Number(n).toFixed(3));
export function serializePathData(segments = []) {
  return segments.map(s => {
    if (s.cmd === 'M' || s.cmd === 'L') return `${s.cmd}${clean(s.x)} ${clean(s.y)}`;
    if (s.cmd === 'C') return `C${clean(s.x1)} ${clean(s.y1)} ${clean(s.x2)} ${clean(s.y2)} ${clean(s.x)} ${clean(s.y)}`;
    if (s.cmd === 'Q') return `Q${clean(s.x1)} ${clean(s.y1)} ${clean(s.x)} ${clean(s.y)}`;
    if (s.cmd === 'A') return `A${clean(s.rx)} ${clean(s.ry)} ${clean(s.rotation)} ${s.large ? 1 : 0} ${s.sweep ? 1 : 0} ${clean(s.x)} ${clean(s.y)}`;
    return 'Z';
  }).join(' ');
}

export function pathAnchors(segments = []) {
  return segments.flatMap((segment, index) => ('x' in segment && 'y' in segment) ? [{ index, x:segment.x, y:segment.y, cmd:segment.cmd }] : []);
}

export function pathControls(segments = []) {
  const controls = [];
  segments.forEach((segment, index) => {
    if (segment.cmd === 'C') {
      controls.push({ index, slot:'c1', x:segment.x1, y:segment.y1 });
      controls.push({ index, slot:'c2', x:segment.x2, y:segment.y2 });
    } else if (segment.cmd === 'Q') controls.push({ index, slot:'q', x:segment.x1, y:segment.y1 });
  });
  return controls;
}

export function moveAnchor(segments, index, x, y, { moveHandles = true } = {}) {
  const next = segments.map(segment => ({ ...segment }));
  const target = next[index];
  if (!target || !('x' in target)) return next;
  const dx = x - target.x, dy = y - target.y;
  target.x = x; target.y = y;
  if (moveHandles) {
    if (target.cmd === 'C') { target.x2 += dx; target.y2 += dy; }
    if (target.cmd === 'Q') { target.x1 += dx; target.y1 += dy; }
    const after = next[index + 1];
    if (after?.cmd === 'C') { after.x1 += dx; after.y1 += dy; }
  }
  return next;
}

export function moveControl(segments, index, slot, x, y, mode = 'corner') {
  const next = segments.map(segment => ({ ...segment }));
  const target = next[index];
  if (!target) return next;
  if (slot === 'c1' || slot === 'q') { target.x1 = x; target.y1 = y; }
  if (slot === 'c2') { target.x2 = x; target.y2 = y; }
  if (mode !== 'corner' && target.cmd === 'C') {
    if (slot === 'c2') {
      const anchor = { x:target.x, y:target.y }, after = next[index + 1];
      if (after?.cmd === 'C') {
        const dx = anchor.x - x, dy = anchor.y - y;
        const length = mode === 'symmetric' ? Math.hypot(dx,dy) : Math.hypot(after.x1-anchor.x, after.y1-anchor.y);
        const base = Math.max(.0001, Math.hypot(dx,dy));
        after.x1 = anchor.x + dx/base*length; after.y1 = anchor.y + dy/base*length;
      }
    } else if (slot === 'c1') {
      const anchorSeg = next[index - 1];
      if (anchorSeg && 'x' in anchorSeg) {
        const anchor = { x:anchorSeg.x, y:anchorSeg.y }, before = next[index - 1];
        if (before?.cmd === 'C') {
          const dx = anchor.x - x, dy = anchor.y - y;
          const length = mode === 'symmetric' ? Math.hypot(dx,dy) : Math.hypot(before.x2-anchor.x, before.y2-anchor.y);
          const base = Math.max(.0001, Math.hypot(dx,dy));
          before.x2 = anchor.x + dx/base*length; before.y2 = anchor.y + dy/base*length;
        }
      }
    }
  }
  return next;
}

function midpoint(a, b) { return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }
function cubicPoint(p0,p1,p2,p3,t) {
  const u=1-t; return { x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x, y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y };
}
function quadPoint(p0,p1,p2,t) { const u=1-t; return { x:u*u*p0.x+2*u*t*p1.x+t*t*p2.x, y:u*u*p0.y+2*u*t*p1.y+t*t*p2.y }; }

export function insertMidpoint(segments, index) {
  const next = segments.map(segment => ({ ...segment }));
  if (index <= 0 || index >= next.length || next[index].cmd === 'Z') return next;
  const prev = next[index-1], seg = next[index];
  if (!prev || !('x' in prev) || !('x' in seg)) return next;
  if (seg.cmd === 'L' || seg.cmd === 'A') {
    const m = midpoint(prev, seg); next.splice(index,0,{cmd:'L',x:m.x,y:m.y}); return next;
  }
  if (seg.cmd === 'C') {
    const p0={x:prev.x,y:prev.y}, p1={x:seg.x1,y:seg.y1}, p2={x:seg.x2,y:seg.y2}, p3={x:seg.x,y:seg.y};
    const a=midpoint(p0,p1), b=midpoint(p1,p2), c=midpoint(p2,p3), d=midpoint(a,b), e=midpoint(b,c), m=midpoint(d,e);
    next.splice(index,1,{cmd:'C',x1:a.x,y1:a.y,x2:d.x,y2:d.y,x:m.x,y:m.y},{cmd:'C',x1:e.x,y1:e.y,x2:c.x,y2:c.y,x:p3.x,y:p3.y}); return next;
  }
  if (seg.cmd === 'Q') {
    const p0={x:prev.x,y:prev.y}, p1={x:seg.x1,y:seg.y1}, p2={x:seg.x,y,y:seg.y};
    const a=midpoint(p0,p1), b=midpoint(p1,p2), m=midpoint(a,b);
    next.splice(index,1,{cmd:'Q',x1:a.x,y1:a.y,x:m.x,y:m.y},{cmd:'Q',x1:b.x,y1:b.y,x:p2.x,y:p2.y}); return next;
  }
  return next;
}

export function deleteAnchor(segments, index) {
  if (index <= 0 || index >= segments.length) return segments.map(s=>({...s}));
  const next = segments.map(segment => ({ ...segment }));
  if (next[index].cmd === 'Z') return next;
  next.splice(index,1);
  return next;
}

export function convertSegment(segments, index, to = 'curve') {
  const next = segments.map(segment => ({ ...segment }));
  if (index <= 0 || index >= next.length) return next;
  const prev = next[index-1], seg = next[index];
  if (!prev || !('x' in prev) || !seg || !('x' in seg)) return next;
  if (to === 'line') { next[index] = { cmd:'L', x:seg.x, y:seg.y }; return next; }
  if (to === 'curve' && seg.cmd !== 'C') {
    const dx=(seg.x-prev.x)/3, dy=(seg.y-prev.y)/3;
    next[index]={cmd:'C',x1:prev.x+dx,y1:prev.y+dy,x2:prev.x+2*dx,y2:prev.y+2*dy,x:seg.x,y:seg.y};
  }
  return next;
}

export function toggleClosed(segments) {
  const next = segments.map(segment => ({ ...segment }));
  const zIndex = next.findIndex(s => s.cmd === 'Z');
  if (zIndex >= 0) next.splice(zIndex,1); else if (next.length > 1) next.push({cmd:'Z'});
  return next;
}

export function segmentPoint(segments, index, t=.5) {
  if (index <= 0 || index >= segments.length) return null;
  const a=segments[index-1], s=segments[index]; if (!('x' in (a||{})) || !('x' in (s||{}))) return null;
  if (s.cmd==='C') return cubicPoint(a,{x:s.x1,y:s.y1},{x:s.x2,y:s.y2},s,t);
  if (s.cmd==='Q') return quadPoint(a,{x:s.x1,y:s.y1},s,t);
  return {x:a.x+(s.x-a.x)*t,y:a.y+(s.y-a.y)*t};
}
