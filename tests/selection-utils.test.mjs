import test from 'node:test';
import assert from 'node:assert/strict';
import { alignmentOffset, distributionOffsets, normalizeRect, rectContains, rectIntersects } from '../src/selection-utils.js';

test('normalizeRect works in either drag direction', () => {
  assert.deepEqual(normalizeRect({x:8,y:7},{x:2,y:3}), {left:2,right:8,top:3,bottom:7,width:6,height:4});
});

test('containment and crossing selection behave differently', () => {
  const marquee = {left:0,right:10,top:0,bottom:10};
  const inside = {left:2,right:8,top:2,bottom:8};
  const crossing = {left:8,right:14,top:2,bottom:8};
  assert.equal(rectContains(marquee, inside), true);
  assert.equal(rectContains(marquee, crossing), false);
  assert.equal(rectIntersects(marquee, crossing), true);
});

test('alignment offsets align edges and centers', () => {
  const item = {left:10,right:20,top:20,bottom:30};
  const bounds = {left:0,right:40,top:0,bottom:50};
  assert.deepEqual(alignmentOffset(item,bounds,'left'), {dx:-10,dy:0});
  assert.deepEqual(alignmentOffset(item,bounds,'hcenter'), {dx:5,dy:0});
  assert.deepEqual(alignmentOffset(item,bounds,'bottom'), {dx:0,dy:20});
});

test('distributionOffsets spaces centers evenly', () => {
  const items = [
    {id:'a',left:0,width:10,top:0,height:10},
    {id:'b',left:12,width:10,top:0,height:10},
    {id:'c',left:40,width:10,top:0,height:10}
  ];
  const offsets = distributionOffsets(items,'x');
  assert.equal(offsets.get('a'), 0);
  assert.equal(offsets.get('c'), 0);
  assert.equal(offsets.get('b'), 8);
});
