# Prepare a hotfix

A hotfix starts from the exact published release that needs correction, not from an arbitrary current `develop` snapshot. The same tag-triggered release workflow publishes the resulting patch version.

## 1. Create the hotfix branch from the published tag

~~~bash
git fetch origin --tags
git switch -c hotfix/vX.Y.Z vA.B.C
~~~

Replace `vA.B.C` with the exact released tag being patched and `vX.Y.Z` with the new patch version. Confirm the branch base with `git rev-parse HEAD` before editing.

## 2. Implement and validate the fix

- Reproduce the defect and add the focused regression test before changing production code.
- Make the smallest coherent fix; preserve the established architecture, test and release gates.
- If the fix already exists on another branch, cherry-pick the exact full commit SHA and review the resulting diff. Do not cherry-pick an entire unrelated feature branch.

## 3. Align the release version

Update the root, desktop and website package versions together:

- `package.json`
- `packages/desktop/package.json`
- `packages/website/package.json`

Update the version-bound release fixtures and run the relevant checks from [Releasing Inkiva](RELEASE.md), including `pnpm test:release`, the desktop version-identifier test and the official PR/package gates.

## 4. Review, tag and publish

Obtain review and approval for the hotfix commit and its release target. Only after the release candidate is accepted, create and push the annotated tag on the exact approved hotfix commit:

~~~bash
git tag -a vX.Y.Z -m "Inkiva vX.Y.Z hotfix"
git push origin vX.Y.Z
~~~

The tag triggers the same validate → build → package smoke → assemble → updater/checksum verification → publish workflow described in [Releasing Inkiva](RELEASE.md). Do not upload binaries manually.

## 5. Forward-port the fix

After the hotfix is published, ensure its fix and regression test are integrated into current `develop` so the defect does not return in the next release. Use a reviewed PR or exact-SHA cherry-pick as appropriate to the branch history; resolve conflicts deliberately and verify the resulting diff.