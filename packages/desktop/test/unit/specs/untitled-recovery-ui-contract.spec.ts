import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const componentPath = resolve(
  here,
  '../../../src/renderer/src/components/recovery/untitledRecoveryCenter.vue'
)
const appPath = resolve(here, '../../../src/renderer/src/pages/app.vue')

describe('US03 untitled recovery UI contract', () => {
  it('mounts an additive recovery center and exposes the explicit restore-to-new-tab action', () => {
    const component = readFileSync(componentPath, 'utf8')
    const app = readFileSync(appPath, 'utf8')

    expect(app).toContain('<untitled-recovery-center />')
    expect(component).toContain('data-testid="untitled-recovery-center"')
    expect(component).toContain('pendingUntitledRecoveries')
    expect(component).toContain('RESTORE_UNTITLED_RECOVERY')
    expect(component).toContain("t('recovery.untitled.restoreToNewTab')")
    expect(component).toContain('protectedAt')
    expect(component).toContain('--surface-elevated')
    expect(component).toContain('--border-subtle')
  })
})
