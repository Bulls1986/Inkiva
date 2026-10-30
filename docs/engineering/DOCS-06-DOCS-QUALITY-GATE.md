# D06 — Public documentation quality gate

- Date: 2026-10-30
- State: **merged in [PR #273](https://github.com/Bulls1986/Inkiva/pull/273), merge commit `92e2ff6399ff4627c8e8db3aae44074d4b64fd36`; website deployment passed.**
- Repository: https://github.com/Bulls1986/Inkiva
- Remote target: `develop`, reverify authoritative head before publishing
- Local source branch: `docs/d06-local-checker`, from a previous D03 worktree with clean tracked status
- Intended remote PR branch: `docs/d06-docs-quality-gate`
- Scope: add a fail-closed checker for public docs pages, relative links, local image/assets and Markdown heading targets; wire it into the website publication workflow
- Not in scope: desktop runtime, website route/navigation changes, performance threshold changes, translation/UI layout work or screenshot recapture

## Source of truth and checks

Read `AGENTS.md`, `docs/agent/WORKFLOW.md`, `docs/agent/TESTING.md` and `docs/agent/ARCHITECTURE_RELEASE.md` before the workflow and script change. The website route registry is `packages/website/src/lib/docs-nav.ts`, the Markdown source is `packages/website/content/docs/`, and public document assets are served from `packages/website/public/docs/`. The existing renderer rewrites registered relative Markdown destinations to their public documentation routes and image paths to public assets.

## Executed Red and real content findings

The focused pre-change assertion ran under Node 24.21.0:

~~~js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const workflow = fs.readFileSync('.github/workflows/website-deploy.yml', 'utf8')
assert.match(
  workflow,
  /pnpm --filter inkiva-website (?:run )?verify:docs/,
  'website publication must fail on broken docs references'
)
~~~

It exited **1 with AssertionError**, because the existing publication workflow had no documentation reference gate. This is a concrete missing-pipeline-contract Red; no absent dependency or test-discovery error was misclassified as Red.

The first real execution of the newly implemented checker also exited **1**, finding three missing same-page anchors in the publicly rendered To-do List examples in `end-user/MARKDOWN_SYNTAX.md` (the targets `#bar`, `#qux`, `#faz` had no matching headings). The fenced Markdown examples were deliberately ignored by the checker. Both the fenced sample and the rendered sample were corrected to existing `#tables`, `#code` and `#images` targets; no syntax or renderer behavior changed.

## Implementation

- `packages/website/scripts/verify-docs-links.mjs`: native Node ESM checker, no new dependencies. Enumerates the 32 registered public Markdown sources, rejects duplicate or missing source entries, checks local relative links/images/reference definitions, guards against unsafe traversal, and verifies heading targets including Unicode and duplicate heading suffixes. Failure prints source path, line and reason and exits nonzero.
- `packages/website/test/docs-links.test.mjs`: nine native `node:test` focused cases covering registry duplication, valid paths/anchors/assets, missing pages/images, literal code examples, unregistered pages, missing anchors, Unicode duplicate headings, traversal and reference-style definitions.
- `packages/website/package.json`: adds `test:docs` and `verify:docs` entry points; no version or dependency modification.
- `.github/workflows/website-deploy.yml`: after existing frozen-lockfile dependency setup and **before** static-site build/publication, run `pnpm --filter inkiva-website test:docs && pnpm --filter inkiva-website verify:docs`. This ensures the deploy job fails rather than publishing broken public docs links.
- `packages/website/content/docs/end-user/MARKDOWN_SYNTAX.md`: repairs the three broken example anchors.

## Validation

- Focused validator tests: **9/9 passed**, executed with `node --test packages/website/test/docs-links.test.mjs`.
- Full current local public docs check: **32 registered pages verified**, no broken checked relative links, images or heading anchors, using `node packages/website/scripts/verify-docs-links.mjs`.
- The originally failing workflow assertion now **passes**, including script entrypoint declarations in `packages/website/package.json`.
- Git staged whitespace diff check passed. Official PR #273 completed **11/11** CI checks successfully: Test, Lint, E2E, Windows x64, macOS x64 and ARM64 builds, package smoke, updater artifact smoke, and artifact links. [Website deployment 41032626715](https://github.com/Bulls1986/Inkiva/actions/runs/41032626715) passed after the merge.
- The checker was also executed against the subsequently merged D04 user documentation (four updated pages on top of the D06 candidate) and validated **32 pages with zero errors**.
- No `node_modules` was available in the isolated local source checkout, so the broader Next.js build and full website TypeScript suite are **not claimed locally**. The authoritative PR CI/deployment evidence must be checked on the final remote commit.
- The checker deliberately uses a bounded Markdown-source scanner rather than a second document renderer. It covers ordinary inline Markdown links, Markdown reference definitions, local assets and explicit Markdown headings; highly nested Markdown, unusual HTML URL attributes, redirect/network availability and screenshot freshness are **not established** by this gate. Do not describe it as comprehensive SEO or visual testing.

## Architecture and lessons

This is build/deployment documentation tooling only. It does not modify desktop or Muya document ownership, IPC, editor hot paths, Markdown formats, CI performance thresholds or the existing main product-test matrices. A documentation gate should run before publication and fail closed; a build-only pass can otherwise publish stale or broken documentation. The missing anchors in a rendered tutorial demonstrate why a source scanner must distinguish fenced code from clickable output and why a test should reject broken targets rather than suppress warnings.

## Handoff

- D06 is published; the release/deploy checks and integration evidence are recorded above.
- D04 user-guide update is merged in [PR #272](https://github.com/Bulls1986/Inkiva/pull/272), but its actual screenshot freshness remains unverified.
- D05 still owns Chinese public docs and language/SEO parity. New localized pages must be added to the route registry and covered by this checker when D05 is implemented.
- If the public documentation parser/router changes, update this scanner's corpus and targeted tests; do not silently broaden its behavior claim without executable examples.
