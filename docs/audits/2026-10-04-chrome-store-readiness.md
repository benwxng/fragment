# Glance Chrome Web Store readiness audit

Audit date: October 4, 2026. Scope: current working tree, current Chrome build, existing release archives, and current official Chrome publishing requirements. Existing uncommitted product changes were included in the review and preserved. No store submission or production configuration change was made.

## Verdict

**Not ready for public launch or store submission yet.** The extension has a viable Manifest V3 package and an implemented account-backed saving flow. The remaining work includes a public privacy policy and disclosures, production authentication setup and real onboarding verification, refreshed release archives, corrected release checks, and store assets/account setup.

The intended new-user journey exists: install → activate the inspector → choose an element → save → sign in or create an account on the website → verify email → approve the extension → save metadata and an image to the account. The architecture does not require a redesign to support this. However, passing unit tests and a successful build do not establish that an unrelated new user can complete real email delivery or Google consent today. See the separate account/security audit for the database and isolation assessment.

## Findings

Severity: **P1** = release gate; **P2** = resolve before a confident public launch; **P3** = follow-up improvement. A gate can be missing evidence/configuration rather than a confirmed runtime bug.

| Priority | Finding and evidence | Required action |
| --- | --- | --- |
| P1 | No completed public privacy policy or policy URL. `CHROMEWEBSTORE.md:40` explicitly leaves it outstanding; the production web route list contains no privacy route. The product handles account identity, authentication data, selected website content, URLs and screenshots (`CHROMEWEBSTORE.md:36`; `apps/extension/src/cloud/client.ts:27`, `:63`, `:81`). | Publish an accurate, public policy, link it from the account/onboarding experience, and enter its URL in the dashboard. Describe processors, storage, retention, deletion, server logs and the exact content sent off-device. The [Chrome privacy policy requirement](https://developer.chrome.com/docs/webstore/program-policies/privacy) applies. |
| P1 | Production account onboarding is not yet evidenced end to end. `docs/NEON_SETUP.md:35–51` records shared development Google credentials, shared SMTP, and incomplete real inbox/Google-consent validation. Its cloud smoke bypasses email delivery by marking test email addresses verified (`:96–100`). This is documentation evidence; live provider settings were not inspected in this store audit. | Verify current provider settings; configure production Google OAuth and email delivery where still needed. Complete email/password registration using a real new inbox and complete Google sign-in with an unrelated user, then save from a fresh Chrome profile and reopen the same reference on the web. |
| P1 | The existing upload ZIP is stale, and the advertised packaging gate expects the wrong name. `scripts/verify-extension-packages.mjs:90` asserts `Refer — Design Inspector`, while `apps/extension/wxt.config.ts:47` correctly names Glance. The archived Chrome manifest still says Refer. All 11 archived files differ from the current output. | Correct the assertion, generate a fresh release ZIP after final changes, run the complete package verifier, and record its hash. Keep the compatibility filename if desired; update visible names. Do not upload the existing archive. |
| P1 | Required store artwork is incomplete. `CHROMEWEBSTORE.md:21` says screenshots need refreshing and promo tiles are unprepared; `:40` leaves final screenshots outstanding. | Supply a **440×280 small promotional image** and at least one **1280×800 or 640×400 screenshot** of the final UI. The 128×128 icon already exists. The small promotional image is mandatory under the [official image requirements](https://developer.chrome.com/docs/webstore/images), despite the local skill template describing it as recommended. |
| P1 | Publisher identity/contact/distribution choices are unfinished in the repository (`CHROMEWEBSTORE.md:40`; `docs/DISTRIBUTION.md:56–58`). No Developer Dashboard inspection was performed, so an existing registration is unknown. | Confirm developer registration and its fee, publisher name, verified contact email, 2-Step Verification, distribution regions and visibility. See [registration](https://developer.chrome.com/docs/webstore/register), [account setup](https://developer.chrome.com/docs/webstore/set-up-account) and [2-Step Verification](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification). |
| P2 | The listing currently claims library filters (`CHROMEWEBSTORE.md:17`), but the shared renderer comments out the filter bar (`packages/capture/src/library/template.ts:34–39`). | Remove that claim from submission copy unless filters return before release. Refresh screenshots against the precise final build. |
| P2 | `alarms` is requested solely to clear an obsolete schedule (`apps/extension/wxt.config.ts:57`; `apps/extension/entrypoints/background.ts:121–122`). It does not implement a current user-facing feature. The website host permission also merits review: current API fetches target the API origin, while the website opens through `launchWebAuthFlow` (`apps/extension/src/cloud/client.ts:27`, `:54–56`). | Remove obsolete alarm access for a first store release, or document an actual upgrade requirement. Test whether website host access can be removed without affecting authentication. Keep only justified permissions under the [minimum permission rule](https://developer.chrome.com/docs/webstore/program-policies/permissions). |
| P2 | There is no public landing/install surface in this checkout. `/` verifies the session and redirects to `/library` (`apps/web/app/page.tsx:9–12`). No store install URL, account recovery link or account deletion control was found in the current route/UI inventory. | Add an install/help entry point and a clear support/data-deletion process. Decide whether to ship password recovery and account deletion UI now. These are product readiness issues; a standalone marketing landing page is not itself a universal CWS requirement. |
| P2 | Release documentation has drifted: `docs/DISTRIBUTION.md:35–39` still describes Supabase browser keys; actual release configuration requires two public Neon/web URLs (`scripts/verify-extension-packages.mjs:39–58`). Older sync/cache feature descriptions also remain in history. | Update release instructions to match the current architecture, and distinguish historical change notes from features available today. Fail release packaging if the intended cloud-enabled public configuration is missing, rather than silently shipping an inspection-only build. |

## What is already in place

- Manifest V3, a service-worker background, an action activation path and keyboard commands (`apps/extension/wxt.config.ts:7`, `:59–76`; `apps/extension/entrypoints/background.ts:99–119`). There is no side panel or popup to wire up separately.
- Temporary `activeTab` access and script injection on an explicit action/command; no broad all-sites host permission, automatic persistent content scripts, `tabs`, history or cookies permission. **Do not add `tabs` just because the code queries the active tab**: this implementation only needs its ID for injection.
- Correctly sized PNG assets at 16, 32, 48, 96 and 128 pixels, verified from both source assets and the current build. Current description length is 70 characters.
- Cloud build includes `identity` plus only the API/site HTTPS origins. API requests omit browser credentials, reject redirects and use bearer authentication (`apps/extension/src/cloud/client.ts:24–30`).
- The extension login uses a random verifier/challenge, state and callback validation, then exchanges a one-use code for an extension session (`apps/extension/src/cloud/client.ts:49–69`). The callback is derived from `browser.identity.getRedirectURL()`. The current server accepts valid Chrome extension callback domains (`backend/validation.ts:14–24`); there is no hardcoded development extension ID that necessarily breaks a store build. Test the actual store ID before release; do not assume an OAuth extension-client update is required when this implementation uses a web OAuth provider.
- Source URL credentials, query strings and fragments are removed; form/editable text is excluded from excerpts (`packages/capture/src/privacy.ts:7–18`, `:24–96`). Screenshots are cropped to selected element bounds (`apps/extension/src/inspector/screenshot.ts:65–78`). These protections do **not** guarantee that all sensitive content has been removed from a selected page or screenshot.
- Static source inspection found no remote executable scripts, `eval()` or `new Function()`. Loading account data and image bytes from the API is compatible with the [MV3 remote-code rules](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements). Inspect the final ZIP again after any dependency/build changes.

## Privacy disclosure worksheet

Treat this as implementation-derived input for the owner to confirm, not a signed business attestation.

| Dashboard category | Implementation evidence / proposed treatment |
| --- | --- |
| Personally identifiable information | Yes: account email, account identifier, optional account name/avatar. |
| Authentication information | Yes: website login credentials/sessions and a locally stored extension bearer session. The extension does not itself read website passwords. |
| Web history | Yes: URLs and titles of the references explicitly chosen by the user; no evidence of a background whole-history collector. |
| Website content | Yes: selected text, design properties, screenshot crop and reference metadata, uploaded when saved. |
| User activity | Saving/importing produces user-initiated reference records and timestamps; assess the dashboard wording against this data. No dedicated browsing interaction telemetry was found. |
| Health, financial information, personal communications, location | No dedicated collector found. Selected website content/screenshots can incidentally contain sensitive information; do not promise complete sensitive-content removal. |

Disclose local handling too. Explain that inspection is available signed out, while saving/viewing the account library needs sign-in and an internet connection. Name Neon/Auth/storage, Vercel and any configured Google/email providers according to their actual data roles. Do not claim end-to-end encryption or that staff can never access data without an operational basis. Document retention and backups, and how someone can request account/data deletion. See [Chrome's user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

Publish an affirmative Limited Use statement, and confirm no sale, ad targeting, lending use, unrelated data transfer or unsupported staff access. This is an operational commitment as well as a code property. [Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

## Verification performed

| Check | Result |
| --- | --- |
| Current production Chrome build | Passed by the coordinating agent; current Glance manifest and 136.57 KB output. |
| `pnpm -r test` | Passed: 108 tests (database 9, shared capture 19, extension 32, web 48). Backend tests are owned by the account/security audit. |
| `pnpm build:web` | Passed, Next.js 16.3.4; current route inventory confirmed. |
| `pnpm -r typecheck` | Passed for database, shared capture, extension and web workspaces. |
| Current manifest and PNG dimensions | Passed. Cloud hosts are production HTTPS endpoints; no broad host access. |
| Existing Chrome ZIP shape | Root manifest present, 11 files, 39,065 bytes; no TypeScript, source maps or environment files found. This is an old artifact, not a release approval. |
| Existing Chrome ZIP provenance | SHA-256 `164e2443cafdcb0ec1166efd092d940e7240ae4c8b126e546bd486522d2aa236`; manifest says Refer; all files differ from current build. |
| Package verifier name assertion | Directly reproduced failure using the current source name and verifier's expected name. Full packaging was not run during UI capture to avoid replacing its extension build. |
| Real production email/Google onboarding; dashboard completeness | Not verified by this store audit. |

## Launch checklist in execution order

1. Confirm production Auth/email configuration and complete real new-user registration through the extension. Verify the saved reference appears on both surfaces; test a second account, sign-out, delete and relaunch. Include actual store-ID authentication once available.
2. Finish privacy policy, limited-use statement, support/contact and deletion/retention process. Complete the dashboard disclosure worksheet honestly.
3. Resolve the package-name assertion and obsolete permissions; refresh docs and final feature claims.
4. Run all tests/typechecks, build both library consumers, run extension/browser flows, package and verify the final ZIP. Record its version/hash and retain reviewer source if requested.
5. Prepare the required icon/promo/screenshot assets. Prefer safe demonstration content that contains no private account information.
6. Complete publisher registration/account verification/2-Step Verification, listing metadata, distribution and privacy tabs. Include clear [test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions) and a reviewer-access plan if needed.
7. Upload the ZIP and use deferred publishing if review should finish before the planned launch. The [publishing workflow](https://developer.chrome.com/docs/webstore/publish) separates review from the final publish action.

No Chrome reload is required for this audit's documentation changes. The coordinating agent rebuilt the extension for the UI inventory; any Chrome session using the unpacked build must reload that extension to pick up its newest code.
