# Glance launch audit and Paper handoff

Audit date: October 4, 2026. Three parallel reviews covered store readiness, account/data protection, and the complete built UI. This is an audit of the current working tree, not a launch approval. Existing product changes were preserved.

## Can a new user install, create an account and save privately?

**The architecture implements that journey, but public launch is not ready yet.** The intended path is install → inspect → save → website signup/sign-in → email verification → extension approval → private cloud save. Glance uses Neon Managed Auth, its Function API, Postgres owner-based row-level security, and private object storage. Both library surfaces read the same account data.

Production read-only checks confirmed owner policies, a restricted application role, the expected migration, a private bucket, and anonymous API rejection. Seven isolated migration checks confirmed owner isolation and rejection of forged-owner writes. These establish meaningful data protection from other ordinary accounts. They do not establish a successful fresh user's real email delivery, Google consent or packaged extension authorization; that journey still needs testing.

Saving is account-required and online-only. There is no durable offline queue for new saves. Service operators retain privileged access; this is not end-to-end encryption.

## Work required before launch

1. **Production authentication and onboarding evidence.** Google and email still use shared providers. Configure owned production OAuth/email delivery and Glance branding, then complete real inbox and unrelated-user Google flows in a fresh browser profile. Verify capture upload and cross-surface access, signout, second-account isolation, expiry and the final store ID. Adapt the verification flow before changing provider verification settings.
2. **Trusted extension callbacks.** Restrict production authorization to approved release/development callbacks. Current validation accepts any syntactically valid extension ID; PKCE protects the exchange but does not authenticate the requester as the released Glance client.
3. **Privacy and account care.** Publish the privacy policy and accurate store disclosures, support/contact and retention/deletion process. Add a working account recovery path. Account deletion and session management remain product gaps.
4. **Fresh, verified release package.** The existing ZIP is stale and visibly branded Refer; the package verifier also expects that old name. Correct the assertion, review obsolete permissions and hidden-feature claims, update architecture-dependent integration tests, rebuild/package and record the verified final archive hash.
5. **Store submission assets and account setup.** Prepare current screenshots, the required small promotional tile and listing copy; confirm publisher/contact/2-Step Verification/distribution settings and reviewer access instructions. No dashboard submission was made.

See the [store audit](2026-10-04-chrome-store-readiness.md) for evidence, official Chrome sources, the disclosure worksheet and execution checklist. See the [account/data audit](2026-10-04-account-data-protection.md) for live configuration, source references, session boundaries and scale/lifecycle gaps.

## Paper deliverable

The existing **Glance** file now contains two new pages; its original 17 artboards remain untouched:

- [Built UI · Editable screens](https://app.paper.design/file/01M3WZ19PKZZT1XXSBRKB7S7D2/p-2-0): 70 editable screen reconstructions, start/gap boards and three source catalogs covering 89 behavior entries.
- [Built UI · Exact browser captures](https://app.paper.design/file/01M3WZ19PKZZT1XXSBRKB7S7D2/p-3-0): the matching 70 full browser captures plus a reading guide.

Coverage includes sign-in/signup, verification, extension consent, both account adapters, gallery, information/typography/colors, layout/context/box model, notes, delete/undo, search/empty/loading states, legacy imports, refresh and signout feedback, inspector hover/selection/save/errors, and narrow layouts. The catalogs also describe transitions, keyboard/accessibility and browser-owned behavior without separate stills.

**No public landing page is built.** The root redirects into the library/auth flow; the developer setup screen and inspector test website are not landing pages. Paper explicitly records absent landing/install/onboarding/privacy/support/recovery/deletion surfaces rather than inventing them.

The captures use actual local rendering with safe sample content and simulated account/API responses. Rare web route components use isolated render harnesses. No real users, email, consent grants or production captures were created. Editable imports preserve text/shapes/vectors but approximate some CSS effects and fonts (Baskerville replaces unavailable Iowan Old Style); reference media remains raster. Exact captures are the visual source of truth. Motion is represented by stills/reduced-motion fallbacks.

Known visible issues include the inspector's ineffective Try again action after Undo/open-library errors and low-contrast Import older saves button. They are preserved for the design review, not silently corrected in the inventory.

The [UI inventory](2026-10-04-ui-inventory.md) records source locations, behaviors and missing features. The [Paper manifest](2026-10-04-paper-inventory.json) maps every artboard. Local capture assets are retained under `output/playwright/glance-ui-inventory/` (ignored build/review output).

## Validation and changes

- Workspace tests, backend auth tests and all workspace typechecks passed; production web and Chrome extension builds passed.
- Live read-only auth/database/storage/API checks and seven isolated owner-isolation checks passed as detailed in the security audit.
- Both library consumers and the actual rebuilt extension were rendered for the inventory. Paper screenshot reviews checked spacing, text, alignment and clipping; original design artboards were preserved.
- This task added audit documents, an appended store-checklist audit section, Paper inventory and local review artifacts. No production application source or remote runtime settings were changed by this audit.
- **Reload the unpacked extension in Chrome** to use the rebuilt output. The existing release ZIP remains intentionally flagged as stale.
