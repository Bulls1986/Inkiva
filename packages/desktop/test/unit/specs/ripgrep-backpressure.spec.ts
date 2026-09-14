import { describe, expect, it, vi } from 'vitest'

import { BatchGate } from 'main_renderer/ipc/ripgrepBackpressure'

describe('ripgrep BatchGate', () => {
  it('bounds in-flight and queued batches and drains in FIFO order on ACK', () => {
    const sent: number[] = []
    const gate = new BatchGate<number>(
      ({ payload }) => {
        sent.push(payload)
        return true
      },
      { maxInFlight: 2, maxQueued: 2 }
    )

    const batchIds = [1, 2, 3, 4].map((payload) => gate.enqueue(payload))

    expect(batchIds.every((batchId): batchId is number => batchId !== null)).toBe(true)
    expect(gate.inFlightCount).toBe(2)
    expect(gate.queuedCount).toBe(2)
    expect(gate.enqueue(5)).toBeNull()
    expect(sent).toEqual([1, 2])

    expect(gate.ack(999)).toBe(false)
    expect(gate.ack(batchIds[0] as number)).toBe(true)
    expect(sent).toEqual([1, 2, 3])
    expect(gate.inFlightCount).toBe(2)
    expect(gate.queuedCount).toBe(1)

    expect(gate.ack(batchIds[0] as number)).toBe(false)
    expect(gate.ack(batchIds[1] as number)).toBe(true)
    expect(sent).toEqual([1, 2, 3, 4])
  })

  it('releases all batches when closed and ignores later ACKs', () => {
    const send = vi.fn(() => true)
    const gate = new BatchGate<number>(send, { maxInFlight: 1, maxQueued: 1 })
    const first = gate.enqueue(1)
    const second = gate.enqueue(2)

    gate.close()

    expect(gate.inFlightCount).toBe(0)
    expect(gate.queuedCount).toBe(0)
    expect(gate.ack(first as number)).toBe(false)
    expect(gate.enqueue(3)).toBeNull()
    expect(send).toHaveBeenCalledTimes(1)
    expect(second).not.toBeNull()
  })
})
