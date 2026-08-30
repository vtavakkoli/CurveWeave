import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactNumbers,
  estimateSvgStats,
  repairSvgText,
  sanitizeSvgText,
  safeFileName,
  simplifyPathData,
  simplifyPointList
} from '../src/svg-utils.js';

test('compactNumbers rounds numeric tokens', () => {
  assert.equal(compactNumbers('M 1.23456 2.00001', 2), 'M 1.23 2');
});

test('estimateSvgStats counts common SVG elements', () => {
  const stats = estimateSvgStats('<svg><g><path d="M0 0L2 2Z"/><rect/></g></svg>');
  assert.equal(stats.paths, 1);
  assert.equal(stats.shapes, 1);
  assert.equal(stats.groups, 1);
  assert.equal(stats.nodes, 3);
});

test('sanitizeSvgText strips script and event handlers', () => {
  const clean = sanitizeSvgText('<svg onclick="bad()"><script>alert(1)</script><path d="M0 0"/></svg>');
  assert.equal(clean.includes('<script'), false);
  assert.equal(clean.includes('onclick'), false);
});

test('simplifyPathData removes redundant line points', () => {
  const simplified = simplifyPathData('M0 0 L10 0 L20 0 L30 0 L30 20', { tolerance: 0.01, precision: 2 });
  assert.equal(simplified, 'M0 0H30V20');
});

test('simplifyPathData collapses nearly straight cubic controls', () => {
  const simplified = simplifyPathData('M0 0 C10 0.05 20 -0.04 30 0', { tolerance: 0.1, precision: 2 });
  assert.equal(simplified, 'M0 0H30');
});

test('simplifyPointList applies RDP to polyline points', () => {
  const simplified = simplifyPointList('0,0 10,0.02 20,-0.01 30,0', { tolerance: 0.1, precision: 2 });
  assert.equal(simplified, '0,0 30,0');
});

test('repairSvgText removes metadata, simplifies geometry and reports removed nodes', () => {
  const result = repairSvgText('<svg>\n<!--x--><metadata>abc</metadata><path d="M0 0 L10 0 L20 0 L30 0"/>\n</svg>', { precision: 2, tolerance: 0.1 });
  assert.equal(result.text.includes('metadata'), false);
  assert.match(result.text, /d="M0 0H30"/);
  assert.equal(result.removedNodes, 2);
});

test('safeFileName returns portable output names', () => {
  assert.equal(safeFileName('My Logo / Final'), 'My-Logo-Final');
});
