import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowUrl = new URL('../../../.github/workflows/website-deploy.yml', import.meta.url)

test('website deployment reruns when a GitHub release is published', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')

  assert.match(workflow, /release:\s*\n\s+types:\s*\[published\]/)
})

test('website build receives a GitHub token for release API requests', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')

  assert.match(workflow, /GITHUB_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/)
})
