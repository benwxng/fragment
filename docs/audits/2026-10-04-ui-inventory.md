# Glance UI inventory

Audit date: 2026-10-04. Scope: UI implemented in the current working tree, including the web application, unpacked Chrome extension, shared library, route fallbacks, and user-visible asynchronous states. This is a record of existing behavior, not a proposed redesign.

## What exists

Glance currently has three presentation families: the web account screens, the shared reference library, and the injected page inspector. The web and extension libraries use the same renderer and styles. There is **no marketing landing page**: `/` checks the session and redirects to the library when configured; an unconfigured deployment shows a developer setup screen. A signed-out visitor reaches sign-in through the auth guard.

Source-of-truth map:

| Surface | Markup / behavior | Styles |
|---|---|---|
| Shared web + extension library | `packages/capture/src/library/template.ts`, `packages/capture/src/library/index.ts` | `packages/capture/src/library.css` |
| Shared labels, dates, filters | `packages/capture/src/presentation.ts` | Shared library styles |
| Web transport / account navigation | `apps/web/lib/library-adapter.ts`, `apps/web/components/shared-library.tsx` | Shared library styles |
| Extension transport | `apps/extension/entrypoints/library/main.ts` | Imports shared library styles |
| Login / account creation | `apps/web/app/login/page.tsx`, `apps/web/components/auth-form.tsx`, `apps/web/app/actions.ts` | `apps/web/app/globals.css` |
| Verification | `apps/web/app/verify-email/page.tsx`, `apps/web/components/verify-email.tsx` | Web global styles |
| Extension authorization | `apps/web/app/extension/connect/page.tsx` | Web global styles |
| Login brand art | `apps/web/components/glace-animation.tsx` | Web global styles, final auth-art section |
| Setup / error pages | `apps/web/components/configuration.tsx`, `apps/web/app/not-found.tsx`, `apps/web/app/library/error.tsx`, `apps/web/app/library/[id]/not-found.tsx` | Web global styles |
| Injected inspector | `apps/extension/src/inspector/bootstrap.ts` | `apps/extension/src/inspector/styles.ts` |
| Save animation / badge | `apps/extension/src/inspector/save-feedback.ts` | Inspector styles |
| Browser action failures | `apps/extension/entrypoints/background.ts` | Chrome-owned toolbar badge and title |

## Web account and entry screens

| ID | Screen/state | Trigger and visible contents | Built status |
|---|---|---|---|
| W01 | Home entry | `/` redirects to library after session check; signed-out guard redirects to login | Live routing; no home-page composition |
| W02 | Sign in | `/login`: green Glance eye-art column and slogan; Sign in / Create account tabs; Welcome back; Continue with Google; Email; Password; Sign in | Built |
| W03 | Create account | `/login?mode=signup`: Create your library; sync explanation; same Google/email/password controls; password hint; Create account | Built |
| W04 | Sign-in pending | Submit disabled and reads Signing in… | Built transient |
| W05 | Create-account pending | Submit disabled and reads Creating account… | Built transient |
| W06 | Google pending | Google control reads Connecting to Google…; disabled while pending | Built transient |
| W07 | Invalid sign-in | Form error: Unable to sign in. Check your email and password, or continue with Google. | Built |
| W08 | Sign-up validation / provider error | Invalid email or short password message; otherwise provider message / Unable to create your account | Built; browser native validation can prevent submission first |
| W09 | Google error | Alert beneath Google button using provider error or Google sign-in failed | Built |
| W10 | Email confirmation route error | `authError` query adds red alert: Unable to confirm your email. Request a new confirmation link and try again. | Built; source of query may be legacy |
| W11 | Verify email initial | Email, Send verification code, numeric Verification code field, Verify email, Use another account | Built; requires unverified signed-in account |
| W12 | Verification sent | Check your email for the verification code | Built inline status |
| W13 | Verification sending/verifying | Buttons disabled; current message remains | Built transient; no distinct spinner |
| W14 | Verification send/verify error | Provider error or Unable to send/verify the code. Try again / Invalid verification code | Built inline status |
| W15 | Verification success | Navigates to return target | No separate success screen |
| W16 | Extension account authorization | Sign in to Glance; identifies email; asks to use extension to save/access library; warning to continue only if started from extension; Continue to Glance | Built; `/extension/connect` requires authentication and verified email |
| W17 | Authorization completion | Server redirects into browser identity callback | No custom completion screen |
| W18 | Responsive authentication | At <=48rem, art above the form; smaller logo/name and full-width form | Built responsive layout |
| W19 | Reduced-motion / failed-animation art | Static eye logo shown if reduced motion or Rive cannot load | Built fallback |
| W20 | Configuration screen | One-time setup / Connect your private library; environment-file instructions, names, Neon dashboard link, Preview the library | Built developer fallback; should not be confused with consumer landing |
| W21 | Unconfigured library demo | `/library?demo=1` uses three sample references and account label Preview mode | Built preview-only mode; bypass unavailable once configured |
| W22 | General not found | This reference is no longer here; explanation; Return to the library | Built Next not-found component |
| W23 | Reference not-found component | That reference isn’t in your library; explanation; return link | Component exists; ordinary missing capture is handled by shared renderer as L13, not this component |
| W24 | Library route error | References could not be loaded; Check your connection and Neon setup; Try again | Built Next error boundary |
| W25 | Library route loading | Shared header/template; reference grid busy before client mount/load | Built; old skeleton CSS exists but current loading component does not render skeleton cards |

Login uses a Google/email flow in the web UI for both web and extension accounts. The Google account chooser and browser identity window frame are external/provider/browser UI; no Glance-owned implementation is present for those surfaces.

## Shared library: web and extension

Routes: web `/library` and `/library/[id]`; extension `chrome-extension://<id>/library.html` and `?reference=<id>`. Both render `mountLibrary`.

| ID | Screen/state | Visible UI and behavior |
|---|---|---|
| L01 | Populated library, screenshots | Light-gray canvas; eye logo; search; circular account control; masonry screenshot cards; typeface labels on hover/focus; external-source arrow |
| L02 | Populated library, missing screenshot | 4:3 type specimen using captured text or Aa; same card/source interactions |
| L03 | Card hover / focus | Typeface label and source link visibility change; card opens detail and source link opens original page separately |
| L04 | Search collapsed/resting | Desktop search reduces when idle; search icon and input expand on hover/focus; touch/coarse pointer keeps usable search |
| L05 | Search matching results | Matches page title, source host, element label, captured text, typeface, note and facets; URL `q` reflects search |
| L06 | No search results | No results for “query”; Try another search, or return to all references; Clear search and filters |
| L07 | Empty signed-in library | No references yet; Use the Glance inspector to save a reference to your account. Your library is shared across the web and extension. |
| L08 | Signed-out library | Sign in to your library; Inspect freely. Sign in to save references and access them anywhere. Account control opens sign-in menu |
| L09 | Initial loading | Header and empty busy grid; no custom spinner/skeleton cards |
| L10 | Initial account/library failure | Unable to load your library; actual returned error or connection guidance |
| L11 | Refresh failed, existing data | Last loaded references remain; Unable to refresh right now. Showing your last loaded references. Appears above grid or in detail feedback |
| L12 | Account changed / session reset | Clears gallery/detail/toasts before loading next identity; can return to signed-out or load error state |
| L13 | Missing/deleted deep link | Returns to gallery with This reference is no longer in your library. |
| L14 | Detail, Inspect tab | Back arrow; screenshot/specimen preview; source domain/link; Saved date; Inspect and Layout & context tabs; Typography rows; Colors swatches; Delete reference |
| L15 | Detail, Layout & context tab | Box model diagram and Radius/Shadow; Layout properties; Context rows (Role, Selector, Snapshot version, Source, Captured text) |
| L16 | Detail, Notes tab | Only present if `reference.note` exists; read-only Your note copy |
| L17 | Detail, incomplete data | Missing property values use Not captured; missing image uses text specimen; absent text uses A type specimen was not captured |
| L18 | Detail, responsive | Image and information stack at <=760px; details remain navigable by tabs |
| L19 | Delete confirmation | Modal backdrop; Remove from library; Delete this reference?; You can undo this action until you dismiss the message; Cancel / Delete reference |
| L20 | Delete pending | Confirmation delete button disabled while request is active |
| L21 | Delete succeeded | Gallery returns; Reference deleted toast with Undo and dismiss |
| L22 | Delete failed | Modal closes; detail feedback says Unable to delete the reference. Try again. |
| L23 | Undo pending | Toast Undo button disabled |
| L24 | Undo succeeded | Restores card, hides toast; Reference restored status |
| L25 | Undo failed | Keep-page-open error status: Unable to restore the reference. Keep this page open and try again. |
| L26 | Account checking | Account menu can initially say Checking your account… |
| L27 | Account unavailable | You can inspect any page. Saving requires an account-enabled build. |
| L28 | Account signed out | Sign-in explanation; Sign in or create account button; Google/email handoff explanation |
| L29 | Account sign-in pending | Sign-in button disabled; Complete sign-in in the browser window… |
| L30 | Account sign-in success/error | Signed in, or provider/cancel/error message |
| L31 | Account signed in | Email and Refresh library / Sign out; no profile-edit controls |
| L32 | Account signed in, avatar | HTTPS provider image shown in circle when available; otherwise white-circle fallback; broken avatar hides |
| L33 | Older saves available | Import N older saves button plus explanation; extension adapter only (web adapter reports none) |
| L34 | Older saves owned by another account | Warning directs user to the owning account to import |
| L35 | Import pending/success/error | Importing older saves…; success message; error preserves saves and tells user to retry |
| L36 | Refresh pending/success/error | Loading your library…; Library refreshed.; returned failure message |
| L37 | Sign out pending | Signing out…; displayed references clear immediately |
| L38 | Sign out success/error | Signed out. Your references remain in your account. / returned failure |
| L39 | Account-status error | Existing menu gets Unable to read cloud status or request-specific error |
| L40 | Keyboard navigation | Skip link appears on focus; detail tabs support arrows/Home/End; focus rings; Escape/outside click closes account menu; modal follows native dialog handling |
| L41 | Motion / accessibility variants | Brand asterisk rotates on gallery/detail transitions; search/card transitions; reduced motion removes movement; forced colors supplies system-color styles |

Dormant UI: filter bar markup is commented out in `template.ts`. All/Type/Components/Colors/Layout filters and their state handlers still exist in the source, but **a current user cannot see or activate them**. Do not draw them as live product UI. The detail Notes tab is a read-only viewer: there is currently no way in the shipped UI to add or edit a note.

## Injected inspector

The inspector is a floating Shadow DOM overlay on the page being inspected. It is not a Chrome popup or side panel. Browser action or registered shortcut toggles it. Library shortcut opens the extension library. Full source: `apps/extension/src/inspector/bootstrap.ts`; styling: `styles.ts`.

| ID | Screen/state | Visible UI and behavior | Fixture artifact |
|---|---|---|---|
| I01 | Active, nothing selected | Floating toolbar: status dot, Click to inspect, View references, Exit | `inspector-01-active` |
| I02 | Hover | Mint selection outline/fill + dark tooltip containing primary typeface | `inspector-02-hover` |
| I03 | Selected element | Toolbar says Click again to save; locked highlight; 288px panel with Type, Color, Box and Layout, keyboard hint | `inspector-03-panel` |
| I04 | Type properties | Typeface / size, Line height, Weight, Tracking | Included in selected panel |
| I05 | Color properties | Text and effective Background swatches plus compact values | Included in selected panel |
| I06 | Box properties | Nested margin/border/padding/content diagram; side values and dimensions; Radius, Border style | Included in selected panel |
| I07 | Borderless element | Border layer omitted when every border width is zero | `inspector-08-heading` |
| I08 | Layout properties | Display, Position, Gap, Align | Included in selected panel |
| I09 | Parent/child traversal | Up selects parent; Down retraces known child; panel remains expanded and measurements update | `inspector-09-parent` |
| I10 | Save pending | Toolbar says Saving…; overlay temporarily hides for screenshot, then returns while request finishes; repeat-save blocked | `inspector-11-saving` |
| I11 | Saved | Saved to your library toast; Undo / View references / dismiss; panel collapses to typeface tooltip | `inspector-05-saved` |
| I12 | Saved element confirmation | Small checked Saved badge attached near selected element for 1.4 seconds; brief entry/fade motion | Same saved artifact |
| I13 | Sign-in cancelled | Error toast: Sign-in was cancelled.; Try again / dismiss; expanded panel remains | `inspector-04-signin-cancelled` |
| I14 | Save network/account/config error | Error text forwarded from transport; Try again / dismiss; expanded panel remains | `inspector-07-network-error` |
| I15 | Undo successful | Removed toast; View references / dismiss; Undo hidden | `inspector-06-undone` |
| I16 | Undo pending | Undo disabled until request completes | Transient variant of saved toast |
| I17 | Undo failed | Unable to remove the reference. Try again.; Try again / dismiss | `inspector-12-undo-error` |
| I18 | Open-library failed | Unable to open references. Try again.; Try again / dismiss | `inspector-13-open-library-error` |
| I19 | Narrow viewport | Smaller toolbar text/buttons; panel clamped within viewport and scrolls; <=360px keyboard hint hidden and toast can wrap | `inspector-10-narrow` (390×844) |
| I20 | Edge and scroll positioning | Tooltip/panel placed beside, below or above target, otherwise clamped to viewport; selected geometry follows scroll/resize | Covered by main/narrow screenshots; dynamic behavior |
| I21 | Collapse / exit | First Escape collapses expanded panel; next Escape or Exit removes overlay; action toggle also removes it | No separate exit screen |
| I22 | Unsupported page | Chrome toolbar gets red ! badge and title Glance cannot inspect this page: [error], then resets after 2.5 seconds | Browser-owned chrome, not in page screenshot |
| I23 | Reduced motion / forced colors | No panel/outline animation under reduced motion; forced-colors system palette | Styles exist; reduced-motion captures used for deterministic layout |

The inspector has **no tabs**, no note editor, no separate account panel, no color picker, no code-copy/export panel, and no always-visible Save button. Inspection is two-step: select once, then click again or Enter to save. The account flow launches on save if authentication is needed.

### Capture provenance

`/tmp/glance-ui-inventory/capture-inspector.mjs` launched the **existing production extension build** in a fresh isolated Playwright Chromium profile. It triggered the actual extension browser action via CDP and interacted with `fixtures/inspector-playground.html`. It did not modify the production sources or extension build.

The success/error states use isolated service-worker fetch/identity fixtures and a non-production fake session. Actual screenshot capture, inspector rendering, save handling and keyboard/click interactions execute unchanged. No real accounts or database rows were created. The browser profile is removed after capture.

`/tmp/glance-ui-inventory/inspector-manifest.json` lists every captured state. Each has:

- `.png`: actual rendered full viewport, including the sample website being inspected.
- `.html`: editable Glance overlay markup with measured absolute positions and inline computed visual properties. It intentionally excludes the underlying sample website.
- `.json`: label, description, text, raw Shadow DOM HTML, and independent toolbar/panel/toast fragments with measured sizes.
- `-chip.html`, `-hud.html`, `-toast.html`, `-save-confirmation.html`: individual components where visible.

The sample website is a test fixture, **not a Glance landing page**. Its legacy fixture copy uses Refer; this is not Glance product copy. SVGs and text remain editable in the HTML export; animation is represented by a still frame. Paper import should be checked against the PNG because CSS/SVG rendering support can differ.

## Design tokens and presentation families

| Token | Shared library / web | Inspector |
|---|---|---|
| Background | `#f5f5f5` | Page-owned; overlay `#171816` |
| Surface | `#fcfbf8`, `#ffffff` | Raised controls `#20211f` |
| Main text | `#181916` | `#f7f7f4` |
| Secondary text | `#5e615a` | `#b6b8b0` |
| Tertiary text | `#72756d` | `#85877f` |
| Accent | `#315b48` (hover `#254936`); eye iris `#526b59` | Mint `#a6f4c5` |
| Borders | `#deded7`, stronger `#c9cac2` | White at 12% opacity |
| Error | Shared `#a12f29`; web `#9d2c27` | Error mark `#fda29b` |
| Body font | Inter, system sans fallback | Inter, system sans fallback |
| Display type | Iowan Old Style / Baskerville serif on auth and fallback pages | None |
| Property values | Small mono/property text | 11px system mono; box values 9–10px |
| Principal sizing | Responsive gutters; auth card rounded 16px; library details split then stack | Panel max 288px; 4px radius; toolbar height >=44px and 17px radius |

Three distinct treatments are intentional in the current source: light gallery/details, green account hero with white form card, dark inspector. Do not unify them while inventorying; revisions should be a later design decision.

## Missing, dormant or externally owned surfaces

These are **not built** in the inspected route/component tree:

- Public marketing landing page, download/install CTA page, product explainer/pricing page.
- First-install welcome/onboarding, guided first capture, pin-extension instructions.
- Password reset / forgot-password, change password/email, account deletion, profile settings.
- Privacy policy, terms, help/contact/support pages or in-product links to them.
- Collection/tag/favorite management, note editing, reference renaming, sharing/public links, import/export controls beyond older-device-save import.
- Extension popup, browser side panel, options page, context menu, custom Chrome notification UI.
- Custom post-authorization success, verification-success, signed-out-completion or OAuth-provider account chooser screen.
- A published Chrome Web Store listing is outside this repository UI inventory.

Present but dormant: commented-out facet controls; some leftover web loading/legacy detail CSS and icon components. Presence of styles or a type field alone does not mean a user-facing feature exists.

## Issues visible while cataloging

1. **Misleading retry on certain inspector errors.** `showToast` displays Try again for every error. `retrySave` only attempts `retryTarget`; after Undo failure or View references failure, this is normally null, so the visible Try again does nothing. Source: `bootstrap.ts` showToast (around line 598), retrySave (around line 809), undoSave and viewReferences. Captured I17/I18 reproduce the existing states.
2. **No recovery UI for forgotten passwords.** Email/password sign-in exists, but the form has no recovery link or associated route.
3. **No real landing page to put into Paper.** Use an explicitly labeled gap card for the desired landing page; do not relabel the developer configuration screen or inspector fixture as one.
4. **Runtime versus unused not-found designs differ.** Missing capture IDs return to the shared gallery with a status message; the authored `[id]/not-found.tsx` is not called by the current capture lookup path.
5. **Notes exist as read-only legacy/sample data.** The Notes tab appears only for references that already have a note. It should not imply note creation is available.
6. **Availability copy leaks implementation details.** Developer setup and web route errors mention Neon; these are currently implemented and should be visible in the audit, then considered separately for launch-facing copy.

No product code was changed as part of this inventory.

## Completed Paper inventory

The existing Glance file now has [70 editable screens](https://app.paper.design/file/01M3WZ19PKZZT1XXSBRKB7S7D2/p-2-0) and [70 matching browser captures](https://app.paper.design/file/01M3WZ19PKZZT1XXSBRKB7S7D2/p-3-0). Six additional guide/catalog boards cover navigation, absent surfaces and the 89 behavior entries above. Original artboards were preserved.

The complete capture bundle was copied from the temporary capture path to `output/playwright/glance-ui-inventory/`. The [Paper manifest](2026-10-04-paper-inventory.json) records screen/artboard mappings. Browser screenshots preserve exact rendering; editable reconstructions approximate some CSS/font behavior and keep reference screenshots as images. Full capture/validation limits are recorded in the [launch handoff](2026-10-04-launch-summary.md).

An additional visible issue found in the account captures is the very low contrast of the Import older saves button. The captured state preserves the existing implementation for review.
