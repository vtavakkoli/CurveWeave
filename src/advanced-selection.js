import { alignmentOffset, distributionOffsets, normalizeRect, rectContains, rectIntersects } from './selection-utils.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const marquee = { active: false, drag: null };
const lockedNodes = new Set();
let toastTimer = null;
let layerSyncQueued = false;

function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible'), 1900);
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

function nodeForLayer(button) {
  const svg = currentSvg();
  const id = button?.dataset?.id;
  return svg && id ? svg.querySelector(`[data-cw-id="${cssEscape(id)}"]`) : null;
}

function layerForNode(node) {
  const id = node?.dataset?.cwId;
  return id ? $(`#layersList .layer[data-id="${cssEscape(id)}"]`) : null;
}

function selectedNodes() {
  return $$('#layersList .layer.selected').map(nodeForLayer).filter(Boolean);
}

function operationNodes() {
  const nodes = selectedNodes().filter(node => node.dataset.cwConnector !== 'true' && !lockedNodes.has(node));
  return nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));
}

function topSelectableNodes() {
  const svg = currentSvg();
  if (!svg) return [];
  return [...svg.querySelectorAll('[data-cw-id]')].filter(node => {
    if (node.closest('defs') || node.getAttribute('display') === 'none' || lockedNodes.has(node) || node.dataset.cwConnector === 'true') return false;
    const parentSelectable = node.parentElement?.closest('[data-cw-id]');
    return !parentSelectable || !svg.contains(parentSelectable);
  });
}

function dispatchLayerClick(button, shiftKey = false) {
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey }));
}

function clearSelection() {
  const ids = $$('#layersList .layer.selected').map(button => button.dataset.id).filter(Boolean);
  ids.forEach(id => {
    const current = $(`#layersList .layer[data-id="${cssEscape(id)}"]`);
    if (current?.classList.contains('selected')) dispatchLayerClick(current, true);
  });
}

function selectNodes(nodes, additive = false) {
  const unique = [...new Set(nodes)].filter(node => node?.isConnected && !lockedNodes.has(node));
  if (!additive) clearSelection();
  const already = new Set($$('#layersList .layer.selected').map(button => button.dataset.id));
  unique.forEach(node => {
    const id = node.dataset.cwId;
    if (!id || already.has(id)) return;
    const layer = layerForNode(node);
    if (layer) {
      dispatchLayerClick(layer, true);
      already.add(id);
    }
  });
  updateAdvancedPanel();
}

function injectStyles() {
  const style = document.createElement('style');
  style.id = 'cw-advanced-selection-style';
  style.textContent = `
    .cw-marquee{position:absolute;z-index:30;pointer-events:none;border:1.5px solid var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent);border-radius:2px;box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 25%,transparent) inset}
    .cw-marquee.crossing{border-style:dashed;background:color-mix(in srgb,var(--accent-2) 10%,transparent);border-color:var(--accent-2)}
    .cw-advanced-panel .panel-title span{font-size:10px;color:var(--muted)}
    .cw-action-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:9px}
    .cw-action-grid.two{grid-template-columns:repeat(2,1fr)}
    .cw-action-grid .mini-button{min-height:30px;padding:0 7px;font-size:10px;white-space:nowrap}
    .cw-action-grid .mini-button:disabled{opacity:.35;cursor:not-allowed}
    .cw-section-label{display:flex;justify-content:space-between;align-items:center;margin-top:12px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.05em}
    .cw-selection-hint{margin:9px 0 0;color:var(--muted);font-size:10px;line-height:1.45}
    .cw-lock-mark{margin-left:auto;color:var(--accent);font-size:10px}
    .layer.cw-locked{opacity:.62}
    .layer.cw-locked .eye{display:none}
    #marqueeTool.active{color:white;background:var(--accent);border-color:color-mix(in srgb,var(--accent) 70%,white)}
  `;
  document.head.appendChild(style);
}

function injectTool() {
  const select = document.querySelector('.tool[data-tool="select"]');
  if (!select || $('#marqueeTool')) return;
  const button = document.createElement('button');
  button.className = 'tool';
  button.id = 'marqueeTool';
  button.title = 'Marquee multi-select (M)';
  button.innerHTML = '<span>▱</span><small>M</small>';
  select.insertAdjacentElement('afterend', button);
  button.addEventListener('click', () => marquee.active ? deactivateMarquee() : activateMarquee());
}

function injectPanel() {
  if ($('#advancedArrangePanel')) return;
  const inspector = $('.inspector');
  const stats = $('.stats-panel');
  if (!inspector || !stats) return;
  const panel = document.createElement('section');
  panel.className = 'panel cw-advanced-panel';
  panel.id = 'advancedArrangePanel';
  panel.innerHTML = `
    <div class="panel-title"><strong>Arrange & selection</strong><span id="advancedSelectionCount">0 selected</span></div>
    <div class="cw-section-label"><span>Align</span><span>2+ objects</span></div>
    <div class="cw-action-grid">
      <button class="mini-button" data-cw-action="left" title="Align left">Left</button>
      <button class="mini-button" data-cw-action="hcenter" title="Align horizontal centers">Center</button>
      <button class="mini-button" data-cw-action="right" title="Align right">Right</button>
      <button class="mini-button" data-cw-action="top" title="Align top">Top</button>
      <button class="mini-button" data-cw-action="vcenter" title="Align vertical centers">Middle</button>
      <button class="mini-button" data-cw-action="bottom" title="Align bottom">Bottom</button>
    </div>
    <div class="cw-section-label"><span>Distribute</span><span>3+ objects</span></div>
    <div class="cw-action-grid two">
      <button class="mini-button" data-cw-action="distribute-x">Horizontal</button>
      <button class="mini-button" data-cw-action="distribute-y">Vertical</button>
    </div>
    <div class="cw-section-label"><span>Transform</span><span>selection</span></div>
    <div class="cw-action-grid two">
      <button class="mini-button" data-cw-action="rotate-left">↶ 90°</button>
      <button class="mini-button" data-cw-action="rotate-right">↷ 90°</button>
      <button class="mini-button" data-cw-action="flip-h">⇆ Flip H</button>
      <button class="mini-button" data-cw-action="flip-v">⇅ Flip V</button>
    </div>
    <div class="cw-section-label"><span>Select</span><span>power tools</span></div>
    <div class="cw-action-grid two">
      <button class="mini-button" data-cw-action="all">Select all</button>
      <button class="mini-button" data-cw-action="same">Same type</button>
      <button class="mini-button" data-cw-action="invert">Invert</button>
      <button class="mini-button" data-cw-action="lock">Lock selected</button>
      <button class="mini-button" data-cw-action="unlock-all">Unlock all</button>
    </div>
    <p class="cw-selection-hint"><strong>M</strong> drag to multi-select · left→right contains · right→left crosses · <strong>Shift</strong> adds · then drag any selected object to move the group.</p>
  `;
  inspector.insertBefore(panel, stats);
  panel.addEventListener('click', event => {
    const action = event.target.closest('[data-cw-action]')?.dataset.cwAction;
    if (action) runAction(action);
  });
}

function getOverlay() {
  let overlay = $('#cwMarquee');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cwMarquee';
    overlay.className = 'cw-marquee';
    overlay.hidden = true;
    $('#artboardWrap')?.appendChild(overlay);
  }
  return overlay;
}

function activateMarquee() {
  document.querySelector('.tool[data-tool="select"]')?.click();
  marquee.active = true;
  $('#marqueeTool')?.classList.add('active');
  setStatus('Marquee select · drag left→right to contain · right→left to cross · Shift adds to selection');
}

function deactivateMarquee(switchToSelect = true) {
  marquee.active = false;
  marquee.drag = null;
  $('#marqueeTool')?.classList.remove('active');
  const overlay = getOverlay();
  overlay.hidden = true;
  if (switchToSelect) document.querySelector('.tool[data-tool="select"]')?.click();
}

function updateMarqueeVisual() {
  if (!marquee.drag) return;
  const wrap = $('#artboardWrap');
  const overlay = getOverlay();
  const wrapRect = wrap?.getBoundingClientRect();
  if (!wrapRect) return;
  const rect = normalizeRect(marquee.drag.start, marquee.drag.current);
  overlay.hidden = rect.width < 2 && rect.height < 2;
  overlay.style.left = `${rect.left - wrapRect.left}px`;
  overlay.style.top = `${rect.top - wrapRect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.classList.toggle('crossing', marquee.drag.current.x < marquee.drag.start.x);
}

function finishMarquee() {
  const drag = marquee.drag;
  if (!drag) return;
  marquee.drag = null;
  getOverlay().hidden = true;
  const rect = normalizeRect(drag.start, drag.current);
  const crossing = drag.current.x < drag.start.x;
  const isClick = rect.width < 4 && rect.height < 4;
  let matches = [];

  if (isClick) {
    const target = drag.target?.closest?.('[data-cw-id]');
    if (target && !lockedNodes.has(target) && target.dataset.cwConnector !== 'true') matches = [target];
  } else {
    matches = topSelectableNodes().filter(node => {
      const box = node.getBoundingClientRect();
      if ((!box.width && !box.height) || box.width > 1e6 || box.height > 1e6) return false;
      const item = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      return crossing ? rectIntersects(rect, item) : rectContains(rect, item);
    });
  }

  selectNodes(matches, drag.additive);
  deactivateMarquee(true);
  const count = selectedNodes().length;
  requestAnimationFrame(() => setStatus(count ? `${count} object${count === 1 ? '' : 's'} selected · drag any selected object to move together` : 'Nothing selected'));
  if (matches.length) toast(`${matches.length} object${matches.length === 1 ? '' : 's'} selected`);
}

function bindMarquee() {
  const artboard = $('#artboard');
  if (!artboard) return;
  artboard.addEventListener('pointerdown', event => {
    if (!marquee.active || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    marquee.drag = {
      start: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
      additive: event.shiftKey,
      target: event.target
    };
    updateMarqueeVisual();
  }, true);

  window.addEventListener('pointermove', event => {
    if (!marquee.drag) return;
    marquee.drag.current = { x: event.clientX, y: event.clientY };
    updateMarqueeVisual();
  }, true);

  window.addEventListener('pointerup', event => {
    if (!marquee.drag) return;
    marquee.drag.current = { x: event.clientX, y: event.clientY };
    finishMarquee();
  }, true);

  $$('.tool[data-tool]').forEach(button => button.addEventListener('click', () => {
    if (marquee.active) deactivateMarquee(false);
  }));
  $('#connectorTool')?.addEventListener('click', () => { if (marquee.active) deactivateMarquee(false); });
}

function rootRect(node, svg) {
  try {
    const box = node.getBBox();
    const matrix = node.getCTM();
    if (!matrix) return null;
    const points = [
      [box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]
    ].map(([x, y]) => {
      const point = svg.createSVGPoint(); point.x = x; point.y = y;
      return point.matrixTransform(matrix);
    });
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  } catch { return null; }
}

function selectionGeometry(nodes) {
  const svg = currentSvg();
  const items = nodes.map(node => ({ node, id: node.dataset.cwId, ...rootRect(node, svg) })).filter(item => Number.isFinite(item.left));
  if (!items.length) return { items: [], bounds: null };
  const bounds = items.reduce((acc, item) => ({
    left: Math.min(acc.left, item.left), right: Math.max(acc.right, item.right),
    top: Math.min(acc.top, item.top), bottom: Math.max(acc.bottom, item.bottom)
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  bounds.width = bounds.right - bounds.left;
  bounds.height = bounds.bottom - bounds.top;
  return { items, bounds };
}

function rootDeltaToParent(node, dx, dy) {
  const svg = currentSvg();
  const parent = node.parentElement;
  if (!svg || !parent || parent === svg) return { dx, dy };
  const matrix = parent.getCTM?.();
  if (!matrix) return { dx, dy };
  const det = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(det) < 1e-10) return { dx, dy };
  return {
    dx: (matrix.d * dx - matrix.c * dy) / det,
    dy: (-matrix.b * dx + matrix.a * dy) / det
  };
}

function rootPointToParent(node, x, y) {
  const svg = currentSvg();
  const parent = node.parentElement;
  if (!svg || !parent || parent === svg) return { x, y };
  const matrix = parent.getCTM?.();
  if (!matrix?.inverse) return { x, y };
  const point = svg.createSVGPoint(); point.x = x; point.y = y;
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

function translateNode(node, dx, dy) {
  if (!dx && !dy) return;
  const local = rootDeltaToParent(node, dx, dy);
  const existing = node.getAttribute('transform') || '';
  node.setAttribute('transform', `translate(${local.dx} ${local.dy}) ${existing}`.trim());
}

function transformAround(node, center, transform) {
  const local = rootPointToParent(node, center.x, center.y);
  const existing = node.getAttribute('transform') || '';
  node.setAttribute('transform', `translate(${local.x} ${local.y}) ${transform} translate(${-local.x} ${-local.y}) ${existing}`.trim());
}

function connectorCenter(node, svg) {
  const box = rootRect(node, svg);
  return box ? { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 } : null;
}

function refreshConnectors() {
  const svg = currentSvg();
  if (!svg) return;
  svg.querySelectorAll('[data-cw-connector="true"]').forEach(path => {
    const from = svg.querySelector(`#${cssEscape(path.dataset.cwFrom || '')}`);
    const to = svg.querySelector(`#${cssEscape(path.dataset.cwTo || '')}`);
    if (!from || !to) return;
    const a = connectorCenter(from, svg), b = connectorCenter(to, svg);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const bend = Math.min(80, Math.hypot(dx, dy) * 0.22);
    const d = Math.abs(dx) > 40 && Math.abs(dy) > 24
      ? `M${a.x} ${a.y} C${a.x + Math.sign(dx || 1) * bend} ${a.y} ${b.x - Math.sign(dx || 1) * bend} ${b.y} ${b.x} ${b.y}`
      : `M${a.x} ${a.y} L${b.x} ${b.y}`;
    path.setAttribute('d', d);
  });
}

function commitMutation(message) {
  refreshConnectors();
  const opacity = $('#opacityRange');
  if (opacity && selectedNodes().length) opacity.dispatchEvent(new Event('change', { bubbles: true }));
  updateAdvancedPanel();
  toast(message);
}

function alignSelection(mode) {
  const nodes = operationNodes();
  if (nodes.length < 2) return;
  const { items, bounds } = selectionGeometry(nodes);
  items.forEach(item => {
    const { dx, dy } = alignmentOffset(item, bounds, mode);
    translateNode(item.node, dx, dy);
  });
  commitMutation(`Aligned ${nodes.length} objects`);
}

function distributeSelection(axis) {
  const nodes = operationNodes();
  if (nodes.length < 3) return;
  const { items } = selectionGeometry(nodes);
  const offsets = distributionOffsets(items, axis);
  items.forEach(item => axis === 'x' ? translateNode(item.node, offsets.get(item.id) || 0, 0) : translateNode(item.node, 0, offsets.get(item.id) || 0));
  commitMutation(`Distributed ${nodes.length} objects`);
}

function transformSelection(kind) {
  const nodes = operationNodes();
  if (!nodes.length) return;
  const { bounds } = selectionGeometry(nodes);
  if (!bounds) return;
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const transform = { 'rotate-left': 'rotate(-90)', 'rotate-right': 'rotate(90)', 'flip-h': 'scale(-1 1)', 'flip-v': 'scale(1 -1)' }[kind];
  nodes.forEach(node => transformAround(node, center, transform));
  commitMutation(kind.startsWith('rotate') ? 'Selection rotated' : 'Selection flipped');
}

function selectAll() {
  const nodes = topSelectableNodes();
  selectNodes(nodes, false);
  toast(`Selected ${nodes.length} objects`);
}

function selectSameType() {
  const primary = selectedNodes().at(-1);
  if (!primary) return;
  const tag = primary.tagName.toLowerCase();
  const nodes = topSelectableNodes().filter(node => node.tagName.toLowerCase() === tag);
  selectNodes(nodes, false);
  toast(`Selected ${nodes.length} ${tag} object${nodes.length === 1 ? '' : 's'}`);
}

function invertSelection() {
  const selected = new Set(selectedNodes());
  const nodes = topSelectableNodes().filter(node => !selected.has(node));
  selectNodes(nodes, false);
  toast('Selection inverted');
}

function lockSelection() {
  const nodes = operationNodes();
  if (!nodes.length) return;
  clearSelection();
  nodes.forEach(node => lockedNodes.add(node));
  syncLayerDecorations();
  updateAdvancedPanel();
  toast(`${nodes.length} object${nodes.length === 1 ? '' : 's'} locked`);
}

function unlockAll() {
  const count = [...lockedNodes].filter(node => node.isConnected).length;
  lockedNodes.clear();
  syncLayerDecorations();
  updateAdvancedPanel();
  toast(count ? `Unlocked ${count} objects` : 'No locked objects');
}

function runAction(action) {
  if (['left','hcenter','right','top','vcenter','bottom'].includes(action)) return alignSelection(action);
  if (action === 'distribute-x') return distributeSelection('x');
  if (action === 'distribute-y') return distributeSelection('y');
  if (['rotate-left','rotate-right','flip-h','flip-v'].includes(action)) return transformSelection(action);
  if (action === 'all') return selectAll();
  if (action === 'same') return selectSameType();
  if (action === 'invert') return invertSelection();
  if (action === 'lock') return lockSelection();
  if (action === 'unlock-all') return unlockAll();
}

function syncLayerDecorations() {
  [...lockedNodes].forEach(node => { if (!node.isConnected) lockedNodes.delete(node); });
  $$('#layersList .layer').forEach(button => {
    const node = nodeForLayer(button);
    const locked = !!node && lockedNodes.has(node);
    button.classList.toggle('cw-locked', locked);
    const existingMark = button.querySelector('.cw-lock-mark');
    if (!locked) existingMark?.remove();
    else if (!existingMark) {
      const mark = document.createElement('span');
      mark.className = 'cw-lock-mark';
      mark.textContent = '🔒';
      mark.title = 'Locked';
      button.appendChild(mark);
    }
  });
}

function updateAdvancedPanel() {
  if (layerSyncQueued) return;
  layerSyncQueued = true;
  requestAnimationFrame(() => {
    layerSyncQueued = false;
    const count = operationNodes().length;
    const countNode = $('#advancedSelectionCount');
    if (countNode) countNode.textContent = `${selectedNodes().length} selected`;
    $$('#advancedArrangePanel [data-cw-action]').forEach(button => {
      const action = button.dataset.cwAction;
      if (['left','hcenter','right','top','vcenter','bottom'].includes(action)) button.disabled = count < 2;
      else if (action.startsWith('distribute-')) button.disabled = count < 3;
      else if (['rotate-left','rotate-right','flip-h','flip-v','same','lock'].includes(action)) button.disabled = count < 1;
      else if (action === 'unlock-all') button.disabled = ![...lockedNodes].some(node => node.isConnected);
      else button.disabled = false;
    });
    syncLayerDecorations();
  });
}

function bindLocks() {
  $('#artboard')?.addEventListener('pointerdown', event => {
    if (marquee.active) return;
    const target = event.target.closest?.('[data-cw-id]');
    if (target && lockedNodes.has(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toast('This object is locked');
    }
  }, true);

  $('#layersList')?.addEventListener('click', event => {
    const button = event.target.closest('.layer');
    const node = nodeForLayer(button);
    if (node && lockedNodes.has(node)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toast('Object is locked · use Unlock all');
    }
  }, true);
}

function bindKeyboard() {
  window.addEventListener('keydown', event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '');
    const mod = event.ctrlKey || event.metaKey;
    if (typing) return;
    if (event.key === 'Escape' && marquee.active) {
      event.preventDefault(); event.stopImmediatePropagation(); deactivateMarquee(true); toast('Marquee cancelled'); return;
    }
    if (!mod && event.key.toLowerCase() === 'm') {
      event.preventDefault(); event.stopImmediatePropagation(); marquee.active ? deactivateMarquee() : activateMarquee(); return;
    }
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault(); event.stopImmediatePropagation(); selectAll(); return;
    }
    if (event.key.startsWith('Arrow') && selectedNodes().some(node => lockedNodes.has(node))) {
      event.preventDefault(); event.stopImmediatePropagation(); toast('Locked objects cannot be moved');
    }
  }, true);
}

function observeLayers() {
  const list = $('#layersList');
  if (!list) return;
  const observer = new MutationObserver(updateAdvancedPanel);
  observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  list.addEventListener('click', () => requestAnimationFrame(updateAdvancedPanel));
}

function init() {
  injectStyles();
  injectTool();
  injectPanel();
  getOverlay();
  bindMarquee();
  bindLocks();
  bindKeyboard();
  observeLayers();
  updateAdvancedPanel();
}

init();
