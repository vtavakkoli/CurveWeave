# Deployment

CurveWeave is a static, browser-native application and is designed to be hosted directly on GitHub Pages.

## One-time repository setup

For a new repository, GitHub Pages must be enabled once before the deployment workflow can publish the site.

1. Open **Settings → Pages** in the CurveWeave repository.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions → Deploy GitHub Pages**.
4. Run the workflow manually, or push a commit to `main`.

After a successful deployment, CurveWeave is available at:

`https://vtavakkoli.github.io/CurveWeave/`

## Deployment pipeline

The Pages workflow performs two stages:

1. **Validate** — installs the repository with `npm ci`, runs the SVG utility tests, and performs JavaScript syntax checks.
2. **Deploy** — configures GitHub Pages, uploads the static repository as a Pages artifact, and publishes it using GitHub's official Pages action.

The deploy job only runs when validation succeeds.

## Local verification

```bash
npm ci
npm test
npm run check
python -m http.server 8080
```

Then open `http://localhost:8080` in a browser.

## No build server required

CurveWeave does not require a backend, database, cloud function, or runtime build service. The published files are static HTML, CSS, JavaScript, SVG assets, the web app manifest, and service worker.

## Troubleshooting

### `Get Pages site failed`

If `actions/configure-pages` reports that the Pages site was not found, GitHub Pages has not yet been enabled for the repository. Complete the one-time setup above and rerun the workflow.

### Site loads but assets are missing

CurveWeave uses relative asset paths so it works under the `/CurveWeave/` project path. Check the browser console for cached service-worker content, then reload once after clearing the site's cache if necessary.

### CI passes but deployment fails

A successful validation stage confirms that the repository tests and JavaScript checks passed. Deployment failures after that point are normally related to GitHub Pages configuration, permissions, or the Pages environment rather than the editor source itself.
