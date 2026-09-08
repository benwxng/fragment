# Refer — Design Inspector

A private, cross-browser inspector and visual reference library for studying typography,
components, color, and layout decisions on the web. It works locally without an
account and can sync the same references to a private Supabase-backed web library.

The product and technical plan is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Current status

The end-to-end product is working:

- one extension source builds for Chromium (including Arc) and Firefox;
- toolbar or keyboard activation starts a style-isolated element inspector;
- hover reveals typography, colors, box model, and layout properties;
- click or Enter saves a cropped visual reference and structured snapshot locally;
- the built-in library supports search, facet filters, detail view, source links,
  deletion, and undo.
- the cloud-enabled packages sync to a live Supabase project with owner-only RLS;
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

1. Select the Refer toolbar icon, or press `Alt+Shift+D` (`Control+Shift+D` on macOS).
2. Hover any page element to inspect its design properties.
3. Click the highlighted element or press Enter to save it.
4. Use **View references** in the confirmation, or open the extension's library from
   its command/action menu.
5. Press Escape to leave inspection mode. `Alt+Up` and `Alt+Down` traverse the DOM.

Refer deliberately requests no persistent access to every website. Activation grants
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

This workspace is already linked to the free **Refer** project in the `artifacts`
Supabase organization (`qagakeijiclubbyvggdq`). The ignored `.env.local` files contain
only its browser-safe URL and publishable key. The database password is stored in the
local macOS Keychain under service `Refer Supabase database`, account `refer`.

Copy `apps/extension/.env.example` to `apps/extension/.env.local` and provide:

```bash
WXT_SUPABASE_URL=https://your-project-ref.supabase.co
WXT_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
```

Apply the migrations in `supabase/migrations` first, create an email/password user in
Supabase Auth, then rebuild the extension. Open **Cloud sync** from the library header
to sign in. Existing and future local references are queued and uploaded; failed work
retries without blocking local saves.

The first cloud sign-in permanently links that browser profile's local library to the
account. Refer blocks later accounts before processing the outbound queue or reading a
reference payload, so a different account cannot silently receive the original account's
local references.

The publishable key is designed for browser clients and is constrained by RLS. Never
put a Supabase secret or legacy `service_role` key in either environment variable.

## Standalone web library

The same cloud references are available in a responsive Next.js library. To preview
the finished interface without an account, run `pnpm dev:web`, open
`http://localhost:3000`, and choose **Explore the demo library**.

For live data, copy `apps/web/.env.example` to `apps/web/.env.local`, provide the same
Supabase project URL and publishable key, and run:

```bash
pnpm build:web
pnpm dev:web
```

Before connecting either client, link a Supabase project and apply the checked-in
migration:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase migration list --linked
supabase db lint --linked --level warning --fail-on error
```

Create the owner account in Supabase Auth (or use the web app's one-time sign-up), then
disable public sign-ups for this personal deployment. Add the production web URL and
`/auth/callback` URL to Supabase Auth's allowed redirect URLs before deploying to Vercel.

Those production redirect URLs and the 5 MiB upload limit are already applied to the
linked project. After creating your personal account at the deployed site, disable
public sign-ups in Supabase to make it owner-only.

Maintainers can run the disposable hosted-backend verification with `pnpm smoke:cloud`.
It requires `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and a temporary admin
`SUPABASE_SECRET_KEY`; the secret must never be written to either app environment file.
