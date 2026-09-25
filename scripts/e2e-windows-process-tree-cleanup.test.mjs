import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const helpers = readFileSync('packages/desktop/test/e2e/helpers.ts', 'utf8')

test('Electron E2E force-close terminates the full Windows process tree', () => {
  assert.match(helpers, /from 'node:child_process'/)
  assert.match(helpers, /process\.platform === 'win32'/)
  assert.match(helpers, /taskkill/)
  assert.match(helpers, /'\/T'/)
  assert.match(helpers, /'\/F'/)
  assert.match(helpers, /String\(child\.pid\)/)
})
