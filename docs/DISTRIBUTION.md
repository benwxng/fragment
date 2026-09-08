# Extension distribution

## Create and verify packages

Use Node.js 22 and pnpm 9.15.2, then run:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm package:extensions
pnpm smoke:extension
pnpm smoke:firefox
```

`package:extensions` creates both browser archives and rejects unexpected permissions,
broad host access, missing runtime files, nested manifests, source maps, leaked environment
files, or an incomplete Firefox reviewer source bundle.

The Chromium interaction harness uses Playwright's Chrome for Testing by default. It
can target another Chromium executable with `REFER_BROWSER_EXECUTABLE=/absolute/path`.
Arc currently hands the automation launch back to its already-running app on macOS, so
Playwright cannot establish its temporary-profile control connection; use the verified
Chrome/Arc package plus the manual Arc unpacked-install steps below.

The artifacts are:

- `apps/extension/.output/referextension-<version>-chrome.zip` — upload to the Chrome
  Web Store; the same package is compatible with Arc.
- `apps/extension/.output/referextension-<version>-firefox.zip` — upload to Mozilla
  Add-ons for signing and distribution.
- `apps/extension/.output/referextension-<version>-sources.zip` — attach as the source
  archive for Mozilla review. Its `SOURCE_CODE_REVIEW.md` contains reproduction steps.

When `apps/extension/.env.local` is present, the release check accepts only the public
Supabase project URL and an `sb_publishable_...` browser key. It rejects secret/service-role
material, includes the public inputs in the private Firefox reviewer source bundle, and
checks that the Firefox data-collection declaration matches the cloud-enabled build. With
no local environment file, it verifies a local-only package instead.

## Local installation

For Chrome or Arc, extract the Chrome ZIP (or use `.output/chrome-mv3` directly), open
`chrome://extensions` or `arc://extensions`, enable developer mode, choose **Load
unpacked**, and select the directory containing `manifest.json`.

For Firefox development, open `about:debugging#/runtime/this-firefox`, choose **Load
Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`. Temporary add-ons are
removed when Firefox restarts.

## Publishing boundaries

- Chrome and Arc on macOS cannot permanently self-install an externally hosted CRX.
  Normal user distribution requires the Chrome Web Store.
- Firefox requires Mozilla signing even when the signed add-on will be self-hosted.
- Store submission still needs developer registrations, listing copy/screenshots, support
  contact details, and a public privacy-policy URL. Those cannot be completed without the
  owner's accounts and final public URLs.
- Never include a Supabase secret or service-role key in any browser artifact. Only the
  public project URL and publishable key may be compiled into a cloud-enabled build.
