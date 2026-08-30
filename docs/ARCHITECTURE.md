# CurveWeave architecture

CurveWeave is intentionally a static, client-side application. The deployed GitHub Pages site contains the same HTML, CSS and JavaScript that is reviewed in this repository; there is no application backend.

## Runtime layers

```text
┌──────────────────────────────────────────────┐
│ UI shell                                     │
│ index.html + styles.css                      │
├──────────────────────────────────────────────┤
│ Editor controller                            │
│ selection · drawing · history · inspector    │
│ import/export · keyboard · local autosave    │
│ src/app.js                                   │
├──────────────────────────────────────────────┤
│ SVG utility layer                            │
│ sanitation · repair · formatting · stats     │
│ src/svg-utils.js                             │
├──────────────────────────────────────────────┤
│ Browser platform                             │
│ SVG DOM · DOMParser · Canvas · Indexed APIs  │
└──────────────────────────────────────────────┘
```

## Document model

The live `<svg>` element is the document model. CurveWeave does not convert SVG into a proprietary scene graph. This has several advantages:

- imported markup remains close to its standards representation;
- browser-native geometry (`getBBox`, CTM transformations) can be used directly;
- serialization is straightforward;
- new SVG element support can be added incrementally.

Temporary `data-cw-*` attributes are used for editor identity and are removed before export/history snapshots.

## Mutation and history flow

A normal edit follows this path:

```text
user action
  → mutate live SVG DOM
  → serialize clean SVG
  → append history checkpoint
  → refresh layers / inspector / stats / source
  → debounce localStorage autosave
```

Undo and redo replace the live document with a sanitized parsed snapshot. History is intentionally session-local and capped to prevent unbounded memory growth.

## Import safety boundary

`parseSvg()` is the rendering boundary. Imported text is sanitized before it becomes a live document. CurveWeave currently removes:

- `<script>`;
- `<foreignObject>`;
- inline `on*` event attributes;
- `javascript:` URLs;
- external `href` / `xlink:href` references (fragment and data-image references are allowed);
- remote `url(http…)` references.

`repairSvgText()` applies an additional source cleanup pass for metadata/comments/editor-specific attributes and numeric precision.

## Export

### SVG

The live SVG is cloned, CurveWeave editor metadata is removed, then the document is serialized and formatted.

### PNG

The clean SVG source is loaded into an in-memory `Image`, drawn to a canvas at 2× its viewBox dimensions, and encoded with `canvas.toBlob()`.

## Persistence

The current SVG and document name are stored in `localStorage`. Preferences such as theme, grid visibility and first-run state are stored separately. Nothing is synchronized to a remote account.

## Deployment

`pages.yml` uploads the repository as a GitHub Pages artifact after CI succeeds on `main`. Because asset URLs are relative, the same files work at the repository subpath (`/CurveWeave/`) and with local static servers.

## Extension points

### Geometry operations

Add pure geometry functions in a separate module (for example `src/geometry.js`). Boolean operations or high-cost path simplification can later be moved to WebAssembly without changing the UI layer.

### New drawing tools

Add a tool button in `index.html`, register it through `setTool()`, and implement pointer behavior in the drawing dispatch (`startDraw`, `updateDraw`, `finishDraw`).

### Inspector controls

Inspector controls should mutate standards attributes when possible. Avoid introducing a second state representation that can drift from the SVG DOM.

### Tests

Pure source transformations belong in `src/svg-utils.js` so they can be tested in Node without a browser. Browser interaction tests can later be added with Playwright while keeping the runtime dependency-free.
