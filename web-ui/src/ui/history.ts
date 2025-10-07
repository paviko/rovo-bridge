// Prompt History Management
// Handles in-memory cache of prompt history with project-based filtering

import {state} from './state'

export interface PromptHistoryEntry {
  id: string
  timestamp: number
  serializedContent: string // Clipboard-compatible format
  projectCwd: string
}

export interface HistoryFilter {
  projectCwd?: string
  showAllProjects: boolean
  searchText?: string
}

export class PromptHistoryManager {
  private cache: PromptHistoryEntry[] = []
  private currentCwd: string | null = null

  constructor() {
    // Don't initialize currentCwd here - let it fall back to boot state
  }

  /**
   * Initialize history cache from session data received during session opening
   */
  initializeFromSession(history: PromptHistoryEntry[]): void {
    try {
      // Validate input
      if (!Array.isArray(history)) {
        console.warn('Invalid history data received from session, expected array but got:', typeof history)
        this.cache = []
        return
      }

      // Filter and validate entries
      const validEntries: PromptHistoryEntry[] = []
      let invalidCount = 0

      for (const entry of history) {
        if (this.isValidHistoryEntry(entry)) {
          validEntries.push(entry)
        } else {
          invalidCount++
          console.warn('Skipping invalid history entry:', entry)
        }
      }

      this.cache = validEntries
      
      // Sort by timestamp descending (newest first) with error handling
      try {
        this.cache.sort((a, b) => b.timestamp - a.timestamp)
      } catch (sortError) {
        console.error('Failed to sort history entries:', sortError)
        // Continue with unsorted cache rather than failing completely
      }

      if (invalidCount > 0) {
        console.warn(`Filtered out ${invalidCount} invalid entries from session history`)
      }
      
      console.log(`History cache initialized with ${this.cache.length} valid entries`)
    } catch (error) {
      console.error('Failed to initialize history from session:', error)
      this.cache = []
    }
  }

  /**
   * Add a new prompt to the cache (backend sending is handled separately)
   */
  addPrompt(serializedContent: string): void {
    const entryId = this.generateId()
    this.addPromptWithId(entryId, serializedContent)
  }

  /**
   * Add a new prompt to the cache with a specific ID (for frontend/backend sync)
   */
  addPromptWithId(id: string, serializedContent: string): void {
    try {
      // Validate input parameters
      if (!serializedContent) {
        console.warn('Skipping empty prompt addition to history cache')
        return
      }

      if (!id) {
        console.warn('Empty ID provided, generating new ID')
        id = this.generateId()
      }

      const entry: PromptHistoryEntry = {
        id: id,
        timestamp: Date.now(),
        serializedContent: serializedContent || '',
        projectCwd: this.getCurrentCwd()
      }

      // Validate the created entry
      if (!this.isValidHistoryEntry(entry)) {
        console.error('Generated invalid history entry, skipping:', entry)
        return
      }

      // Add to cache at the beginning (newest first)
      this.cache.unshift(entry)

      // Implement cache size limit to prevent memory issues
      const maxCacheSize = 5000
      if (this.cache.length > maxCacheSize) {
        const removed = this.cache.splice(maxCacheSize)
        console.log(`Trimmed history cache to ${maxCacheSize} entries (removed ${removed.length} oldest entries)`)
      }

      console.log('Added prompt to history cache:', entry.id, `(cache size: ${this.cache.length})`)
    } catch (error) {
      console.error('Failed to add prompt to history cache:', error)
      // Don't throw - this should not break the main application flow
    }
  }

  /**
   * Get filtered history for display
   */
  getFilteredHistory(filter: HistoryFilter): PromptHistoryEntry[] {
    try {
      // Validate filter parameter
      if (!filter || typeof filter !== 'object') {
        console.warn('Invalid filter provided to getFilteredHistory, using default')
        filter = { showAllProjects: false }
      }

      let entries = [...this.cache]

      // Filter by project if not showing all
      if (!filter.showAllProjects) {
        const targetCwd = filter.projectCwd || this.getCurrentCwd()
        if (targetCwd) {
          entries = entries.filter(entry => {
            try {
              return this.isProjectMatch(entry.projectCwd, targetCwd)
            } catch (entryError) {
              console.warn('Error processing history entry during project filtering:', entryError, entry)
              return false
            }
          })
        } else {
          console.warn('No target CWD available for filtering, showing all entries')
        }
      }

      // Filter by search text if provided
      if (filter.searchText && filter.searchText.trim()) {
        const searchLower = filter.searchText.trim().toLowerCase()
        entries = entries.filter(entry => {
          try {
            // Search in serialized content (convert HTML to plain text for searching)
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = entry.serializedContent
            const textContent = tempDiv.textContent || tempDiv.innerText || ''
            return textContent.toLowerCase().includes(searchLower)
          } catch (searchError) {
            console.warn('Error processing history entry during text filtering:', searchError, entry)
            return false
          }
        })
      }

      return entries
    } catch (error) {
      console.error('Failed to filter history:', error)
      // Return empty array rather than throwing to prevent UI breakage
      return []
    }
  }

  /**
   * Get current project working directory
   */
  getCurrentCwd(): string {
    try {
      // Return current CWD if explicitly set, otherwise fall back to boot state
      if (this.currentCwd !== null) {
        return this.currentCwd
      }
      return state.boot?.cwd || ''
    } catch (error) {
      console.warn('Error getting current CWD:', error)
      return ''
    }
  }

  /**
   * Update current working directory
   */
  updateCurrentCwd(cwd: string): void {
    try {
      if (typeof cwd === 'string') {
        this.currentCwd = cwd
      } else {
        console.warn('Invalid CWD provided to updateCurrentCwd:', cwd)
      }
    } catch (error) {
      console.error('Error updating current CWD:', error)
    }
  }

  /**
   * Get total number of cached entries
   */
  getCacheSize(): number {
    try {
      return this.cache.length
    } catch (error) {
      console.error('Error getting cache size:', error)
      return 0
    }
  }

  /**
   * Remove a prompt from the cache and send removal message to backend
   */
  removePrompt(id: string): void {
    try {
      // Validate input
      if (!id || typeof id !== 'string') {
        console.warn('Invalid prompt ID provided for removal:', id)
        return
      }

      // Find and remove from cache
      const initialLength = this.cache.length
      this.cache = this.cache.filter(entry => entry.id !== id)
      
      if (this.cache.length === initialLength) {
        console.warn('Prompt ID not found in cache for removal:', id)
        // Still send to backend in case it exists there but not in cache
      } else {
        console.log('Removed prompt from cache:', id, `(cache size: ${this.cache.length})`)
      }

      // Send removal message to backend
      this.sendRemovalToBackend(id)
    } catch (error) {
      console.error('Failed to remove prompt from cache:', error)
      // Don't throw - this should not break the main application flow
    }
  }

  /**
   * Clear the entire cache (for testing or reset purposes)
   */
  clearCache(): void {
    try {
      this.cache = []
      console.log('History cache cleared')
    } catch (error) {
      console.error('Error clearing history cache:', error)
    }
  }

  /**
   * Generate a unique ID for history entries
   */
  private generateId(): string {
    try {
      return `hist_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    } catch (error) {
      console.error('Error generating history ID:', error)
      return `hist_${Date.now()}_fallback`
    }
  }

  /**
   * Check if two project paths match (exact match or parent/child relationship)
   */
  private isProjectMatch(entryCwd: string, currentCwd: string): boolean {
    try {
      if (!entryCwd || !currentCwd) {
        return true // If either is empty, include the entry
      }

      // Normalize paths (remove trailing slashes)
      const normalizeP = (p: string) => p.replace(/\/+$/, '') || '/'
      const entryPath = normalizeP(entryCwd)
      const currentPath = normalizeP(currentCwd)

      // Exact match
      if (entryPath === currentPath) {
        return true
      }

      // Check if current directory is a subdirectory of entry's project
      if (currentPath.startsWith(entryPath + '/')) {
        return true
      }

      // Check if entry's project is a subdirectory of current directory
      if (entryPath.startsWith(currentPath + '/')) {
        return true
      }

      return false
    } catch (error) {
      console.warn('Error in project path matching:', error, { entryCwd, currentCwd })
      return true // Include entry on error to avoid losing data
    }
  }


  /**
   * Send removal message to backend via WebSocket
   */
  private sendRemovalToBackend(id: string): void {
    try {
      if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
        const message = {
          type: 'removePrompt',
          promptId: id
        }
        
        state.currentWs.send(JSON.stringify(message))
        console.log('Sent prompt removal message to backend:', id)
      } else {
        console.warn('WebSocket not available for sending prompt removal:', id)
      }
    } catch (error) {
      console.error('Failed to send removal message to backend:', error)
    }
  }

  /**
   * Validate that a history entry has all required fields and valid data
   */
  private isValidHistoryEntry(entry: any): entry is PromptHistoryEntry {
    try {
      return (
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        entry.id.length > 0 &&
        typeof entry.timestamp === 'number' &&
        entry.timestamp > 0 &&
        typeof entry.serializedContent === 'string' &&
        typeof entry.projectCwd === 'string'
      )
    } catch (error) {
      console.warn('Error validating history entry:', error)
      return false
    }
  }
}

// Global instance
export const promptHistoryManager = new PromptHistoryManager()
