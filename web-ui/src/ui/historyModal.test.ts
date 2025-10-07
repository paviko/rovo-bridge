// History Modal UI Tests
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {HistoryModal} from './historyModal'
import {type PromptHistoryEntry, promptHistoryManager} from './history'

// Mock DOM elements
const mockModal = document.createElement('div')
mockModal.id = 'historyModal'
mockModal.classList.add('hidden')

const mockListContainer = document.createElement('div')
mockListContainer.id = 'historyList'

const mockShowAllCheckbox = document.createElement('input')
mockShowAllCheckbox.type = 'checkbox'
mockShowAllCheckbox.id = 'historyShowAll'

const mockCloseBtn = document.createElement('button')
mockCloseBtn.id = 'historyCloseBtn'

const mockBackdrop = document.createElement('div')
mockBackdrop.className = 'history-modal-backdrop'

const mockModalContent = document.createElement('div')
mockModalContent.className = 'history-modal-content'

// Setup DOM structure
mockModal.appendChild(mockBackdrop)
mockModal.appendChild(mockModalContent)
mockModalContent.appendChild(mockListContainer)

describe('HistoryModal', () => {
  let historyModal: HistoryModal

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = ''

    // Add mock elements to DOM
    document.body.appendChild(mockModal)
    document.body.appendChild(mockListContainer)
    document.body.appendChild(mockShowAllCheckbox)
    document.body.appendChild(mockCloseBtn)

    // Reset modal state
    mockModal.classList.add('hidden')
    document.body.style.overflow = ''

    // Clear history cache
    promptHistoryManager.clearCache()

    // Create new instance
    historyModal = new HistoryModal()
  })

  afterEach(() => {
    // Clean up
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  describe('show/hide functionality', () => {
    it('should show modal when show() is called', () => {
      historyModal.show()

      expect(mockModal.classList.contains('hidden')).toBe(false)
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('should hide modal when hide() is called', () => {
      historyModal.show()
      historyModal.hide()

      expect(mockModal.classList.contains('hidden')).toBe(true)
      expect(document.body.style.overflow).toBe('')
    })

    it('should toggle modal visibility', () => {
      // Initially hidden
      expect(mockModal.classList.contains('hidden')).toBe(true)

      // Toggle to show
      historyModal.toggle()
      expect(mockModal.classList.contains('hidden')).toBe(false)

      // Toggle to hide
      historyModal.toggle()
      expect(mockModal.classList.contains('hidden')).toBe(true)
    })

    it('should not show modal multiple times', () => {
      historyModal.show()
      const firstState = mockModal.classList.contains('hidden')

      historyModal.show() // Second call should be ignored
      const secondState = mockModal.classList.contains('hidden')

      expect(firstState).toBe(secondState)
      expect(firstState).toBe(false)
    })
  })

  describe('event handling', () => {
    it('should close modal on escape key', () => {
      historyModal.show()

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
      document.dispatchEvent(escapeEvent)

      expect(mockModal.classList.contains('hidden')).toBe(true)
    })

    it('should close modal on backdrop click', () => {
      historyModal.show()

      mockBackdrop.click()

      expect(mockModal.classList.contains('hidden')).toBe(true)
    })

    it('should close modal on close button click', () => {
      historyModal.show()

      mockCloseBtn.click()

      expect(mockModal.classList.contains('hidden')).toBe(true)
    })

    it('should not close modal on content click', () => {
      historyModal.show()

      // Mock event with stopPropagation
      const clickEvent = new MouseEvent('click', { bubbles: true })
      const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation')

      mockModalContent.dispatchEvent(clickEvent)

      expect(stopPropagationSpy).toHaveBeenCalled()
      expect(mockModal.classList.contains('hidden')).toBe(false)
    })
  })

  describe('history rendering', () => {
    it('should render empty state when no history', () => {
      historyModal.show()

      expect(mockListContainer.children.length).toBe(1)
      expect(mockListContainer.textContent).toContain('No prompts')
    })

    it('should render history entries when available', () => {
      // Add some test history
      promptHistoryManager.addPrompt(
        'Test prompt <[#file.js][file.js]>'
      )

      historyModal.show()

      expect(mockListContainer.children.length).toBe(1)
      expect(mockListContainer.querySelector('.history-item')).toBeTruthy()
    })

    it('should update display when filter changes', () => {
      // Add test history
      promptHistoryManager.addPrompt('Test prompt')

      historyModal.show()

      // Initially should show filtered results
      const initialCount = mockListContainer.children.length

      // Toggle show all
      mockShowAllCheckbox.checked = true
      mockShowAllCheckbox.dispatchEvent(new Event('change'))

      // Should re-render (in this case same result since we only have one entry)
      expect(mockListContainer.children.length).toBe(initialCount)
    })
  })

  describe('timestamp formatting', () => {
    it('should format recent timestamps correctly', () => {
      const historyModal = new HistoryModal()

      // Access private method for testing
      const formatTimestamp = (historyModal as any).formatTimestamp.bind(historyModal)

      const now = Date.now()
      const today = formatTimestamp(now - 1000 * 60 * 30) // 30 minutes ago
      const yesterday = formatTimestamp(now - 1000 * 60 * 60 * 25) // 25 hours ago

      expect(typeof today).toBe('string')
      expect(typeof yesterday).toBe('string')
      expect(yesterday).toBe('Yesterday')
    })
  })

  describe('prompt card rendering', () => {
    it('should create history items with proper structure', () => {
      const entry: PromptHistoryEntry = {
        id: 'test-id',
        timestamp: Date.now(),
        serializedContent: '<[#test.js]> Fix the bug',
        projectCwd: '/test/project'
      }

      promptHistoryManager.addPrompt(entry.serializedContent)
      historyModal.show()

      const historyItem = mockListContainer.querySelector('.history-item')
      expect(historyItem).toBeTruthy()

      const content = historyItem?.querySelector('.history-item-content')
      expect(content).toBeTruthy()
      expect(content?.innerHTML).toContain('&lt;[#test.js]&gt; Fix the bug')

      // Check overlay metadata (replaces bottom row - always visible)
      const metaOverlay = historyItem?.querySelector('.history-item-meta-overlay')
      expect(metaOverlay).toBeTruthy()
      expect(metaOverlay?.textContent).toContain('project') // project name from '/test/project'
      
      // Original metadata structure should not exist (removed bottom row)
      const meta = historyItem?.querySelector('.history-item-meta')
      expect(meta).toBeFalsy()
    })

    it('should apply truncation for long content', () => {
      // Create a very long prompt that will exceed 75px height
      const longContent = 'This is a very long prompt that should be truncated. '.repeat(20)
      const entry: PromptHistoryEntry = {
        id: 'long-test',
        timestamp: Date.now(),
        serializedContent: longContent,
        projectCwd: '/test/project'
      }

      promptHistoryManager.addPrompt(entry.serializedContent)
      historyModal.show()

      const content = mockListContainer.querySelector('.history-item-content')
      expect(content).toBeTruthy()

      // Check that the content has the history-item-content class which applies max-height via CSS
      expect(content?.className).toContain('history-item-content')

      // In a real browser, this would trigger truncation, but in test environment
      // we just verify the structure is correct
      expect(content?.textContent).toContain('This is a very long prompt')
    })

    it('should display project names correctly', () => {
      // First initialize the history manager with the entry that has projectCwd
      const entry: PromptHistoryEntry = {
        id: 'project-test',
        timestamp: Date.now(),
        serializedContent: 'Test prompt',
        projectCwd: '/home/user/my-awesome-project'
      }

      // Initialize from session to ensure projectCwd is preserved
      promptHistoryManager.initializeFromSession([entry])
      historyModal.show()

      // Check overlay metadata (replaces bottom row)
      const metaOverlay = mockListContainer.querySelector('.history-item-meta-overlay')
      expect(metaOverlay?.textContent).toContain('my-awesome-project')
      expect((metaOverlay as HTMLElement)?.title).toBe('/home/user/my-awesome-project')
      
      // Original metadata structure should not exist (removed bottom row)
      const project = mockListContainer.querySelector('.history-item-project')
      expect(project).toBeFalsy()
    })

    it('should sort entries in reverse chronological order', () => {
      const now = Date.now()
      const entries = [
        {
          id: 'old',
          timestamp: now - 1000,
          serializedContent: 'Old prompt',
          projectCwd: '/test'
        },
        {
          id: 'new',
          timestamp: now,
          serializedContent: 'New prompt',
          projectCwd: '/test'
        }
      ]

      // Add in random order
      entries.forEach(entry => {
        promptHistoryManager.addPrompt(entry.serializedContent)
      })

      historyModal.show()

      const items = mockListContainer.querySelectorAll('.history-item')
      expect(items).toHaveLength(2)

      // First item should be the newer one
      const firstContent = items[0].querySelector('.history-item-content')?.textContent
      expect(firstContent).toBe('New prompt')
    })
  })

  describe('prompt selection functionality', () => {
    let mockComposerInput: HTMLElement

    beforeEach(() => {
      // Create mock composer input
      mockComposerInput = document.createElement('div')
      mockComposerInput.id = 'composerInput'
      mockComposerInput.contentEditable = 'true'
      document.body.appendChild(mockComposerInput)
    })

    afterEach(() => {
      mockComposerInput?.remove()
    })

    it('should append selected prompt to composer on click', () => {
      const entry: PromptHistoryEntry = {
        id: 'test-selection',
        timestamp: Date.now(),
        serializedContent: '<[#/test.js][test.js]> Fix the bug',
        projectCwd: '/test/project'
      }

      promptHistoryManager.addPrompt(entry.serializedContent)
      historyModal.show()

      const historyItem = mockListContainer.querySelector('.history-item') as HTMLElement
      expect(historyItem).toBeTruthy()

      // Click the history item
      historyItem.click()

      // Modal should be closed after selection
      expect(mockModal.classList.contains('hidden')).toBe(true)
    })

    it('should append selected prompt to composer on Enter key', () => {
      const entry: PromptHistoryEntry = {
        id: 'test-keyboard',
        timestamp: Date.now(),
        serializedContent: 'Test keyboard selection',
        projectCwd: '/test/project'
      }

      promptHistoryManager.addPrompt(entry.serializedContent)
      historyModal.show()

      const historyItem = mockListContainer.querySelector('.history-item') as HTMLElement
      expect(historyItem).toBeTruthy()

      // Press Enter on the history item
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' })
      Object.defineProperty(enterEvent, 'preventDefault', { value: vi.fn() })
      historyItem.dispatchEvent(enterEvent)

      // Modal should be closed after selection
      expect(mockModal.classList.contains('hidden')).toBe(true)
    })

    it('should append selected prompt to composer on Space key', () => {
      const entry: PromptHistoryEntry = {
        id: 'test-space',
        timestamp: Date.now(),
        serializedContent: 'Test space selection',
        projectCwd: '/test/project'
      }

      promptHistoryManager.addPrompt(entry.serializedContent)
      historyModal.show()

      const historyItem = mockListContainer.querySelector('.history-item') as HTMLElement
      expect(historyItem).toBeTruthy()

      // Press Space on the history item
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' })
      Object.defineProperty(spaceEvent, 'preventDefault', { value: vi.fn() })
      historyItem.dispatchEvent(spaceEvent)

      // Modal should be closed after selection
      expect(mockModal.classList.contains('hidden')).toBe(true)
    })

    it('should preserve file chips and formatting when selecting prompts', () => {
      const entry: PromptHistoryEntry = {
        id: 'test-chips',
        timestamp: Date.now(),
        serializedContent: '<[#/src/main.js][main.js]> and <[#/src/utils.js][utils.js]> need refactoring',
        projectCwd: '/test/project'
      }

      promptHistoryManager.addPrompt(entry.serializedContent)
      historyModal.show()

      const historyItem = mockListContainer.querySelector('.history-item') as HTMLElement
      expect(historyItem).toBeTruthy()

      // Verify the display content contains chips
      const content = historyItem.querySelector('.history-item-content')
      expect(content?.innerHTML).toContain('composer-chip')
      expect(content?.innerHTML).toContain('main.js')
      expect(content?.innerHTML).toContain('utils.js')

      // Click the history item
      historyItem.click()

      // Modal should be closed after selection
      expect(mockModal.classList.contains('hidden')).toBe(true)
    })

    it('should handle missing composer input gracefully', () => {
      // Remove composer input
      mockComposerInput.remove()

      const entry: PromptHistoryEntry = {
        id: 'test-missing-composer',
        timestamp: Date.now(),
        serializedContent: 'Test prompt',
        projectCwd: '/test/project'
      }

      promptHistoryManager.addPrompt(entry.serializedContent)
      historyModal.show()

      const historyItem = mockListContainer.querySelector('.history-item') as HTMLElement
      expect(historyItem).toBeTruthy()

      // Mock console.error to verify error handling
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

      // Click should not throw error
      expect(() => historyItem.click()).not.toThrow()

      // Should log error about missing composer
      expect(consoleSpy).toHaveBeenCalledWith('Composer input not found, cannot paste history item')

      consoleSpy.mockRestore()
    })

    it('should handle selection errors gracefully', () => {
      const entry: PromptHistoryEntry = {
        id: 'test-error',
        timestamp: Date.now(),
        serializedContent: 'Test error handling',
        projectCwd: '/test/project'
      }

      promptHistoryManager.addPrompt(entry.serializedContent)
      historyModal.show()

      const historyItem = mockListContainer.querySelector('.history-item') as HTMLElement
      expect(historyItem).toBeTruthy()

      // Mock console.error to verify error handling
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

      // Remove the composer input to trigger the error path
      mockComposerInput.remove()

      // Click should not throw error
      expect(() => historyItem.click()).not.toThrow()

      // Should log error about missing composer (this is the expected error path)
      expect(consoleSpy).toHaveBeenCalledWith('Composer input not found, cannot paste history item')

      consoleSpy.mockRestore()
    })
  })

  describe('error handling', () => {
    it('should handle missing DOM elements gracefully', () => {
      // Remove required elements
      document.getElementById('historyModal')?.remove()

      const newModal = new HistoryModal()

      // Should not throw when trying to show
      expect(() => newModal.show()).not.toThrow()
      expect(() => newModal.hide()).not.toThrow()
    })

    it('should handle rendering errors gracefully', () => {
      // Mock console.error to verify error handling
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

      // Force an error by corrupting the history manager
      const originalGetFilteredHistory = promptHistoryManager.getFilteredHistory
      promptHistoryManager.getFilteredHistory = () => {
        throw new Error('Test error')
      }

      historyModal.show()

      expect(consoleSpy).toHaveBeenCalledWith('Failed to render history:', expect.any(Error))
      expect(mockListContainer.textContent).toContain('Failed to load history')

      // Restore
      promptHistoryManager.getFilteredHistory = originalGetFilteredHistory
      consoleSpy.mockRestore()
    })
  })
})