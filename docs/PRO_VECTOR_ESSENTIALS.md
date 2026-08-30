# Pro Vector Essentials

CurveWeave's Pro Vector Studio adds five geometry and paint capabilities expected from a serious SVG-native editor while preserving the existing local-first, dependency-light architecture.

## 1. Node & Bézier editor

Activate **Node (N)** and select a path. CurveWeave exposes SVG anchors and control handles directly over the rendered artwork.

Capabilities:
- drag path anchors
- drag cubic and quadratic Bézier handles
- corner, smooth and symmetric handle behavior
- insert a midpoint into line, quadratic, or cubic segments
- delete anchors
- convert a segment between line and cubic curve
- open/close paths
- convert rectangles, circles, ellipses, lines, polylines and polygons into editable `<path>` geometry
- normalize relative and shorthand path commands into editable absolute commands
- preserve arc radii/rotation while allowing arc endpoint editing

All edits remain ordinary SVG path data and participate in the existing undo/redo history.

## 2. Boolean operations & Shape Builder

Select two or more filled objects and use:
- Union
- Subtract
- Intersect
- Exclude
- Shape Builder

Shape Builder decomposes overlapping artwork into visually selectable regions. Click regions to keep/remove them, then apply the result.

### Geometry strategy

CurveWeave intentionally remains dependency-free and static-hostable. Boolean inputs are rendered into high-resolution occupancy masks, combined deterministically, traced back to contours, simplified, and emitted as editable SVG `<path>` subpaths with `fill-rule="evenodd"`.

Three quality levels are available: Fast, High and Ultra. This is a raster-assisted construction step, not raster output: the committed result is SVG vector geometry. For extremely precision-sensitive CAD/CAM boolean work, analytic curve clipping remains a future engine upgrade.

## 3. Smart snapping, guides & rulers

Smart snapping aligns a moved selection to:
- other object left/center/right edges
- other object top/middle/bottom edges
- SVG page edges and center
- configurable grid increments
- user guides

The canvas exposes horizontal and vertical rulers. Click a ruler to create a guide, drag guides to reposition them, double-click to remove a guide, or clear all guides from Pro Vector Studio. Snap candidates are visualized while dragging.

## 4. Advanced paint & gradient editor

Paint controls work on either **Fill** or **Stroke** and support:
- solid color
- none
- linear gradients
- radial gradients
- multiple gradient stops
- per-stop color, offset, and opacity
- linear angle editing
- radial center X/Y and radius
- pad, reflect, and repeat spread modes
- reverse gradient stops

CurveWeave stores gradients in native `<defs>` elements and assigns them using standard `url(#gradient-id)` references.

## 5. Masks & clipping paths

With target object(s) plus a top source shape selected, CurveWeave can create:
- native SVG `<clipPath>`
- standard white mask
- inverted mask
- release clip/mask and restore the source artwork

Effects are stored in native SVG definitions rather than in a proprietary document format.

## Architecture

The feature is separated into three modules:

```text
src/path-geometry.js   # SVG path parsing/normalization/node operations
src/boolean-utils.js   # mask boolean algebra, contour tracing, shape regions
src/pro-vector.js      # browser integration, UI, snapping, gradients, masks
```

Pure geometry is covered by dependency-free Node tests. Browser integration reuses CurveWeave's existing selection, source-apply, history, sanitization, and export pathways.
