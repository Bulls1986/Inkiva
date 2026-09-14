import { describe, expect, it, vi } from 'vitest'
import { StartupPhase, StartupPhaseCoordinator } from 'main_renderer/app/startup'

describe('startup phase coordinator', () => {
  it('keeps non-critical work queued until the first document is editable', () => {
    const coordinator = new StartupPhaseCoordinator()
    const task = vi.fn()

    expect(coordinator.phase).toBe(StartupPhase.BOOTING)
    coordinator.onEditorInteractive(task)
    coordinator.markShellVisible()
    coordinator.markRendererReady()

    expect(coordinator.phase).toBe(StartupPhase.SHELL_VISIBLE)
    expect(coordinator.rendererReady).toBe(true)
    expect(task).not.toHaveBeenCalled()

    coordinator.markDocumentEditable()

    expect(coordinator.phase).toBe(StartupPhase.READY)
    expect(coordinator.documentEditable).toBe(true)
    expect(task).toHaveBeenCalledOnce()
  })

  it('preserves the restoring phase until the document becomes editable', () => {
    const coordinator = new StartupPhaseCoordinator()
    const task = vi.fn()

    coordinator.markShellVisible()
    coordinator.beginRestoring()
    coordinator.onEditorInteractive(task)
    coordinator.markRendererReady()

    expect(coordinator.phase).toBe(StartupPhase.RESTORING)
    expect(task).not.toHaveBeenCalled()

    coordinator.markDocumentEditable()
    coordinator.markDocumentEditable()

    expect(coordinator.phase).toBe(StartupPhase.READY)
    expect(task).toHaveBeenCalledOnce()
  })

  it('does not become ready when the renderer milestone is reported too early', () => {
    const coordinator = new StartupPhaseCoordinator()
    const task = vi.fn()

    coordinator.onEditorInteractive(task)
    coordinator.markDocumentEditable()

    expect(coordinator.phase).toBe(StartupPhase.BOOTING)
    expect(coordinator.documentEditable).toBe(false)
    expect(task).not.toHaveBeenCalled()
  })

  it('reports an editable timeout without releasing background work', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const coordinator = new StartupPhaseCoordinator({
      documentEditableTimeoutMs: 100,
      onDocumentEditableTimeout: onTimeout
    })

    vi.advanceTimersByTime(100)

    expect(onTimeout).toHaveBeenCalledOnce()
    expect(coordinator.phase).toBe(StartupPhase.BOOTING)
    expect(coordinator.documentEditable).toBe(false)
    coordinator.dispose()
    vi.useRealTimers()
  })

  it('supports cancellation and does not retain callbacks after disposal', () => {
    const coordinator = new StartupPhaseCoordinator()
    const cancelled = vi.fn()
    const retained = vi.fn()

    const unsubscribe = coordinator.onEditorInteractive(cancelled)
    coordinator.onEditorInteractive(retained)
    unsubscribe()
    coordinator.dispose()
    coordinator.markRendererReady()
    coordinator.markDocumentEditable()

    expect(cancelled).not.toHaveBeenCalled()
    expect(retained).not.toHaveBeenCalled()
    expect(coordinator.phase).toBe(StartupPhase.BOOTING)
  })
})
