import test from 'node:test';
import assert from 'node:assert/strict';
import { commandSearchText, groupCommands, scoreCommand, searchCommands } from '../src/ui-utils.js';

const commands = [
  { id:'gradient', label:'Open paint & gradients', group:'Effects', keywords:'fill stroke radial linear', priority:2 },
  { id:'grid', label:'Toggle grid', group:'View', keywords:'canvas guides' },
  { id:'trace', label:'Trace selected image', group:'Tracing', keywords:'vectorize raster png', priority:1 },
  { id:'text', label:'Text tool', group:'Tools', shortcut:'T', keywords:'typography type' }
];

test('command search text contains discoverability metadata', () => {
  assert.match(commandSearchText(commands[0]), /effects/);
  assert.match(commandSearchText(commands[0]), /radial/);
});

test('exact and prefix label matches outrank keyword-only matches', () => {
  assert.ok(scoreCommand('toggle grid', commands[1]) > scoreCommand('grid', commands[0]));
  const results = searchCommands(commands, 'trace');
  assert.equal(results[0].id, 'trace');
});

test('multi-token search can match across label group and keywords', () => {
  const results = searchCommands(commands, 'raster tracing');
  assert.equal(results[0].id, 'trace');
});

test('empty query preserves priority ordering', () => {
  const results = searchCommands(commands, '');
  assert.equal(results[0].id, 'gradient');
  assert.equal(results[1].id, 'trace');
});

test('groupCommands keeps command order inside groups', () => {
  const groups = groupCommands(commands);
  assert.deepEqual(groups.get('Effects').map(command => command.id), ['gradient']);
  assert.equal(groups.get('Tools')[0].id, 'text');
});
