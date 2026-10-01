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
- click or Enter saves a cropped visual reference and structured snapshot locally;
- the built-in library supports search, facet filters, detail view, source links,
  deletion, and undo.
- the cloud-enabled packages sync to Neon Postgres and private object storage with per-user RLS;
- the authenticated web library is deployed at
  [refer-design-library.vercel.app](https://refer-design-library.vercel.app).

Cloud sync is available from the library's account menu. Without cloud environment
variables, the same build remains completely local-only.

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
real toolbar-action flow: active-tab injection, hover inspection, local screenshot
save, library rendering, pointer and keyboard font previews, and Escape cleanup.

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

## Optional cloud sync

This workspace is linked to Neon project `young-wildflower-24750720`, production.
The schema, existing library, and screenshots have been migrated. See
[Neon setup](docs/NEON_SETUP.md) for deployment, verification, and remaining Google
OAuth configuration.

Copy `apps/extension/.env.example` to `apps/extension/.env.local` and provide the
public `WXT_NEON_API_URL` and `WXT_SITE_URL`. Rebuild the extension, open its account
menu, and choose **Connect account**. Sign in on the website and approve the extension.
The account library is shared by the website and every connected extension. The
extension keeps an IndexedDB cache, including image bytes, for offline use. It
uploads queued local changes, then downloads the complete cloud library and
reconciles remote edits/deletions without overwriting pending offline work.
Sync runs on library open/focus, reconnect, manual sync, and a one-minute background
alarm. The web gallery refreshes on focus/reconnect and every minute while visible.
Images stay in private object storage; Postgres stores metadata and image paths.

Revision checks keep stale local edits from overwriting newer cloud edits or
recreating cloud-deleted captures. In a conflict, the cloud version wins. Explicit
local deletion wins over remote edits; undo after a completed local deletion can
recreate the reference. Failed or incomplete downloads preserve the previous offline
cache and retry. Existing anonymous captures upload when the account is connected.

The first cloud sign-in permanently links that browser profile's local library to one
account. Glance blocks a different account before processing the outbound queue or reading
a reference payload, so account switching cannot leak the first user's local references.
Use a separate browser profile for a different Glance account. A future explicit local-data
reset/export flow can make deliberate switching possible without weakening this boundary.

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
