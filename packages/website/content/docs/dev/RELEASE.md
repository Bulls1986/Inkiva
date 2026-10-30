# Releasing Inkiva

This guide describes the release process implemented by [`.github/workflows/release.yml`](https://github.com/Bulls1986/Inkiva/blob/develop/.github/workflows/release.yml). The workflow is the authority for release triggers, supported targets, artifact assembly and publication behavior.

## Current published baseline

The latest stable release verified by this guide is [Inkiva v0.6.0](https://github.com/Bulls1986/Inkiva/releases/tag/v0.6.0), published on 2026-10-29. Its tag-triggered workflow built and smoke-tested Windows x64, macOS Intel x64 and macOS Apple Silicon arm64 packages, verified updater metadata, assembled checksums and published 14 assets.

## Release model

- A pushed tag matching `v*` starts the **Release Inkiva** workflow.
- The first job validates the tag as SemVer with a leading `v`.
- Stable tags publish a normal GitHub Release. Tags containing a hyphen, such as `vX.Y.Z-rc.1`, are marked as prereleases.
- Supported release targets are **Windows x64, macOS x64 and macOS arm64**. Linux and Windows ARM64 are not release targets.
- The release job assembles the already-built platform artifacts, validates updater metadata and checksums, creates a draft release with assets, then promotes it to a published release.

Do not create a GitHub Release manually or upload platform artifacts outside this workflow.

## 1. Prepare a version candidate

Start from the latest authoritative remote `develop`. The v0.6.0 precedent used a dedicated `release/v0.6.0-readiness` branch and [PR #258](https://github.com/Bulls1986/Inkiva/pull/258).

~~~bash
git fetch origin develop --tags
git switch develop
git pull --ff-only origin develop
git switch -c release/vX.Y.Z-readiness
~~~

Align all three published package manifests:

- `package.json` — workspace root version.
- `packages/desktop/package.json` — Electron application/electron-builder version.
- `packages/website/package.json` — website package version.

Update the version-bound regression fixtures in the same change. The established version-preparation inventory includes:

- `packages/desktop/test/unit/specs/inkiva-release-identifiers.spec.ts`
- `perf/soak/fast-runner.spec.ts`
- `scripts/assembleReleaseArtifacts.test.ts`
- `scripts/verifyUpdateArtifacts.test.ts`

Inspect the current source and tests for any additional version-specific expectations before committing. Historical release notes and old benchmark records are not current version identifiers and must not be rewritten indiscriminately.

For a version-only change, keep `pnpm-lock.yaml` unchanged when dependency ranges and resolutions have not changed.

## 2. Run version and release-contract checks

From the repository root, run the focused release contracts and the relevant package tests:

~~~bash
pnpm test:release
pnpm test:perf:fast
pnpm -C packages/desktop exec vitest run test/unit/specs/inkiva-release-identifiers.spec.ts
pnpm --filter inkiva-website test
~~~

These local checks supplement, not replace, the official PR workflows. Open a PR from the candidate branch to `develop` and require the applicable Test, Lint, E2E, Validate Licenses, Performance Fast Gate, PR Build, package-smoke and updater-artifact-smoke checks to pass. Do not weaken any threshold, workload or required gate to obtain a green result.

Inkiva currently uses **squash merge only**. Merge only when explicitly authorized. A PR being mergeable is not evidence that its checks passed.

## 3. Merge and create the release tag

After the candidate PR is merged:

1. Verify GitHub reports the PR as merged.
2. Fetch the authoritative remote `develop` ref and verify it points to the expected merge commit.
3. Create the annotated stable tag on that exact approved commit.

~~~bash
git fetch origin develop --tags
git switch --detach origin/develop
git tag -a vX.Y.Z -m "Inkiva vX.Y.Z stable release"
git push origin vX.Y.Z
~~~

The tag push is the publication trigger. Do not tag a local candidate branch before its approved changes are integrated into the intended release commit.

For a release candidate, use a prerelease tag such as `vX.Y.Z-rc.1`. The workflow marks hyphenated tags as prereleases and skips the stable updater-artifact contract; the final stable tag must still pass the full stable release checks.

## 4. What the tag workflow does

The current workflow performs these stages:

1. **Validate tag** — enforce the supported SemVer tag format.
2. **Build matrix** — build Windows x64, macOS x64 and macOS arm64 packages on their native runners.
3. **Package smoke** — validate the already-built Windows installer/ZIP and macOS DMG/ZIP artifacts. Smoke consumes downloaded build artifacts; it does not rebuild the application.
4. **Assemble release artifacts** — merge the two macOS `latest-mac.yml` metadata files, reject duplicate artifact names and create `SHA256SUMS.txt`.
5. **Verify stable updater artifacts** — for stable tags, require the tag to match the desktop package version and verify required Windows/macOS updater files, metadata versions, SHA-512 values, file sizes and SHA-256 checksum entries. Prerelease tags skip this stable updater-channel contract.
6. **Compose release notes** — generate GitHub's merged-PR notes and append checksum verification plus unsigned macOS installation guidance.
7. **Publish** — create a draft release with all assembled assets, then promote it to a published release.

## 5. Verify the published GitHub Release

Inspect the completed run and release:

~~~bash
gh run list --workflow=release.yml --limit 5
gh run watch <run-id> --exit-status
gh release view vX.Y.Z
~~~

A stable release must contain **14 assets**:

| Group | Assets |
|---|---|
| macOS arm64 | `dmg`, `dmg.blockmap`, `zip`, `zip.blockmap` |
| macOS x64 | `dmg`, `dmg.blockmap`, `zip`, `zip.blockmap` |
| Windows x64 | `setup.exe`, `setup.exe.blockmap`, `zip` |
| Updater metadata | `latest.yml`, `latest-mac.yml` |
| Checksums | `SHA256SUMS.txt` |

Download the release assets and verify the checksum manifest in a directory containing the downloaded files:

~~~bash
sha256sum -c SHA256SUMS.txt --ignore-missing
~~~

The manifest contains checksums for the 13 other release assets; it does not hash itself. Confirm that both updater metadata files describe the tag version and that the release body includes checksum instructions and the unsigned macOS disclosure.

**macOS distribution:** current builds are unsigned and not notarized because the project has no Developer ID signing identity. Gatekeeper may block the first launch. Only install a release you trust; in Finder, Control-click the app and choose Open, then confirm the prompt. Do not disable Gatekeeper globally.

Package smoke is not a substitute for native macOS manual acceptance, reference-machine absolute performance qualification, or a real installed-app upgrade/document-preservation test. Record those separately as passed, deferred or risk-accepted based on actual evidence.

## 6. Website deployment

The separate **Deploy Inkiva website** workflow is triggered by a published GitHub Release and by relevant changes on `develop`. On the release event it builds the static website and deploys it to the configured Pages repository.

The website resolves its displayed release label from the latest published GitHub Release through `packages/website/next.config.ts`; it does not rely only on the package manifest version. After publication, verify the corresponding `website-deploy.yml` run succeeds.

## 7. Post-release records

After publication:

- Update `packages/website/content/docs/CHANGELOG.md` with the user-visible release summary.
- Update the release-readiness audit with the exact tag commit, workflow run, asset inventory, updater/checksum result and any accepted qualification gaps.
- Keep manual acceptance, reference performance and upgrade evidence distinct from package-smoke/CI evidence.
- Do not automatically bump `develop` to a new development version unless a separately approved next-version plan requires it. Keep the three package manifests aligned.

For a hotfix based on an already-published release, see [Prepare a hotfix](RELEASE_HOTFIX.md).