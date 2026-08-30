import { groupCommands, searchCommands } from './ui-utils.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { menu: null, paletteOpen: false, paletteIndex: 0, paletteResults: [], inspectorTab: 'design' };

function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('visible'), 1800);
}

function addStylesheet() {
  if (document.querySelector('link[data-cw-workspace-ui]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'styles/workspace-ui.css';
  link.dataset.cwWorkspaceUi = 'true';
  document.head.appendChild(link);
}

function clickSelector(selector) {
  const target = $(selector);
  if (!target) { toast('This command is not available in the current context'); return false; }
  if (target.disabled) { toast('This command needs a different selection'); return false; }
  target.click();
  return true;
}

function focusAdvanced(label) {
  showInspectorTab('advanced');
  const summaries = $$('#cwInspectorAdvanced summary');
  const wanted = String(label || '').toLowerCase();
  const summary = summaries.find(node => node.textContent.toLowerCase().includes(wanted));
  if (!summary) return;
  const details = summary.closest('details');
  if (details) {
    $$('#cwInspectorAdvanced details').forEach(node => { if (node !== details) node.open = false; });
    details.open = true;
    requestAnimationFrame(() => details.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
}

function toggleBodyClass(name) {
  document.body.classList.toggle(name);
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

const commands = [
  { id:'file.new', label:'New document', menu:'File', section:1, group:'File', icon:'＋', shortcut:'Ctrl+N', selector:'#newBtn', keywords:'create blank svg', priority:90 },
  { id:'file.open', label:'Open SVG…', menu:'File', section:1, group:'File', icon:'⌁', shortcut:'Ctrl+O', selector:'#openBtn', keywords:'load file import svg', priority:89 },
  { id:'file.import-image', label:'Import raster image…', menu:'File', section:1, group:'File', icon:'▧', selector:'#cwImportImage', keywords:'png jpg jpeg webp raster picture image', priority:70 },
  { id:'file.save', label:'Save SVG', menu:'File', section:2, group:'File', icon:'↓', shortcut:'Ctrl+S', selector:'#saveBtn', keywords:'download export vector', priority:88 },
  { id:'file.export-svg', label:'Export SVG', menu:'File', section:2, group:'File', icon:'◇', selector:'#exportMenu [data-export="svg"]', keywords:'download vector' },
  { id:'file.export-png', label:'Export PNG 2×', menu:'File', section:2, group:'File', icon:'▧', selector:'#exportMenu [data-export="png"]', keywords:'raster download image' },
  { id:'file.copy-svg', label:'Copy SVG to clipboard', menu:'File', section:2, group:'File', icon:'⧉', selector:'#exportMenu [data-export="copy"]', keywords:'source clipboard' },
  { id:'file.repair', label:'Repair & optimize SVG…', menu:'File', section:3, group:'File', icon:'✦', selector:'#repairBtn', keywords:'simplify clean compress optimize doctor', priority:72 },

  { id:'edit.undo', label:'Undo', menu:'Edit', section:1, group:'Edit', icon:'↶', shortcut:'Ctrl+Z', selector:'#undoBtn', priority:85 },
  { id:'edit.redo', label:'Redo', menu:'Edit', section:1, group:'Edit', icon:'↷', shortcut:'Ctrl+Shift+Z', selector:'#redoBtn', priority:84 },
  { id:'edit.duplicate', label:'Duplicate selection', menu:'Edit', section:2, group:'Edit', icon:'⧉', shortcut:'Ctrl+D', selector:'#duplicateBtn', keywords:'copy object clone', priority:66 },
  { id:'edit.delete', label:'Delete selection', menu:'Edit', section:2, group:'Edit', icon:'⌫', shortcut:'Delete', selector:'#deleteBtn', keywords:'remove object' },
  { id:'edit.select-all', label:'Select all', menu:'Edit', section:3, group:'Selection', icon:'▣', shortcut:'Ctrl+A', selector:'[data-cw-action="all"]', priority:64 },
  { id:'edit.select-same', label:'Select same type', menu:'Edit', section:3, group:'Selection', icon:'≋', selector:'[data-cw-action="same"]', keywords:'similar same element' },
  { id:'edit.invert', label:'Invert selection', menu:'Edit', section:3, group:'Selection', icon:'◩', selector:'[data-cw-action="invert"]' },

  { id:'tool.select', label:'Select tool', menu:'Object', section:1, group:'Tools', icon:'↖', shortcut:'V', selector:'.tool[data-tool="select"]', keywords:'pointer move selection', priority:95 },
  { id:'tool.marquee', label:'Marquee multi-select', menu:'Object', section:1, group:'Tools', icon:'▱', shortcut:'M', selector:'#marqueeTool', keywords:'box selection crossing contain', priority:82 },
  { id:'tool.hand', label:'Hand / pan tool', menu:'View', section:1, group:'Tools', icon:'✋', shortcut:'H', selector:'.tool[data-tool="hand"]', keywords:'move canvas pan' },
  { id:'tool.node', label:'Node / Bézier tool', menu:'Path', section:1, group:'Tools', icon:'◆', shortcut:'N', selector:'#nodeTool', keywords:'anchor control handles edit path', priority:86 },
  { id:'tool.rect', label:'Rectangle tool', menu:'Object', section:1, group:'Tools', icon:'▭', shortcut:'R', selector:'.tool[data-tool="rect"]', keywords:'draw shape box' },
  { id:'tool.ellipse', label:'Ellipse tool', menu:'Object', section:1, group:'Tools', icon:'○', shortcut:'E', selector:'.tool[data-tool="ellipse"]', keywords:'circle oval draw' },
  { id:'tool.pen', label:'Pen tool', menu:'Path', section:1, group:'Tools', icon:'⌁', shortcut:'P', selector:'.tool[data-tool="pen"]', keywords:'draw path vector' },
  { id:'tool.text', label:'Text tool', menu:'Text', section:1, group:'Tools', icon:'T', shortcut:'T', selector:'.tool[data-tool="text"]', keywords:'type typography' },
  { id:'tool.connector', label:'Connector tool', menu:'Object', section:1, group:'Tools', icon:'↗', shortcut:'C', selector:'#connectorTool', keywords:'arrow link objects diagram' },
  { id:'tool.image', label:'Image import tool', menu:'Object', section:1, group:'Tools', icon:'▧', selector:'#cwImageTool', keywords:'raster png jpeg' },

  { id:'object.group', label:'Group selection', menu:'Object', section:2, group:'Object', icon:'▦', selector:'#groupBtn', keywords:'combine objects' },
  { id:'object.ungroup', label:'Ungroup', menu:'Object', section:2, group:'Object', icon:'▤', selector:'#ungroupBtn', keywords:'separate group' },
  { id:'object.front', label:'Bring to front', menu:'Object', section:2, group:'Object', icon:'⇈', selector:'#bringFrontBtn', keywords:'layer z order' },
  { id:'object.back', label:'Send to back', menu:'Object', section:2, group:'Object', icon:'⇊', selector:'#sendBackBtn', keywords:'layer z order' },
  { id:'object.lock', label:'Lock selected', menu:'Object', section:3, group:'Object', icon:'🔒', selector:'[data-cw-action="lock"]' },
  { id:'object.unlock', label:'Unlock all', menu:'Object', section:3, group:'Object', icon:'🔓', selector:'[data-cw-action="unlock-all"]' },
  { id:'object.align-left', label:'Align left', menu:'Object', section:4, group:'Arrange', icon:'⇤', selector:'[data-cw-action="left"]' },
  { id:'object.align-center', label:'Align horizontal centers', menu:'Object', section:4, group:'Arrange', icon:'↔', selector:'[data-cw-action="hcenter"]', keywords:'center align' },
  { id:'object.align-right', label:'Align right', menu:'Object', section:4, group:'Arrange', icon:'⇥', selector:'[data-cw-action="right"]' },
  { id:'object.align-top', label:'Align top', menu:'Object', section:4, group:'Arrange', icon:'↥', selector:'[data-cw-action="top"]' },
  { id:'object.align-middle', label:'Align vertical centers', menu:'Object', section:4, group:'Arrange', icon:'↕', selector:'[data-cw-action="vcenter"]', keywords:'middle align' },
  { id:'object.align-bottom', label:'Align bottom', menu:'Object', section:4, group:'Arrange', icon:'↧', selector:'[data-cw-action="bottom"]' },
  { id:'object.distribute-h', label:'Distribute horizontally', menu:'Object', section:5, group:'Arrange', icon:'⇔', selector:'[data-cw-action="distribute-x"]' },
  { id:'object.distribute-v', label:'Distribute vertically', menu:'Object', section:5, group:'Arrange', icon:'⇕', selector:'[data-cw-action="distribute-y"]' },
  { id:'object.rotate-left', label:'Rotate 90° left', menu:'Object', section:6, group:'Transform', icon:'↶', selector:'[data-cw-action="rotate-left"]' },
  { id:'object.rotate-right', label:'Rotate 90° right', menu:'Object', section:6, group:'Transform', icon:'↷', selector:'[data-cw-action="rotate-right"]' },
  { id:'object.flip-h', label:'Flip horizontal', menu:'Object', section:6, group:'Transform', icon:'⇆', selector:'[data-cw-action="flip-h"]' },
  { id:'object.flip-v', label:'Flip vertical', menu:'Object', section:6, group:'Transform', icon:'⇅', selector:'[data-cw-action="flip-v"]' },
  { id:'object.rotate-45', label:'Rotate +45°', menu:'Object', section:6, group:'Transform', icon:'⟳', selector:'#cwRotate45' },
  { id:'object.reset-angle', label:'Reset rotation angle', menu:'Object', section:6, group:'Transform', icon:'0°', selector:'#cwRotateReset' },
  { id:'object.clip', label:'Clip with top object', menu:'Object', section:7, group:'Object', icon:'◫', selector:'#cwClipTop', keywords:'clipping path mask crop' },
  { id:'object.mask', label:'Mask with top object', menu:'Object', section:7, group:'Object', icon:'◐', selector:'#cwMaskTop', keywords:'opacity mask' },
  { id:'object.release-mask', label:'Release mask / clip', menu:'Object', section:7, group:'Object', icon:'×', selector:'#cwReleaseEffect' },

  { id:'path.to-path', label:'Convert object to path', menu:'Path', section:2, group:'Path', icon:'◇', selector:'#cwConvertPath', keywords:'shape convert vector' },
  { id:'path.add-node', label:'Add path node', menu:'Path', section:2, group:'Path', icon:'＋', selector:'#cwAddNode', keywords:'anchor point' },
  { id:'path.delete-node', label:'Delete path node', menu:'Path', section:2, group:'Path', icon:'−', selector:'#cwDeleteNode', keywords:'anchor point' },
  { id:'path.line', label:'Convert segment to line', menu:'Path', section:2, group:'Path', icon:'╱', selector:'#cwLineSeg' },
  { id:'path.curve', label:'Convert segment to curve', menu:'Path', section:2, group:'Path', icon:'⌒', selector:'#cwCurveSeg', keywords:'bezier' },
  { id:'path.open-close', label:'Open / close path', menu:'Path', section:2, group:'Path', icon:'◌', selector:'#cwClosePath' },
  { id:'path.union', label:'Union shapes', menu:'Path', section:3, group:'Boolean', icon:'∪', selector:'[data-cw-boolean="union"]', keywords:'boolean combine merge' },
  { id:'path.subtract', label:'Subtract shapes', menu:'Path', section:3, group:'Boolean', icon:'−', selector:'[data-cw-boolean="subtract"]', keywords:'boolean difference' },
  { id:'path.intersect', label:'Intersect shapes', menu:'Path', section:3, group:'Boolean', icon:'∩', selector:'[data-cw-boolean="intersect"]', keywords:'boolean overlap' },
  { id:'path.exclude', label:'Exclude overlap', menu:'Path', section:3, group:'Boolean', icon:'⊕', selector:'[data-cw-boolean="exclude"]', keywords:'boolean xor' },
  { id:'path.builder', label:'Shape Builder', menu:'Path', section:3, group:'Boolean', icon:'✣', selector:'#cwShapeBuilder', keywords:'regions combine remove' },
  { id:'path.stroke-to-path', label:'Stroke → Path', menu:'Path', section:4, group:'Path', icon:'▰', selector:'#cwStrokeToPath', keywords:'expand outline stroke', priority:60 },
  { id:'path.offset', label:'Apply Offset Path', menu:'Path', section:4, group:'Path', icon:'◎', selector:'#cwApplyOffset', keywords:'inset outset grow shrink' },

  { id:'text.typography', label:'Open advanced typography', menu:'Text', section:2, group:'Text', icon:'Aa', run:() => focusAdvanced('Advanced typography'), keywords:'font weight spacing baseline multiline', priority:62 },
  { id:'text.path', label:'Put text on selected path', menu:'Text', section:2, group:'Text', icon:'⌒T', selector:'#cwTextOnPath', keywords:'text path curve' },
  { id:'text.release-path', label:'Release text from path', menu:'Text', section:2, group:'Text', icon:'T', selector:'#cwReleaseTextPath' },

  { id:'effects.paint', label:'Open paint & gradients', menu:'Effects', section:1, group:'Effects', icon:'◒', run:() => focusAdvanced('Paint & gradients'), keywords:'fill stroke gradient radial linear stops' },
  { id:'effects.filters', label:'Open SVG filters & effects', menu:'Effects', section:1, group:'Effects', icon:'✦', run:() => focusAdvanced('SVG filters'), keywords:'blur shadow glow grayscale sepia hue brightness' },
  { id:'effects.apply-filter', label:'Apply selected filter effect', menu:'Effects', section:1, group:'Effects', icon:'✦', selector:'#cwApplyFilter' },
  { id:'effects.remove-filter', label:'Remove filter effect', menu:'Effects', section:1, group:'Effects', icon:'×', selector:'#cwRemoveFilter' },
  { id:'effects.symbols', label:'Open symbols / components', menu:'Effects', section:2, group:'Components', icon:'◇', run:() => focusAdvanced('Symbols / reusable'), keywords:'component reusable master instance symbol use' },
  { id:'effects.create-symbol', label:'Create symbol from selection', menu:'Effects', section:2, group:'Components', icon:'◇', selector:'#cwCreateSymbol' },
  { id:'effects.detach-symbol', label:'Detach symbol instance', menu:'Effects', section:2, group:'Components', icon:'◇', selector:'#cwDetachSymbol' },
  { id:'effects.trace', label:'Trace selected image', menu:'Effects', section:3, group:'Tracing', icon:'▧', selector:'#cwTraceImage', keywords:'vectorize raster image png jpeg colors' },
  { id:'effects.tracing-panel', label:'Open image tracing controls', menu:'Effects', section:3, group:'Tracing', icon:'▧', run:() => focusAdvanced('Image import & vector tracing'), keywords:'vectorize raster' },
  { id:'effects.animation', label:'Open SVG animation timeline', menu:'Effects', section:4, group:'Animation', icon:'▶', run:() => focusAdvanced('SVG animation timeline'), keywords:'smil animate motion opacity rotate scale morph timeline' },
  { id:'effects.add-animation', label:'Add animation track', menu:'Effects', section:4, group:'Animation', icon:'＋', selector:'#cwAddAnimation' },

  { id:'view.fit', label:'Fit artwork to window', menu:'View', section:1, group:'View', icon:'□', selector:'#fitBtn', keywords:'zoom fit canvas', priority:55 },
  { id:'view.zoom-in', label:'Zoom in', menu:'View', section:1, group:'View', icon:'＋', selector:'#zoomInBtn' },
  { id:'view.zoom-out', label:'Zoom out', menu:'View', section:1, group:'View', icon:'−', selector:'#zoomOutBtn' },
  { id:'view.grid', label:'Toggle grid', menu:'View', section:2, group:'View', icon:'#', selector:'#gridBtn' },
  { id:'view.source', label:'Toggle SVG source', menu:'View', section:2, group:'View', icon:'</>', selector:'#codeToggleBtn', keywords:'code xml source inspector' },
  { id:'view.theme', label:'Toggle light / dark theme', menu:'View', section:2, group:'View', icon:'◐', selector:'#themeBtn' },
  { id:'view.inspector', label:'Toggle right inspector', menu:'View', section:3, group:'View', icon:'▤', run:() => toggleBodyClass('cw-inspector-collapsed'), keywords:'panel sidebar hide show' },
  { id:'view.tools', label:'Toggle left tool dock', menu:'View', section:3, group:'View', icon:'▥', run:() => toggleBodyClass('cw-tools-collapsed'), keywords:'toolbar sidebar hide show' },
  { id:'view.layers', label:'Show Layers panel', menu:'View', section:4, group:'View', icon:'≡', run:() => showInspectorTab('layers') },
  { id:'view.design', label:'Show Design panel', menu:'View', section:4, group:'View', icon:'◧', run:() => showInspectorTab('design') },
  { id:'view.advanced', label:'Show Advanced panel', menu:'View', section:4, group:'View', icon:'✦', run:() => showInspectorTab('advanced') },

  { id:'help.palette', label:'Find any command…', menu:'Help', section:1, group:'Help', icon:'⌕', shortcut:'Ctrl+K', run:() => openPalette(), keywords:'search command tool finder', priority:100 },
  { id:'help.shortcuts', label:'Keyboard shortcuts', menu:'Help', section:1, group:'Help', icon:'⌨', shortcut:'?', run:() => openShortcuts(), keywords:'keys help' },
  { id:'help.github', label:'CurveWeave on GitHub', menu:'Help', section:2, group:'Help', icon:'⌘', run:() => window.open('https://github.com/vtavakkoli/CurveWeave','_blank','noopener'), keywords:'repository source issues' }
];

const byId = new Map(commands.map(command => [command.id, command]));

function commandAvailable(command) {
  if (command.run) return true;
  return Boolean(command.selector && $(command.selector));
}

function executeCommand(command) {
  if (!command) return;
  closeMenus();
  closePalette();
  if (command.run) command.run();
  else clickSelector(command.selector);
  requestAnimationFrame(() => { syncToolbarActive(); updateContextBar(); });
}

function menuCommands(name) {
  return commands.filter(command => command.menu === name);
}

function createMenubar() {
  if ($('#cwMenuBar')) return;
  const app = $('#app');
  const topbar = $('.topbar');
  if (!app || !topbar) return;
  const bar = document.createElement('nav');
  bar.id = 'cwMenuBar';
  bar.className = 'cw-menubar';
  bar.setAttribute('aria-label', 'Application menu');
  const main = document.createElement('div');
  main.className = 'cw-menubar-main';
  const menus = ['File','Edit','Object','Path','Text','Effects','View','Help'];
  menus.forEach(name => {
    const trigger = document.createElement('button');
    trigger.className = 'cw-menu-trigger';
    trigger.type = 'button';
    trigger.textContent = name;
    trigger.setAttribute('aria-expanded','false');
    trigger.dataset.menu = name;
    trigger.addEventListener('click', event => { event.stopPropagation(); toggleMenu(name, trigger); });
    main.appendChild(trigger);
  });
  const spacer = document.createElement('div'); spacer.className = 'cw-menubar-spacer';
  const search = document.createElement('button');
  search.id = 'cwCommandTrigger'; search.className = 'cw-command-trigger'; search.type = 'button';
  search.innerHTML = '<span class="cw-command-text">⌕ Find a tool or command</span><kbd>Ctrl K</kbd>';
  search.addEventListener('click', openPalette);
  bar.append(main, spacer, search);
  topbar.insertAdjacentElement('afterend', bar);
  document.addEventListener('click', event => { if (!event.target.closest('.cw-menubar')) closeMenus(); });
}

function toggleMenu(name, trigger) {
  if (state.menu === name) { closeMenus(); return; }
  closeMenus();
  state.menu = name;
  trigger.setAttribute('aria-expanded','true');
  const popover = document.createElement('div');
  popover.className = 'cw-menu-popover';
  popover.dataset.cwMenuPopover = name;
  let section = null;
  menuCommands(name).forEach(command => {
    if (section !== null && command.section !== section) {
      const sep = document.createElement('div'); sep.className = 'cw-menu-separator'; popover.appendChild(sep);
    }
    section = command.section;
    const button = document.createElement('button'); button.className = 'cw-menu-item'; button.type = 'button';
    button.disabled = !commandAvailable(command);
    button.innerHTML = `<span class="cw-menu-icon">${command.icon || '·'}</span><span class="cw-menu-label">${command.label}</span>${command.shortcut ? `<kbd>${command.shortcut.replace('Ctrl','⌘/Ctrl')}</kbd>` : '<span></span>'}`;
    button.addEventListener('click', () => executeCommand(command));
    popover.appendChild(button);
  });
  $('#cwMenuBar').appendChild(popover);
  const triggerRect = trigger.getBoundingClientRect();
  const barRect = $('#cwMenuBar').getBoundingClientRect();
  popover.style.left = `${Math.max(4, triggerRect.left - barRect.left)}px`;
  requestAnimationFrame(() => {
    const rect = popover.getBoundingClientRect();
    if (rect.right > window.innerWidth - 6) popover.style.left = `${Math.max(4, window.innerWidth - barRect.left - rect.width - 6)}px`;
    popover.querySelector('button:not(:disabled)')?.focus();
  });
}

function closeMenus() {
  state.menu = null;
  $$('.cw-menu-trigger').forEach(button => button.setAttribute('aria-expanded','false'));
  $$('[data-cw-menu-popover]').forEach(node => node.remove());
}

function proxyButton(commandId, label = null, icon = null, className = '') {
  const command = byId.get(commandId);
  if (!command) return null;
  const button = document.createElement('button');
  button.type = 'button'; button.className = `cw-toolbar-button ${className}`.trim(); button.dataset.commandId = commandId;
  button.title = command.shortcut ? `${command.label} (${command.shortcut})` : command.label;
  button.innerHTML = `<span class="cw-tb-icon">${icon || command.icon || '·'}</span>${label === false ? '' : `<span class="cw-tb-label">${label || command.label.replace(/ tool$/i,'')}</span>`}`;
  button.addEventListener('click', () => executeCommand(command));
  return button;
}

function createPrimaryToolbar() {
  if ($('#cwPrimaryToolbar')) return;
  const center = $('.center-column'); if (!center) return;
  const bar = document.createElement('div'); bar.id = 'cwPrimaryToolbar'; bar.className = 'cw-primary-toolbar'; bar.setAttribute('role','toolbar'); bar.setAttribute('aria-label','Primary tools');
  const groups = [
    [['tool.select','Select','↖'],['tool.marquee','Marquee','▱'],['tool.node','Node','◆']],
    [['tool.rect','Rectangle','▭'],['tool.ellipse','Ellipse','○'],['tool.pen','Pen','⌁'],['tool.text','Text','T']],
    [['tool.connector','Connector','↗'],['tool.image','Image','▧']],
    [['edit.undo',false,'↶'],['edit.redo',false,'↷']],
    [['path.union',false,'∪'],['path.subtract',false,'−'],['path.stroke-to-path',false,'▰']]
  ];
  groups.forEach(items => {
    const group = document.createElement('div'); group.className = 'cw-toolbar-group';
    items.forEach(([id,label,icon]) => { const button = proxyButton(id,label,icon); if (button) group.appendChild(button); });
    bar.appendChild(group);
  });
  const finder = document.createElement('button'); finder.type = 'button'; finder.className = 'cw-toolbar-button cw-toolbar-overflow primary'; finder.innerHTML = '<span class="cw-tb-icon">⌕</span><span class="cw-tb-label">Find tools</span>'; finder.addEventListener('click',openPalette); bar.appendChild(finder);
  center.insertBefore(bar, center.firstChild);
}

function createContextBar() {
  if ($('#cwContextBar')) return;
  const center = $('.center-column'); const canvas = $('.canvas-area'); if (!center || !canvas) return;
  const bar = document.createElement('div'); bar.id = 'cwContextBar'; bar.className = 'cw-contextbar';
  bar.innerHTML = '<div class="cw-context-meta"><span class="cw-context-dot"></span><span id="cwContextLabel">Nothing selected</span></div><div class="cw-context-actions" id="cwContextActions"></div><span class="cw-context-hint">Ctrl/⌘ K finds every command</span>';
  center.insertBefore(bar, canvas);
  updateContextBar();
}

function selectedElements() {
  const root = $('#artboard svg'); if (!root) return [];
  return $$('#layersList .layer.selected').map(button => {
    const id = button.dataset.id; if (!id) return null;
    const escaped = globalThis.CSS?.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g,'');
    return root.querySelector(`[data-cw-id="${escaped}"]`);
  }).filter(Boolean);
}

function updateContextBar() {
  const label = $('#cwContextLabel'), actions = $('#cwContextActions'); if (!label || !actions) return;
  const nodes = selectedElements(); const types = [...new Set(nodes.map(node => node.tagName.toLowerCase()))];
  label.textContent = nodes.length ? `${nodes.length} selected · ${types.join(', ')}` : 'Nothing selected · choose a tool or press Ctrl/⌘ K';
  const ids = [];
  if (!nodes.length) ids.push('tool.select','tool.rect','tool.pen','tool.text','tool.image');
  else {
    ids.push('edit.duplicate');
    if (nodes.length > 1) ids.push('object.group','object.align-center','path.union','path.subtract','path.builder');
    if (types.includes('path')) ids.push('tool.node','path.stroke-to-path','path.offset');
    if (types.includes('text')) ids.push('text.typography');
    if (types.includes('image')) ids.push('effects.trace');
    if (types.includes('use')) ids.push('effects.detach-symbol');
    ids.push('effects.paint','effects.filters','effects.animation','edit.delete');
  }
  actions.replaceChildren(...[...new Set(ids)].slice(0,10).map(id => {
    const command = byId.get(id); const button = document.createElement('button'); button.type='button'; button.className='cw-context-action'; button.textContent=command?.label.replace(/selection|selected|Open /gi,'').trim() || id; button.addEventListener('click',()=>executeCommand(command)); return button;
  }));
}

function decorateToolRail() {
  const rail = $('.toolrail'); if (!rail) return;
  const mapping = [
    ['.tool[data-tool="select"]','Select'],['#marqueeTool','Marquee'],['#nodeTool','Node'],['.tool[data-tool="hand"]','Hand'],
    ['.tool[data-tool="rect"]','Rectangle'],['.tool[data-tool="ellipse"]','Ellipse'],['.tool[data-tool="pen"]','Pen'],['.tool[data-tool="text"]','Text'],
    ['#connectorTool','Connector'],['#cwImageTool','Image'],['#duplicateBtn','Duplicate'],['#deleteBtn','Delete']
  ];
  mapping.forEach(([selector,name]) => {
    const button = $(selector); if (!button || button.querySelector('.cw-tool-name')) return;
    const nameNode = document.createElement('span'); nameNode.className='cw-tool-name'; nameNode.textContent=name;
    const shortcut = button.querySelector('small'); if (shortcut) button.insertBefore(nameNode, shortcut); else button.appendChild(nameNode);
    button.setAttribute('aria-label', name);
  });
  const headings = [['.tool[data-tool="select"]','Select'],['.tool[data-tool="rect"]','Draw'],['#duplicateBtn','Edit']];
  headings.forEach(([selector,title]) => { const target=$(selector); if(!target||target.previousElementSibling?.classList.contains('cw-rail-heading'))return; const heading=document.createElement('div');heading.className='cw-rail-heading';heading.textContent=title;target.before(heading); });
  if (!$('#cwToolrailToggle')) { const button=document.createElement('button');button.id='cwToolrailToggle';button.className='tool cw-toolrail-toggle';button.title='Collapse tool dock';button.innerHTML='<span>‹</span><span class="cw-tool-name">Collapse</span><small></small>';button.addEventListener('click',()=>toggleBodyClass('cw-tools-collapsed'));rail.appendChild(button); }
}

function createInspectorTabs() {
  if ($('#cwInspectorTabs')) return;
  const inspector = $('.inspector'); if (!inspector) return;
  const tabs = document.createElement('div'); tabs.id='cwInspectorTabs'; tabs.className='cw-inspector-tabs';
  const pages = document.createElement('div'); pages.className='cw-inspector-pages';
  const definitions = [['layers','Layers'],['design','Design'],['advanced','Advanced'],['info','Info']];
  definitions.forEach(([id,label]) => {
    const button=document.createElement('button');button.className='cw-inspector-tab';button.type='button';button.dataset.tab=id;button.textContent=label;button.addEventListener('click',()=>showInspectorTab(id));tabs.appendChild(button);
    const page=document.createElement('div');page.className='cw-inspector-page';page.id=`cwInspector${id[0].toUpperCase()}${id.slice(1)}`;page.hidden=true;pages.appendChild(page);
  });
  inspector.prepend(tabs,pages);
  const layers=$('.layers-panel'), properties=$('.properties-panel'), stats=$('.stats-panel'), arrange=$('#advancedArrangePanel'), pro=$('#cwProStudio'), advanced=$('#cwAdvancedStudio');
  if(layers) $('#cwInspectorLayers').appendChild(layers);
  if(properties) $('#cwInspectorDesign').appendChild(properties);
  const advancedPage=$('#cwInspectorAdvanced');
  const searchWrap=document.createElement('div');searchWrap.className='cw-advanced-search-wrap';searchWrap.innerHTML='<input class="cw-advanced-search" id="cwAdvancedSearch" type="search" placeholder="Find advanced tool… e.g. gradient, mask, animation">';advancedPage.appendChild(searchWrap);
  if(arrange) advancedPage.appendChild(arrange);
  if(pro) advancedPage.appendChild(pro);
  if(advanced) advancedPage.appendChild(advanced);
  const empty=document.createElement('div');empty.id='cwAdvancedEmpty';empty.className='cw-advanced-empty';empty.textContent='No advanced tools match this search.';advancedPage.appendChild(empty);
  $('#cwAdvancedSearch').addEventListener('input',event=>filterAdvanced(event.target.value));
  if(stats) $('#cwInspectorInfo').appendChild(stats);
  const card=document.createElement('div');card.className='cw-info-card';card.innerHTML='<strong>Fast navigation</strong><p>Use Ctrl/⌘ K to search every editor command. Menus group features by task, while the Advanced tab contains detailed controls. Press ? to see shortcuts.</p>';$('#cwInspectorInfo').appendChild(card);
  $$('#cwInspectorAdvanced details').forEach((details,index)=>{details.open=index===0;details.addEventListener('toggle',()=>{if(!details.open)return;$$('#cwInspectorAdvanced details').forEach(other=>{if(other!==details)other.open=false;});});});
  showInspectorTab(state.inspectorTab);
}

function showInspectorTab(id) {
  document.body.classList.remove('cw-inspector-collapsed');
  state.inspectorTab = id;
  $$('.cw-inspector-tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===id));
  $$('.cw-inspector-page').forEach(page=>{page.hidden=page.id!==`cwInspector${id[0].toUpperCase()}${id.slice(1)}`;});
}

function filterAdvanced(query) {
  const q=String(query||'').toLowerCase().trim(); let shown=0;
  $$('#cwInspectorAdvanced details').forEach(details=>{const match=!q||details.textContent.toLowerCase().includes(q);details.hidden=!match;if(match){shown++;if(q)details.open=true;}});
  $('#cwAdvancedEmpty')?.classList.toggle('visible',shown===0);
}

function createPalette() {
  if ($('#cwPaletteBackdrop')) return;
  const backdrop=document.createElement('div');backdrop.id='cwPaletteBackdrop';backdrop.className='cw-palette-backdrop';backdrop.hidden=true;
  backdrop.innerHTML='<div class="cw-palette" role="dialog" aria-modal="true" aria-label="Command palette"><div class="cw-palette-search"><span>⌕</span><input id="cwPaletteInput" type="search" autocomplete="off" placeholder="Search tools, commands, effects…"><kbd>Esc</kbd></div><div class="cw-palette-list" id="cwPaletteList"></div></div>';
  document.body.appendChild(backdrop);
  backdrop.addEventListener('pointerdown',event=>{if(event.target===backdrop)closePalette();});
  $('#cwPaletteInput').addEventListener('input',event=>renderPalette(event.target.value));
  $('#cwPaletteInput').addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'){event.preventDefault();movePalette(1);}else if(event.key==='ArrowUp'){event.preventDefault();movePalette(-1);}else if(event.key==='Enter'){event.preventDefault();executeCommand(state.paletteResults[state.paletteIndex]);}else if(event.key==='Escape'){event.preventDefault();closePalette();}
  });
}

function openPalette() {
  createPalette(); closeMenus(); state.paletteOpen=true; state.paletteIndex=0; $('#cwPaletteBackdrop').hidden=false; const input=$('#cwPaletteInput');input.value='';renderPalette('');requestAnimationFrame(()=>input.focus());
}
function closePalette(){state.paletteOpen=false;if($('#cwPaletteBackdrop'))$('#cwPaletteBackdrop').hidden=true;}
function movePalette(delta){if(!state.paletteResults.length)return;state.paletteIndex=(state.paletteIndex+delta+state.paletteResults.length)%state.paletteResults.length;$$('.cw-palette-item').forEach((node,index)=>node.classList.toggle('active',index===state.paletteIndex));$('.cw-palette-item.active')?.scrollIntoView({block:'nearest'});}
function renderPalette(query){
  const list=$('#cwPaletteList');if(!list)return;state.paletteResults=searchCommands(commands.filter(commandAvailable),query,48);state.paletteIndex=0;if(!state.paletteResults.length){list.innerHTML='<div class="cw-palette-empty">No matching command. Try “gradient”, “align”, “trace”, “mask”, or “animation”.</div>';return;}
  const grouped=groupCommands(state.paletteResults);list.replaceChildren();let index=0;for(const [group,items] of grouped){const heading=document.createElement('div');heading.className='cw-palette-group';heading.textContent=group;list.appendChild(heading);items.forEach(command=>{const current=index++;const button=document.createElement('button');button.type='button';button.className=`cw-palette-item${current===0?' active':''}`;button.innerHTML=`<span class="icon">${command.icon||'·'}</span><span><strong>${command.label}</strong><small>${command.keywords?command.keywords.split(' ').slice(0,6).join(' · '):command.group}</small></span>${command.shortcut?`<kbd>${command.shortcut}</kbd>`:'<span></span>'}`;button.addEventListener('mouseenter',()=>{state.paletteIndex=current;$$('.cw-palette-item').forEach((node,i)=>node.classList.toggle('active',i===current));});button.addEventListener('click',()=>executeCommand(command));list.appendChild(button);});}
}

function createShortcuts() {
  if ($('#cwShortcuts')) return;
  const overlay=document.createElement('div');overlay.id='cwShortcuts';overlay.className='cw-shortcuts';overlay.hidden=true;
  const shortcuts=commands.filter(command=>command.shortcut).slice(0,30);
  overlay.innerHTML=`<div class="cw-shortcuts-card"><div class="cw-shortcuts-head"><h2>Keyboard shortcuts</h2><button class="cw-shortcuts-close" aria-label="Close">×</button></div><div class="cw-shortcuts-grid">${shortcuts.map(c=>`<div class="cw-shortcut-row"><span>${c.label}</span><kbd>${c.shortcut}</kbd></div>`).join('')}</div></div>`;
  document.body.appendChild(overlay);overlay.querySelector('.cw-shortcuts-close').addEventListener('click',closeShortcuts);overlay.addEventListener('click',event=>{if(event.target===overlay)closeShortcuts();});
}
function openShortcuts(){createShortcuts();closeMenus();closePalette();$('#cwShortcuts').hidden=false;}
function closeShortcuts(){if($('#cwShortcuts'))$('#cwShortcuts').hidden=true;}

function syncToolbarActive() {
  $$('.cw-toolbar-button[data-command-id]').forEach(button=>{const command=byId.get(button.dataset.commandId);const target=command?.selector?$(command.selector):null;button.disabled=Boolean(command?.selector&&!target);button.classList.toggle('active',Boolean(target?.classList.contains('active')||target?.getAttribute('aria-pressed')==='true'));});
}

function observeSelectionAndTools() {
  const layers=$('#layersList'), rail=$('.toolrail');
  if(layers)new MutationObserver(()=>{updateContextBar();syncToolbarActive();}).observe(layers,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  if(rail)new MutationObserver(syncToolbarActive).observe(rail,{subtree:true,attributes:true,attributeFilter:['class','aria-pressed']});
}

function bindGlobalKeys() {
  window.addEventListener('keydown',event=>{
    const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)||event.target?.isContentEditable;
    const mod=event.ctrlKey||event.metaKey;
    if(mod&&event.key.toLowerCase()==='k'){event.preventDefault();openPalette();return;}
    if(event.key==='Escape'){if(state.paletteOpen){closePalette();return;}if(!$('#cwShortcuts')?.hidden){closeShortcuts();return;}closeMenus();}
    if(!typing&&event.key==='?'){event.preventDefault();openShortcuts();}
  },true);
}

function init() {
  if (document.body.classList.contains('cw-ux')) return;
  addStylesheet(); document.body.classList.add('cw-ux');
  createMenubar(); createPrimaryToolbar(); createContextBar(); decorateToolRail(); createInspectorTabs(); createPalette(); createShortcuts(); bindGlobalKeys(); observeSelectionAndTools(); syncToolbarActive(); updateContextBar();
  requestAnimationFrame(()=>toast('New workspace · Ctrl/⌘ K finds every tool'));
}

init();
