# Refer Firefox source review

This archive contains the source required to reproduce the submitted Firefox extension.
It deliberately excludes the unrelated web application, tests, generated output, local
environment files, and `node_modules`.

## Build environment

- Ubuntu 24.04 or macOS
- Node.js 22 (the repository `.nvmrc` contains the major version)
- pnpm 9.15.2, selected by the `packageManager` field in `package.json`
- Internet access to the public npm registry for dependency installation

All build tools and dependencies are open-source packages downloaded through pnpm. The
build does not use a web service. When present, `apps/extension/.env.local` contains only
the public Supabase project URL and browser-safe publishable key compiled into the
submitted build; it contains no secret or service-role credential. Its absence produces
the fully local build.

## Reproduce the extension

From the extracted source archive root:

```sh
corepack enable
corepack prepare pnpm@9.15.2 --activate
pnpm install --frozen-lockfile
pnpm package:extensions
```

The verifier rebuilds both browser archives, checks their manifests and contents, and
writes the Firefox extension archive to:

```text
apps/extension/.output/referextension-0.1.0-firefox.zip
```

The build command first compiles the extension with WXT, Vite, TypeScript, and esbuild,
then creates a deterministic ZIP with `manifest.json` at its root.
