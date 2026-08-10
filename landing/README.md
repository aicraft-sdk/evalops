# EvalOps Landing Page

A small, self-contained, portable static landing page pitching EvalOps ("SonarQube for AI")
and capturing early interest in self-hosting/open-source vs. a hosted/enterprise offering.

Plain HTML/CSS, no build step, no framework, no dependency on `apps/frontend`. Works via
`file://` or any static file server.

## What this is

- `index.html` — the entire page (markup + styles inline, no external assets).
- One email-capture form with an "interested in" checkbox group.
- Dark-mode aware via `prefers-color-scheme` (no JS toggle needed).

## Preview locally

From inside this directory:

```bash
npx serve landing/
# or
python3 -m http.server
```

Or just open `landing/index.html` directly in a browser — it has no build step and no
external dependencies, so `file://` works too.

## Deploy as a static site

This is plain static HTML, so any static host works. A few options (pick whichever fits —
none of these are prescribed):

- **GitHub Pages** — serve this `landing/` directory (or its contents) from a repo/branch.
- **Vercel** — import the repo, set the project root to `landing/`, no build command needed.
- **Netlify** — same idea: point the publish directory at `landing/`, no build step.

## Before deploying: wire up the form

The form currently posts to a **placeholder** Formspree endpoint:

```
https://formspree.io/f/YOUR_FORM_ID
```

**You must replace `YOUR_FORM_ID` with a real Formspree form ID before this works.**
Submissions will silently fail (or 404) until you do:

1. Sign up free at [https://formspree.io](https://formspree.io).
2. Create a new form.
3. Copy the form ID Formspree gives you.
4. Replace `YOUR_FORM_ID` in the `action` attribute of the `<form>` tag in `index.html`.

The same instruction is repeated as an HTML comment directly above the `<form>` tag in
`index.html`.

## Notes

- The "Back to GitHub repo" link in the footer is a placeholder (`#`) — fill in the real
  repo URL once/if this repository goes public.
- The pitch content is based on the actual project description in `project-config.json`
  and the root `README.md` — no unlisted/invented capabilities.
