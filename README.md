<p align="center">
  <img src="assets/icon.svg" width="92" alt="CurveWeave logo" />
</p>

<h1 align="center">CurveWeave</h1>
<p align="center"><strong>Edit · Inspect · Repair · Optimize · Export</strong></p>
<p align="center">A privacy-first, browser-native SVG workspace that runs entirely on the client.</p>

<p align="center">
  <a href="https://vtavakkoli.github.io/CurveWeave/"><strong>Launch CurveWeave →</strong></a>
  ·
  <a href="docs/ARCHITECTURE.md">Architecture</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <img alt="CI" src="https://github.com/vtavakkoli/CurveWeave/actions/workflows/ci.yml/badge.svg" />
  <img alt="Pages" src="https://github.com/vtavakkoli/CurveWeave/actions/workflows/pages.yml/badge.svg" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-7257ff" />
  <img alt="No backend" src="https://img.shields.io/badge/backend-none-31c9bc" />
</p>

## Why CurveWeave?

CurveWeave is built for the space between a heavyweight design suite and a raw text editor. Open an SVG, make precise visual edits, inspect its structure, clean noisy markup, optimize it, and export the result—without uploading the document to a server.

### Highlights

- **Direct vector editing** — select, move, resize, duplicate, reorder, group and ungroup SVG elements; nudge selections precisely with the arrow keys.
- **Drawing tools** — rectangle, ellipse, pen/path, text and smart object-to-object connectors.
- **Text inspector** — edit text content, font family, font size and font color directly from the properties panel.
- **Clipboard SVG paste** — paste SVG markup from design tools or the clipboard directly into the current canvas; imported IDs are namespaced to reduce collisions.
- **Source workspace** — formatted SVG source with explicit apply-to-canvas workflow.
- **Geometric repair & optimize** — removes scripts, event handlers, metadata and editor noise, while simplifying redundant line anchors, polyline points and near-redundant Bézier segments with an adjustable tolerance.
- **Privacy by design** — all document processing happens in the browser; remote references in opened SVGs are removed.
- **Undo / redo** — an in-memory document history keeps editing reversible.
- **SVG + PNG export** — save clean vector source or a 2× PNG rendition.
- **Local autosave** — the current document is restored from browser storage.
- **Offline-friendly PWA** — the application shell is cached with a service worker.
- **GitHub Pages native** — no database, API server, cloud function, or deployment service is required.

## Try it

**Live editor:** https://vtavakkoli.github.io/CurveWeave/

Or run it locally with any static HTTP server:

```bash
python -m http.server 8080
# open http://localhost:8080
```

For repository checks:

```bash
npm test
npm run check
```

Node.js 20+ is used only for repository validation. The application itself has no runtime package dependency.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Select | `V` |
| Hand / pan | `H` |
| Rectangle | `R` |
| Ellipse | `E` |
| Pen | `P` |
| Text | `T` |
| Connector | `C` |
| Move selection | `Arrow keys` |
| Move selection by 10 units | `Shift + Arrow keys` |
| Finish pen path | `Enter` |
| Cancel / clear selection | `Esc` |
| Duplicate | `Ctrl/Cmd + D` |
| Delete | `Delete` / `Backspace` |
| Undo | `Ctrl/Cmd + Z` |
| Redo | `Ctrl/Cmd + Shift + Z` |
| Open | `Ctrl/Cmd + O` |
| Save SVG | `Ctrl/Cmd + S` |
| Zoom | `Ctrl/Cmd + wheel` |
| Paste SVG | `Ctrl/Cmd + V` |

## Security and privacy model

SVG can contain active or remote content. CurveWeave therefore sanitizes imported/source-applied SVGs before rendering them. Scripts, inline event handlers, `foreignObject`, JavaScript URLs, external `href` references, and remote `url(http…)` references are removed. See [SECURITY.md](SECURITY.md) for the threat model and reporting process.

CurveWeave is not a general-purpose HTML/SVG sandbox. If you are embedding exported SVGs into a security-sensitive application, apply your application's own content-security and sanitization policy as well.

## Project structure

```text
CurveWeave/
├── index.html               # application shell
├── styles.css               # responsive editor UI
├── src/
│   ├── app.js               # core editor interaction/state engine
│   ├── enhancements.js      # text, connectors, paste and keyboard precision tools
│   └── svg-utils.js         # SVG sanitation, geometry simplification and stats
├── assets/icon.svg          # project identity
├── tests/                   # dependency-free Node tests
├── docs/ARCHITECTURE.md     # design and extension guide
├── sw.js                    # offline application-shell cache
├── manifest.webmanifest     # installable PWA metadata
└── .github/workflows/       # CI and GitHub Pages deployment
```

## Design principles

1. **Local-first:** artwork should not require a network round-trip.
2. **Standards-first:** preserve real SVG DOM rather than inventing a proprietary document format.
3. **Dependency-light:** keep the editor auditable, fast to load, and easy to deploy.
4. **Reversible editing:** significant mutations create history checkpoints.
5. **Progressive capability:** visual editing and source editing should remain synchronized.

## Roadmap

Near-term areas that fit the architecture well include Bézier node handles, boolean path operations, snapping/guides, reusable symbols, gradient editing, accessibility linting, and optional WASM geometry modules.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the staged roadmap.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## License

MIT © Vahid Tavakkoli. See [LICENSE](LICENSE).
