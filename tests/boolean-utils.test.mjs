import test from 'node:test';
import assert from 'node:assert/strict';
import { combineMasks, traceMask, loopsToPath, connectedComponentsBySignature } from '../src/boolean-utils.js';

test('boolean mask operations are deterministic',()=>{
  const a=Uint8Array.from([1,1,0,0]); const b=Uint8Array.from([0,1,1,0]);
  assert.deepEqual([...combineMasks([a,b],'union')],[1,1,1,0]);
  assert.deepEqual([...combineMasks([a,b],'intersect')],[0,1,0,0]);
  assert.deepEqual([...combineMasks([a,b],'subtract')],[1,0,0,0]);
  assert.deepEqual([...combineMasks([a,b],'exclude')],[1,0,1,0]);
});

test('traceMask returns a closed contour around a rectangle',()=>{
  const mask=Uint8Array.from([1,1,1,1]);
  const loops=traceMask(mask,2,2); assert.equal(loops.length,1); assert.equal(loops[0].length,4);
  assert.match(loopsToPath(loops),/^M/); assert.match(loopsToPath(loops),/Z$/);
});

test('shape regions split different overlap signatures',()=>{
  const a=Uint8Array.from([1,1,0]); const b=Uint8Array.from([0,1,1]);
  const regions=connectedComponentsBySignature([a,b],3,1);
  assert.equal(regions.length,3);
  assert.deepEqual(new Set(regions.map(r=>r.signature)),new Set([1,2,3]));
});
