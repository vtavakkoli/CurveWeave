# CurveWeave Advanced Vector Studio

Advanced Vector Studio builds on Pro Vector Studio and adds the next layer of professional SVG authoring while keeping CurveWeave static-hostable, privacy-first, dependency-light, and browser-local.

## 6. Stroke → Path and Offset Path

### Stroke → Path

Select a stroked object and choose **Stroke → Path**. CurveWeave isolates the rendered stroke, constructs its occupied region, traces the region boundary, simplifies the contour, and replaces the source with an editable filled SVG `<path>`.

The resulting document contains vector geometry rather than a raster image.

### Offset Path

Enter a positive or negative offset and choose **Apply Offset**:

- positive values create an outset
- negative values create an inset
- the result is an editable SVG `<path>`
- fill, opacity, clipping, mask, and filter references are preserved when possible

The current implementation is a high-resolution traced geometric approximation. It is designed for illustration, icons, UI assets, logos, and general SVG work. It should not be treated as an analytic CAD/CAM offset kernel.

## 7. Full Rotation UX

Every ordinary selection receives a rotation handle above its bounds.

- drag the handle for free rotation
- rotate multi-selections around their combined visual center
- type an arbitrary angle in degrees
- reset the angle to zero
- apply quick `+45°` rotation
- existing transforms are preserved through matrix composition

The live angle badge displays the current primary-selection angle.

## 8. Advanced Typography

Advanced typography remains native SVG text instead of converting text into proprietary objects.

Supported controls include:

- font weight from 100–900
- normal / italic / oblique styles
- left / centered / right text anchoring
- letter spacing
- word spacing
- dominant baseline
- underline and strike-through decoration
- multiline SVG text using `<tspan>`
- configurable line height
- text on path using `<textPath>`
- text-path start offset
- releasing text from a path

Text-on-path requires one `<text>` and one `<path>` to be selected.

## 9. Symbols and Reusable Components

CurveWeave components use the SVG standard directly:

```xml
<defs>
  <symbol id="cw-symbol-button" viewBox="…">…</symbol>
</defs>
<use href="#cw-symbol-button" x="…" y="…" width="…" height="…"/>
```

Advanced Studio supports:

- create a symbol from selected artwork
- maintain a document-local symbol library
- insert new instances
- update a symbol master so all `<use>` instances update
- detach an instance into ordinary editable artwork

This makes reusable components portable to other SVG-aware software without a CurveWeave runtime.

## 10. SVG Filters and Effects

Effects are stored as native SVG `<filter>` graphs in `<defs>` and applied through `filter="url(#…)"`.

Available presets:

- Gaussian blur
- drop shadow
- glow
- brightness
- contrast
- saturation
- hue rotation
- grayscale
- sepia

Effect parameters include amount, shadow/glow offset, effect color, and opacity where relevant. Effects can be removed without changing the underlying geometry.

## 11. Image Import and Vector Tracing

### Image import

CurveWeave accepts PNG, JPEG, WebP, GIF, and BMP files. The selected file is embedded locally as a `data:image/...` SVG `<image>` element, so no upload or remote URL is required.

### Vector tracing

Select an imported image and choose **Trace Selected**.

The tracing pipeline is:

1. decode and rasterize the image locally
2. deterministic RGB color clustering
3. create one binary occupancy mask per dominant color
4. trace connected boundaries
5. simplify contour points
6. create ordinary filled SVG `<path>` layers

Controls include:

- 2–10 colors
- Fast / Balanced / Fine trace resolution
- contour smoothing
- keep or replace the original image

The color swatches displayed after tracing show the generated palette.

The final trace is SVG path geometry, not a raster wrapper. Like most browser-local auto-tracing algorithms, the result is an approximation of the source pixels; increasing detail improves fidelity at the cost of path complexity.

## 12. Native SVG Animation Timeline

CurveWeave exports standard SVG animation markup with no JavaScript runtime dependency.

Supported tracks:

- opacity
- translation
- rotation
- scale
- fill color
- stroke color
- path morphing

Each track provides:

- from and to values
- begin delay
- duration
- repeat count / infinite repeat
- linear, ease, ease-in, ease-out, or ease-in-out timing

CurveWeave creates native `<animate>` or `<animateTransform>` elements. The timeline can restart, play, pause through scrubbing, and seek by percentage using the browser's SVG animation APIs.

For path morphing, source and destination path data should have compatible command topology for predictable interpolation.

## Native SVG and Security Model

Advanced Studio deliberately keeps the existing CurveWeave parser and sanitizer. Imported raster files are converted to local `data:image/*` references. External image URLs remain blocked by the editor's existing safety rules.

Symbols, filters, text paths, animation elements, clips, masks, gradients, and other definitions remain ordinary SVG markup and survive source editing and export.

Editor-only attributes such as `data-cw-id` are not part of the intended SVG document model and are stripped by the normal export path.

## Architecture

The feature remains modular:

- `src/advanced-utils.js` — pure mask geometry, color quantization, contour simplification, angle and easing helpers
- `src/advanced-studio.js` — browser UI and editor integration for features 6–12
- `src/special-layer-support.js` — integrates top-level `<image>` and `<use>` elements with CurveWeave's existing Layers/selection model
- `src/boolean-utils.js` — reused contour tracing and SVG path generation
- `src/pro-vector.js` — reused Pro Vector geometry, paint, clipping, and selection infrastructure

Pure helpers stay Node-testable; browser-only modules are loaded dynamically after the existing Pro Vector Studio.

## Current Precision Boundaries

CurveWeave favors transparent behavior over pretending approximate geometry is analytic geometry:

- Stroke → Path and Offset Path use high-resolution occupancy tracing.
- Raster vectorization is cluster-and-contour based rather than ML-based semantic reconstruction.
- SMIL/native SVG animation support depends on the target SVG renderer.
- Path morphs require compatible path structures.

These boundaries are intentional extension points. Analytic offset/stroke kernels, curve-fitting vectorization, and a more sophisticated keyframe interpolation engine can be added later without changing the current UI contract or exported SVG model.
