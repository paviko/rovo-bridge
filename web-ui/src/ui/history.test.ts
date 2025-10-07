// Unit tests for PromptHistoryManager

import {beforeEach, describe, expect, it, vi} from 'vitest'
import {type HistoryFilter, type PromptHistoryEntry, PromptHistoryManager} from './history'
import {state} from './state'

// Mock the state module
vi.mock('./state', () => ({
  state: {
    boot: { cwd: '/test/project' },
    currentWs: null,
    historyInitialized: false
  }
}))

describe('PromptHistoryManager', () => {
  let manager: PromptHistoryManager
  
  beforeEach(() => {
    manager = new PromptHistoryManager()
    // Reset state
    state.boot = { cwd: '/test/project' }
    state.currentWs = null
    state.historyInitialized = false
  })

  describe('initialization', () => {
    it('should initialize with empty cache', () => {
      expect(manager.getCacheSize()).toBe(0)
    })

    it('should get current CWD from boot state', () => {
      expect(manager.getCurrentCwd()).toBe('/test/project')
    })

    it('should handle missing boot CWD gracefully', () => {
      state.boot = {}
      const newManager = new PromptHistoryManager()
      expect(newManager.getCurrentCwd()).toBe('')
    })
  })

  describe('initializeFromSession', () => {
    it('should initialize cache from session data', () => {
      const historyData: PromptHistoryEntry[] = [
        {
          id: 'test1',
          timestamp: 1000,
          serializedContent: 'Test 1',
          projectCwd: '/test/project'
        },
        {
          id: 'test2',
          timestamp: 2000,
          serializedContent: 'Test 2',
          projectCwd: '/test/project'
        }
      ]

      manager.initializeFromSession(historyData)
      expect(manager.getCacheSize()).toBe(2)
    })

    it('should sort entries by timestamp descending', () => {
      const historyData: PromptHistoryEntry[] = [
        {
          id: 'older',
          timestamp: 1000,
          serializedContent: 'Older',
          projectCwd: '/test'
        },
        {
          id: 'newer',
          timestamp: 2000,
          serializedContent: 'Newer',
          projectCwd: '/test'
        }
      ]

      manager.initializeFromSession(historyData)
      const filtered = manager.getFilteredHistory({ showAllProjects: true })
      expect(filtered[0].id).toBe('newer')
      expect(filtered[1].id).toBe('older')
    })

    it('should handle invalid session data gracefully', () => {
      manager.initializeFromSession(null as any)
      expect(manager.getCacheSize()).toBe(0)

      manager.initializeFromSession('invalid' as any)
      expect(manager.getCacheSize()).toBe(0)
    })
  })

  describe('addPrompt', () => {
    it('should add prompt to cache', () => {
      manager.addPrompt('Test')
      expect(manager.getCacheSize()).toBe(1)
    })

    it('should add prompt at beginning (newest first)', () => {
      manager.addPrompt('First')
      manager.addPrompt('Second')
      
      const filtered = manager.getFilteredHistory({ showAllProjects: true })
      expect(filtered[0].serializedContent).toBe('Second')
      expect(filtered[1].serializedContent).toBe('First')
    })

    it('should generate unique IDs', () => {
      manager.addPrompt('Test 1')
      manager.addPrompt('Test 2')
      
      const filtered = manager.getFilteredHistory({ showAllProjects: true })
      expect(filtered[0].id).not.toBe(filtered[1].id)
    })

    it('should handle errors gracefully', () => {
      // Mock console.error to avoid test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      // This should not throw
      expect(() => {
        manager.addPrompt(null as any)
      }).not.toThrow()
      
      consoleSpy.mockRestore()
    })
  })

  describe('getFilteredHistory', () => {
    beforeEach(() => {
      const historyData: PromptHistoryEntry[] = [
        {
          id: 'project1',
          timestamp: 3000,
          serializedContent: 'Project 1',
          projectCwd: '/test/project'
        },
        {
          id: 'project2',
          timestamp: 2000,
          serializedContent: 'Project 2',
          projectCwd: '/other/project'
        },
        {
          id: 'subproject',
          timestamp: 1000,
          serializedContent: 'Subproject',
          projectCwd: '/test/project/sub'
        }
      ]
      manager.initializeFromSession(historyData)
    })

    it('should return all entries when showAllProjects is true', () => {
      const filter: HistoryFilter = { showAllProjects: true }
      const result = manager.getFilteredHistory(filter)
      expect(result.length).toBe(3)
    })

    it('should filter by current project when showAllProjects is false', () => {
      const filter: HistoryFilter = { showAllProjects: false }
      const result = manager.getFilteredHistory(filter)
      // Should include entries from /test/project and /test/project/sub
      expect(result.length).toBe(2)
      expect(result.some(e => e.id === 'project1')).toBe(true)
      expect(result.some(e => e.id === 'subproject')).toBe(true)
    })

    it('should filter by specified project CWD', () => {
      const filter: HistoryFilter = { 
        projectCwd: '/other/project',
        showAllProjects: false 
      }
      const result = manager.getFilteredHistory(filter)
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('project2')
    })

    it('should handle empty CWD gracefully', () => {
      state.boot = {}
      const newManager = new PromptHistoryManager()
      newManager.initializeFromSession([{
        id: 'test',
        timestamp: 1000,
        serializedContent: 'Test',
        projectCwd: ''
      }])
      
      const filter: HistoryFilter = { showAllProjects: false }
      const result = newManager.getFilteredHistory(filter)
      expect(result.length).toBe(1)
    })

    it('should handle errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      // When passed invalid filter, should use default filter and return results
      const result = manager.getFilteredHistory(null as any)
      expect(result.length).toBeGreaterThan(0) // Should return entries with default filter
      expect(consoleSpy).toHaveBeenCalledWith('Invalid filter provided to getFilteredHistory, using default')
      
      consoleSpy.mockRestore()
    })
  })

  describe('project matching logic', () => {
    let manager: PromptHistoryManager

    beforeEach(() => {
      manager = new PromptHistoryManager()
    })

    it('should match exact paths', () => {
      manager.updateCurrentCwd('/test/project')
      manager.initializeFromSession([{
        id: 'exact',
        timestamp: 1000,
        serializedContent: 'Exact',
        projectCwd: '/test/project'
      }])

      const result = manager.getFilteredHistory({ showAllProjects: false })
      expect(result.length).toBe(1)
    })

    it('should match parent directories', () => {
      manager.updateCurrentCwd('/test/project/subdirectory')
      manager.initializeFromSession([{
        id: 'parent',
        timestamp: 1000,
        serializedContent: 'Parent',
        projectCwd: '/test/project'
      }])

      const result = manager.getFilteredHistory({ showAllProjects: false })
      expect(result.length).toBe(1)
    })

    it('should match child directories', () => {
      manager.updateCurrentCwd('/test/project')
      manager.initializeFromSession([{
        id: 'child',
        timestamp: 1000,
        serializedContent: 'Child',
        projectCwd: '/test/project/subdirectory'
      }])

      const result = manager.getFilteredHistory({ showAllProjects: false })
      expect(result.length).toBe(1)
    })

    it('should not match unrelated paths', () => {
      manager.updateCurrentCwd('/test/project')
      manager.initializeFromSession([{
        id: 'unrelated',
        timestamp: 1000,
        serializedContent: 'Unrelated',
        projectCwd: '/completely/different/path'
      }])

      const result = manager.getFilteredHistory({ showAllProjects: false })
      expect(result.length).toBe(0)
    })

    it('should handle root directory correctly', () => {
      manager.updateCurrentCwd('/')
      manager.initializeFromSession([{
        id: 'root',
        timestamp: 1000,
        serializedContent: 'Root',
        projectCwd: '/'
      }])

      const result = manager.getFilteredHistory({ showAllProjects: false })
      expect(result.length).toBe(1)
    })
  })

  describe('utility methods', () => {
    it('should update current CWD', () => {
      manager.updateCurrentCwd('/new/path')
      expect(manager.getCurrentCwd()).toBe('/new/path')
    })

    it('should handle empty CWD update', () => {
      manager.updateCurrentCwd('')
      expect(manager.getCurrentCwd()).toBe('')
    })

    it('should clear cache', () => {
      manager.addPrompt('Test')
      expect(manager.getCacheSize()).toBe(1)
      
      manager.clearCache()
      expect(manager.getCacheSize()).toBe(0)
    })

    it('should remove prompt from cache', () => {
      // Add some prompts
      manager.addPrompt('First prompt')
      manager.addPrompt('Second prompt')
      expect(manager.getCacheSize()).toBe(2)
      
      // Get the filtered history to access the entries
      const entries = manager.getFilteredHistory({ showAllProjects: true })
      expect(entries.length).toBe(2)
      
      // Remove the first entry
      const firstEntryId = entries[0].id
      manager.removePrompt(firstEntryId)
      
      // Verify it was removed
      expect(manager.getCacheSize()).toBe(1)
      const remainingEntries = manager.getFilteredHistory({ showAllProjects: true })
      expect(remainingEntries.length).toBe(1)
      expect(remainingEntries[0].id).not.toBe(firstEntryId)
    })

    it('should handle removal of non-existent prompt gracefully', () => {
      manager.addPrompt('Test prompt')
      expect(manager.getCacheSize()).toBe(1)
      
      // Try to remove non-existent ID
      manager.removePrompt('non-existent-id')
      
      // Cache should remain unchanged
      expect(manager.getCacheSize()).toBe(1)
    })
  })
})