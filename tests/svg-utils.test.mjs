import test from 'node:test';
import assert from 'node:assert/strict';
import { compactNumbers, estimateSvgStats, repairSvgText, sanitizeSvgText, safeFileName } from '../src/svg-utils.js';

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

test('repairSvgText removes metadata and reduces numeric precision', () => {
  const result = repairSvgText('<svg>\n<!--x--><metadata>abc</metadata><path d="M 1.23456 2.34567"/>\n</svg>', { precision: 2 });
  assert.equal(result.text.includes('metadata'), false);
  assert.match(result.text, /1\.23 2\.35/);
});

test('safeFileName returns portable output names', () => {
  assert.equal(safeFileName('My Logo / Final'), 'My-Logo-Final');
});
