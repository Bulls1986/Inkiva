import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowUrl = new URL('../../../.github/workflows/release.yml', import.meta.url)

test('release job initializes the repository and package manager before artifact verification', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')
  const releaseStart = workflow.indexOf('\n  release:\n')

  assert.notEqual(releaseStart, -1, 'release job must exist')

  const releaseJob = workflow.slice(releaseStart)
  const checkoutIndex = releaseJob.indexOf('uses: actions/checkout@v4')
  const setupIndex = releaseJob.indexOf('uses: ./.github/actions/setup')
  const verificationIndex = releaseJob.indexOf('run: pnpm verify-update-artifacts')

  assert.notEqual(checkoutIndex, -1, 'release job must check out the repository')
  assert.notEqual(setupIndex, -1, 'release job must install Node, pnpm, and dependencies')
  assert.notEqual(verificationIndex, -1, 'release job must verify update artifacts')
  assert.ok(checkoutIndex < setupIndex, 'checkout must happen before project setup')
  assert.ok(
    setupIndex < verificationIndex,
    'project setup must happen before artifact verification'
  )
})
