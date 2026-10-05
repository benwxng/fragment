# Glance session reliability review — 2026-10-02

## Evidence

- The local Next.js log contains repeated `Server API upstream fetch failed` and `TypeError: fetch failed` events. The old development logs discarded the useful error metadata as `{}`, so they cannot establish the specific network cause for every incident.
- A read-only aggregate query against `neon_auth.session` found four active sessions with seven-day lifetimes. The earliest pending expiry was October 8. This rules out a configured one- or two-minute session lifetime at the time of inspection; it does not prove which cookie each browser was sending.
- The library refreshes every 60 seconds and when the browser regains focus. A single refresh re-downloaded every saved image. On web, every image also required a token request and an owner check.
- The installed Neon SDK middleware converts an unavailable session lookup into a login redirect. The backend also converted every JWT verification exception—including failure to reach the signing-key server—into HTTP 401, which the client interpreted as a lost session.
- Root and web environment files point at matching auth and API endpoints. A configured cookie secret is present; the app does not generate a new secret on each rebuild.
- Public, unauthenticated connectivity probes succeeded during the review. The production function log query returned no matching JWT failure records in the four-hour window. The backend error mapping is a reproduced bug, not proof that every observed interruption passed through that branch.

## Changes

1. Distinguish unavailable authentication (503) from a confirmed missing session (401). Before interpreting a rejected backend JWT as a logout, verify the browser session through a fresh Neon session lookup.
2. Retry failed token reads once. Do not replay sign-in, sign-out, uploads, deletes, or other mutations.
3. Keep Neon's OAuth verifier exchange in middleware. Perform ordinary protected-page authentication in the page handler, where service failures can be distinguished from sign-out. Preserve the existing login, verification, and extension return destinations.
4. Classify JWT verification failures: invalid/expired credentials remain 401; unavailable or broken signing-key infrastructure becomes 503. No failed verification grants access.
5. Reuse unchanged image bytes in memory after a successful, complete, authenticated library listing. Cache entries are scoped to the account, image path, and reference revision; changed images reload, removed entries are pruned, and sign-out invalidates in-flight cache writes. No persistent/offline storage was added.
6. Record safe structured failure metadata. Do not log cookies, tokens, credentials, or account data. Preserve Next.js control-flow exceptions through error handling.

## Verification

- Unit tests exercise the installed Neon SDK with dropped connections, token renewal, confirmed missing sessions, and cookie preservation.
- Backend tests verify real signed JWTs against mocked key-server failures, recovery using the same valid JWT, invalid/expired JWT rejection, and database-failure propagation.
- API tests cover unavailable auth, rejected JWTs with valid sessions, confirmed sign-out, owner isolation, and no mutation replay.
- Image tests cover unchanged/changed revisions, account changes, failed authenticated listings, deletion, and sign-out races.
- Browser checks exercise the shared web/extension renderer, outage preservation of an open preview, recovery, and explicit sign-out clearing. Extension checks use isolated test accounts and fixtures.

Final result: all 119 unit tests, workspace/backend type checks, production web and extension builds, shared-library browser checks, and the extension end-to-end smoke test passed.

## Release scope and remaining limits

The code fixes are in the local workspace. The local web dev server picks up the web changes. The rebuilt unpacked extension needs a Chrome reload. The backend JWT-classification fix requires a Neon API deployment; no production function, schema, session, secret, or authentication policy was changed during this review.

Network/service outages can still prevent fresh reads or saves. They should not be reported as logout without evidence that the session ended. Long-duration production behavior and the cause of the historical network interruptions remain unverified; the new diagnostics make subsequent failures distinguishable.
