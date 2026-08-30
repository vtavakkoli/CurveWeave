# Contributing to CurveWeave

Thanks for helping improve CurveWeave.

## Development setup

CurveWeave has no browser runtime dependencies. Use a static server for development and Node.js 20+ for repository checks.

```bash
python -m http.server 8080
npm test
npm run check
```

Do not open `index.html` directly with `file://` when testing PWA/service-worker behavior.

## Pull requests

Keep changes focused and explain the user-facing behavior. For SVG transformation logic, add or update tests under `tests/`. For editor changes, describe a short manual verification path in the pull request.

Before opening a PR:

```bash
npm test
npm run check
```

## Architecture expectations

- Keep document processing local unless a future feature is explicitly designed as opt-in network functionality.
- Prefer standards SVG attributes and DOM operations over a proprietary scene graph.
- Do not add a framework or large dependency for a small convenience function.
- Treat imported SVG as untrusted content.
- Keep export free of temporary `data-cw-*` editor attributes.
- Preserve keyboard accessibility for newly added controls.

## Commit style

Short imperative subjects are preferred, for example:

- `Add gradient stop inspector`
- `Fix nested group selection bounds`
- `Harden external SVG reference sanitization`

## Reporting security problems

Please do not file public exploit details. Follow [SECURITY.md](SECURITY.md).
