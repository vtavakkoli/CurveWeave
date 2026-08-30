# Precision editing features

CurveWeave adds a focused set of browser-native editing features without introducing a backend or runtime dependency.

## Geometric SVG optimization

The repair workflow now has two independent controls:

- **Numeric precision** controls decimal rounding.
- **Curve tolerance** controls geometric simplification.

The simplifier removes redundant line anchors using Ramer–Douglas–Peucker reduction, simplifies polyline/polygon point lists, collapses nearly straight quadratic/cubic Bézier segments to lines, and can merge compatible adjacent cubic segments when the sampled approximation remains inside the selected tolerance.

Use **Lossless** tolerance when geometry must not change. Higher tolerances trade a bounded amount of geometric precision for fewer path commands and smaller SVG source.

## Text editing

Selecting a `<text>` element exposes controls for:

- text content
- font family
- font size
- font color

Font choices use local/system fonts; CurveWeave does not fetch remote web fonts.

## Smart connectors

Choose the **Connector** tool or press `C`, click a source object, then a destination object. CurveWeave creates an SVG path with an arrow marker and stores endpoint IDs so the connector can follow objects as they move.

## SVG clipboard paste

When the clipboard contains SVG markup, `Ctrl/Cmd + V` imports it into the active artwork. Imported IDs are namespaced before insertion to reduce collisions with gradients, masks, clip paths, and existing object IDs.

## Keyboard precision movement

With one or more objects selected:

- Arrow key: move by 1 SVG user unit.
- Shift + Arrow key: move by 10 SVG user units.

A key hold is committed as one history checkpoint when the arrow key is released.
