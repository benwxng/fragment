# Chrome Web Store Listing — Glance

Last updated: 2026-10-04

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

The inspector toolbar stays visible during saving unless it overlaps the screenshot crop. Capture UI is restored immediately after the browser screenshot, before image encoding and upload (2026-10-04, draft).

The enlarged inspector toolbar uses the Glance eye logo. Its pupil follows the pointer; clicking a page element triggers a blink and a 90-degree asterisk turn. Decorative motion respects reduced-motion preferences (2026-10-04, draft).

The inspector toolbar fades and slides down into place on activation with the same easing as the panel; reduced-motion activation remains instant (2026-10-04, draft).

Inspector save confirmations appear below the top toolbar and slide down into place, respecting reduced motion (2026-10-04, draft).

Inspector panel opening uses the library search expansion easing with a 280ms reveal; keyboard and reduced-motion opening remain instant (2026-10-04, draft).

Saved-card images and hover effects share one rounded clipping boundary, with the border drawn above them to prevent exposed image edges (2026-10-04, draft).

Saved-card hover titles have a 6px backdrop blur that fades away within the top 7rem of the card (2026-10-04, draft).

Saved-card hover titles slide down into place. The source-domain line below the font name is removed; the source button remains (2026-10-04, draft).

Saved-card hover overlays fade from 40% black at the top to transparent at 75% of the card height in both libraries (2026-10-04, draft).

The selection outline glides between hovered elements and resizes smoothly while keeping its green stroke thin. Click selection, keyboard navigation, scrolling, and reduced-motion settings retain immediate alignment (2026-10-03, draft).

Font-only hover previews expand into the inspector on the first click and save on the second. Selection stays locked while the panel is open. Enter follows the same two-step flow; Escape returns to preview. Panel expansion respects reduced motion (2026-10-03, draft). Refresh inspector screenshots.

Inspector panel corners use a 4px radius (2026-10-03, draft). Refresh inspector screenshots.

Inspector panel starts directly with Type; remove the element-name and pixel-dimension header (2026-10-03, draft). Refresh inspector screenshots.

Card overlays use 15% black, show the font name without a date, and include a solid white button with a black arrow to open the source site in a new tab (2026-10-02, draft). Refresh library screenshots.

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
| 0.1.0 | 2026-10-02 | Add a thin gray search border, quick expansion, and gradual background fading while search is focused on both libraries; refresh library screenshots. | Draft |
