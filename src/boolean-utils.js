export function combineMasks(masks, operation = 'union') {
  if (!masks.length) return new Uint8Array();
  const length = masks[0].length;
  const result = new Uint8Array(length);
  for (let i=0;i<length;i++) {
    const values = masks.map(mask => mask[i] > 0);
    let on = false;
    if (operation === 'union') on = values.some(Boolean);
    else if (operation === 'intersect') on = values.every(Boolean);
    else if (operation === 'subtract') on = values[0] && !values.slice(1).some(Boolean);
    else if (operation === 'exclude') on = values.filter(Boolean).length % 2 === 1;
    result[i] = on ? 1 : 0;
  }
  return result;
}

const key = (x,y) => `${x},${y}`;

export function traceMask(mask, width, height) {
  const edges = [];
  const filled = (x,y) => x>=0 && y>=0 && x<width && y<height && mask[y*width+x] > 0;
  const add = (ax,ay,bx,by) => edges.push({ ax,ay,bx,by, used:false });
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    if (!filled(x,y)) continue;
    if (!filled(x,y-1)) add(x,y,x+1,y);
    if (!filled(x+1,y)) add(x+1,y,x+1,y+1);
    if (!filled(x,y+1)) add(x+1,y+1,x,y+1);
    if (!filled(x-1,y)) add(x,y+1,x,y);
  }
  const byStart = new Map();
  edges.forEach((edge,index) => {
    const k=key(edge.ax,edge.ay); if (!byStart.has(k)) byStart.set(k,[]); byStart.get(k).push(index);
  });
  const loops=[];
  for (let seed=0;seed<edges.length;seed++) {
    if (edges[seed].used) continue;
    const loop=[]; let current=seed, guard=0;
    const startKey=key(edges[seed].ax,edges[seed].ay);
    while (current != null && guard++ < edges.length+4) {
      const edge=edges[current]; if (edge.used) break;
      edge.used=true; loop.push({x:edge.ax,y:edge.ay});
      const endKey=key(edge.bx,edge.by);
      if (endKey===startKey) break;
      const candidates=(byStart.get(endKey)||[]).filter(i=>!edges[i].used);
      if (!candidates.length) { loop.push({x:edge.bx,y:edge.by}); break; }
      current=chooseContinuation(edge,candidates.map(i=>edges[i]),candidates);
    }
    const simplified=simplifyLoop(loop);
    if (simplified.length>=3) loops.push(simplified);
  }
  return loops;
}

function chooseContinuation(previous, candidateEdges, indices) {
  const dx=previous.bx-previous.ax, dy=previous.by-previous.ay;
  let best=indices[0], bestScore=-Infinity;
  candidateEdges.forEach((edge, idx) => {
    const nx=edge.bx-edge.ax, ny=edge.by-edge.ay;
    const cross=dx*ny-dy*nx, dot=dx*nx+dy*ny;
    const score=(cross>0?3:cross===0?2:1)+(dot>0?.2:0);
    if (score>bestScore) {bestScore=score;best=indices[idx];}
  });
  return best;
}

export function simplifyLoop(points) {
  if (points.length<3) return points.slice();
  const out=[];
  for (let i=0;i<points.length;i++) {
    const a=points[(i-1+points.length)%points.length], b=points[i], c=points[(i+1)%points.length];
    const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    if (Math.abs(cross)>1e-9) out.push(b);
  }
  return out.length>=3?out:points.slice();
}

export function loopsToPath(loops, { originX=0, originY=0, scaleX=1, scaleY=1, precision=2 } = {}) {
  const n=value=>Number(value.toFixed(precision));
  return loops.map(loop => loop.map((p,i) => `${i?'L':'M'}${n(originX+p.x*scaleX)} ${n(originY+p.y*scaleY)}`).join(' ')+' Z').join(' ');
}

export function maskBounds(mask, width, height) {
  let minX=width,minY=height,maxX=-1,maxY=-1;
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) if (mask[y*width+x]) {
    minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
  }
  return maxX<minX?null:{minX,minY,maxX:maxX+1,maxY:maxY+1};
}

export function connectedComponentsBySignature(masks, width, height, maxShapes=24) {
  const count=Math.min(maxShapes,masks.length);
  const signature=new Uint32Array(width*height);
  for (let i=0;i<signature.length;i++) {
    let bits=0; for (let m=0;m<count;m++) if (masks[m][i]) bits|=(1<<m); signature[i]=bits>>>0;
  }
  const seen=new Uint8Array(signature.length), regions=[];
  const neighbors=[[1,0],[-1,0],[0,1],[0,-1]];
  for (let start=0;start<signature.length;start++) {
    if (seen[start] || !signature[start]) continue;
    const sig=signature[start], pixels=[], queue=[start]; seen[start]=1;
    for (let qi=0;qi<queue.length;qi++) {
      const index=queue[qi], x=index%width, y=Math.floor(index/width); pixels.push(index);
      for (const [dx,dy] of neighbors) {
        const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=width||ny>=height) continue;
        const ni=ny*width+nx; if(!seen[ni] && signature[ni]===sig){seen[ni]=1;queue.push(ni);}
      }
    }
    const mask=new Uint8Array(width*height); pixels.forEach(i=>mask[i]=1);
    regions.push({ signature:sig, pixels:pixels.length, mask, loops:traceMask(mask,width,height) });
  }
  return regions.sort((a,b)=>b.pixels-a.pixels);
}
