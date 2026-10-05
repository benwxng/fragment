# Chrome Web Store Listing — Glance

Last updated: 2026-10-05

## Store listing

- Extension name: Glance — Design Inspector
- Short description: Inspect and save typography, color, spacing, and component references.
- Category: Developer Tools
- Language: English
- Single purpose: Inspect design details on a web page and save them to a personal reference library.

Glance helps you keep the details that catch your eye. Inspect a page's typography, colors, spacing, and components without an account. Sign in to save references and screenshots to one library on the web and across extensions. Saving and viewing the library require an internet connection.

Hover to see the font name. Click once to open the element's design details, then click again to save it. The selected element stays in place while you inspect it; Escape returns to browsing fonts.

The library offers concise reference titles and filters for type, components, colors, and layout.

## Graphics and assets

The eye replaces the former R mark and appears on a transparent background, without a dark tile. Icons at 16, 32, 48, 96, and 128 pixels are in `apps/extension/public/icon/`. The editable vector source is `source.svg`. Refresh library and inspector store screenshots to show the Glance branding before submission. Refresh library screenshots for the shared flat preview styling and expanded filters. Refresh any store artwork showing the previous dark icon tile. Promotional tiles have not been prepared.

## Permissions justification

| Permission | Purpose |
| --- | --- |
| activeTab | Inspect the page the user explicitly activates. |
| scripting | Run the design inspector on that page. |
| storage | Store preferences, account sessions, and progress when importing older saves. |
| alarms | Clear the obsolete sync schedule when upgrading older installations; no new alarms are scheduled. |
| identity (cloud builds) | Connect the extension to the user's account. |
| Configured API and site origins (cloud builds) | Authenticate and synchronize captures with the user's library. |

## Privacy and data use

Saved references include source URLs, page titles, selected website content, design properties, and screenshots. Saving requires sign-in and sends this content to the configured backend. Newly saved references are not persisted in a separate device library. Older device saves remain intact and are uploaded only when the user chooses to import them into the appropriate account. Account sessions and import progress are stored on the device. Refresh account-menu screenshots before submission.

## Publication details

Privacy policy URL, publisher contact, support URL, distribution regions, and final store screenshots remain to be supplied before submission. No store submission was performed.

## Version history

Sign-in failures explain how to retry, and retrying a save clears the previous error while the sign-in window opens. The local development build uses the sign-in site on port 3001 (2026-10-05, draft).

Logged-out library users go directly to the web sign-in page. Expired web sessions preserve the requested destination and show sign-in without redirecting back through a stale session (2026-10-05, draft).

The account popover uses concise sign-in copy and a single action, with a compact layout shared by both libraries (2026-10-05, draft).

Gallery screenshot previews have a bounded height and preserve the entire image, preventing tall captures from dominating either library. Full captures remain available in the detail view (2026-10-05, draft).

Inspector tracking displays letter spacing as a percentage of the computed font size, retaining “Normal” for normal spacing (2026-10-05, draft).

Inspector box properties use a compact nested margin, border, padding, and content diagram with per-side pixel values. Labels share the top-value row, and zero-width borders are omitted from the diagram. The diagram and detail rows align with the other inspector content columns. Radius and border style remain below the diagram (2026-10-04, draft).

The inspector toolbar uses a simple green status dot again; the pointer-following eye, blink, and asterisk animation have been removed (2026-10-04, draft).

The inspector toolbar stays visible during saving unless it overlaps the screenshot crop. Capture UI is restored immediately after the browser screenshot, before image encoding and upload (2026-10-04, draft).

The enlarged inspector toolbar uses the Glance eye logo. Its pupil follows the pointer; clicking a page element triggers a blink and a 90-degree asterisk turn. Decorative motion respects reduced-motion preferences (2026-10-04, draft).

The inspector toolbar fades and slides down into place on activation with the same easing as the panel; reduced-motion activation remains instant (2026-10-04, draft).

Inspector save confirmations appear below the top toolbar and slide down into place, respecting reduced motion (2026-10-04, draft).

Inspector panel opening uses the library search expansion easing with a 280ms reveal; keyboard and reduced-motion opening remain instant (2026-10-04, draft).

Saved-card images and hover effects share one rounded clipping boundary, with the border drawn above them to prevent exposed image edges (2026-10-04, draft).

Saved-card hover titles have a 6px backdrop blur that fades away within the top 7rem of the card (2026-10-04, draft).

Page backgrounds are now light gray (#F5F5F5) (2026-10-04, draft). Refresh library screenshots.

Saved-card hover titles slide down into place. The source-domain line below the font name is removed; the source button remains (2026-10-04, draft).

Saved-card hover overlays fade from 40% black at the top to transparent at 75% of the card height in both libraries (2026-10-04, draft).

The selection outline glides between hovered elements and resizes smoothly while keeping its green stroke thin. Click selection, keyboard navigation, scrolling, and reduced-motion settings retain immediate alignment (2026-10-03, draft).

Font-only hover previews expand into the inspector on the first click and save on the second. Selection stays locked while the panel is open. Enter follows the same two-step flow; Escape returns to preview. Panel expansion respects reduced motion (2026-10-03, draft). Refresh inspector screenshots.

Inspector panel corners use a 4px radius (2026-10-03, draft). Refresh inspector screenshots.

Inspector panel starts directly with Type; remove the element-name and pixel-dimension header (2026-10-03, draft). Refresh inspector screenshots.

Web sign-in no longer displays a false account-status error while opening the login page. The library filter bar is temporarily hidden with its markup preserved for later. Card overlays use 15% black, show the font name without a date, and include a solid white button with a black arrow to open the source site in a new tab (2026-10-02, draft). Refresh library screenshots.

Account checks distinguish service interruptions from expired sessions, retry temporary token failures, and reuse unchanged saved images after authenticated refreshes (2026-10-02, draft).

Temporary connection failures keep the last loaded library visible. Overlapping refreshes are combined, and the web library retains its loaded view during routine code updates (2026-10-02, draft).

Remove the visible results count from the main library (2026-10-02, draft).

Reference details use normal page scrolling, with the tabs above their content and no separate scroll area (2026-10-02, draft).

The eye logo returns from a reference preview immediately, preserving the loaded library, filters, and scroll position (2026-10-02, draft).

Saved pictures now follow the selected element's visible bounds without extra surrounding page content (2026-10-02, draft). Refresh saved-reference screenshots.

Library cards no longer show the truncated font-name row or its hover preview (2026-10-02, draft). Refresh library screenshots.

The account library now replaces optional sync: sign-in is required to save, with an explicit import for older device saves (2026-10-01, draft).
The temporary save-feedback preview panel has been removed from the inspector; normal save confirmations remain.

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 0.1.0 | 2026-09-25 | Rebrand visible UI and icons to Glace and the eye logo. | Draft |
| 0.1.0 | 2026-09-29 | Align extension and web library cards, concise titles, and all five filters. | Draft |
| 0.1.0 | 2026-09-30 | Two-way account library sync, offline image cache, cloud deletion propagation, and revision conflict protection. | Draft |
| 0.1.0 | 2026-10-01 | Remove library intro sections, excess spacing, and the header divider; update library screenshots. | Draft |
| 0.1.0 | 2026-10-01 | Correct the product name to Glance across the website and extension. | Draft |
| 0.1.0 | 2026-10-01 | Reduce corner radii across the web app, extension library, and inspector; refresh screenshots. | Draft |
| 0.1.0 | 2026-10-01 | Remove the dark icon background so only the eye remains; refresh artwork showing the old tile. | Draft |
| 0.1.0 | 2026-10-02 | Enlarge the transparent eye icon to fill the available width in browser extension menus; refresh icon artwork. | Draft |
| 0.1.0 | 2026-10-02 | Show card details inside a dark hover or keyboard-focus overlay on both libraries, with an in-card touch fallback; refresh library screenshots. | Draft |
| 0.1.0 | 2026-10-02 | Soften card hover overlays with a lighter gradient and gentle fade and text motion; respect reduced-motion settings. | Draft |

## Launch audit — October 4, 2026

**Status: not ready to submit.** See [the evidence-backed launch audit](docs/audits/2026-10-04-chrome-store-readiness.md) for findings and verification. This section supplements the existing draft and history; no submission was made.

### Submission gates

- [ ] Publish a public privacy policy and Limited Use statement; supply its URL here and in the dashboard.
- [ ] Confirm production Google OAuth/email configuration and test real new-user verification and saving from a fresh Chrome profile.
- [ ] Fix the release verifier's old `Refer — Design Inspector` assertion; regenerate and verify the release ZIP. Existing September 25 ZIPs are stale and still identify themselves as Refer.
- [ ] Supply publisher name, verified contact email, support route, visibility and regions; confirm developer registration and 2-Step Verification.
- [ ] Create a **440×280 promotional tile (required)** and at least one current **1280×800 or 640×400 screenshot**. The 128×128 PNG exists and its dimensions were verified. [Official image requirements](https://developer.chrome.com/docs/webstore/images).
- [ ] Review obsolete `alarms` access and whether the website host permission is necessary.
- [ ] Remove the current filter feature claim from submission copy while the shared filter bar is commented out. Do not advertise offline account saving or a persistent cache of new saves.
- [ ] Add reviewer instructions for inspection, account creation/verification, extension approval, saving, viewing, deletion and sign-out.

### Draft disclosure mapping

The extension handles user data. Proposed dashboard categories are personally identifiable information (email/account identity), authentication information (login and session credentials), web history (only saved source URLs/titles), and website content (selected text/design properties/screenshots). Assess the user-activity category against saved actions/timestamps. No dedicated health, financial, communications or location collector was found, but selected website content can contain these incidentally. No general browsing analytics collector was found.

Saving uploads selected references and screenshot crops to the account service; session/import state is also handled locally. Policy text must name actual service providers, describe retention/backups/deletion and cover operational logs. Privacy safeguards do not guarantee removal of all sensitive page content. Owner confirmation is required for the business commitments below, not for finishing this draft:

- [ ] No sale of user data.
- [ ] No use or transfer unrelated to Glance's disclosed purpose.
- [ ] No creditworthiness/lending use.
- [ ] Staff access and provider processing follow the published Limited Use commitments.

[Chrome privacy disclosures](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [privacy policy requirements](https://developer.chrome.com/docs/webstore/program-policies/privacy), and [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use).
| 0.1.0 | 2026-10-02 | Add a thin gray search border, quick expansion, and gradual background fading while search is focused on both libraries; refresh library screenshots. | Draft |
