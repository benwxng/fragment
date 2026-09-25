# Chrome Web Store Listing — Glace

Last updated: 2026-09-25

## Store listing

- Extension name: Glace — Design Inspector
- Short description: Inspect and save typography, color, spacing, and component references.
- Category: Developer Tools
- Language: English
- Single purpose: Inspect design details on a web page and save them to a personal reference library.

Glace helps you keep the details that catch your eye. Inspect a page's typography, colors, spacing, and components, then save references and screenshots to revisit in your library. Connect an account to sync your saved captures.

## Graphics and assets

The eye replaces the former R mark. Icons at 16, 32, 48, 96, and 128 pixels are in `apps/extension/public/icon/`. The editable vector source is `source.svg`. Refresh library and inspector store screenshots to show the Glace branding before submission. Promotional tiles have not been prepared.

## Permissions justification

| Permission | Purpose |
| --- | --- |
| activeTab | Inspect the page the user explicitly activates. |
| scripting | Run the design inspector on that page. |
| storage | Store preferences and account/sync state. |
| alarms | Retry queued capture synchronization. |
| identity (cloud builds) | Connect the extension to the user's account. |
| Configured API and site origins (cloud builds) | Authenticate and synchronize captures with the user's library. |

## Privacy and data use

Saved references include source URLs, page titles, selected website content, design properties, and screenshots. They are stored locally and, when the user connects cloud sync, transmitted to the configured backend. Account information and authentication tokens support login and synchronization. Review final data disclosures against the release configuration before submitting.

## Publication details

Privacy policy URL, publisher contact, support URL, distribution regions, and final store screenshots remain to be supplied before submission. No store submission was performed.

## Version history

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 0.1.0 | 2026-09-25 | Rebrand visible UI and icons to Glace and the eye logo. | Draft |
