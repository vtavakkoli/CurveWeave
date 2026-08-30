# CurveWeave roadmap

The roadmap favors capabilities that strengthen SVG editing while preserving the local-first and standards-first architecture.

## 0.1 — Foundation

- [x] GitHub Pages application shell
- [x] SVG import / drag-and-drop
- [x] Sanitized rendering boundary
- [x] Selection, movement and corner scaling
- [x] Rectangle, ellipse, pen and text tools
- [x] Multi-selection, grouping and layer ordering
- [x] Fill, stroke, opacity and basic geometry inspector
- [x] Source inspector
- [x] Repair / optimization pass
- [x] SVG and PNG export
- [x] Undo / redo and local autosave
- [x] Dark/light themes and PWA shell

## 0.2 — Precision editing

- [ ] Bézier anchor/node editing with control handles
- [ ] Rotation handle and transform matrix inspector
- [ ] Smart snapping, guides and rulers
- [ ] Alignment and distribution toolbar
- [ ] Lock / hide state in layers
- [ ] Gradient stop editor
- [ ] Stroke dash / caps / joins inspector

## 0.3 — Path intelligence

- [ ] Union, intersect, subtract and exclude operations
- [ ] Path simplify with visual error tolerance
- [ ] Shape-to-path conversion
- [ ] Open-path repair and tiny-artifact detection
- [ ] Duplicate/overlap analysis
- [ ] Unused defs, gradient and clipPath cleanup

## 0.4 — Developer workflow

- [ ] Accessibility linting for SVGs
- [ ] SVG optimization diagnostics with rule-by-rule report
- [ ] Reusable symbols/components
- [ ] Batch optimize mode
- [ ] Optional CLI sharing the repair engine
- [ ] Browser end-to-end regression suite

## Non-goals for now

CurveWeave is not trying to become a raster image editor, a cloud collaboration platform, or a proprietary design-document ecosystem. Those directions would undermine the project's small, auditable and local-first core.
