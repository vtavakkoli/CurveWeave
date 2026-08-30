import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetMask, quantizeRgba, masksFromLabels, simplifyPolyline, normalizeAngle, easingSpline } from '../src/advanced-utils.js';

test('offset mask expands and contracts', () => {
  const w=5,h=5,m=new Uint8Array(w*h); m[2*w+2]=1;
  const expanded=offsetMask(m,w,h,1); assert.equal(expanded[2*w+1],1); assert.equal(expanded[0],0);
  const block=new Uint8Array(w*h).fill(1); const eroded=offsetMask(block,w,h,-1); assert.equal(eroded[2*w+2],1); assert.equal(eroded[0],0);
});

test('quantizer separates dominant red and blue clusters',()=>{
  const data=new Uint8ClampedArray([
    255,0,0,255, 250,5,0,255, 0,0,255,255, 5,0,250,255
  ]);
  const q=quantizeRgba(data,2,{iterations:5,maxSamples:10});
  assert.equal(q.centers.length,2); assert.equal(q.labels[0],q.labels[1]); assert.equal(q.labels[2],q.labels[3]); assert.notEqual(q.labels[0],q.labels[2]);
  const masks=masksFromLabels(q.labels,2); assert.equal(masks[0].reduce((a,b)=>a+b,0)+masks[1].reduce((a,b)=>a+b,0),4);
});

test('RDP simplification removes near-collinear points',()=>{
  const points=[{x:0,y:0},{x:1,y:.02},{x:2,y:0},{x:3,y:0}];
  assert.equal(simplifyPolyline(points,.1).length,2);
});

test('angle normalization and easing helpers',()=>{
  assert.equal(normalizeAngle(270),-90); assert.equal(normalizeAngle(-270),90); assert.match(easingSpline('ease-in-out'),/\.42/);
});
