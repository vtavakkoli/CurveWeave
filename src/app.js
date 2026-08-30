import {
  clamp,
  createStarterSvg,
  estimateSvgStats,
  formatBytes,
  getDrawableElements,
  prettyPrintSvg,
  repairSvgText,
  safeFileName,
  sanitizeSvgText,
  serializeSvg
} from './svg-utils.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE_KEY = 'curveweave.document.v1';
const PREFS_KEY = 'curveweave.preferences.v1';

const state = {
  svg: null,
  tool: 'select',
  zoom: 1,
  selected: new Set(),
  history: [],
  historyIndex: -1,
  drawing: null,
  dragging: null,
  panning: null,
  penPoints: [],
  sourceDirty: false,
  toastTimer: null,
  repairPreview: null,
  grid: false
};

const el = {
  artboard: $('#artboard'), artboardWrap: $('#artboardWrap'), canvasArea: $('#canvasArea'), selectionBox: $('#selectionBox'),
  layersList: $('#layersList'), properties: $('#properties'), emptyInspector: $('#emptyInspector'), selectionType: $('#selectionType'),
  sourcePanel: $('#sourcePanel'), sourceEditor: $('#sourceEditor'), sourceStatus: $('#sourceStatus'),
  fileInput: $('#fileInput'), documentName: $('#documentName'), saveState: $('#saveState'), statusMessage: $('#statusMessage'),
  zoomValue: $('#zoomValue'), toast: $('#toast'), dropOverlay: $('#dropOverlay'), exportMenu: $('#exportMenu'),
  repairDialog: $('#repairDialog'), precisionSelect: $('#precisionSelect'), welcomeDialog: $('#welcomeDialog'),
  statElements: $('#statElements'), statNodes: $('#statNodes'), statSize: $('#statSize'), statViewBox: $('#statViewBox'),
  propX: $('#propX'), propY: $('#propY'), propW: $('#propW'), propH: $('#propH'),
  fillColor: $('#fillColor'), fillText: $('#fillText'), strokeColor: $('#strokeColor'), strokeText: $('#strokeText'),
  strokeWidth: $('#strokeWidth'), opacityRange: $('#opacityRange'), opacityValue: $('#opacityValue'), textRow: $('#textRow'), textValue: $('#textValue')
};

function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.toast.classList.remove('visible'), 1800);
}

function setStatus(message) {
  el.statusMessage.textContent = message;
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
}

function savePrefs(patch = {}) {
  const next = { ...loadPrefs(), ...patch };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
}

function sanitizeDocumentForExport(svg = state.svg) {
  if (!svg) return '';
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('[data-cw-selected],[data-cw-id]').forEach(node => {
    node.removeAttribute('data-cw-selected');
    node.removeAttribute('data-cw-id');
  });
  return serializeSvg(clone);
}

function saveLocal() {
  if (!state.svg) return;
  const payload = {
    name: el.documentName.value,
    svg: sanitizeDocumentForExport(),
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  el.saveState.textContent = 'Saved locally';
}

function scheduleLocalSave() {
  el.saveState.textContent = 'Saving…';
  clearTimeout(scheduleLocalSave.timer);
  scheduleLocalSave.timer = setTimeout(saveLocal, 450);
}

function restoreLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.svg) {
      el.documentName.value = saved.name || 'curveweave-artwork';
      return saved.svg;
    }
  } catch { /* ignore corrupt local state */ }
  return null;
}

function parseSvg(svgText) {
  const safe = sanitizeSvgText(svgText);
  const doc = new DOMParser().parseFromString(safe, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('SVG source could not be parsed. Check the markup and try again.');
  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== 'svg') throw new Error('Expected an <svg> root element.');
  svg.querySelectorAll('script,foreignObject').forEach(node => node.remove());
  svg.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => {
      const value = attr.value.trim();
      const externalHref = /^(?:href|xlink:href)$/i.test(attr.name) && value && !value.startsWith('#') && !value.startsWith('data:image/');
      const remoteUrl = /url\(\s*[\"']?https?:/i.test(value);
      if (/^on/i.test(attr.name) || /^javascript:/i.test(value) || externalHref || remoteUrl) node.removeAttribute(attr.name);
    });
  });
  ensureSvgDimensions(svg);
  return document.importNode(svg, true);
}

function ensureSvgDimensions(svg) {
  let viewBox = svg.getAttribute('viewBox');
  if (!viewBox) {
    const width = parseFloat(svg.getAttribute('width')) || 960;
    const height = parseFloat(svg.getAttribute('height')) || 600;
    viewBox = `0 0 ${width} ${height}`;
    svg.setAttribute('viewBox', viewBox);
  }
  const parts = viewBox.trim().split(/[ ,]+/).map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0) {
    svg.setAttribute('viewBox', '0 0 960 600');
  }
  const [, , w, h] = svg.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
}

function assignEditorIds() {
  if (!state.svg) return;
  let i = 0;
  getDrawableElements(state.svg).forEach(node => {
    if (!node.dataset.cwId) node.dataset.cwId = `cw-${++i}-${Math.random().toString(36).slice(2,7)}`;
  });
}

function loadDocument(svgText, { push = true, resetZoom = true } = {}) {
  const svg = parseSvg(svgText);
  el.artboard.replaceChildren(svg);
  state.svg = svg;
  state.selected.clear();
  state.penPoints = [];
  assignEditorIds();
  if (resetZoom) state.zoom = 1;
  applyZoom();
  refreshAll();
  if (push) resetHistory();
  scheduleLocalSave();
}

function resetHistory() {
  const text = sanitizeDocumentForExport();
  state.history = [text];
  state.historyIndex = 0;
  updateHistoryButtons();
}

function pushHistory() {
  const text = sanitizeDocumentForExport();
  if (!text || state.history[state.historyIndex] === text) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(text);
  if (state.history.length > 80) state.history.shift();
  state.historyIndex = state.history.length - 1;
  updateHistoryButtons();
  scheduleLocalSave();
}

function updateHistoryButtons() {
  $('#undoBtn').disabled = state.historyIndex <= 0;
  $('#redoBtn').disabled = state.historyIndex >= state.history.length - 1;
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex -= 1;
  loadDocument(state.history[state.historyIndex], { push: false, resetZoom: false });
  updateHistoryButtons();
  toast('Undone');
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex += 1;
  loadDocument(state.history[state.historyIndex], { push: false, resetZoom: false });
  updateHistoryButtons();
  toast('Redone');
}

function refreshAll() {
  refreshLayers();
  refreshInspector();
  refreshStats();
  syncSource();
  updateSelectionBox();
}

function refreshStats() {
  const text = sanitizeDocumentForExport();
  const stats = estimateSvgStats(text);
  el.statElements.textContent = stats.elements;
  el.statNodes.textContent = stats.nodes;
  el.statSize.textContent = formatBytes(stats.bytes);
  const vb = state.svg?.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  el.statViewBox.textContent = vb?.length === 4 ? `${Math.round(vb[2])}×${Math.round(vb[3])}` : '—';
}

function refreshLayers() {
  if (!state.svg) return;
  const nodes = getDrawableElements(state.svg).reverse();
  el.layersList.replaceChildren(...nodes.map((node, index) => {
    const button = document.createElement('button');
    button.className = `layer${state.selected.has(node) ? ' selected' : ''}`;
    button.dataset.id = node.dataset.cwId || '';
    const name = node.id || node.getAttribute('aria-label') || (node.tagName.toLowerCase() === 'text' ? node.textContent?.trim().slice(0,22) : '') || `${node.tagName.toLowerCase()} ${nodes.length - index}`;
    button.innerHTML = `<span class="kind">${node.tagName.toLowerCase().slice(0,4)}</span><span class="name"></span><span class="eye">●</span>`;
    button.querySelector('.name').textContent = name;
    button.addEventListener('click', event => selectElement(node, event.shiftKey));
    button.querySelector('.eye').addEventListener('click', event => {
      event.stopPropagation();
      const hidden = node.getAttribute('display') === 'none';
      node.setAttribute('display', hidden ? '' : 'none');
      button.querySelector('.eye').textContent = hidden ? '●' : '○';
      pushHistory(); refreshAll();
    });
    return button;
  }));
}

function selectElement(node, additive = false) {
  if (!node || node === state.svg) {
    state.selected.clear();
  } else if (additive) {
    state.selected.has(node) ? state.selected.delete(node) : state.selected.add(node);
  } else {
    state.selected.clear();
    state.selected.add(node);
  }
  refreshLayers();
  refreshInspector();
  updateSelectionBox();
}

function getPrimarySelection() {
  return [...state.selected][state.selected.size - 1] || null;
}

function bboxForSelection() {
  const nodes = [...state.selected].filter(n => n.isConnected && n.getAttribute('display') !== 'none');
  if (!nodes.length) return null;
  const rects = nodes.map(n => n.getBoundingClientRect()).filter(r => r.width || r.height);
  if (!rects.length) return null;
  return rects.reduce((acc, r) => ({
    left: Math.min(acc.left, r.left), top: Math.min(acc.top, r.top), right: Math.max(acc.right, r.right), bottom: Math.max(acc.bottom, r.bottom)
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
}

function updateSelectionBox() {
  const box = bboxForSelection();
  if (!box || state.tool !== 'select') { el.selectionBox.hidden = true; return; }
  const wrapRect = el.artboardWrap.getBoundingClientRect();
  el.selectionBox.hidden = false;
  el.selectionBox.style.left = `${box.left - wrapRect.left + el.artboardWrap.scrollLeft}px`;
  el.selectionBox.style.top = `${box.top - wrapRect.top + el.artboardWrap.scrollTop}px`;
  el.selectionBox.style.width = `${Math.max(1, box.right - box.left)}px`;
  el.selectionBox.style.height = `${Math.max(1, box.bottom - box.top)}px`;
}

function getElementBBox(node) {
  try {
    const b = node.getBBox();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch { return { x: 0, y: 0, width: 0, height: 0 }; }
}

function normalizeColor(value, fallback = '#000000') {
  const v = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v.slice(1).split('').map(c => c + c).join('')}`;
  const probe = document.createElement('span');
  probe.style.color = v;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const match = rgb.match(/\d+/g);
  if (!match || match.length < 3) return fallback;
  return `#${match.slice(0,3).map(n => Number(n).toString(16).padStart(2,'0')).join('')}`;
}

function refreshInspector() {
  const node = getPrimarySelection();
  if (!node) {
    el.properties.hidden = true;
    el.emptyInspector.hidden = false;
    el.selectionType.textContent = state.selected.size ? `${state.selected.size} selected` : 'Nothing selected';
    return;
  }
  el.properties.hidden = false;
  el.emptyInspector.hidden = true;
  const type = node.tagName.toLowerCase();
  el.selectionType.textContent = state.selected.size > 1 ? `${state.selected.size} selected` : type;
  const b = getElementBBox(node);
  el.propX.value = Number.isFinite(b.x) ? Math.round(b.x * 100) / 100 : '';
  el.propY.value = Number.isFinite(b.y) ? Math.round(b.y * 100) / 100 : '';
  el.propW.value = Number.isFinite(b.width) ? Math.round(b.width * 100) / 100 : '';
  el.propH.value = Number.isFinite(b.height) ? Math.round(b.height * 100) / 100 : '';
  const fill = node.getAttribute('fill') || getComputedStyle(node).fill || '#000000';
  const stroke = node.getAttribute('stroke') || getComputedStyle(node).stroke || '#000000';
  el.fillText.value = fill === 'none' ? 'none' : fill;
  el.strokeText.value = stroke === 'none' ? 'none' : stroke;
  el.fillColor.value = normalizeColor(fill, '#7257ff');
  el.strokeColor.value = normalizeColor(stroke, '#000000');
  el.strokeWidth.value = parseFloat(node.getAttribute('stroke-width')) || 0;
  const opacity = parseFloat(node.getAttribute('opacity'));
  el.opacityRange.value = Number.isFinite(opacity) ? opacity : 1;
  el.opacityValue.textContent = `${Math.round(Number(el.opacityRange.value) * 100)}%`;
  el.textRow.hidden = type !== 'text';
  if (type === 'text') el.textValue.value = node.textContent || '';
  $('#ungroupBtn').disabled = type !== 'g';
  $('#groupBtn').disabled = state.selected.size < 2;
}

function syncSource() {
  if (!state.svg || state.sourceDirty) return;
  el.sourceEditor.value = prettyPrintSvg(sanitizeDocumentForExport());
  el.sourceStatus.textContent = 'Synchronized';
}

function applyZoom() {
  if (!state.svg) return;
  const vb = state.svg.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number);
  state.svg.style.width = `${vb[2] * state.zoom}px`;
  state.svg.style.height = `${vb[3] * state.zoom}px`;
  el.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  requestAnimationFrame(updateSelectionBox);
}

function setZoom(value, anchor = null) {
  const previous = state.zoom;
  state.zoom = clamp(value, 0.1, 8);
  if (anchor && previous !== state.zoom) {
    const beforeX = el.canvasArea.scrollLeft + anchor.x;
    const beforeY = el.canvasArea.scrollTop + anchor.y;
    const ratio = state.zoom / previous;
    applyZoom();
    el.canvasArea.scrollLeft = beforeX * ratio - anchor.x;
    el.canvasArea.scrollTop = beforeY * ratio - anchor.y;
  } else applyZoom();
}

function fitCanvas() {
  if (!state.svg) return;
  const vb = state.svg.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number);
  const availableW = Math.max(100, el.canvasArea.clientWidth - 120);
  const availableH = Math.max(100, el.canvasArea.clientHeight - 120);
  setZoom(Math.min(availableW / vb[2], availableH / vb[3], 1.5));
  requestAnimationFrame(() => {
    el.canvasArea.scrollLeft = Math.max(0, (el.canvasArea.scrollWidth - el.canvasArea.clientWidth) / 2);
    el.canvasArea.scrollTop = Math.max(0, (el.canvasArea.scrollHeight - el.canvasArea.clientHeight) / 2);
  });
}

function clientToSvg(clientX, clientY) {
  if (!state.svg) return { x: 0, y: 0 };
  const point = state.svg.createSVGPoint();
  point.x = clientX; point.y = clientY;
  const ctm = state.svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

function setTool(tool) {
  state.tool = tool;
  $$('.tool[data-tool]').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
  el.canvasArea.style.cursor = tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  if (tool !== 'select') el.selectionBox.hidden = true; else updateSelectionBox();
  setStatus({ select:'Select elements · Shift-click for multi-select', hand:'Drag to pan the canvas', rect:'Drag to draw a rectangle', ellipse:'Drag to draw an ellipse', pen:'Click to add points · Enter to finish · Esc to cancel', text:'Click canvas to add text' }[tool] || 'Ready');
}

function createSvgElement(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function startDraw(event) {
  const point = clientToSvg(event.clientX, event.clientY);
  if (state.tool === 'rect') {
    const node = createSvgElement('rect', { x: point.x, y: point.y, width: 1, height: 1, rx: 4, fill: '#7257ff' });
    state.svg.appendChild(node); assignEditorIds();
    state.drawing = { node, start: point, type: 'rect' };
    selectElement(node);
  } else if (state.tool === 'ellipse') {
    const node = createSvgElement('ellipse', { cx: point.x, cy: point.y, rx: 1, ry: 1, fill: '#31c9bc' });
    state.svg.appendChild(node); assignEditorIds();
    state.drawing = { node, start: point, type: 'ellipse' };
    selectElement(node);
  } else if (state.tool === 'text') {
    const text = prompt('Text content', 'Text');
    if (text === null) return;
    const node = createSvgElement('text', { x: point.x, y: point.y, fill: '#111827', 'font-size': 32, 'font-family': 'system-ui, sans-serif' });
    node.textContent = text || 'Text';
    state.svg.appendChild(node); assignEditorIds(); selectElement(node); pushHistory(); refreshAll(); setTool('select');
  } else if (state.tool === 'pen') {
    state.penPoints.push(point);
    let node = state.svg.querySelector('[data-cw-pen-preview="true"]');
    if (!node) {
      node = createSvgElement('path', { fill:'none', stroke:'#7257ff', 'stroke-width':3, 'stroke-linecap':'round', 'stroke-linejoin':'round', 'data-cw-pen-preview':'true' });
      state.svg.appendChild(node);
    }
    node.setAttribute('d', state.penPoints.map((p,i) => `${i ? 'L':'M'} ${p.x} ${p.y}`).join(' '));
    setStatus(`${state.penPoints.length} pen point${state.penPoints.length === 1 ? '' : 's'} · Enter to finish`);
    refreshStats();
  }
}

function updateDraw(event) {
  if (!state.drawing) return;
  const p = clientToSvg(event.clientX, event.clientY);
  const { node, start, type } = state.drawing;
  if (type === 'rect') {
    node.setAttribute('x', Math.min(start.x, p.x)); node.setAttribute('y', Math.min(start.y, p.y));
    node.setAttribute('width', Math.abs(p.x - start.x)); node.setAttribute('height', Math.abs(p.y - start.y));
  } else if (type === 'ellipse') {
    node.setAttribute('cx', (start.x + p.x) / 2); node.setAttribute('cy', (start.y + p.y) / 2);
    node.setAttribute('rx', Math.abs(p.x - start.x) / 2); node.setAttribute('ry', Math.abs(p.y - start.y) / 2);
  }
  updateSelectionBox(); refreshInspector(); refreshStats();
}

function finishDraw() {
  if (!state.drawing) return;
  state.drawing = null;
  pushHistory(); refreshAll(); setTool('select');
}

function finishPen() {
  const node = state.svg?.querySelector('[data-cw-pen-preview="true"]');
  if (!node) return;
  if (state.penPoints.length < 2) { node.remove(); }
  else { node.removeAttribute('data-cw-pen-preview'); assignEditorIds(); selectElement(node); pushHistory(); }
  state.penPoints = [];
  refreshAll(); setTool('select');
}

function cancelPen() {
  state.svg?.querySelector('[data-cw-pen-preview="true"]')?.remove();
  state.penPoints = [];
  refreshAll(); setTool('select');
}

function startMove(event, target) {
  if (!state.selected.has(target)) selectElement(target, event.shiftKey);
  if (event.shiftKey) return;
  const start = clientToSvg(event.clientX, event.clientY);
  state.dragging = {
    start,
    originals: [...state.selected].map(node => ({ node, transform: node.getAttribute('transform') || '' }))
  };
  event.preventDefault();
}

function updateMove(event) {
  if (!state.dragging) return;
  const p = clientToSvg(event.clientX, event.clientY);
  const dx = p.x - state.dragging.start.x, dy = p.y - state.dragging.start.y;
  state.dragging.originals.forEach(({ node, transform }) => node.setAttribute('transform', `translate(${dx} ${dy}) ${transform}`.trim()));
  updateSelectionBox(); refreshInspector();
}

function finishMove() {
  if (!state.dragging) return;
  state.dragging = null;
  pushHistory(); refreshAll();
}

function startPan(event) {
  state.panning = { x: event.clientX, y: event.clientY, left: el.canvasArea.scrollLeft, top: el.canvasArea.scrollTop };
  el.canvasArea.style.cursor = 'grabbing';
  event.preventDefault();
}

function updatePan(event) {
  if (!state.panning) return;
  el.canvasArea.scrollLeft = state.panning.left - (event.clientX - state.panning.x);
  el.canvasArea.scrollTop = state.panning.top - (event.clientY - state.panning.y);
}

function finishPan() {
  state.panning = null;
  el.canvasArea.style.cursor = state.tool === 'hand' ? 'grab' : state.tool === 'select' ? 'default' : 'crosshair';
}

function deleteSelection() {
  if (!state.selected.size) return;
  [...state.selected].forEach(node => node.remove());
  state.selected.clear(); pushHistory(); refreshAll(); toast('Selection deleted');
}

function duplicateSelection() {
  if (!state.selected.size) return;
  const next = new Set();
  [...state.selected].forEach(node => {
    const clone = node.cloneNode(true);
    clone.removeAttribute('data-cw-id');
    const existing = clone.getAttribute('transform') || '';
    clone.setAttribute('transform', `translate(16 16) ${existing}`.trim());
    node.parentNode.insertBefore(clone, node.nextSibling);
    next.add(clone);
  });
  assignEditorIds(); state.selected = next; pushHistory(); refreshAll(); toast('Duplicated');
}

function bringToFront() {
  [...state.selected].forEach(node => node.parentNode?.appendChild(node));
  pushHistory(); refreshAll();
}

function sendToBack() {
  [...state.selected].reverse().forEach(node => {
    const parent = node.parentNode;
    if (!parent) return;
    const firstDrawable = [...parent.children].find(child => child.tagName?.toLowerCase() !== 'defs');
    parent.insertBefore(node, firstDrawable || null);
  });
  pushHistory(); refreshAll();
}

function groupSelection() {
  if (state.selected.size < 2) return;
  const nodes = [...state.selected];
  const parent = nodes[0].parentNode;
  if (!nodes.every(node => node.parentNode === parent)) { toast('Select elements from the same group'); return; }
  const group = createSvgElement('g');
  parent.insertBefore(group, nodes[0]);
  nodes.forEach(node => group.appendChild(node));
  assignEditorIds(); state.selected = new Set([group]); pushHistory(); refreshAll(); toast('Grouped');
}

function ungroupSelection() {
  const group = getPrimarySelection();
  if (!group || group.tagName.toLowerCase() !== 'g') return;
  const parent = group.parentNode;
  const children = [...group.children];
  children.forEach(child => parent.insertBefore(child, group));
  group.remove(); state.selected = new Set(children); assignEditorIds(); pushHistory(); refreshAll(); toast('Ungrouped');
}

function changeSelectedAttribute(name, value) {
  if (!state.selected.size) return;
  [...state.selected].forEach(node => value === '' || value == null ? node.removeAttribute(name) : node.setAttribute(name, value));
  pushHistory(); refreshAll();
}

function scalePrimaryToBox(field, value) {
  const node = getPrimarySelection();
  if (!node || !Number.isFinite(value)) return;
  const b = getElementBBox(node);
  if (!b.width && ['w','x'].includes(field)) return;
  if (!b.height && ['h','y'].includes(field)) return;
  const currentTransform = node.getAttribute('transform') || '';
  if (field === 'x' || field === 'y') {
    const dx = field === 'x' ? value - b.x : 0;
    const dy = field === 'y' ? value - b.y : 0;
    node.setAttribute('transform', `translate(${dx} ${dy}) ${currentTransform}`.trim());
  } else {
    const sx = field === 'w' ? Math.max(0.001, value / Math.max(0.001,b.width)) : 1;
    const sy = field === 'h' ? Math.max(0.001, value / Math.max(0.001,b.height)) : 1;
    node.setAttribute('transform', `translate(${b.x} ${b.y}) scale(${sx} ${sy}) translate(${-b.x} ${-b.y}) ${currentTransform}`.trim());
  }
  pushHistory(); refreshAll();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadSvg() {
  const text = prettyPrintSvg(sanitizeDocumentForExport());
  downloadBlob(new Blob([text], { type:'image/svg+xml;charset=utf-8' }), `${safeFileName(el.documentName.value)}.svg`);
  toast('SVG downloaded');
}

async function exportPng() {
  const text = sanitizeDocumentForExport();
  const blob = new Blob([text], { type:'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const vb = state.svg.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number);
    const scale = 2;
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(vb[2] * scale)); canvas.height = Math.max(1, Math.round(vb[3] * scale));
    const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(image, 0, 0, vb[2], vb[3]);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNG encoding failed');
    downloadBlob(png, `${safeFileName(el.documentName.value)}@2x.png`); toast('PNG exported at 2×');
  } catch { toast('PNG export failed — external image references may be blocking the canvas'); }
  finally { URL.revokeObjectURL(url); }
}

async function copySvg() {
  try { await navigator.clipboard.writeText(prettyPrintSvg(sanitizeDocumentForExport())); toast('SVG copied'); }
  catch { toast('Clipboard permission was not available'); }
}

function openRepairDialog() {
  const preview = repairSvgText(sanitizeDocumentForExport(), { precision: Number(el.precisionSelect.value) });
  state.repairPreview = preview;
  $('#repairBefore').textContent = formatBytes(preview.before.bytes);
  $('#repairAfter').textContent = formatBytes(preview.after.bytes);
  $('#repairSaved').textContent = preview.savedBytes ? `${formatBytes(preview.savedBytes)} (${Math.round(preview.savedBytes / Math.max(1, preview.before.bytes) * 100)}%)` : 'Already compact';
  el.repairDialog.showModal();
}

function applyRepair() {
  if (!state.repairPreview) return;
  const selectedIds = [...state.selected].map(n => n.dataset.cwId).filter(Boolean);
  loadDocument(state.repairPreview.text, { push: false, resetZoom: false });
  pushHistory();
  selectedIds.forEach(id => {
    const node = state.svg.querySelector(`[data-cw-id="${CSS.escape(id)}"]`);
    if (node) state.selected.add(node);
  });
  refreshAll(); toast('Repair applied');
}

async function readFile(file) {
  if (!file || (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml')) { toast('Please choose an SVG file'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('This SVG is larger than the 10 MB editor limit'); return; }
  try {
    const text = await file.text();
    loadDocument(text);
    el.documentName.value = file.name.replace(/\.svg$/i,'');
    scheduleLocalSave(); fitCanvas(); toast(`Opened ${file.name}`);
  } catch (error) { toast(error.message || 'Could not open SVG'); }
}

function newDocument() {
  if (state.svg && state.history.length > 1 && !confirm('Start a new SVG? Your current document is autosaved locally.')) return;
  el.documentName.value = 'curveweave-artwork'; loadDocument(createStarterSvg()); fitCanvas(); toast('New document');
}

function applySource() {
  try {
    const next = sanitizeSvgText(el.sourceEditor.value);
    loadDocument(next, { push:false, resetZoom:false });
    pushHistory(); state.sourceDirty = false; el.sourceStatus.textContent = 'Synchronized'; toast('Source applied');
  } catch (error) { el.sourceStatus.textContent = 'Invalid SVG'; toast(error.message); }
}

function onCanvasPointerDown(event) {
  if (!state.svg) return;
  if (event.button === 1 || state.tool === 'hand' || (event.button === 0 && event.altKey)) { startPan(event); return; }
  if (event.button !== 0) return;
  const target = event.target.closest?.('[data-cw-id]');
  if (state.tool === 'select') {
    if (target && state.svg.contains(target)) startMove(event, target);
    else selectElement(null);
  } else startDraw(event);
}

function onPointerMove(event) {
  updatePan(event); updateMove(event); updateDraw(event);
}

function onPointerUp() {
  finishPan(); finishMove(); finishDraw();
}

function bindControls() {
  $('#newBtn').addEventListener('click', newDocument);
  $('#openBtn').addEventListener('click', () => el.fileInput.click());
  $('#saveBtn').addEventListener('click', downloadSvg);
  $('#undoBtn').addEventListener('click', undo); $('#redoBtn').addEventListener('click', redo);
  $('#repairBtn').addEventListener('click', openRepairDialog);
  $('#exportBtn').addEventListener('click', event => { event.stopPropagation(); el.exportMenu.hidden = !el.exportMenu.hidden; });
  el.exportMenu.addEventListener('click', event => {
    const type = event.target.closest('button')?.dataset.export; if (!type) return;
    el.exportMenu.hidden = true; if (type === 'svg') downloadSvg(); if (type === 'png') exportPng(); if (type === 'copy') copySvg();
  });
  document.addEventListener('click', () => { el.exportMenu.hidden = true; });
  $('#themeBtn').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme; savePrefs({ theme });
  });
  $$('.tool[data-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
  $('#duplicateBtn').addEventListener('click', duplicateSelection); $('#deleteBtn').addEventListener('click', deleteSelection);
  $('#bringFrontBtn').addEventListener('click', bringToFront); $('#sendBackBtn').addEventListener('click', sendToBack);
  $('#groupBtn').addEventListener('click', groupSelection); $('#ungroupBtn').addEventListener('click', ungroupSelection);
  $('#zoomInBtn').addEventListener('click', () => setZoom(state.zoom * 1.2)); $('#zoomOutBtn').addEventListener('click', () => setZoom(state.zoom / 1.2));
  $('#zoomValue').addEventListener('click', () => setZoom(1)); $('#fitBtn').addEventListener('click', fitCanvas);
  $('#gridBtn').addEventListener('click', event => {
    state.grid = !state.grid; event.currentTarget.setAttribute('aria-pressed', String(state.grid));
    el.canvasArea.classList.toggle('grid-off', !state.grid); savePrefs({ grid: state.grid });
  });
  $('#codeToggleBtn').addEventListener('click', event => {
    el.sourcePanel.hidden = !el.sourcePanel.hidden; event.currentTarget.setAttribute('aria-pressed', String(!el.sourcePanel.hidden)); if (!el.sourcePanel.hidden) syncSource();
  });
  $('#prettyBtn').addEventListener('click', () => { try { el.sourceEditor.value = prettyPrintSvg(el.sourceEditor.value); } catch (e) { toast(e.message); } });
  $('#applySourceBtn').addEventListener('click', applySource);
  el.sourceEditor.addEventListener('input', () => { state.sourceDirty = true; el.sourceStatus.textContent = 'Modified — apply to canvas'; });
  el.fileInput.addEventListener('change', () => { readFile(el.fileInput.files?.[0]); el.fileInput.value = ''; });
  el.documentName.addEventListener('input', scheduleLocalSave);
  el.precisionSelect.addEventListener('change', () => {
    if (!el.repairDialog.open) return;
    const preview = repairSvgText(sanitizeDocumentForExport(), { precision: Number(el.precisionSelect.value) });
    state.repairPreview = preview;
    $('#repairBefore').textContent = formatBytes(preview.before.bytes);
    $('#repairAfter').textContent = formatBytes(preview.after.bytes);
    $('#repairSaved').textContent = preview.savedBytes ? `${formatBytes(preview.savedBytes)} (${Math.round(preview.savedBytes / Math.max(1, preview.before.bytes) * 100)}%)` : 'Already compact';
  });
  el.repairDialog.addEventListener('close', () => { if (el.repairDialog.returnValue === 'confirm') applyRepair(); state.repairPreview = null; });
  $('#welcomeOpenBtn').addEventListener('click', () => setTimeout(() => el.fileInput.click(), 0));

  el.artboard.addEventListener('pointerdown', onCanvasPointerDown);
  window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp);
  el.canvasArea.addEventListener('scroll', updateSelectionBox, { passive:true });
  el.canvasArea.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const rect = el.canvasArea.getBoundingClientRect();
    setZoom(state.zoom * (event.deltaY < 0 ? 1.1 : 0.9), { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, { passive:false });

  ['dragenter','dragover'].forEach(type => document.addEventListener(type, event => { event.preventDefault(); el.dropOverlay.classList.add('visible'); }));
  ['dragleave','drop'].forEach(type => document.addEventListener(type, event => { event.preventDefault(); if (type === 'drop') readFile(event.dataTransfer?.files?.[0]); el.dropOverlay.classList.remove('visible'); }));

  [['fillText','fill'],['strokeText','stroke'],['strokeWidth','stroke-width']].forEach(([id, attr]) => {
    $(`#${id}`).addEventListener('change', event => changeSelectedAttribute(attr, event.target.value));
  });
  el.fillColor.addEventListener('change', event => { el.fillText.value = event.target.value; changeSelectedAttribute('fill', event.target.value); });
  el.strokeColor.addEventListener('change', event => { el.strokeText.value = event.target.value; changeSelectedAttribute('stroke', event.target.value); });
  el.opacityRange.addEventListener('input', event => { el.opacityValue.textContent = `${Math.round(Number(event.target.value)*100)}%`; [...state.selected].forEach(n => n.setAttribute('opacity', event.target.value)); updateSelectionBox(); });
  el.opacityRange.addEventListener('change', () => { pushHistory(); refreshAll(); });
  el.textValue.addEventListener('change', event => { const node = getPrimarySelection(); if (node?.tagName.toLowerCase() === 'text') { node.textContent = event.target.value; pushHistory(); refreshAll(); } });
  [[el.propX,'x'],[el.propY,'y'],[el.propW,'w'],[el.propH,'h']].forEach(([input, field]) => input.addEventListener('change', event => scalePrimaryToBox(field, Number(event.target.value))));

  $$('.resize-handle').forEach(handle => handle.addEventListener('pointerdown', event => {
    event.stopPropagation();
    const node = getPrimarySelection(); if (!node || state.selected.size !== 1) { toast('Resize handles currently require one selected element'); return; }
    const b = getElementBBox(node), original = node.getAttribute('transform') || '';
    const corner = handle.dataset.handle;
    const move = e => {
      const p = clientToSvg(e.clientX,e.clientY);
      const anchorX = corner.includes('w') ? b.x+b.width : b.x;
      const anchorY = corner.includes('n') ? b.y+b.height : b.y;
      const movingX = corner.includes('w') ? b.x : b.x+b.width;
      const movingY = corner.includes('n') ? b.y : b.y+b.height;
      const sx = (p.x-anchorX) / Math.max(.001,movingX-anchorX);
      const sy = (p.y-anchorY) / Math.max(.001,movingY-anchorY);
      node.setAttribute('transform', `translate(${anchorX} ${anchorY}) scale(${sx} ${sy}) translate(${-anchorX} ${-anchorY}) ${original}`.trim());
      updateSelectionBox(); refreshInspector();
    };
    const up = () => { window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); pushHistory(); refreshAll(); };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up,{once:true});
  }));

  window.addEventListener('keydown', event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
    if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); downloadSvg(); return; }
    if (mod && event.key.toLowerCase() === 'o') { event.preventDefault(); el.fileInput.click(); return; }
    if (mod && event.key.toLowerCase() === 'n') { event.preventDefault(); newDocument(); return; }
    if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); return; }
    if (typing) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); return; }
    if (event.key === 'Escape') { if (state.penPoints.length) cancelPen(); else selectElement(null); return; }
    if (event.key === 'Enter' && state.penPoints.length) { finishPen(); return; }
    const tools = { v:'select', h:'hand', r:'rect', e:'ellipse', p:'pen', t:'text' };
    if (tools[event.key.toLowerCase()]) setTool(tools[event.key.toLowerCase()]);
  });
  window.addEventListener('resize', updateSelectionBox);
}

function init() {
  bindControls();
  const prefs = loadPrefs();
  document.documentElement.dataset.theme = prefs.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  state.grid = prefs.grid ?? false;
  $('#gridBtn').setAttribute('aria-pressed', String(state.grid));
  el.canvasArea.classList.toggle('grid-off', !state.grid);
  const restored = restoreLocal();
  loadDocument(restored || createStarterSvg());
  requestAnimationFrame(fitCanvas);
  if (!prefs.welcomed) {
    setTimeout(() => el.welcomeDialog.showModal(), 250);
    el.welcomeDialog.addEventListener('close', () => savePrefs({ welcomed:true }), { once:true });
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

init();
