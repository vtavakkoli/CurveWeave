import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathData, serializePathData, moveAnchor, insertMidpoint, convertSegment, toggleClosed } from '../src/path-geometry.js';

test('normalizes relative and shorthand path commands',()=>{
  const s=normalizePathData('M10 10 h20 v10 s10 10 20 0');
  assert.equal(s[0].cmd,'M'); assert.deepEqual([s[1].x,s[1].y],[30,10]);
  assert.deepEqual([s[2].x,s[2].y],[30,20]); assert.equal(s[3].cmd,'C');
});

test('moving an anchor carries adjacent cubic handles',()=>{
  const s=normalizePathData('M0 0 C10 0 20 0 30 0 C40 0 50 0 60 0');
  const moved=moveAnchor(s,1,30,10);
  assert.equal(moved[1].y,10); assert.equal(moved[1].y2,10); assert.equal(moved[2].y1,10);
});

test('inserting cubic midpoint splits into two cubics',()=>{
  const s=normalizePathData('M0 0 C0 10 10 10 10 0');
  const split=insertMidpoint(s,1); assert.equal(split.length,3); assert.equal(split[1].cmd,'C'); assert.equal(split[2].cmd,'C');
});

test('inserting quadratic midpoint preserves endpoint geometry',()=>{
  const s=normalizePathData('M0 0 Q10 20 20 0');
  const split=insertMidpoint(s,1);
  assert.equal(split.length,3); assert.equal(split[1].cmd,'Q'); assert.equal(split[2].cmd,'Q');
  assert.deepEqual([split[2].x,split[2].y],[20,0]);
});

test('segment conversion and close toggle serialize valid path',()=>{
  const s=normalizePathData('M0 0 L10 0 L10 10');
  const curve=convertSegment(s,1,'curve'); assert.equal(curve[1].cmd,'C');
  const closed=toggleClosed(curve); assert.equal(closed.at(-1).cmd,'Z'); assert.match(serializePathData(closed),/Z$/);
});
