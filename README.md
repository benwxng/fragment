# Glance — Design Inspector

A cross-browser inspector and visual reference library for studying typography,
components, color, and layout decisions on the web. Anyone can create an account;
each user's curation stays private to that account. Glance also works locally before
an account is connected.

The product and technical plan is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Current status

The end-to-end product is working:

- one extension source builds for Chromium (including Arc) and Firefox;
- toolbar or keyboard activation starts a style-isolated element inspector;
- hover reveals typography, colors, box model, and layout properties;
- click or Enter signs in if needed, then saves a cropped reference directly to the account;
- the built-in library supports search, facet filters, detail view, source links,
  deletion, and undo.
- saved references live in Neon Postgres and private object storage with per-user RLS;
- the authenticated web library is deployed at
  [refer-design-library.vercel.app](https://refer-design-library.vercel.app).

Inspection is available without an account. Saving and browsing saved references
require sign-in and an internet connection. Without account configuration, a build
can inspect pages but cannot save references.

## Run it locally

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install
pnpm build
```

In Arc or Chrome:

1. Open `arc://extensions` or `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `apps/extension/.output/chrome-mv3`.

For Firefox, build its artifact first:

```bash
pnpm build:firefox
```

Then open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**,
and select `apps/extension/.output/firefox-mv3/manifest.json`.

## Use it

1. Select the Glance toolbar icon, or press `Alt+Shift+D` (`Control+Shift+D` on macOS).
2. Hover any page element to inspect its design properties.
3. Click the highlighted element or press Enter to save it.
4. Use **View references** in the confirmation, or open the extension's library from
   its command/action menu.
5. Press Escape to leave inspection mode. `↑` selects the parent element; `↓` returns to the previous child.

Glance deliberately requests no persistent access to every website. Activation grants
temporary access only to the active tab. Saved URLs have query strings and fragments
removed; editable/form content is excluded from captured text and concealed in screenshots.

## Development

```bash
pnpm test
pnpm typecheck
pnpm package:extensions
pnpm smoke:extension
pnpm smoke:firefox
pnpm dev
pnpm dev:firefox
pnpm dev:web
pnpm zip
pnpm zip:firefox
```

`pnpm smoke:extension` launches Chromium with the built extension and verifies the
real toolbar-action flow against an isolated local API fixture: active-tab injection,
inspection without an account, cancelled sign-in, cloud save, library rendering,
delete/undo, sign-out and account switching, no new IndexedDB, font previews, and cleanup.

`pnpm smoke:firefox` builds the Firefox artifact, validates it with Mozilla's
`web-ext`, and proves it installs as a temporary add-on in Firefox. Install the
Playwright Firefox binary once with `pnpm exec playwright install firefox`, or set
`FIREFOX_BINARY` to an existing Firefox executable. Playwright cannot drive Firefox
extensions, so the shared interaction flow is exercised in the Chromium smoke test.

`pnpm package:extensions` creates and audits the Chrome/Arc, Firefox, and Firefox
reviewer-source ZIPs. See [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) for artifact and
store-install details.

No Chrome DevTools account is required. Store publication requires Chrome Web Store
and Mozilla Add-ons developer accounts, but unpacked development installation does not.

## Account library

This workspace is linked to Neon project `young-wildflower-24750720`, production.
The schema, existing library, and screenshots have been migrated. See
[Neon setup](docs/NEON_SETUP.md) for deployment, verification, and remaining Google
OAuth configuration.

Copy `apps/extension/.env.example` to `apps/extension/.env.local` and provide the
public `WXT_NEON_API_URL` and `WXT_SITE_URL`. Rebuild the extension, open its account
menu, and choose **Sign in or create account**. Sign in on the website and approve the extension.

When developing with `pnpm dev:web`, run `pnpm --filter @refer/extension build:local`
to connect the unpacked Chrome extension through `http://localhost:3000`. This keeps
the configured backend and saved data; it only changes the sign-in website. Keep
the web server running, reload Glance in `chrome://extensions`, and reopen its
library after rebuilding. Use the regular `pnpm build` for the hosted website.

The website and extension read the same account library. Saves and deletes go
directly to the backend; failed requests display an error rather than creating
offline work. Both galleries refresh on focus/reconnect and every minute while
visible. Images stay in private object storage; Postgres stores metadata and paths.
The extension keeps displayed references only in page memory and clears them on
sign-out or account changes. No new IndexedDB library or sync queue is created.

Existing installations can choose **Import older saves** in the account menu.
The migration reads old IndexedDB data without modifying the backup, skips existing
cloud references and previously uploaded cache rows, and records successful imports
so retries do not duplicate them. Older account-owned saves can only be imported
by their original account. Anonymous imports bind to the account that starts the
import. This migration is the sole remaining IndexedDB consumer.

Only public API and website URLs belong in the extension environment. Database,
object-storage, and cookie secrets stay on the server.

## Standalone web library

Run `pnpm dev:web` and open `http://localhost:3000`. The demo library works without
an account. Live data needs the four values in `apps/web/.env.example`: Neon Auth
URL, a server-only cookie secret, API URL, and the canonical website URL.

Existing Supabase passwords and sessions do not transfer. Sign in with Google using
the same verified email, or create and verify a Neon email/password account with that
email. The account mapping preserves the existing library and extension ownership.

```bash
pnpm db:migrate
pnpm build:web
pnpm dev:web
```

`pnpm smoke:cloud` uses the ignored root `.env.local` to exercise real authentication,
private storage, capture operations, extension sessions, and cross-user isolation.
It creates and cleans up disposable users and data. Prefer an isolated Neon branch;
see [Neon setup](docs/NEON_SETUP.md).
