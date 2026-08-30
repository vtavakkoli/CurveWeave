import { traceMask, loopsToPath } from './boolean-utils.js';
import {
  offsetMask, quantizeRgba, masksFromLabels, simplifyClosedLoop,
  rgbaToHex, normalizeAngle, easingSpline
} from './advanced-utils.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const SVG_NS = 'http://www.w3.org/2000/svg';
const state = { rotationFrame: 0, rotationDrag: null, syncing: false };
let toastTimer = null;

function toast(message) {
  const node = $('#toast'); if (!node) return;
  node.textContent = message; node.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 1900);
}
function status(message) { const node = $('#statusMessage'); if (node) node.textContent = message; }
function svg() { return $('#artboard svg'); }
function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c.codePointAt(0).toString(16)} `); }
function selectedNodes() {
  const root = svg(); if (!root) return [];
  return $$('#layersList .layer.selected').map(button => button.dataset.id ? root.querySelector(`[data-cw-id="${cssEscape(button.dataset.id)}"]`) : null).filter(Boolean);
}
function primary() { return selectedNodes().at(-1) || null; }
function uniqueId(prefix) { const root = svg(); let id; do { id = `cw-${prefix}-${Math.random().toString(36).slice(2, 9)}`; } while (root?.querySelector(`#${cssEscape(id)}`)); return id; }
function ensureDefs() { const root = svg(); if (!root) return null; let defs = root.querySelector(':scope > defs'); if (!defs) { defs = document.createElementNS(SVG_NS, 'defs'); root.insertBefore(defs, root.firstChild); } return defs; }
function serializeCurrent() { return svg() ? new XMLSerializer().serializeToString(svg()) : ''; }
function applyViaSource(text, selectDomId = null) {
  const editor = $('#sourceEditor'), apply = $('#applySourceBtn'); if (!editor || !apply) return;
  editor.value = text; editor.dispatchEvent(new Event('input', { bubbles: true })); apply.click();
  if (selectDomId) requestAnimationFrame(() => {
    const node = svg()?.querySelector(`#${cssEscape(selectDomId)}`); if (!node) return;
    $(`#layersList .layer[data-id="${cssEscape(node.dataset.cwId || '')}"]`)?.click();
  });
}
function commitSelectionChange() { const opacity = $('#opacityRange'); if (opacity && selectedNodes().length) opacity.dispatchEvent(new Event('change', { bubbles: true })); }
function rootViewBox() { const v = svg()?.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number); return v?.length === 4 ? v : [0, 0, 960, 600]; }
function clientToSvg(x, y) { const root = svg(); if (!root) return { x: 0, y: 0 }; const p = root.createSVGPoint(); p.x = x; p.y = y; const m = root.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
function stripEditorAttrs(node) { if (node.nodeType !== 1) return; ['data-cw-id', 'data-cw-selected', 'data-cw-locked'].forEach(a => node.removeAttribute(a)); node.querySelectorAll?.('[data-cw-id],[data-cw-selected],[data-cw-locked]').forEach(n => ['data-cw-id', 'data-cw-selected', 'data-cw-locked'].forEach(a => n.removeAttribute(a))); }
function presentation(node, attrs) { const computed = getComputedStyle(node); const out = {}; attrs.forEach(a => { out[a] = node.getAttribute(a) || computed.getPropertyValue(a) || ''; }); return out; }

function elementRootBounds(node, padding = 0) {
  const rect = node.getBoundingClientRect();
  const a = clientToSvg(rect.left, rect.top), b = clientToSvg(rect.right, rect.bottom);
  const left = Math.min(a.x, b.x) - padding, right = Math.max(a.x, b.x) + padding;
  const top = Math.min(a.y, b.y) - padding, bottom = Math.max(a.y, b.y) + padding;
  return { left, top, right, bottom, width: Math.max(.001, right - left), height: Math.max(.001, bottom - top) };
}
function combinedRootBounds(nodes) {
  const boxes = nodes.map(n => elementRootBounds(n)); if (!boxes.length) return null;
  return { left: Math.min(...boxes.map(b => b.left)), top: Math.min(...boxes.map(b => b.top)), right: Math.max(...boxes.map(b => b.right)), bottom: Math.max(...boxes.map(b => b.bottom)), width: Math.max(...boxes.map(b => b.right)) - Math.min(...boxes.map(b => b.left)), height: Math.max(...boxes.map(b => b.bottom)) - Math.min(...boxes.map(b => b.top)) };
}
function unionClientBounds(nodes) {
  const rects = nodes.map(n => n.getBoundingClientRect()).filter(r => r.width || r.height); if (!rects.length) return null;
  const left = Math.min(...rects.map(r => r.left)), right = Math.max(...rects.map(r => r.right)), top = Math.min(...rects.map(r => r.top)), bottom = Math.max(...rects.map(r => r.bottom));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function injectUi() {
  if ($('#cwAdvancedStudio')) return;
  const style = document.createElement('style'); style.textContent = `
    .cw-advanced-panel{border-top:1px solid var(--border);padding:10px 0 2px;margin-top:10px}.cw-advanced-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
    .cw-adv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:7px}.cw-adv-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.cw-adv-row{display:flex;gap:6px;align-items:center;margin:7px 0}.cw-adv-row>label{font-size:10px;color:var(--muted);min-width:58px}.cw-adv-row input,.cw-adv-row select,.cw-adv-row textarea{min-width:0;width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 6px;font-size:11px}.cw-adv-row textarea{resize:vertical;min-height:54px}.cw-adv-grid .mini-button{height:30px;padding:0 6px;font-size:10px}
    .cw-rotate-overlay{position:absolute;inset:0;z-index:45;pointer-events:none}.cw-rotate-line{position:absolute;width:1px;background:#ffbd59;transform-origin:bottom center;pointer-events:none}.cw-rotate-handle{position:absolute;width:16px;height:16px;border-radius:50%;background:#ffbd59;border:2px solid white;box-shadow:0 0 0 3px rgba(255,189,89,.25);transform:translate(-50%,-50%);pointer-events:auto;cursor:grab}.cw-rotate-handle:active{cursor:grabbing}.cw-angle-badge{position:absolute;padding:2px 5px;border-radius:5px;background:#151924;color:#ffcf80;border:1px solid rgba(255,189,89,.35);font-size:9px;transform:translate(9px,-50%)}
    .cw-adv-badge{font-size:9px;padding:2px 5px;border-radius:99px;background:rgba(45,199,189,.13);color:#75e8dd}.cw-symbol-list,.cw-animation-list{width:100%;min-width:0}.cw-tool-image{color:#ffd479!important}.cw-trace-swatches{display:flex;gap:3px;flex-wrap:wrap;margin:5px 0}.cw-trace-swatches span{width:18px;height:18px;border-radius:4px;border:1px solid var(--border)}
    .cw-timeline{display:grid;grid-template-columns:auto 1fr auto;gap:5px;align-items:center}.cw-timeline input{width:100%}.cw-help{display:block;color:var(--muted);font-size:9px;line-height:1.4;margin-top:5px}
  `; document.head.appendChild(style);

  const rail = $('.toolrail'); if (rail && !$('#cwImageTool')) {
    const b = document.createElement('button'); b.className = 'tool cw-tool-image'; b.id = 'cwImageTool'; b.title = 'Import raster image'; b.innerHTML = '<span>▧</span><small>IMG</small>'; rail.appendChild(b);
  }
  const panel = $('.properties-panel'); if (!panel) return;
  const section = document.createElement('section'); section.id = 'cwAdvancedStudio'; section.className = 'cw-advanced-panel'; section.innerHTML = `
    <div class="cw-advanced-title"><strong>Advanced Studio</strong><span class="cw-adv-badge">Pro</span></div>
    <details open><summary>Stroke, offset & rotation</summary>
      <div class="cw-adv-grid"><button class="mini-button" id="cwStrokeToPath">Stroke → Path</button><button class="mini-button" id="cwApplyOffset">Apply Offset</button></div>
      <div class="cw-adv-row"><label>Offset</label><input id="cwOffsetDistance" type="number" value="8" step="1"></div>
      <div class="cw-adv-row"><label>Angle °</label><input id="cwRotationAngle" type="number" value="0" step="1"></div>
      <div class="cw-adv-grid"><button class="mini-button" id="cwRotateReset">Reset angle</button><button class="mini-button" id="cwRotate45">+45°</button></div>
      <span class="cw-help">Selection gets a draggable rotation handle. Stroke expansion and offsets produce editable filled paths.</span>
    </details>
    <details><summary>Advanced typography</summary>
      <div class="cw-adv-row"><label>Weight</label><select id="cwFontWeight"><option>100</option><option>200</option><option>300</option><option selected>400</option><option>500</option><option>600</option><option>700</option><option>800</option><option>900</option></select></div>
      <div class="cw-adv-grid"><label style="font-size:9px">Style<select id="cwFontStyle"><option>normal</option><option>italic</option><option>oblique</option></select></label><label style="font-size:9px">Anchor<select id="cwTextAnchor"><option value="start">Left</option><option value="middle">Center</option><option value="end">Right</option></select></label></div>
      <div class="cw-adv-grid"><label style="font-size:9px">Letter<input id="cwLetterSpacing" type="number" value="0" step="0.1"></label><label style="font-size:9px">Word<input id="cwWordSpacing" type="number" value="0" step="0.1"></label></div>
      <div class="cw-adv-grid"><label style="font-size:9px">Line height<input id="cwLineHeight" type="number" value="1.2" min="0.5" max="5" step="0.1"></label><label style="font-size:9px">Baseline<select id="cwBaseline"><option value="auto">Auto</option><option value="middle">Middle</option><option value="hanging">Hanging</option><option value="central">Central</option><option value="text-after-edge">Bottom</option></select></label></div>
      <div class="cw-adv-row"><label>Decor.</label><select id="cwTextDecoration"><option value="none">None</option><option value="underline">Underline</option><option value="line-through">Strike</option><option value="underline line-through">Both</option></select></div>
      <div class="cw-adv-row"><label>Multiline</label><textarea id="cwMultilineText" placeholder="Text lines…"></textarea></div>
      <div class="cw-adv-row"><label>Path %</label><input id="cwTextPathOffset" type="number" min="0" max="100" value="0"></div>
      <div class="cw-adv-grid"><button class="mini-button" id="cwTextOnPath">Text on Path</button><button class="mini-button" id="cwReleaseTextPath">Release Path</button></div>
      <span class="cw-help">Select a text object and a path to attach type to the path. Multiline text uses native SVG tspans.</span>
    </details>
    <details><summary>Symbols / reusable components</summary>
      <div class="cw-adv-row"><label>Name</label><input id="cwSymbolName" type="text" value="component"></div>
      <div class="cw-adv-row"><label>Library</label><select id="cwSymbolLibrary" class="cw-symbol-list"></select></div>
      <div class="cw-adv-grid"><button class="mini-button" id="cwCreateSymbol">Create Symbol</button><button class="mini-button" id="cwInsertSymbol">New Instance</button><button class="mini-button" id="cwUpdateSymbol">Update Master</button><button class="mini-button" id="cwDetachSymbol">Detach Instance</button></div>
      <span class="cw-help">Uses native SVG &lt;symbol&gt; + &lt;use&gt;. Updating a master updates every instance.</span>
    </details>
    <details><summary>SVG filters & effects</summary>
      <div class="cw-adv-row"><label>Effect</label><select id="cwFilterPreset"><option value="blur">Blur</option><option value="shadow">Drop shadow</option><option value="glow">Glow</option><option value="brightness">Brightness</option><option value="contrast">Contrast</option><option value="saturate">Saturation</option><option value="hue">Hue rotate</option><option value="grayscale">Grayscale</option><option value="sepia">Sepia</option></select></div>
      <div class="cw-adv-grid three"><label style="font-size:9px">Amount<input id="cwFilterAmount" type="number" value="4" step="0.1"></label><label style="font-size:9px">DX<input id="cwFilterDx" type="number" value="4"></label><label style="font-size:9px">DY<input id="cwFilterDy" type="number" value="6"></label></div>
      <div class="cw-adv-grid"><label style="font-size:9px">Color<input id="cwFilterColor" type="color" value="#000000"></label><label style="font-size:9px">Opacity<input id="cwFilterOpacity" type="number" min="0" max="1" step="0.05" value="0.45"></label></div>
      <div class="cw-adv-grid"><button class="mini-button" id="cwApplyFilter">Apply Effect</button><button class="mini-button" id="cwRemoveFilter">Remove Effect</button></div>
    </details>
    <details><summary>Image import & vector tracing</summary>
      <div class="cw-adv-grid"><button class="mini-button" id="cwImportImage">Import Image</button><button class="mini-button" id="cwTraceImage">Trace Selected</button></div>
      <div class="cw-adv-grid three"><label style="font-size:9px">Colors<input id="cwTraceColors" type="number" min="2" max="10" value="4"></label><label style="font-size:9px">Detail<select id="cwTraceDetail"><option value="256">Fast</option><option value="384" selected>Balanced</option><option value="640">Fine</option></select></label><label style="font-size:9px">Smooth<input id="cwTraceSmooth" type="number" min="0" max="8" value="1.4" step="0.2"></label></div>
      <label style="font-size:10px;color:var(--muted)"><input id="cwTraceKeep" type="checkbox"> Keep original image</label><div id="cwTraceSwatches" class="cw-trace-swatches"></div>
      <span class="cw-help">Color clustering + contour tracing converts raster artwork into ordinary editable SVG paths.</span>
    </details>
    <details><summary>SVG animation timeline</summary>
      <div class="cw-adv-row"><label>Type</label><select id="cwAnimType"><option value="opacity">Opacity</option><option value="translate">Move</option><option value="rotate">Rotate</option><option value="scale">Scale</option><option value="fill">Fill color</option><option value="stroke">Stroke color</option><option value="path">Path morph</option></select></div>
      <div class="cw-adv-grid"><label style="font-size:9px">From<input id="cwAnimFrom" type="text" value="1"></label><label style="font-size:9px">To<input id="cwAnimTo" type="text" value="0"></label></div>
      <div class="cw-adv-grid three"><label style="font-size:9px">Duration s<input id="cwAnimDuration" type="number" value="1" min="0.05" step="0.1"></label><label style="font-size:9px">Begin s<input id="cwAnimBegin" type="number" value="0" min="0" step="0.1"></label><label style="font-size:9px">Repeat<select id="cwAnimRepeat"><option value="1">Once</option><option value="2">2×</option><option value="3">3×</option><option value="indefinite">Forever</option></select></label></div>
      <div class="cw-adv-row"><label>Easing</label><select id="cwAnimEasing"><option value="linear">Linear</option><option value="ease">Ease</option><option value="ease-in">Ease in</option><option value="ease-out">Ease out</option><option value="ease-in-out">Ease in/out</option></select></div>
      <div class="cw-adv-grid"><button class="mini-button" id="cwAddAnimation">Add Animation</button><button class="mini-button" id="cwRemoveAnimation">Remove Selected</button></div>
      <div class="cw-adv-row"><label>Tracks</label><select id="cwAnimationList" class="cw-animation-list"></select></div>
      <div class="cw-timeline"><button class="mini-button" id="cwAnimRestart">↺</button><input id="cwTimeline" type="range" min="0" max="100" value="0"><button class="mini-button" id="cwAnimPlay">▶</button></div>
      <span class="cw-help">Exports native SVG &lt;animate&gt; / &lt;animateTransform&gt; elements; no runtime library is required.</span>
    </details>
  `; panel.appendChild(section);
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp'; input.id = 'cwRasterInput'; input.hidden = true; document.body.appendChild(input);
  const wrap = $('#artboardWrap'); if (wrap && getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
}

async function imageFromUrl(url) {
  return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Image could not be decoded.')); image.src = url; });
}
function rasterDataUrl(rootClone) { const text = new XMLSerializer().serializeToString(rootClone); return URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })); }

async function rasterizeNode(node, mode = 'fill', padding = 2, quality = 850) {
  const root = svg(); if (!root || !node) throw new Error('No SVG selection.');
  const bounds = elementRootBounds(node, padding);
  const aspect = bounds.width / bounds.height;
  let width = aspect >= 1 ? quality : Math.max(64, Math.round(quality * aspect));
  let height = aspect >= 1 ? Math.max(64, Math.round(quality / aspect)) : quality;
  width = Math.min(1400, Math.max(64, width)); height = Math.min(1400, Math.max(64, height));

  const marker = `cw-raster-${Math.random().toString(36).slice(2)}`; node.setAttribute('data-cw-raster-target', marker);
  const clone = root.cloneNode(true); node.removeAttribute('data-cw-raster-target');
  const target = clone.querySelector(`[data-cw-raster-target="${marker}"]`); if (!target) throw new Error('Could not isolate selected SVG element.');
  target.removeAttribute('data-cw-raster-target');
  [...clone.querySelectorAll('*')].forEach(el => {
    if (el.closest('defs')) return;
    if (el === target || el.contains(target) || target.contains(el)) return;
    el.setAttribute('display', 'none');
  });
  const painted = [target, ...target.querySelectorAll('*')].filter(el => !el.closest('defs'));
  if (mode === 'stroke') painted.forEach(el => el.setAttribute('fill', 'none'));
  else if (mode === 'fill') painted.forEach(el => el.setAttribute('stroke', 'none'));
  clone.setAttribute('viewBox', `${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`); clone.setAttribute('width', width); clone.setAttribute('height', height);
  clone.removeAttribute('style');
  const url = rasterDataUrl(clone);
  try {
    const image = await imageFromUrl(url); const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.clearRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data; const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3] > 16 ? 1 : 0;
    return { mask, width, height, bounds, rgba };
  } finally { URL.revokeObjectURL(url); }
}
function tracedPath(mask, width, height, bounds, smooth = .8) {
  let loops = traceMask(mask, width, height);
  if (smooth > 0) loops = loops.map(loop => simplifyClosedLoop(loop, smooth)).filter(loop => loop.length >= 3);
  return loopsToPath(loops, { originX: bounds.left, originY: bounds.top, scaleX: bounds.width / width, scaleY: bounds.height / height, precision: 3 });
}
function replaceWithRootPath(node, d, attrs = {}) {
  const root = svg(); if (!root || !d) return null;
  const path = document.createElementNS(SVG_NS, 'path'); path.id = uniqueId('path'); path.setAttribute('d', d); path.setAttribute('fill-rule', 'evenodd');
  Object.entries(attrs).forEach(([k, v]) => { if (v != null && v !== '') path.setAttribute(k, v); });
  if (node.parentNode === root) root.insertBefore(path, node); else root.appendChild(path); node.remove(); return path;
}

async function strokeToPath() {
  const node = primary(); if (!node) return toast('Select a stroked object first');
  const paint = presentation(node, ['stroke', 'opacity', 'filter', 'clip-path', 'mask']);
  if (!paint.stroke || paint.stroke === 'none' || paint.stroke === 'rgba(0, 0, 0, 0)') return toast('Selection has no visible stroke');
  status('Expanding stroke to editable path…');
  try {
    const width = parseFloat(getComputedStyle(node).strokeWidth) || 1; const raster = await rasterizeNode(node, 'stroke', width + 3, 1000);
    if (!raster.mask.some(Boolean)) return toast('Stroke produced no geometry');
    const d = tracedPath(raster.mask, raster.width, raster.height, raster.bounds, .7); const path = replaceWithRootPath(node, d, { fill: paint.stroke, stroke: 'none', opacity: paint.opacity, filter: paint.filter, 'clip-path': paint['clip-path'], mask: paint.mask });
    applyViaSource(serializeCurrent(), path?.id); toast('Stroke converted to path');
  } catch (error) { console.error(error); toast(error.message || 'Stroke expansion failed'); }
}
async function applyOffset() {
  const node = primary(); if (!node) return toast('Select a filled object first');
  const distance = Number($('#cwOffsetDistance')?.value) || 0; if (!distance) return toast('Enter a non-zero offset');
  const paint = presentation(node, ['fill', 'opacity', 'filter', 'clip-path', 'mask']); if (!paint.fill || paint.fill === 'none') return toast('Selection has no fill to offset');
  status(`Creating ${distance > 0 ? 'outset' : 'inset'} path…`);
  try {
    const raster = await rasterizeNode(node, 'fill', Math.abs(distance) + 4, 1000); const pxPerUnit = Math.min(raster.width / raster.bounds.width, raster.height / raster.bounds.height);
    const result = offsetMask(raster.mask, raster.width, raster.height, distance * pxPerUnit); if (!result.some(Boolean)) return toast('Offset removed the entire shape');
    const d = tracedPath(result, raster.width, raster.height, raster.bounds, .8); const path = replaceWithRootPath(node, d, { fill: paint.fill, stroke: 'none', opacity: paint.opacity, filter: paint.filter, 'clip-path': paint['clip-path'], mask: paint.mask });
    applyViaSource(serializeCurrent(), path?.id); toast(`Offset path ${distance > 0 ? 'expanded' : 'inset'} by ${Math.abs(distance)}`);
  } catch (error) { console.error(error); toast(error.message || 'Offset failed'); }
}

function matrixOf(node) { const item = node.transform?.baseVal?.numberOfItems ? node.transform.baseVal.consolidate() : null; const m = item?.matrix; return m ? new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]) : new DOMMatrix(); }
function parentPointAtClient(node, clientX, clientY) { const parent = node.parentNode; const root = svg(); const p = root.createSVGPoint(); p.x = clientX; p.y = clientY; const matrix = parent?.getScreenCTM?.(); return matrix ? p.matrixTransform(matrix.inverse()) : clientToSvg(clientX, clientY); }
function rotationOf(node) { const m = matrixOf(node); return normalizeAngle(Math.atan2(m.b, m.a) * 180 / Math.PI); }
function matrixText(m) { const n = value => Number(value.toFixed(6)); return `matrix(${n(m.a)} ${n(m.b)} ${n(m.c)} ${n(m.d)} ${n(m.e)} ${n(m.f)})`; }
function rotateNodes(nodes, delta, centerClient, bases = null) {
  nodes.forEach((node, index) => {
    const center = parentPointAtClient(node, centerClient.x, centerClient.y); const base = bases?.[index] || matrixOf(node);
    const rotated = new DOMMatrix().translate(center.x, center.y).rotate(delta).translate(-center.x, -center.y).multiply(base); node.setAttribute('transform', matrixText(rotated));
  });
}
function scheduleRotationOverlay() { if (state.rotationFrame) return; state.rotationFrame = requestAnimationFrame(() => { state.rotationFrame = 0; renderRotationOverlay(); syncInspector(); }); }
function renderRotationOverlay() {
  $('#cwRotateOverlay')?.remove(); const nodes = selectedNodes().filter(n => n.dataset.cwConnector !== 'true'); const wrap = $('#artboardWrap'); if (!nodes.length || !wrap) return;
  const bounds = unionClientBounds(nodes); if (!bounds) return; const wr = wrap.getBoundingClientRect(); const cx = (bounds.left + bounds.right) / 2 - wr.left; const top = bounds.top - wr.top; const handleY = top - 28;
  const overlay = document.createElement('div'); overlay.id = 'cwRotateOverlay'; overlay.className = 'cw-rotate-overlay'; overlay.innerHTML = `<span class="cw-rotate-line"></span><button class="cw-rotate-handle" title="Drag to rotate"></button><span class="cw-angle-badge"></span>`; wrap.appendChild(overlay);
  const line = overlay.querySelector('.cw-rotate-line'), handle = overlay.querySelector('.cw-rotate-handle'), badge = overlay.querySelector('.cw-angle-badge'); line.style.left = `${cx}px`; line.style.top = `${handleY}px`; line.style.height = '28px'; handle.style.left = `${cx}px`; handle.style.top = `${handleY}px`; badge.style.left = `${cx}px`; badge.style.top = `${handleY}px`; badge.textContent = `${Math.round(rotationOf(nodes.at(-1)) * 10) / 10}°`;
  handle.addEventListener('pointerdown', event => {
    event.preventDefault(); event.stopPropagation(); handle.setPointerCapture(event.pointerId);
    const centerClient = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 }; const start = Math.atan2(event.clientY - centerClient.y, event.clientX - centerClient.x) * 180 / Math.PI; const bases = nodes.map(matrixOf);
    state.rotationDrag = { nodes, centerClient, start, bases, delta: 0 };
    const move = e => { if (!state.rotationDrag) return; const now = Math.atan2(e.clientY - centerClient.y, e.clientX - centerClient.x) * 180 / Math.PI; const delta = normalizeAngle(now - start); state.rotationDrag.delta = delta; rotateNodes(nodes, delta, centerClient, bases); badge.textContent = `${Math.round(normalizeAngle(rotationOf(nodes.at(-1))) * 10) / 10}°`; };
    const end = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end); state.rotationDrag = null; commitSelectionChange(); scheduleRotationOverlay(); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  });
}
function rotateSelectionTo(angle) {
  const nodes = selectedNodes().filter(n => n.dataset.cwConnector !== 'true'); if (!nodes.length) return toast('Select an object to rotate'); const bounds = unionClientBounds(nodes); const current = rotationOf(nodes.at(-1)); const delta = normalizeAngle(Number(angle) - current); rotateNodes(nodes, delta, { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 }); commitSelectionChange(); scheduleRotationOverlay();
}
function rotateSelectionBy(delta) { const nodes = selectedNodes().filter(n => n.dataset.cwConnector !== 'true'); if (!nodes.length) return toast('Select an object to rotate'); const bounds = unionClientBounds(nodes); rotateNodes(nodes, delta, { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 }); commitSelectionChange(); scheduleRotationOverlay(); }

function selectedTexts() { return selectedNodes().filter(n => n.tagName?.toLowerCase() === 'text'); }
function textLines(text) { const tspans = [...text.children].filter(n => n.tagName.toLowerCase() === 'tspan'); return tspans.length ? tspans.map(n => n.textContent) : [text.textContent || '']; }
function setMultiline(text, value, lineHeight = 1.2) {
  if (text.querySelector('textPath')) { text.querySelector('textPath').textContent = value.replace(/\n+/g, ' '); return; }
  const lines = String(value).split('\n'); const x = text.getAttribute('x') || '0'; text.textContent = '';
  lines.forEach((line, index) => { const span = document.createElementNS(SVG_NS, 'tspan'); span.setAttribute('x', x); if (index) span.setAttribute('dy', `${lineHeight}em`); span.textContent = line || ' '; text.appendChild(span); });
}
function applyTypography(attr, value) { const texts = selectedTexts(); if (!texts.length) return; texts.forEach(text => value === '' ? text.removeAttribute(attr) : text.setAttribute(attr, value)); commitSelectionChange(); scheduleRotationOverlay(); }
function textOnPath() {
  const nodes = selectedNodes(), text = nodes.find(n => n.tagName.toLowerCase() === 'text'), path = nodes.find(n => n.tagName.toLowerCase() === 'path'); if (!text || !path) return toast('Select one text object and one path');
  if (!path.id) path.id = uniqueId('text-path'); const content = textLines(text).join(' '); text.textContent = ''; text.removeAttribute('x'); text.removeAttribute('y'); const tp = document.createElementNS(SVG_NS, 'textPath'); tp.setAttribute('href', `#${path.id}`); tp.setAttribute('startOffset', `${Number($('#cwTextPathOffset')?.value) || 0}%`); tp.textContent = content; text.appendChild(tp); commitSelectionChange(); toast('Text attached to path');
}
function releaseTextPath() {
  const text = selectedTexts().at(-1); const tp = text?.querySelector('textPath'); if (!text || !tp) return toast('Select text that is attached to a path'); const content = tp.textContent; const ref = tp.getAttribute('href') || ''; const path = ref.startsWith('#') ? svg()?.querySelector(ref) : null; let point = { x: 0, y: 0 }; try { if (path?.getPointAtLength) point = path.getPointAtLength(0); } catch {}
  text.textContent = content; text.setAttribute('x', String(point.x)); text.setAttribute('y', String(point.y)); commitSelectionChange(); toast('Text released from path');
}

function symbolElements() { return [...(svg()?.querySelectorAll('defs symbol') || [])]; }
function refreshSymbolLibrary() { const select = $('#cwSymbolLibrary'); if (!select) return; const current = select.value; const symbols = symbolElements(); select.innerHTML = symbols.length ? symbols.map(s => `<option value="${s.id}">${s.id}</option>`).join('') : '<option value="">No symbols yet</option>'; if (symbols.some(s => s.id === current)) select.value = current; }
function createSymbol() {
  const nodes = selectedNodes().filter(n => !n.closest('defs')); if (!nodes.length) return toast('Select artwork to turn into a symbol'); const bounds = combinedRootBounds(nodes); if (!bounds) return;
  const raw = ($('#cwSymbolName')?.value || 'component').trim(); const base = raw.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'component'; let id = `cw-symbol-${base}`, suffix = 2; while (svg().querySelector(`#${cssEscape(id)}`)) id = `cw-symbol-${base}-${suffix++}`;
  const symbol = document.createElementNS(SVG_NS, 'symbol'); symbol.id = id; symbol.setAttribute('viewBox', `${bounds.left} ${bounds.top} ${Math.max(.001, bounds.width)} ${Math.max(.001, bounds.height)}`); nodes.forEach(n => { const clone = n.cloneNode(true); stripEditorAttrs(clone); symbol.appendChild(clone); }); ensureDefs().appendChild(symbol);
  const use = document.createElementNS(SVG_NS, 'use'); use.id = uniqueId('instance'); use.setAttribute('href', `#${id}`); use.setAttribute('x', bounds.left); use.setAttribute('y', bounds.top); use.setAttribute('width', bounds.width); use.setAttribute('height', bounds.height); const first = nodes[0]; first.parentNode.insertBefore(use, first); nodes.forEach(n => n.remove());
  applyViaSource(serializeCurrent(), use.id); requestAnimationFrame(refreshSymbolLibrary); toast('Reusable SVG symbol created');
}
function insertSymbol() {
  const id = $('#cwSymbolLibrary')?.value, symbol = id && svg()?.querySelector(`#${cssEscape(id)}`); if (!symbol) return toast('Choose a symbol from the library'); const vb = symbol.getAttribute('viewBox')?.split(/[ ,]+/).map(Number) || [0, 0, 100, 100]; const page = rootViewBox(); const scale = Math.min(1, page[2] * .35 / vb[2], page[3] * .35 / vb[3]); const w = vb[2] * scale, h = vb[3] * scale;
  const use = document.createElementNS(SVG_NS, 'use'); use.id = uniqueId('instance'); use.setAttribute('href', `#${id}`); use.setAttribute('x', page[0] + (page[2] - w) / 2); use.setAttribute('y', page[1] + (page[3] - h) / 2); use.setAttribute('width', w); use.setAttribute('height', h); svg().appendChild(use); applyViaSource(serializeCurrent(), use.id); toast('Symbol instance inserted');
}
function updateSymbol() {
  const id = $('#cwSymbolLibrary')?.value, symbol = id && svg()?.querySelector(`#${cssEscape(id)}`); const nodes = selectedNodes().filter(n => !n.closest('defs') && n.tagName.toLowerCase() !== 'use'); if (!symbol || !nodes.length) return toast('Choose a symbol and select replacement artwork'); const bounds = combinedRootBounds(nodes); symbol.textContent = ''; nodes.forEach(n => { const clone = n.cloneNode(true); stripEditorAttrs(clone); symbol.appendChild(clone); }); symbol.setAttribute('viewBox', `${bounds.left} ${bounds.top} ${Math.max(.001, bounds.width)} ${Math.max(.001, bounds.height)}`); commitSelectionChange(); toast('Symbol master updated');
}
function detachSymbol() {
  const use = selectedNodes().find(n => n.tagName.toLowerCase() === 'use'); if (!use) return toast('Select a symbol instance'); const href = use.getAttribute('href') || use.getAttribute('xlink:href'); const symbol = href?.startsWith('#') ? svg()?.querySelector(href) : null; if (!symbol) return toast('Referenced symbol is unavailable'); const vb = symbol.getAttribute('viewBox')?.split(/[ ,]+/).map(Number) || [0, 0, 100, 100]; const x = Number(use.getAttribute('x')) || 0, y = Number(use.getAttribute('y')) || 0, w = Number(use.getAttribute('width')) || vb[2], h = Number(use.getAttribute('height')) || vb[3]; const sx = w / vb[2], sy = h / vb[3]; const group = document.createElementNS(SVG_NS, 'g'); group.id = uniqueId('detached'); const own = use.getAttribute('transform') || ''; group.setAttribute('transform', `${own} translate(${x} ${y}) scale(${sx} ${sy}) translate(${-vb[0]} ${-vb[1]})`.trim()); [...symbol.children].forEach(n => group.appendChild(n.cloneNode(true))); use.replaceWith(group); applyViaSource(serializeCurrent(), group.id); toast('Symbol instance detached');
}

function filterElement(tag, attrs = {}) { const el = document.createElementNS(SVG_NS, tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v))); return el; }
function applyFilter() {
  const nodes = selectedNodes(); if (!nodes.length) return toast('Select artwork for an effect'); const preset = $('#cwFilterPreset').value; const amount = Number($('#cwFilterAmount').value) || 0; const dx = Number($('#cwFilterDx').value) || 0, dy = Number($('#cwFilterDy').value) || 0, color = $('#cwFilterColor').value, opacity = Math.max(0, Math.min(1, Number($('#cwFilterOpacity').value) || 0)); const filter = filterElement('filter', { id: uniqueId('filter'), x: '-60%', y: '-60%', width: '220%', height: '220%', 'color-interpolation-filters': 'sRGB' });
  if (preset === 'blur') filter.appendChild(filterElement('feGaussianBlur', { stdDeviation: Math.max(0, amount) }));
  else if (preset === 'shadow') filter.appendChild(filterElement('feDropShadow', { dx, dy, stdDeviation: Math.max(0, amount), 'flood-color': color, 'flood-opacity': opacity }));
  else if (preset === 'glow') { filter.appendChild(filterElement('feGaussianBlur', { stdDeviation: Math.max(0, amount), result: 'blur' })); filter.appendChild(filterElement('feFlood', { 'flood-color': color, 'flood-opacity': opacity, result: 'color' })); filter.appendChild(filterElement('feComposite', { in: 'color', in2: 'blur', operator: 'in', result: 'glow' })); const merge = filterElement('feMerge'); merge.append(filterElement('feMergeNode', { in: 'glow' }), filterElement('feMergeNode', { in: 'SourceGraphic' })); filter.appendChild(merge); }
  else if (preset === 'brightness' || preset === 'contrast') { const transfer = filterElement('feComponentTransfer'); const slope = Math.max(0, amount); const intercept = preset === 'contrast' ? .5 - .5 * slope : 0; ['R', 'G', 'B'].forEach(channel => transfer.appendChild(filterElement(`feFunc${channel}`, { type: 'linear', slope, intercept }))); filter.appendChild(transfer); }
  else if (preset === 'saturate') filter.appendChild(filterElement('feColorMatrix', { type: 'saturate', values: Math.max(0, amount) }));
  else if (preset === 'hue') filter.appendChild(filterElement('feColorMatrix', { type: 'hueRotate', values: amount }));
  else if (preset === 'grayscale') filter.appendChild(filterElement('feColorMatrix', { type: 'saturate', values: 0 }));
  else if (preset === 'sepia') filter.appendChild(filterElement('feColorMatrix', { type: 'matrix', values: '.393 .769 .189 0 0 .349 .686 .168 0 0 .272 .534 .131 0 0 0 0 0 1 0' }));
  ensureDefs().appendChild(filter); nodes.forEach(node => node.setAttribute('filter', `url(#${filter.id})`)); commitSelectionChange(); toast('SVG effect applied');
}
function removeFilter() { const nodes = selectedNodes(); if (!nodes.length) return; nodes.forEach(n => n.removeAttribute('filter')); commitSelectionChange(); toast('Effect removed'); }

async function importImageFile(file) {
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); const image = await imageFromUrl(dataUrl); const vb = rootViewBox(); const scale = Math.min(vb[2] * .65 / image.naturalWidth, vb[3] * .65 / image.naturalHeight, 1); const width = image.naturalWidth * scale, height = image.naturalHeight * scale; const el = document.createElementNS(SVG_NS, 'image'); el.id = uniqueId('image'); el.setAttribute('href', dataUrl); el.setAttribute('x', vb[0] + (vb[2] - width) / 2); el.setAttribute('y', vb[1] + (vb[3] - height) / 2); el.setAttribute('width', width); el.setAttribute('height', height); el.setAttribute('preserveAspectRatio', 'xMidYMid meet'); svg().appendChild(el); applyViaSource(serializeCurrent(), el.id); toast('Raster image embedded locally');
}
async function traceSelectedImage() {
  const imageNode = selectedNodes().find(n => n.tagName.toLowerCase() === 'image'); if (!imageNode) return toast('Select an imported image to trace'); const href = imageNode.getAttribute('href') || imageNode.getAttribute('xlink:href'); if (!href) return toast('Selected image has no source'); status('Clustering colors and tracing contours…');
  try {
    const image = await imageFromUrl(href); const detail = Number($('#cwTraceDetail').value) || 384; const aspect = image.naturalWidth / image.naturalHeight; const width = aspect >= 1 ? detail : Math.max(32, Math.round(detail * aspect)); const height = aspect >= 1 ? Math.max(32, Math.round(detail / aspect)) : detail; const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0, width, height); const rgba = ctx.getImageData(0, 0, width, height).data; const colors = Math.max(2, Math.min(10, Number($('#cwTraceColors').value) || 4)); const q = quantizeRgba(rgba, colors); const minPixels = Math.max(2, Math.round(width * height * .00035)); const masks = masksFromLabels(q.labels, q.centers.length, minPixels); const smooth = Number($('#cwTraceSmooth').value) || 0;
    const swatches = $('#cwTraceSwatches'); if (swatches) swatches.innerHTML = q.centers.map(c => `<span title="${rgbaToHex(...c)}" style="background:${rgbaToHex(...c)}"></span>`).join('');
    const x = Number(imageNode.getAttribute('x')) || 0, y = Number(imageNode.getAttribute('y')) || 0, iw = Number(imageNode.getAttribute('width')) || image.naturalWidth, ih = Number(imageNode.getAttribute('height')) || image.naturalHeight; const group = document.createElementNS(SVG_NS, 'g'); group.id = uniqueId('trace'); if (imageNode.getAttribute('transform')) group.setAttribute('transform', imageNode.getAttribute('transform'));
    masks.forEach((mask, index) => { if (!mask.some(Boolean)) return; const loops = traceMask(mask, width, height).map(loop => simplifyClosedLoop(loop, smooth)).filter(loop => loop.length >= 3); if (!loops.length) return; const path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('d', loopsToPath(loops, { originX: x, originY: y, scaleX: iw / width, scaleY: ih / height, precision: 2 })); path.setAttribute('fill', rgbaToHex(...q.centers[index])); path.setAttribute('fill-rule', 'evenodd'); path.setAttribute('stroke', 'none'); group.appendChild(path); });
    if (!group.childElementCount) return toast('No traceable regions found'); const parent = imageNode.parentNode; if ($('#cwTraceKeep').checked) parent.insertBefore(group, imageNode.nextSibling); else imageNode.replaceWith(group); applyViaSource(serializeCurrent(), group.id); toast(`Vector trace created with ${group.childElementCount} color layers`);
  } catch (error) { console.error(error); toast(error.message || 'Image tracing failed'); }
}

function parseSeconds(text) { const match = String(text || '').trim().match(/^([\d.]+)(ms|s)?$/); if (!match) return 0; return Number(match[1]) * (match[2] === 'ms' ? .001 : 1); }
function animationElements(node) { return node ? [...node.children].filter(n => ['animate', 'animatetransform'].includes(n.tagName.toLowerCase())) : []; }
function refreshAnimationList() { const select = $('#cwAnimationList'); if (!select) return; const items = animationElements(primary()); const current = select.value; select.innerHTML = items.length ? items.map((a, i) => { if (!a.id) a.id = uniqueId('anim'); const label = a.tagName.toLowerCase() === 'animatetransform' ? `Transform: ${a.getAttribute('type')}` : `${a.getAttribute('attributeName')}`; return `<option value="${a.id}">${i + 1}. ${label} · ${a.getAttribute('dur') || ''}</option>`; }).join('') : '<option value="">No animations</option>'; if (items.some(a => a.id === current)) select.value = current; }
function syncAnimationDefaults() {
  const type = $('#cwAnimType')?.value, node = primary(); if (!type || !$('#cwAnimFrom')) return;
  const defaults = { opacity: [node?.getAttribute('opacity') || '1', '0'], translate: ['0 0', '100 0'], rotate: ['0', '360'], scale: ['1', '1.5'], fill: [node?.getAttribute('fill') || '#7257ff', '#2dc7bd'], stroke: [node?.getAttribute('stroke') || '#000000', '#7257ff'], path: [node?.tagName?.toLowerCase() === 'path' ? node.getAttribute('d') || '' : '', ''] };
  const [from, to] = defaults[type] || ['', '']; $('#cwAnimFrom').value = from; $('#cwAnimTo').value = to;
}
function addAnimation() {
  const node = primary(); if (!node) return toast('Select an object to animate'); const type = $('#cwAnimType').value, from = $('#cwAnimFrom').value, to = $('#cwAnimTo').value, dur = Math.max(.05, Number($('#cwAnimDuration').value) || 1), begin = Math.max(0, Number($('#cwAnimBegin').value) || 0), repeat = $('#cwAnimRepeat').value, easing = $('#cwAnimEasing').value; if (type === 'path' && node.tagName.toLowerCase() !== 'path') return toast('Path morph requires a path element'); if (!to.trim()) return toast('Enter a target animation value');
  let anim;
  if (['translate', 'rotate', 'scale'].includes(type)) { anim = document.createElementNS(SVG_NS, 'animateTransform'); anim.setAttribute('attributeName', 'transform'); anim.setAttribute('type', type); anim.setAttribute('additive', 'sum'); if (type === 'rotate') { const b = node.getBBox(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; anim.setAttribute('from', `${Number(from) || 0} ${cx} ${cy}`); anim.setAttribute('to', `${Number(to) || 0} ${cx} ${cy}`); } else { anim.setAttribute('from', from); anim.setAttribute('to', to); } }
  else { anim = document.createElementNS(SVG_NS, 'animate'); anim.setAttribute('attributeName', type === 'path' ? 'd' : type); anim.setAttribute('from', type === 'path' ? (from || node.getAttribute('d') || '') : from); anim.setAttribute('to', to); }
  anim.id = uniqueId('anim'); anim.setAttribute('dur', `${dur}s`); anim.setAttribute('begin', `${begin}s`); anim.setAttribute('repeatCount', repeat); anim.setAttribute('fill', 'freeze'); const spline = easingSpline(easing); if (spline) { anim.setAttribute('calcMode', 'spline'); anim.setAttribute('keyTimes', '0;1'); anim.setAttribute('keySplines', spline); }
  node.appendChild(anim); commitSelectionChange(); refreshAnimationList(); toast('Native SVG animation added');
}
function removeAnimation() { const node = primary(), id = $('#cwAnimationList')?.value; const anim = id && node?.querySelector(`#${cssEscape(id)}`); if (!anim) return toast('Choose an animation track'); anim.remove(); commitSelectionChange(); refreshAnimationList(); }
function animationDuration(node) { return Math.max(1, ...animationElements(node).map(a => parseSeconds(a.getAttribute('begin')) + parseSeconds(a.getAttribute('dur')) * (Number(a.getAttribute('repeatCount')) || 1)).filter(Number.isFinite)); }
function scrubAnimation(percent) { const root = svg(); if (!root?.setCurrentTime) return; const total = animationDuration(primary()); try { root.pauseAnimations?.(); root.setCurrentTime(total * percent / 100); } catch {} }
function restartAnimation(play = false) { const root = svg(); if (!root?.setCurrentTime) return; try { root.setCurrentTime(0); if (play) root.unpauseAnimations?.(); else root.pauseAnimations?.(); if ($('#cwTimeline')) $('#cwTimeline').value = '0'; } catch {} }

function syncTypography() {
  const text = selectedTexts().at(-1); const controls = ['cwFontWeight', 'cwFontStyle', 'cwTextAnchor', 'cwLetterSpacing', 'cwWordSpacing', 'cwLineHeight', 'cwBaseline', 'cwTextDecoration', 'cwMultilineText', 'cwTextPathOffset']; controls.forEach(id => { const el = $(`#${id}`); if (el) el.disabled = !text; }); if (!text) return;
  const weight = text.getAttribute('font-weight') || '400'; $('#cwFontWeight').value = weight === 'bold' ? '700' : (['100','200','300','400','500','600','700','800','900'].includes(weight) ? weight : '400'); $('#cwFontStyle').value = text.getAttribute('font-style') || 'normal'; $('#cwTextAnchor').value = text.getAttribute('text-anchor') || 'start'; $('#cwLetterSpacing').value = parseFloat(text.getAttribute('letter-spacing')) || 0; $('#cwWordSpacing').value = parseFloat(text.getAttribute('word-spacing')) || 0; $('#cwBaseline').value = text.getAttribute('dominant-baseline') || 'auto'; $('#cwTextDecoration').value = text.getAttribute('text-decoration') || 'none'; $('#cwMultilineText').value = textLines(text).join('\n'); const tp = text.querySelector('textPath'); $('#cwTextPathOffset').value = tp ? parseFloat(tp.getAttribute('startOffset')) || 0 : 0;
}
function syncInspector() {
  if (state.syncing) return; state.syncing = true;
  try { const node = primary(); if ($('#cwRotationAngle')) $('#cwRotationAngle').value = node ? String(Math.round(rotationOf(node) * 100) / 100) : '0'; syncTypography(); refreshSymbolLibrary(); refreshAnimationList(); } finally { state.syncing = false; }
}
function syncFilterDefaults() {
  const preset = $('#cwFilterPreset')?.value; if (!preset) return;
  const amount = $('#cwFilterAmount'); if (!amount) return;
  if (['brightness','contrast','saturate'].includes(preset)) amount.value = '1';
  else if (preset === 'hue') amount.value = '90';
  else amount.value = '4';
}

function bindUi() {
  $('#cwStrokeToPath')?.addEventListener('click', strokeToPath); $('#cwApplyOffset')?.addEventListener('click', applyOffset); $('#cwRotationAngle')?.addEventListener('change', e => rotateSelectionTo(e.target.value)); $('#cwRotateReset')?.addEventListener('click', () => rotateSelectionTo(0)); $('#cwRotate45')?.addEventListener('click', () => rotateSelectionBy(45));
  $('#cwFontWeight')?.addEventListener('change', e => !state.syncing && applyTypography('font-weight', e.target.value)); $('#cwFontStyle')?.addEventListener('change', e => !state.syncing && applyTypography('font-style', e.target.value)); $('#cwTextAnchor')?.addEventListener('change', e => !state.syncing && applyTypography('text-anchor', e.target.value)); $('#cwLetterSpacing')?.addEventListener('change', e => !state.syncing && applyTypography('letter-spacing', `${Number(e.target.value) || 0}`)); $('#cwWordSpacing')?.addEventListener('change', e => !state.syncing && applyTypography('word-spacing', `${Number(e.target.value) || 0}`)); $('#cwBaseline')?.addEventListener('change', e => !state.syncing && applyTypography('dominant-baseline', e.target.value)); $('#cwTextDecoration')?.addEventListener('change', e => !state.syncing && applyTypography('text-decoration', e.target.value));
  $('#cwMultilineText')?.addEventListener('change', e => { const texts = selectedTexts(); if (!texts.length) return; const lh = Number($('#cwLineHeight').value) || 1.2; texts.forEach(t => setMultiline(t, e.target.value, lh)); commitSelectionChange(); }); $('#cwLineHeight')?.addEventListener('change', () => { const text = selectedTexts().at(-1); if (text) { const value = $('#cwMultilineText').value; setMultiline(text, value, Number($('#cwLineHeight').value) || 1.2); commitSelectionChange(); } }); $('#cwTextOnPath')?.addEventListener('click', textOnPath); $('#cwReleaseTextPath')?.addEventListener('click', releaseTextPath); $('#cwTextPathOffset')?.addEventListener('change', e => { const tp = selectedTexts().at(-1)?.querySelector('textPath'); if (tp) { tp.setAttribute('startOffset', `${Number(e.target.value) || 0}%`); commitSelectionChange(); } });
  $('#cwCreateSymbol')?.addEventListener('click', createSymbol); $('#cwInsertSymbol')?.addEventListener('click', insertSymbol); $('#cwUpdateSymbol')?.addEventListener('click', updateSymbol); $('#cwDetachSymbol')?.addEventListener('click', detachSymbol);
  $('#cwFilterPreset')?.addEventListener('change', syncFilterDefaults); $('#cwApplyFilter')?.addEventListener('click', applyFilter); $('#cwRemoveFilter')?.addEventListener('click', removeFilter);
  $('#cwImportImage')?.addEventListener('click', () => $('#cwRasterInput')?.click()); $('#cwImageTool')?.addEventListener('click', () => $('#cwRasterInput')?.click()); $('#cwRasterInput')?.addEventListener('change', async e => { const file = e.target.files?.[0]; if (!file) return; try { await importImageFile(file); } catch (error) { console.error(error); toast('Image import failed'); } e.target.value = ''; }); $('#cwTraceImage')?.addEventListener('click', traceSelectedImage);
  $('#cwAnimType')?.addEventListener('change', syncAnimationDefaults); $('#cwAddAnimation')?.addEventListener('click', addAnimation); $('#cwRemoveAnimation')?.addEventListener('click', removeAnimation); $('#cwTimeline')?.addEventListener('input', e => scrubAnimation(Number(e.target.value))); $('#cwAnimRestart')?.addEventListener('click', () => restartAnimation(false)); $('#cwAnimPlay')?.addEventListener('click', () => restartAnimation(true));
}

function observeEditor() {
  const layers = $('#layersList'), art = $('#artboard'); if (layers) new MutationObserver(scheduleRotationOverlay).observe(layers, { subtree: true, attributes: true, attributeFilter: ['class'] }); if (art) new MutationObserver(scheduleRotationOverlay).observe(art, { childList: true, subtree: true, attributes: true, attributeFilter: ['transform', 'x', 'y', 'width', 'height', 'd', 'font-size'] }); window.addEventListener('resize', scheduleRotationOverlay); $('#canvasArea')?.addEventListener('scroll', scheduleRotationOverlay, { passive: true });
}

function init() { injectUi(); bindUi(); observeEditor(); refreshSymbolLibrary(); syncAnimationDefaults(); scheduleRotationOverlay(); }
if (typeof document !== 'undefined') init();
