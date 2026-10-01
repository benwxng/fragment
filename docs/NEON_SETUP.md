# Neon setup

## Current deployment

- Project: `young-wildflower-24750720` (`glance`), AWS us-east-2.
- Production branch: `br-fragrant-rice-b4xkrp05`.
- Web: https://refer-design-library.vercel.app
- API: https://br-fragrant-rice-b4xkrp05-api.compute.c-6.us-east-2.aws.neon.tech/
- `neon.ts` deploys managed Auth, private `uploads` storage, and `backend/api.ts`.
- AI Gateway is disabled.

The CLI login, skills installation, MCP configuration, project link, config, and
service deployment are complete. The starter hello function has been replaced by
the application's authenticated API.

## Migration completed September 25, 2026

`neon/migrations/001_refer.sql` is the Neon migration. The original Supabase SQL
remains as historical source and must not be applied to Neon unchanged.

Production contains the original account/profile, four captures, and four private
screenshots. Collections, tags, and capture-tag tables were empty. Original row IDs
were preserved. Each copied screenshot was downloaded again and SHA-256 checked.
Supabase remains untouched as a fallback. Ignored backups are under
`output/migration/`; these contain private data and must not be committed.

Application account IDs are separate from Neon Auth IDs. A verified matching email
claims an imported account on first login, preserving its library and extension
ownership. Unverified emails cannot claim imported accounts. Supabase passwords
and sessions cannot transfer: use Google with the same email, or create and verify
a new email/password account with that email.

## Production account configuration still needed

Google sign-in is implemented and enabled using Neon's shared development client.
Configure your own Google web OAuth client before public production use. Its
authorized redirect URI is:

```text
https://ep-sparkling-water-b4psw1bw.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth/callback/google
```

The application callback origin is `https://refer-design-library.vercel.app`, which
is already trusted in Neon Auth. Add the Google client ID and secret to the Google
provider in the production branch's Neon Auth settings. To have the agent finish
this step, place `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the ignored root
`.env.local`; never put the secret in extension configuration.

Email verification-code UI is implemented. Email delivery currently uses Neon's
shared SMTP; configure your own SMTP for public production registration. The Google button reaches Google account selection. Actual inbox delivery and a
completed personal Google consent/sign-in have not been verified.

## Local configuration and deployment

Root `.env.local`, app `.env.local` files, `.neon`, and `.vercel` are ignored.
Root credentials include database and private storage access. The web environment
contains only the Auth URL, a server-only cookie secret, API URL, and site URL.
The extension environment contains only public API and website URLs.

```sh
pnpm install
neon login
neon link --project-id young-wildflower-24750720 --branch production -y
neon config plan
neon deploy
pnpm db:migrate
pnpm test
pnpm typecheck
pnpm build:web
pnpm package:extensions
```

`neon deploy` pulls root environment values but does not run SQL migrations.
`pnpm db:migrate` uses a direct database URL, transactions, an advisory lock, and
checksummed migration history. Reruns skip already-applied migrations. Add a new
numbered SQL file for subsequent changes; never edit an applied migration.

Vercel project `refer-design-library` uses root directory `apps/web`. Its production
environment points at the production Neon branch. Deploy from the repository root
with `pnpx vercel@latest deploy --prod`. Extension releases must be rebuilt and
reloaded/installed separately; existing installed Supabase builds do not update
automatically.

## Verification

Production web sign-in, reload, signout, and protected routes passed. Chrome local
interaction smoke, Firefox validation/install, and production extension package
audits passed. Disposable test accounts and objects were cleaned up.

```sh
pnpm smoke:cloud
pnpm smoke:extension
pnpm smoke:firefox
```

The cloud smoke test creates disposable users/data and cleans them up. It tests
real Auth signup/signin/signout, stable legacy-account linking, unverified-user
rejection, capture operations, private screenshot round trips, cross-user RLS,
PKCE, single-use authorization codes, and extension session revocation. It marks
test emails verified through the database; it does not test email delivery.

Prefer an isolated Neon branch. The `migration-neon` verification branch expires
October 2, 2026; its ignored environment is `output/migration/test.env`.

```sh
node --env-file=output/migration/test.env scripts/smoke-neon.mjs
```

For the real extension/web integration check, run the local web app against that
same branch on port 3100 and retain disposable users with `KEEP_SMOKE_USERS=1`
when running the cloud smoke test. Then run:

```sh
node --env-file=output/migration/test.env scripts/smoke-neon-extension.mjs
```

This test needs the ignored migration export and screenshot backup. It verifies
the real browser identity popup, website approval, capture queue, private storage,
session reload, web library display, delete sync, and signout. It builds a test
extension: run `pnpm package:extensions` afterward to restore production artifacts.

`scripts/import-supabase.mjs` is the one-time importer. It requires the ignored
source export/keys, direct destination credentials, object-storage credentials,
and `MIGRATION_SUPABASE_URL`. It inserts missing rows without overwriting existing
ones and verifies copied objects. It is not continuous replication. The old
`pnpm smoke:cloud:legacy` command is retained only for the Supabase fallback.

## Shared account library (September 30, 2026)

`GET /library-sync` returns an explicitly complete, account-scoped snapshot and
lossless Postgres revision strings. It is never limited to the first 500 records.
Extensions reconcile only after validating and downloading the entire response.
`GET /screenshots/:id.png|webp` returns image bytes through the authenticated API,
so no additional storage-origin extension permissions are necessary. Capture
images are immutable once referenced by a cloud row.

Extension writes include `base_revision`: null means create-only, a revision means
update-only if that revision still exists. Conflicts return 409 and keep the cloud
version; older API consumers remain compatible. No schema migration is required.
The extension preserves pending jobs during cache reconciliation and checks account
ownership in the same IndexedDB transaction that updates cached references.

Run the real two-profile browser test on the existing isolated test branch:

```sh
VERIFY_EXTENSION_SYNC=1 node --env-file=output/migration/test.env scripts/smoke-neon.mjs
```

This adds fresh-device hydration, cached offline images, offline capture upload,
second-device propagation, and remote deletion checks. It uses disposable accounts
and restores the configured production extension build afterward.
