# CurveWeave Professional Workspace UX

CurveWeave has a broad professional SVG feature set. The workspace UX is designed so those capabilities are discoverable without forcing users to remember which inspector accordion contains a tool.

## Navigation model

Every important command should be reachable through at least two of these paths:

1. **Application menu** — familiar task-oriented menus: File, Edit, Object, Path, Text, Effects, View and Help.
2. **Primary toolbar** — frequently used selection, drawing and path operations.
3. **Context bar** — short action list based on the current selection.
4. **Command palette** — `Ctrl/Cmd + K`, searchable by command name, feature name, synonyms and shortcuts.
5. **Keyboard shortcut** — for high-frequency editing tools.

This deliberately uses redundant navigation. A new user can browse, an experienced user can use the toolbar, and a power user can search or use shortcuts.

## Application menus

The menu structure follows the object model of an SVG editor rather than the internal JavaScript modules.

- **File**: document lifecycle, import/export, repair/optimization.
- **Edit**: history, duplication/deletion and selection commands.
- **Object**: selection tools, grouping, order, alignment, distribution, transform, masks/clips.
- **Path**: node editing, path conversion, Boolean operations, Shape Builder, stroke expansion and offsets.
- **Text**: text tool, typography and text-on-path.
- **Effects**: gradients, filters, symbols, image tracing and animation.
- **View**: canvas navigation, grid/source/theme and panel visibility.
- **Help**: command finder, shortcuts and repository link.

Menus call the existing editor controls instead of duplicating action logic. Undo/history semantics therefore remain owned by the existing feature implementations.

## Primary toolbar

The horizontal toolbar groups high-frequency work:

- Select / Marquee / Node
- Rectangle / Ellipse / Pen / Text
- Connector / Image
- Undo / Redo
- Union / Subtract / Stroke → Path
- Find tools

The toolbar mirrors active state from the real editor controls.

## Context bar

The context bar changes according to selection type and count.

Examples:

- No selection: drawing and import shortcuts.
- Multiple objects: Group, Align, Boolean and Shape Builder operations.
- Path selected: Node tool, Stroke → Path and Offset Path.
- Text selected: Advanced Typography.
- Image selected: Trace Selected.
- Symbol instance selected: Detach Symbol.

It intentionally shows only a small subset of relevant commands rather than every available action.

## Inspector tabs

The right panel is split into four areas:

- **Layers** — document structure and visibility.
- **Design** — geometry, fill/stroke, opacity and basic text properties.
- **Advanced** — Arrange, Pro Vector Studio and Advanced Studio features.
- **Info** — document statistics and navigation help.

Advanced controls include a local search field. Typing terms such as `gradient`, `mask`, `animation`, `trace`, `boolean` or `symbol` filters the available advanced sections.

Only one advanced `<details>` group is expanded at a time by default to reduce long-panel scanning.

## Command palette

Open with:

- Windows/Linux: `Ctrl + K`
- macOS: `Cmd + K`

Search considers:

- command label
- menu/group
- synonyms and feature keywords
- keyboard shortcut

Examples:

- `vectorize raster` → Trace Selected Image
- `bezier anchor` → Node / Bézier Tool
- `difference boolean` → Subtract Shapes
- `component instance` → Symbols / reusable components
- `svg source` → Toggle SVG Source

Use `↑` / `↓` to navigate and `Enter` to execute.

## Left tool dock

The original icon-only rail is preserved as the actual editor control surface, but it is visually upgraded with readable labels and sections:

- Select
- Draw
- Edit

On smaller screens labels collapse while icons and shortcuts remain available.

## Accessibility and keyboard behavior

- Menu and palette buttons are native buttons.
- Focus-visible styling is retained.
- `Escape` closes menus/palette/shortcut overlay.
- `?` opens the keyboard shortcut reference when focus is not in a form field.
- `Ctrl/Cmd + K` opens command search from anywhere.
- Existing tool shortcuts remain unchanged.

## Architecture

The UX layer is intentionally separate from editing geometry/state:

- `src/ui-workspace.js` — application menus, toolbars, context bar, inspector tabs and palette.
- `src/ui-utils.js` — pure command ranking/search helpers.
- `styles/workspace-ui.css` — workspace visual hierarchy and responsive overrides.
- `tests/ui-utils.test.mjs` — search/ranking regression tests.

The UX module loads only after Pro Vector Studio and Advanced Studio, which allows it to discover and organize those controls without changing their implementation.
