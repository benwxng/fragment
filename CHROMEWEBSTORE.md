# Chrome Web Store Listing — Glance

Last updated: 2026-10-01

## Store listing

- Extension name: Glance — Design Inspector
- Short description: Inspect and save typography, color, spacing, and component references.
- Category: Developer Tools
- Language: English
- Single purpose: Inspect design details on a web page and save them to a personal reference library.

Glance helps you keep the details that catch your eye. Inspect a page's typography, colors, spacing, and components without an account. Sign in to save references and screenshots to one library on the web and across extensions. Saving and viewing the library require an internet connection.

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
