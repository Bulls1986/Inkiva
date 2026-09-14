import { describe, expect, it, vi } from 'vitest'
import { StartupPhase, StartupPhaseCoordinator } from 'main_renderer/app/startup'

describe('startup phase coordinator', () => {
  it('keeps non-critical work queued until the editor is interactive', () => {
    const coordinator = new StartupPhaseCoordinator()
    const task = vi.fn()

    expect(coordinator.phase).toBe(StartupPhase.BOOTING)
    coordinator.onEditorInteractive(task)
    coordinator.markShellVisible()

    expect(coordinator.phase).toBe(StartupPhase.SHELL_VISIBLE)
    expect(task).not.toHaveBeenCalled()

    coordinator.markEditorInteractive()

    expect(coordinator.phase).toBe(StartupPhase.READY)
    expect(task).toHaveBeenCalledOnce()
  })

  it('preserves the restoring phase until the editor becomes interactive', () => {
    const coordinator = new StartupPhaseCoordinator()
    const task = vi.fn()

    coordinator.markShellVisible()
    coordinator.beginRestoring()
    coordinator.onEditorInteractive(task)

    expect(coordinator.phase).toBe(StartupPhase.RESTORING)
    expect(task).not.toHaveBeenCalled()

    coordinator.markEditorInteractive()
    coordinator.markEditorInteractive()

    expect(coordinator.phase).toBe(StartupPhase.READY)
    expect(task).toHaveBeenCalledOnce()
  })

  it('supports cancellation and does not retain callbacks after disposal', () => {
    const coordinator = new StartupPhaseCoordinator()
    const cancelled = vi.fn()
    const retained = vi.fn()

    const unsubscribe = coordinator.onEditorInteractive(cancelled)
    coordinator.onEditorInteractive(retained)
    unsubscribe()
    coordinator.dispose()
    coordinator.markEditorInteractive()

    expect(cancelled).not.toHaveBeenCalled()
    expect(retained).not.toHaveBeenCalled()
    expect(coordinator.phase).toBe(StartupPhase.BOOTING)
  })
})
