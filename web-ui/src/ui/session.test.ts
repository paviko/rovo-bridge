import {describe, it, expect, vi, beforeEach} from 'vitest'
import {sendTextToStdinWithHistory} from './session'
import {state} from './state'

// Minimal WebSocket OPEN constant
const OPEN = 1

describe('sendTextToStdinWithHistory fallback behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global as any).WebSocket = { OPEN }
  })

  it('attempts savePrompt when initial stdin send throws', () => {
    const sendMock = vi.fn(() => { throw new Error('send failed') })
    ;(state as any).currentWs = { readyState: OPEN, send: sendMock }

    const historyEntry = { id: 'hist_1', serializedContent: 'Hello world' }

    // Should not throw despite send failing
    expect(() => sendTextToStdinWithHistory('echo test', historyEntry as any)).not.toThrow()

    // Verify that a savePrompt attempt was made after failure
    const calls: any[] = (sendMock as any).mock.calls || []
    const types = calls.map((args: any[]) => {
      const arg0 = args && args.length > 0 ? args[0] : undefined
      if (typeof arg0 !== 'string') return null
      try {
        const parsed = JSON.parse(arg0)
        return parsed?.type ?? null
      } catch {
        return null
      }
    })

    expect(types).toContain('savePrompt')
  })
})
