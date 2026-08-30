import { formatBytes, repairSvgText } from './svg-utils.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const SVG_NS = 'http://www.w3.org/2000/svg';
const connector = { active:false, start:null };
let nudgeDirty = false;
let connectorRefreshQueued = false;
let localToastTimer = null;
let activeRepairPreview = null;

function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(localToastTimer);
  localToastTimer = setTimeout(() => node.classList.remove('visible'), 1800);
}

function setStatus(message) {
  const node = $('#statusMessage');
  if (node) node.textContent = message;
}

function currentSvg() { return $('#artboard svg'); }

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, char => `\\${char.codePointAt(0).toString(16)} `);
}

function selectedNodes() {
  const svg = currentSvg();
  if (!svg) return [];
  return $$('#layersList .layer.selected')
    .map(button => button.dataset.id ? svg.querySelector(`[data-cw-id="${cssEscape(button.dataset.id)}"]`) : null)
    .filter(Boolean);
}

function selectedPrimary() {
  const nodes = selectedNodes();
  return nodes[nodes.length - 1] || null;
}

function currentSvgText() {
  const svg = currentSvg();
  if (!svg) return '';
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('[data-cw-id],[data-cw-selected]').forEach(node => {
    node.removeAttribute('data-cw-id');
    node.removeAttribute('data-cw-selected');
  });
  return new XMLSerializer().serializeToString(clone);
}

function commitSelectionChange() {
  const opacity = $('#opacityRange');
  if (opacity && selectedNodes().length) opacity.dispatchEvent(new Event('change', { bubbles:true }));
}

function refreshSelectionOverlay() {
  const opacity = $('#opacityRange');
  if (opacity && selectedNodes().length) opacity.dispatchEvent(new Event('input', { bubbles:true }));
}

function applyViaSource(svgText, selectDomId = null) {
  const editor = $('#sourceEditor');
  const apply = $('#applySourceBtn');
  if (!editor || !apply) return;
  editor.value = svgText;
  editor.dispatchEvent(new Event('input', { bubbles:true }));
  apply.click();
  if (selectDomId) {
    requestAnimationFrame(() => {
      const node = currentSvg()?.querySelector(`#${cssEscape(selectDomId)}`);
      const editorId = node?.dataset.cwId;
      if (!editorId) return;
      const layer = $(`#layersList .layer[data-id="${cssEscape(editorId)}"]`);
      layer?.click();
    });
  }
}

function ensureFontOption(select, value) {
  if (!select || !value) return;
  select.querySelector('option[data-current="true"]')?.remove();
  if ([...select.options].some(option => option.value === value)) {
    select.value = value;
    return;
  }
  const option = document.createElement('option');
  option.value = value;
  option.textContent = `Current: ${value}`;
  option.dataset.current = 'true';
  select.appendChild(option);
  select.value = value;
}

function syncTextInspector() {
  const section = $('#textStyleSection');
  const node = selectedPrimary();
  const isText = node?.tagName?.toLowerCase() === 'text';
  if (!section) return;
  section.hidden = !isText;
  if (!isText) return;

  const computed = getComputedStyle(node);
  const family = node.getAttribute('font-family') || computed.fontFamily || 'system-ui, sans-serif';
  const size = parseFloat(node.getAttribute('font-size') || computed.fontSize) || 16;
  ensureFontOption($('#fontFamily'), family);
  $('#fontSize').value = String(Math.round(size * 100) / 100);
  const existingFill = $('#fillColor')?.value;
  if (existingFill && /^#[0-9a-f]{6}$/i.test(existingFill)) $('#fontColor').value = existingFill;
}

function bindTextControls() {
  const family = $('#fontFamily');
  const size = $('#fontSize');
  const color = $('#fontColor');
  if (!family || !size || !color) return;

  family.addEventListener('change', event => {
    const node = selectedPrimary();
    if (node?.tagName?.toLowerCase() !== 'text') return;
    node.setAttribute('font-family', event.target.value);
    commitSelectionChange();
    toast('Font updated');
  });

  size.addEventListener('change', event => {
    const node = selectedPrimary();
    if (node?.tagName?.toLowerCase() !== 'text') return;
    const value = Math.max(1, Math.min(1000, Number(event.target.value) || 16));
    event.target.value = String(value);
    node.setAttribute('font-size', String(value));
    commitSelectionChange();
  });

  color.addEventListener('input', event => {
    const node = selectedPrimary();
    if (node?.tagName?.toLowerCase() !== 'text') return;
    node.setAttribute('fill', event.target.value);
    if ($('#fillColor')) $('#fillColor').value = event.target.value;
    if ($('#fillText')) $('#fillText').value = event.target.value;
    refreshSelectionOverlay();
  });
  color.addEventListener('change', commitSelectionChange);
}

function translateNode(node, dx, dy) {
  if (!node || node.dataset.cwConnector === 'true') return;
  const base = node.transform?.baseVal;
  const consolidated = base?.numberOfItems ? base.consolidate() : null;
  if (!consolidated) {
    node.setAttribute('transform', `translate(${dx} ${dy})`);
    return;
  }
  const m = consolidated.matrix;
  node.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e + dx} ${m.f + dy})`);
}

function nudgeSelection(key, amount) {
  const delta = {
    ArrowLeft:[-amount, 0], ArrowRight:[amount, 0], ArrowUp:[0, -amount], ArrowDown:[0, amount]
  }[key];
  if (!delta) return false;
  const nodes = selectedNodes().filter(node => node.dataset.cwConnector !== 'true');
  if (!nodes.length) return false;
  nodes.forEach(node => translateNode(node, delta[0], delta[1]));
  refreshConnectors();
  refreshSelectionOverlay();
  nudgeDirty = true;
  setStatus(`Moved ${nodes.length === 1 ? 'selection' : `${nodes.length} elements`} ${amount} unit${amount === 1 ? '' : 's'} · Shift+Arrow = 10`);
  return true;
}

function connectorCenter(node, svg) {
  try {
    const box = node.getBBox();
    const p = svg.createSVGPoint();
    p.x = box.x + box.width / 2;
    p.y = box.y + box.height / 2;
    const matrix = node.getCTM();
    return matrix ? p.matrixTransform(matrix) : p;
  } catch { return null; }
}

function ensureObjectId(node) {
  if (node.id) return node.id;
  node.id = `cw-object-${Math.random().toString(36).slice(2, 9)}`;
  return node.id;
}

function ensureConnectorMarker(svg) {
  let marker = svg.querySelector('#cw-connector-arrow');
  if (marker) return marker;
  let defs = svg.querySelector(':scope > defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', 'cw-connector-arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('orient', 'auto-start-reverse');
  const arrow = document.createElementNS(SVG_NS, 'path');
  arrow.setAttribute('d', 'M0 0L10 5L0 10Z');
  arrow.setAttribute('fill', 'context-stroke');
  marker.appendChild(arrow);
  defs.appendChild(marker);
  return marker;
}

function updateConnectorPath(path, svg) {
  const from = svg.querySelector(`#${cssEscape(path.dataset.cwFrom || '')}`);
  const to = svg.querySelector(`#${cssEscape(path.dataset.cwTo || '')}`);
  if (!from || !to) return false;
  const a = connectorCenter(from, svg), b = connectorCenter(to, svg);
  if (!a || !b) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  const bend = Math.min(80, distance * 0.22);
  const useCurve = Math.abs(dx) > 40 && Math.abs(dy) > 24;
  const d = useCurve
    ? `M${a.x} ${a.y} C${a.x + Math.sign(dx || 1) * bend} ${a.y} ${b.x - Math.sign(dx || 1) * bend} ${b.y} ${b.x} ${b.y}`
    : `M${a.x} ${a.y} L${b.x} ${b.y}`;
  if (path.getAttribute('d') !== d) path.setAttribute('d', d);
  return true;
}

function refreshConnectors() {
  if (connectorRefreshQueued) return;
  connectorRefreshQueued = true;
  requestAnimationFrame(() => {
    connectorRefreshQueued = false;
    const svg = currentSvg();
    if (!svg) return;
    svg.querySelectorAll('[data-cw-connector="true"]').forEach(path => {
      const fromExists = svg.querySelector(`#${cssEscape(path.dataset.cwFrom || '')}`);
      const toExists = svg.querySelector(`#${cssEscape(path.dataset.cwTo || '')}`);
      if (!fromExists || !toExists) path.remove();
      else updateConnectorPath(path, svg);
    });
  });
}

function removeConnectorsForSelection() {
  const svg = currentSvg();
  if (!svg) return;
  const selected = selectedNodes();
  if (!selected.length) return;
  svg.querySelectorAll('[data-cw-connector="true"]').forEach(path => {
    const from = svg.querySelector(`#${cssEscape(path.dataset.cwFrom || '')}`);
    const to = svg.querySelector(`#${cssEscape(path.dataset.cwTo || '')}`);
    const endpointWillBeRemoved = [from, to].some(endpoint => endpoint && selected.some(node => node === endpoint || node.contains(endpoint)));
    if (endpointWillBeRemoved) path.remove();
  });
}

function exitConnectorMode(message = null) {
  connector.active = false;
  connector.start = null;
  $('#connectorTool')?.classList.remove('active');
  document.querySelector('[data-tool="select"]')?.click();
  if (message) toast(message);
}

function activateConnectorMode() {
  if (connector.active) { exitConnectorMode('Connector cancelled'); return; }
  document.querySelector('[data-tool="select"]')?.click();
  connector.active = true;
  connector.start = null;
  $$('.tool[data-tool]').forEach(button => button.classList.remove('active'));
  $('#connectorTool')?.classList.add('active');
  setStatus('Connector · click a start object, then click the destination object · Esc to cancel');
}

function createConnector(fromNode, toNode) {
  const svg = currentSvg();
  if (!svg || fromNode === toNode) { toast('Choose two different objects'); return; }
  ensureConnectorMarker(svg);
  const fromId = ensureObjectId(fromNode);
  const toId = ensureObjectId(toNode);
  const path = document.createElementNS(SVG_NS, 'path');
  path.dataset.cwConnector = 'true';
  path.dataset.cwFrom = fromId;
  path.dataset.cwTo = toId;
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#7257ff');
  path.setAttribute('stroke-width', '2.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('marker-end', 'url(#cw-connector-arrow)');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  updateConnectorPath(path, svg);
  const defs = svg.querySelector(':scope > defs');
  svg.insertBefore(path, defs?.nextSibling || svg.firstChild);
  applyViaSource(new XMLSerializer().serializeToString(svg));
  exitConnectorMode('Connector created');
}

function bindConnectorTool() {
  $('#connectorTool')?.addEventListener('click', activateConnectorMode);
  $('#artboard')?.addEventListener('pointerdown', event => {
    if (!connector.active || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = event.target.closest?.('[data-cw-id]');
    if (!target || target.dataset.cwConnector === 'true') {
      toast('Click an SVG object to connect');
      return;
    }
    if (!connector.start) {
      connector.start = target;
      setStatus('Connector · start object selected; click the destination object');
      toast('Start object selected');
      return;
    }
    createConnector(connector.start, target);
  }, true);
}

function prefixImportedIds(svg, prefix) {
  const map = new Map();
  svg.querySelectorAll('[id]').forEach(node => {
    const oldId = node.id;
    const newId = `${prefix}-${oldId}`;
    map.set(oldId, newId);
    node.id = newId;
  });
  svg.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => {
      let value = attr.value;
      for (const [oldId, newId] of map) {
        value = value.replaceAll(`url(#${oldId})`, `url(#${newId})`);
        if ((attr.name === 'href' || attr.name === 'xlink:href') && value === `#${oldId}`) value = `#${newId}`;
      }
      if (value !== attr.value) node.setAttribute(attr.name, value);
    });
  });
}

function pasteSvgText(text) {
  const destination = currentSvg();
  if (!destination) return;
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const source = parsed.documentElement;
  if (!source || source.tagName?.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) {
    toast('Clipboard SVG could not be parsed');
    return;
  }

  const prefix = `cw-paste-${Math.random().toString(36).slice(2, 8)}`;
  prefixImportedIds(source, prefix);
  const destBox = destination.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number) || [0,0,960,600];
  const sourceBox = source.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  const sx = sourceBox?.length === 4 ? sourceBox[0] : 0;
  const sy = sourceBox?.length === 4 ? sourceBox[1] : 0;
  const sw = sourceBox?.length === 4 ? sourceBox[2] : (parseFloat(source.getAttribute('width')) || 300);
  const sh = sourceBox?.length === 4 ? sourceBox[3] : (parseFloat(source.getAttribute('height')) || 150);
  const scale = Math.min(1, destBox[2] * 0.6 / Math.max(1, sw), destBox[3] * 0.6 / Math.max(1, sh));
  const tx = destBox[0] + (destBox[2] - sw * scale) / 2 - sx * scale;
  const ty = destBox[1] + (destBox[3] - sh * scale) / 2 - sy * scale;

  const group = document.createElementNS(SVG_NS, 'g');
  group.id = `${prefix}-group`;
  group.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
  const nested = document.importNode(source, true);
  nested.setAttribute('x', '0');
  nested.setAttribute('y', '0');
  nested.setAttribute('width', String(sw));
  nested.setAttribute('height', String(sh));
  if (!nested.getAttribute('viewBox')) nested.setAttribute('viewBox', `0 0 ${sw} ${sh}`);
  group.appendChild(nested);
  destination.appendChild(group);
  applyViaSource(new XMLSerializer().serializeToString(destination), group.id);
  toast('SVG pasted into canvas');
}

function bindClipboardPaste() {
  window.addEventListener('paste', event => {
    const tag = event.target?.tagName;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || event.target?.isContentEditable) return;
    const data = event.clipboardData;
    if (!data) return;
    const text = data.getData('image/svg+xml') || data.getData('text/plain');
    if (!/<svg[\s>]/i.test(text || '')) return;
    event.preventDefault();
    pasteSvgText(text);
  });
}

function updateRepairPreview() {
  const dialog = $('#repairDialog');
  if (!dialog?.open) return;
  try {
    activeRepairPreview = repairSvgText(currentSvgText(), {
      precision:Number($('#precisionSelect')?.value || 3),
      tolerance:Number($('#simplifyTolerance')?.value || 0.75)
    });
    $('#repairBefore').textContent = formatBytes(activeRepairPreview.before.bytes);
    $('#repairAfter').textContent = formatBytes(activeRepairPreview.after.bytes);
    $('#repairSaved').textContent = activeRepairPreview.savedBytes
      ? `${formatBytes(activeRepairPreview.savedBytes)} (${Math.round(activeRepairPreview.savedBytes / Math.max(1, activeRepairPreview.before.bytes) * 100)}%)`
      : 'Already compact';
    if ($('#repairNodes')) $('#repairNodes').textContent = activeRepairPreview.removedNodes
      ? `${activeRepairPreview.removedNodes} fewer path command${activeRepairPreview.removedNodes === 1 ? '' : 's'}`
      : 'No redundant path commands';
  } catch (error) {
    toast(error.message || 'Could not optimize SVG');
  }
}

function bindRepairEnhancements() {
  $('#repairBtn')?.addEventListener('click', () => queueMicrotask(updateRepairPreview));
  $('#precisionSelect')?.addEventListener('change', () => queueMicrotask(updateRepairPreview));
  $('#simplifyTolerance')?.addEventListener('change', updateRepairPreview);
  $('#confirmRepairBtn')?.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    updateRepairPreview();
    if (!activeRepairPreview) return;
    const dialog = $('#repairDialog');
    dialog?.close('cancel');
    applyViaSource(activeRepairPreview.text);
    toast(activeRepairPreview.removedNodes
      ? `Optimized · ${activeRepairPreview.removedNodes} path commands removed`
      : 'Repair applied');
    activeRepairPreview = null;
  }, true);
}

function bindKeyboardEnhancements() {
  window.addEventListener('keydown', event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable;
    if (typing) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      activateConnectorMode();
      return;
    }
    if (connector.active && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      exitConnectorMode('Connector cancelled');
      return;
    }
    if (event.key.startsWith('Arrow')) {
      const amount = event.shiftKey ? 10 : 1;
      if (nudgeSelection(event.key, amount)) event.preventDefault();
    }
  }, true);

  window.addEventListener('keyup', event => {
    if (!event.key.startsWith('Arrow') || !nudgeDirty) return;
    nudgeDirty = false;
    commitSelectionChange();
  }, true);

  document.addEventListener('click', event => {
    if (event.target.closest?.('#deleteBtn')) removeConnectorsForSelection();
  }, true);
  window.addEventListener('keydown', event => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) removeConnectorsForSelection();
  }, true);
}

function bindObservers() {
  const layers = $('#layersList');
  if (layers) new MutationObserver(syncTextInspector).observe(layers, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  const artboard = $('#artboard');
  if (artboard) new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.type === 'childList' || (mutation.type === 'attributes' && mutation.target.dataset?.cwConnector !== 'true'))) refreshConnectors();
    syncTextInspector();
  }).observe(artboard, { childList:true, subtree:true, attributes:true, attributeFilter:['transform','x','y','cx','cy','width','height','d','fill','font-size','font-family'] });
}

function initEnhancements() {
  bindTextControls();
  bindConnectorTool();
  bindClipboardPaste();
  bindRepairEnhancements();
  bindKeyboardEnhancements();
  bindObservers();
  syncTextInspector();
  refreshConnectors();
}

initEnhancements();
