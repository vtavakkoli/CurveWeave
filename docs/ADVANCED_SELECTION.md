# Advanced selection and arrangement

CurveWeave includes a dedicated multi-object workflow for editing complex SVG artwork without first grouping objects.

## Marquee select

Press **M** or choose the marquee tool that appears next to the normal Select tool.

- Drag **left → right** to select only objects completely contained by the rectangle.
- Drag **right → left** to use crossing selection and include any object touched by the rectangle.
- Hold **Shift** while drawing the marquee to add objects to the current selection.
- After the marquee completes, CurveWeave switches back to the normal Select tool automatically.
- Drag any selected object to move the entire selection as one set.

This intentionally follows a CAD-style containment/crossing model because it scales better than simple intersection-only selection on dense illustrations.

## Selection power tools

The **Arrange & selection** panel provides:

- **Select all** (`Ctrl/Cmd + A`)
- **Select same type** to find other rectangles, paths, text objects, and so on
- **Invert selection**
- **Lock selected** to protect objects from canvas selection/movement during the current editing session
- **Unlock all**

Locks are editor state and are intentionally not written into exported SVG markup.

## Align

With two or more objects selected you can align them to the bounds of the selection:

- Left
- Horizontal center
- Right
- Top
- Vertical middle
- Bottom

The operation respects transformed object bounds instead of only using raw `x`/`y` attributes.

## Distribute

With three or more objects selected, CurveWeave can distribute object centers evenly:

- Horizontal
- Vertical

The first and last objects stay anchored while intermediate objects are repositioned.

## Transform a selection

The panel also includes group-like transforms without requiring a permanent SVG `<g>` element:

- Rotate 90° left
- Rotate 90° right
- Flip horizontally
- Flip vertically

These transforms use the combined selection center as the pivot. Smart connectors are recalculated after arrangement operations.

## Keyboard workflow

| Action | Shortcut |
| --- | --- |
| Normal select | `V` |
| Marquee multi-select | `M` |
| Add to selection | `Shift` + marquee / Shift-click |
| Select all | `Ctrl/Cmd + A` |
| Move selected objects | Arrow keys |
| Move selected objects faster | `Shift + Arrow` |
| Cancel marquee | `Esc` |

## Design notes

The feature is implemented as a separate browser module (`src/advanced-selection.js`) with pure geometry helpers in `src/selection-utils.js`. This keeps selection geometry testable and prevents the core SVG document model from acquiring editor-only lock metadata.
