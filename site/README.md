# EvalOps Docs Site

A single-page static documentation and showcase site for EvalOps ("SonarQube for AI"), covering
the real service architecture, features, and getting-started/CLI/SDK usage — published via
GitHub Pages.

Plain HTML/CSS/vanilla JS, no build step, no framework, no bundler. Works via `file://` or any
static file server. The only external dependency is the [Mermaid](https://mermaid.js.org/) CDN
script, used to render the two architecture/workflow diagrams client-side (no build-time diagram
generation).

## What this is

- `index.html` — the entire site: architecture (with a Mermaid topology diagram), an eval-run →
  policy-gate workflow (Mermaid sequence diagram), features, getting-started, CLI reference,
  JS/Python SDK usage, GitHub Action usage, and the security model — all inline in one file.
- `.nojekyll` — tells GitHub Pages not to run Jekyll processing over this directory.
- Dark-mode aware via `prefers-color-scheme` (no JS toggle needed), same approach as
  [`landing/index.html`](../landing/index.html).

## Preview locally

From inside this directory:

```bash
python3 -m http.server
# then open http://localhost:8000
```

Or open `site/index.html` directly in a browser — there's no build step. The Mermaid diagrams
still need network access to load the CDN script (`cdn.jsdelivr.net`); everything else works
fully offline via `file://`.

## How the GitHub Pages deploy is wired

[`../.github/workflows/deploy-docs-site.yml`](../.github/workflows/deploy-docs-site.yml) deploys
this `site/` directory to GitHub Pages automatically on every push to `main` that touches
`site/**` (or via manual `workflow_dispatch`). It uses the modern, non-branch-based GitHub Pages
deployment method:

1. `actions/configure-pages@v5` — configures the Pages environment.
2. `actions/upload-pages-artifact@v3` — packages `site/` as a Pages artifact.
3. `actions/deploy-pages@v4` — deploys that artifact to the `github-pages` environment.

There is no `gh-pages` branch involved. **One-time setup:** in the repo's Settings → Pages, set
"Source" to "GitHub Actions" — that repository setting can't be set from the workflow file
itself.

## Content policy

Every claim on this site is sourced from the real repo: `README.md`, `docs/ARCHITECTURE.md`,
`docs/CLI_GUIDE.md`, `docs/QUICK_START.md`, `project-config.json`, and the actual `apps/`/`libs/`
code structure. No invented features, no old 6-service topology (`integration-service` and
`analytics-service` were fully decommissioned — their functionality now lives in `core-service`
via `libs/core-integration` and `libs/core-analytics`).

## Notes

- This is a separate, more content-heavy sibling to [`landing/`](../landing/) (a single-page
  interest-capture form) — it does not replace or modify it.
- It does not touch the markdown docs under [`docs/`](../docs/); it summarizes and links back to
  them instead.
