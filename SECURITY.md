# Security policy

## Supported version

Security fixes are applied to the current `main` branch and the live GitHub Pages deployment.

## Reporting a vulnerability

Please report security-sensitive findings privately to the repository owner through GitHub's private vulnerability reporting feature when available. Do not include working exploit payloads in a public issue before a fix is available.

Useful reports include the affected code path, browser/version, minimal reproduction, impact, and a suggested mitigation if known.

## Threat model

SVG is an active document format and may contain scripts, event handlers, embedded HTML, external resources and URL-bearing attributes. CurveWeave treats imported/source-applied SVG as untrusted and applies a local sanitization boundary before rendering.

Current protections remove scripts, `foreignObject`, inline event handlers, JavaScript URLs, external hyperlink/image references, and remote CSS-style `url(http…)` references.

These protections reduce risk but do not make CurveWeave a general-purpose sandbox. Consumers embedding exported SVGs should apply an appropriate Content Security Policy and their own sanitization requirements.
