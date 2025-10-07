import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {extractComposerPayload, sendComposer} from './send'
import {state} from '../state'
import {promptHistoryManager} from '../history'
import {getComposerInput} from '../focus'
import {finalizeIterationAndSendEnter, sendTextToStdinWithHistory} from '../session'

// Mock dependencies
vi.mock('../focus', () => ({
  getComposerInput: vi.fn()
}))

vi.mock('../session', () => ({
  sendTextToStdin: vi.fn(),
  sendTextToStdinWithHistory: vi.fn(),
  finalizeIterationAndSendEnter: vi.fn()
}))

vi.mock('./reconcile', () => ({
  reconcileRegistryWithComposer: vi.fn()
}))

vi.mock('./init', () => ({
  composerUndoRedoManager: {
    clear: vi.fn(),
    initialize: vi.fn()
  }
}))

vi.mock('../history', () => ({
  promptHistoryManager: {
    addPromptWithId: vi.fn()
  }
}))

vi.mock('../utils', () => ({
  quotePath: vi.fn((p: string) => p) // Simple mock that returns the path as-is
}))

describe('sendComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset state
    state.historyInitialized = true
    state.composerChecked = new Map()
    
    // Mock WebSocket
    ;(global as any).WebSocket = vi.fn()
    ;(global as any).__SESSION_ID__ = 's1'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should capture prompt history when sending composer content', () => {
    // Setup mock input element with proper DOM structure
    const mockInput = document.createElement('div')
    mockInput.innerHTML = '<span class="composer-chip" data-path="/test/file.js">file.js</span> Fix this bug'

    vi.mocked(getComposerInput).mockReturnValue(mockInput)

    // Call sendComposer
    sendComposer()

    // Verify history was captured  
    expect(promptHistoryManager.addPromptWithId).toHaveBeenCalled()

    // Verify text was sent with history
    expect(sendTextToStdinWithHistory).toHaveBeenCalledWith(
      '/test/file.js Fix this bug',
      expect.objectContaining({
        serializedContent: '<[#/test/file.js][file.js]> Fix this bug'
      })
    )

    // Verify finalization was called
    expect(finalizeIterationAndSendEnter).toHaveBeenCalled()
  })

  it('should not capture history when history is not initialized', () => {
    state.historyInitialized = false

    const mockInput = document.createElement('div')
    mockInput.innerHTML = 'Test content'

    vi.mocked(getComposerInput).mockReturnValue(mockInput)

    sendComposer()

    // Verify history was not captured
    expect(promptHistoryManager.addPromptWithId).not.toHaveBeenCalled()

    // Verify text was still sent but without history
    expect(sendTextToStdinWithHistory).toHaveBeenCalledWith('Test content', null)
  })

  it('should not capture history for empty content', () => {
    const mockInput = document.createElement('div')
    mockInput.innerHTML = ''

    vi.mocked(getComposerInput).mockReturnValue(mockInput)

    sendComposer()

    // Verify history was not captured for empty content
    expect(promptHistoryManager.addPromptWithId).not.toHaveBeenCalled()
    expect(sendTextToStdinWithHistory).not.toHaveBeenCalled()
  })

  it('should handle history capture errors gracefully', () => {
    const mockInput = document.createElement('div')
    mockInput.innerHTML = 'Test content'

    vi.mocked(getComposerInput).mockReturnValue(mockInput)
    vi.mocked(promptHistoryManager.addPromptWithId).mockImplementation(() => {
      throw new Error('History error')
    })

    // Should not throw
    expect(() => sendComposer()).not.toThrow()

    // Should still send the text
    expect(sendTextToStdinWithHistory).toHaveBeenCalled()
  })
})

describe('extractComposerPayload', () => {
  it('should extract text from composer content', () => {
    const mockRoot = document.createElement('div')
    mockRoot.innerHTML = '<span class="composer-chip" data-path="/test/file1.js">file1.js</span> and <span class="composer-chip" data-path="/test/file2.js">file2.js</span> content'

    const result = extractComposerPayload(mockRoot)

    expect(result.textToSend).toBe('/test/file1.js and /test/file2.js content')
  })

  it('should handle content without chips', () => {
    const mockRoot = document.createElement('div')
    mockRoot.innerHTML = 'Plain text content'

    const result = extractComposerPayload(mockRoot)

    expect(result.textToSend).toBe('Plain text content')
  })

  it('should skip image placeholders', () => {
    const mockRoot = document.createElement('div')
    mockRoot.innerHTML = '<span class="composer-image-placeholder">image</span> text content'

    const result = extractComposerPayload(mockRoot)

    expect(result.textToSend).toBe(' text content')
  })
})