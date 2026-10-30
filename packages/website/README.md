# Inkiva website

The public site for [Inkiva](https://github.com/Bulls1986/Inkiva), a free, open-source, document-first Markdown editor for Windows and macOS.

This package is a **Next.js/React/TypeScript** static website within Inkiva's pnpm monorepo. It is not the Electron desktop application, and it no longer uses the old standalone Vite/React 18 website scaffold.

## Requirements

- Node.js **20.19.0 or newer**.
- pnpm **10.x**. The repository root `package.json` pins pnpm **10.33.4** using `packageManager`.
- Install dependencies from the **repository root** so workspace packages resolve correctly.

## Get started

~~~bash
git clone https://github.com/Bulls1986/Inkiva.git
cd Inkiva
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm --filter inkiva-website dev
~~~

The development server listens on **http://localhost:3000** by default.

## Scripts

Run these commands from the repository root:

~~~bash
pnpm --filter inkiva-website docs:index
pnpm --filter inkiva-website type-check
pnpm --filter inkiva-website lint
pnpm --filter inkiva-website test
pnpm --filter inkiva-website build:static
pnpm --filter inkiva-website verify:seo
~~~

- `docs:index` regenerates the documentation search index from the Markdown files.
- `build:static` exports the production site into `packages/website/out/`.
- `verify:seo` validates the generated static site's search-engine output; run it after a static build.
- `next.config.ts` sets `output: 'export'` and `trailingSlash: true`. The displayed release version is obtained from the latest published GitHub Release, unless explicitly overridden by the build environment.

## Where to edit

| Purpose | Location |
|---|---|
| Website routes and React components | `src/app/`, `src/components/` |
| Public user and developer guides | `content/docs/` |
| Documentation route/sidebar registry | `src/lib/docs-nav.ts` |
| Documentation search index generator | `scripts/build-docs-index.ts` |
| SEO verification | `scripts/verify-seo-output.ts` |
| Tests | `test/` |
| Static assets | `public/` |
| Production export | `out/` (generated) |

There are 32 registered public documentation pages in the current documentation registry. If you add or rename a public guide, update the route registry, verify its source file and relative links, and regenerate the docs index.

The main product/engineering contracts live under the repository root `docs/`; they are separate from public website manuals.

## Publishing

The [Deploy Inkiva website](https://github.com/Bulls1986/Inkiva/blob/develop/.github/workflows/website-deploy.yml) GitHub Actions workflow builds a static site and publishes `packages/website/out` to `Bulls1986/Bulls1986.github.io` with the configured `www.inkiva.net` CNAME. It runs for relevant `develop` updates, on published releases and through an explicit workflow dispatch.

Do not manually publish generated files from a local build without the repository's release/deployment workflow. The workflow's source and trigger filters are authoritative; changing text under `content/docs/` triggers a website deployment after merge.

For the desktop product architecture, see [Developer documentation](content/docs/dev/README.md) and the repository's [AGENTS.md](../../AGENTS.md).

## License

Inkiva is available under [GPL-3.0-or-later](../../LICENSE).
