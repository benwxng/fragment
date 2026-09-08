# Design reference tool — product and technical architecture

Status: implemented, connected to live Supabase, and deployed to Vercel  
Primary browsers: Arc/Chrome and Firefox  
Working scope: personal tool first, multi-user-safe data model from day one

## 1. Product promise

Activate the extension, point at an element, and save the design decision behind it.
The saved reference preserves both:

- the exact visual context, as a cropped screenshot;
- structured design data that can be searched, filtered, copied, and compared later.

The product has two surfaces:

1. **Inspector extension** — a temporary on-page inspection mode.
2. **Reference library** — a web application for browsing typography, components,
   colors, spacing, and source context.

## 2. Architecture decision

Use a pnpm TypeScript monorepo:

```text
apps/
  extension/   WXT + TypeScript browser extension
  web/         Next.js reference library
packages/
  capture/     DOM inspection, normalization, and shared capture types
  database/    Supabase clients and generated database types
  ui/          shared tokens and small UI primitives
supabase/
  migrations/  schema, indexes, storage policies, and RLS
docs/
```

Standardize local development and CI on Node 22 or newer. The current machine already
has a newer compatible runtime; an `.nvmrc` will make automated builds reproducible.

### Why this stack

- **WXT** generates browser-specific extension builds while keeping one source tree.
  It supports background, content-script, popup, and cross-browser manifest entrypoints.
- **TypeScript** keeps the capture model explicit across both surfaces. The extension
  uses a small dependency-free DOM layer inside Shadow DOM; the standalone Next.js
  library uses React server and client components.
- **Supabase** provides hosted Postgres, authentication, row-level security, and
  screenshot storage in one service. D1 is SQLite rather than Postgres; choosing it
  would still require separate authentication and object-storage decisions.
- **Next.js on Vercel** is the simplest deployment path for the authenticated web
  library. The extension is independently packaged for each browser.

Supabase's public publishable key is safe to ship in the extension and web client.
Authorization is enforced by row-level security. A service-role/secret key must never
be included in either client.

## 3. Extension anatomy

```text
Toolbar action / shortcut
        |
        v
Background service worker
  - receives the user gesture (`activeTab`)
  - injects or toggles the inspector
  - captures the visible tab on selection
  - crops and uploads the image
  - writes the capture through Supabase
        |
        v
Isolated content script + Shadow DOM UI
  - hit-tests the page
  - reads computed styles and box geometry
  - draws the highlight and inspector card
  - blocks the page click only while capture mode is active
```

WXT produces two Manifest V3 artifacts. Chromium/Arc uses
`background.service_worker`; Firefox currently requires `background.scripts` and a
stable `browser_specific_settings.gecko.id`. The Firefox manifest will also declare
the data categories transmitted by the extension. These differences stay in build
configuration rather than leaking into the inspector logic.

### Permissions

Request only:

- `activeTab` — temporary access after a toolbar click or shortcut;
- `scripting` — inject the inspector into the active page;
- `storage` — keep the local session and pending captures.

Add host access only for the configured Supabase project and deployed web app. Do not
request persistent `<all_urls>` access for the MVP.

### Activation and interaction

1. Select the toolbar icon or press the configurable shortcut.
2. A small persistent status pill says **Inspecting** and exposes **Exit**.
3. Pointer movement highlights the nearest meaningful element. The inspector card is
   placed away from the pointer and flips at viewport edges.
4. Select once to save immediately. The page action is suppressed for that click and
   inspection stays active for rapid collection.
5. A non-blocking **Saved** toast offers **Undo** and **View reference**.
6. `Escape` exits. Keyboard inspection uses Tab to choose page controls and a shortcut
   to capture the focused element. `Option/Alt + Up` selects the parent,
   `Option/Alt + Down` returns toward the prior child, `Space` pins the inspector card,
   and `Enter` saves the current target.

The interaction must never leave event handlers, overlays, modified cursor styles, or
scroll locks behind after exit or navigation.

### Inspection algorithm

- Run pointer hit-testing at most once per animation frame.
- Ignore the extension's own shadow host and overlay nodes.
- Recompute expensive styles only when the target element changes or its geometry is
  invalidated by scroll/resize.
- Read values with `getComputedStyle`; read geometry with `getBoundingClientRect`.
- Walk ancestors to derive the visually effective background when the element itself
  is transparent.
- Use a fixed-position Shadow DOM overlay so host-page CSS cannot style the inspector.
- Hide the extension UI for two animation frames before taking the screenshot, then
  restore it.
- Crop using `capturedImageWidth / window.innerWidth` and the corresponding height
  scale rather than assuming `devicePixelRatio` matches the screenshot.

## 4. Capture model

Every capture stores a versioned snapshot. Raw structured fields live in `jsonb` so
the inspector can evolve; commonly filtered fields are also first-class columns.

### Source

- sanitized URL (query and fragment removed by default), origin, page title, favicon
  URL, capture timestamp
- viewport width/height, scroll position, browser zoom/image scale
- element tag, semantic role, accessible name, stable best-effort selector
- short text excerpt; never the entire page HTML
- element rectangle and screenshot crop coordinates

### Typography

- computed font-family stack and primary declared family
- font size, computed line height, weight, style, stretch
- letter spacing, word spacing, text transform, decoration, alignment
- font feature settings, variation settings, optical sizing
- text color and measured effective background color
- best-effort loaded-font status via the Font Loading API

### Box and layout

- width/height and display/position
- four-sided padding, margin, and border widths/colors/styles
- border radius and box shadow
- opacity, overflow, z-index
- flex/grid direction, alignment, justification, gap, and template values when relevant

### Visual context

- cropped PNG/WebP screenshot
- optional user note, tags, favorite state, and collection
- capture facets: any combination of `typography`, `component`, `color`, and `layout`

### Important font limitation

Computed CSS reliably exposes the declared font stack, but browsers do not provide a
universal, reliable API for identifying the exact font file used for every glyph.
Cross-origin stylesheets, fallback glyphs, closed shadow roots, canvas, and images also
limit inspection. The screenshot is therefore the source of truth for exact fidelity.
The library may render a live specimen only when the font is available locally or the
user has connected a legally usable font file/provider.

## 5. Database and storage

Initial tables:

```text
profiles
  id uuid primary key -> auth.users
  display_name text
  created_at timestamptz

captures
  id uuid primary key
  user_id uuid -> profiles.id
  facets capture_facet[]
  source_url text
  source_origin text
  page_title text
  element_label text
  primary_font_family text
  text_color text
  background_color text
  screenshot_path text nullable
  snapshot_version integer
  snapshot jsonb
  note text nullable
  created_at timestamptz
  updated_at timestamptz

tags
  id uuid primary key
  user_id uuid -> profiles.id
  name text
  normalized_name text

capture_tags
  capture_id uuid -> captures.id
  tag_id uuid -> tags.id
```

Indexes cover `(user_id, captured_at desc)`, collection/date and font lookups, plus GIN
indexes for facets and the generated search document. A general GIN index on `snapshot`
can wait until real query patterns justify it.

Enable RLS on every exposed table. Each select/insert/update/delete policy requires
`auth.uid() = user_id`; updates use both `USING` and `WITH CHECK`. Screenshot objects
use paths shaped as `{user_id}/{capture_id}.webp`, with matching ownership policies.

The extension writes directly with the signed-in user's JWT. A failed upload is placed
in a small local retry queue and shown as **Saved on this device** until synchronization
succeeds.

The local IndexedDB library is atomically bound to the first Supabase user that enables
sync. That account may continue capturing while signed out, but a different account is
blocked before the outbound queue is processed or a reference payload is read. Supporting
deliberate account migration later requires an explicit export/reset/import flow rather
than implicit adoption.

All network traffic originates from the background context, not the page content
script. This keeps Supabase requests outside the host page's CORS policy and leaves
authentication tokens out of the inspected page's JavaScript environment.

## 6. Authentication

For the personal MVP, use email and password with public sign-up disabled after the
owner account is created. Sign in separately in the extension popup and web app; both
sessions represent the same Supabase user.

This avoids browser-specific OAuth redirect behavior in the first release. Google OAuth
can be added later with the browser identity API and registered Chromium/Firefox redirect
URLs once stable store IDs exist.

## 7. Reference library

Default view: a quiet, image-led grid with a compact filter rail.

- **All** shows every saved reference.
- **Type** groups by primary font family and exposes size/weight/line-height facets.
- **Components** groups cards, navigation, controls, editorial blocks, and custom tags.
- Search covers page title, domain, note, tag, and captured text.
- Selecting a card opens a detail sheet with the screenshot, source link, structured
  properties, copy actions, note/tags, and delete with undo.
- Hovering a font family can show a live specimen when that font is available; otherwise
  it enlarges the saved screenshot and clearly labels it **Captured preview**.

The UI uses one neutral ramp and one restrained accent, sentence-case copy, native
controls, visible focus rings, reduced-motion support, and semantic spacing tokens.
The extension card favors scan speed over decoration: type and color first, box model
second, advanced layout behind one disclosure.

## 8. Security and privacy boundaries

- Inspect only after an explicit user gesture and only in the active tab.
- Never collect passwords, form values, hidden DOM, cookies, network traffic, or full
  page HTML.
- Redact password inputs and allow the user to exclude editable/form elements entirely.
- Capture only the selected element's visible crop, not a full-page screenshot.
- Do not run on browser-internal pages, extension stores, or other protected schemes.
- Disclose screenshot, URL, and visible-text collection before cloud sync. The Chrome
  listing needs a privacy policy; Firefox builds declare transmitted website-content
  and browsing-activity categories in the manifest.
- Keep all authorization in RLS; never trust a `user_id` supplied without JWT ownership.
- Store no Supabase secret/service-role key in browser-delivered code.

## 9. Known platform boundaries

- Browser internal pages and extension-store pages cannot be injected into.
- Cross-origin iframes require separate permission/injection and are out of MVP scope.
- Closed shadow roots cannot be traversed.
- Canvas, video, images, and text converted to paths expose pixels, not underlying CSS.
- Pseudo-elements can be inspected only through `getComputedStyle(element, '::before')`
  and `getComputedStyle(element, '::after')`; they are a later enhancement.
- The first screenshot captures only the visible intersection of a large or offscreen
  element. Scrolling and stitching would increase privacy and fidelity risk.
- Exact authored tokens/classes may be unavailable after CSS compilation; the product
  captures computed truth first.

## 10. Delivery phases

### Phase 1 — local vertical slice

- WXT builds for Chromium and Firefox.
- Toolbar activation, hover highlight, compact computed-style card, Escape to exit.
- One-click capture to local extension storage.
- Local library page proves the capture model with no cloud dependency.

### Phase 2 — personal cloud library

- Supabase schema, RLS, owner authentication, screenshot bucket.
- Extension sync/retry flow.
- Deployed web library with search, facets, detail view, notes, tags, and deletion undo.

### Phase 3 — fidelity and learning tools

- cropped screenshots, font availability detection, comparison view, design-token export,
  collections, duplicate detection, and keyboard DOM traversal.

### Phase 4 — distribution

- privacy policy, store artwork, automated release packages, Chrome Web Store submission,
  and Firefox Add-ons signing/submission.

## 11. What the owner needs to provide

Nothing is required for Phase 1.

For Phase 2:

1. Create one Supabase project in the preferred region.
2. Provide the project URL and new `sb_publishable_...` key through local environment
   variables. Never provide a secret/service-role key for client code.
3. Create the owner account, then disable public sign-up.
4. Create or connect a Vercel account/project when the web library is ready to deploy.

For public distribution only:

- Chrome Web Store developer registration.
- Mozilla Add-ons account.
- A public privacy-policy URL and final product name/icon.

There is no "Chrome DevTools account." Local browser testing uses an unpacked extension
and a temporary Firefox profile. Browser automation is useful later for regression tests,
but no extra account or API key is needed.

## 12. Definition of done for the first working version

- The same source builds installable Chromium and Firefox packages.
- Activating the tool on a normal HTTPS page shows a stable, host-style-isolated inspector.
- Hovered elements display accurate core typography, foreground/background, dimensions,
  padding, margin, border, radius, and layout values.
- Selecting an element creates one saved reference with its page context and screenshot.
- The reference appears in the authenticated library after reload.
- The complete flow works by pointer and keyboard and passes a basic accessibility audit.
- No persistent all-sites permission or secret key is present in the built extension.

## Sources consulted

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome `activeTab`](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome tabs and visible-tab capture](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Chrome Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Firefox WebExtension compatibility](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities)
- [Firefox background manifest compatibility](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Arc extension support](https://resources.arc.net/hc/en-us/articles/19434259167767-Extensions-in-Arc-How-to-Import-Add-Open)
- [WXT entrypoints and browser targets](https://wxt.dev/guide/essentials/entrypoints.html)
- [Supabase authentication](https://supabase.com/docs/guides/auth)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
