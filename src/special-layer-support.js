const $ = selector => document.querySelector(selector);
const specialSelected = new Set();
let scheduled = false;
let counter = 0;

function svg() { return $('#artboard svg'); }
function specialNodes() {
  const root = svg(); if (!root) return [];
  return [...root.querySelectorAll(':scope > image, :scope > use')].filter(node => !node.closest('defs'));
}
function ensureId(node) {
  if (!node.dataset.cwId) node.dataset.cwId = `cw-special-${++counter}-${Math.random().toString(36).slice(2,7)}`;
  return node.dataset.cwId;
}
function triggerSelection(node, additive = false) {
  const rect = node.getBoundingClientRect();
  node.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true, button:0, clientX:rect.left + rect.width/2, clientY:rect.top + rect.height/2, shiftKey:additive }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, button:0, clientX:rect.left + rect.width/2, clientY:rect.top + rect.height/2, shiftKey:additive }));
}
function makeLayer(node) {
  const id = ensureId(node);
  const button = document.createElement('button');
  button.className = `layer cw-special-layer${specialSelected.has(id) ? ' selected' : ''}`;
  button.dataset.id = id; button.dataset.cwSpecial = 'true';
  const tag = node.tagName.toLowerCase();
  const name = node.id || (tag === 'image' ? 'Embedded image' : (node.getAttribute('href') || 'Symbol instance'));
  button.innerHTML = `<span class="kind">${tag}</span><span class="name"></span><span class="eye">●</span>`;
  button.querySelector('.name').textContent = name;
  button.addEventListener('click', event => {
    if (event.shiftKey) specialSelected.has(id) ? specialSelected.delete(id) : specialSelected.add(id);
    else { specialSelected.clear(); specialSelected.add(id); }
    triggerSelection(node, event.shiftKey); schedule();
  });
  button.querySelector('.eye').addEventListener('click', event => {
    event.stopPropagation(); const hidden = node.getAttribute('display') === 'none'; node.setAttribute('display', hidden ? '' : 'none'); event.currentTarget.textContent = hidden ? '●' : '○';
  });
  return button;
}
function syncRows() {
  scheduled = false;
  const list = $('#layersList'), root = svg(); if (!list || !root) return;
  const nodes = specialNodes(); const existingIds = new Set(nodes.map(ensureId));
  [...specialSelected].forEach(id => { if (!existingIds.has(id)) specialSelected.delete(id); });
  list.querySelectorAll('.cw-special-layer').forEach(row => row.remove());
  const fragment = document.createDocumentFragment(); nodes.slice().reverse().forEach(node => fragment.appendChild(makeLayer(node))); list.prepend(fragment);
}
function schedule() { if (scheduled) return; scheduled = true; queueMicrotask(syncRows); }
function bindCapture() {
  $('#artboard')?.addEventListener('pointerdown', event => {
    const target = event.target.closest?.('[data-cw-id]');
    if (target && ['image','use'].includes(target.tagName?.toLowerCase())) {
      const id = ensureId(target); if (event.shiftKey) specialSelected.has(id) ? specialSelected.delete(id) : specialSelected.add(id); else { specialSelected.clear(); specialSelected.add(id); }
    } else if (!event.shiftKey) specialSelected.clear();
    schedule();
  }, true);
  $('#layersList')?.addEventListener('click', event => {
    if (!event.target.closest('.cw-special-layer') && !event.shiftKey) { specialSelected.clear(); schedule(); }
  }, true);
}
function init() {
  const artboard = $('#artboard'), layers = $('#layersList');
  if (artboard) new MutationObserver(schedule).observe(artboard, { childList:true, subtree:true });
  if (layers) new MutationObserver(records => {
    const substantive = records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => !node.classList?.contains('cw-special-layer')));
    if (substantive) schedule();
  }).observe(layers, { childList:true });
  bindCapture(); schedule();
}
if (typeof document !== 'undefined') init();
