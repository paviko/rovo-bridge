// History Modal UI Implementation
// Handles the full-screen history modal interface

import {type HistoryFilter, type PromptHistoryEntry, promptHistoryManager} from './history'
import {pasteWithMarkupParsing} from './composer/clipboard'
import {focusComposerInput, getComposerInput} from './focus'

export class HistoryModal {
  private modal: HTMLElement | null = null
  private listContainer: HTMLElement | null = null
  private showAllCheckbox: HTMLInputElement | null = null
  private searchInput: HTMLInputElement | null = null
  private searchClearBtn: HTMLButtonElement | null = null
  private isOpen = false
  private isRenderingHistory = false

  constructor() {
    this.initializeElements()
    this.setupEventListeners()
  }

  /**
   * Show the history modal
   */
  show(): void {
    if (this.isOpen || !this.modal) {
      if (!this.modal) {
        console.error('Cannot show history modal: modal element not found')
      }
      return
    }

    try {
      this.isOpen = true
      this.modal.classList.remove('hidden')

      // Render history with error handling
      try {
        this.renderHistory()
      } catch (renderError) {
        console.error('Failed to render history during modal show:', renderError)
        this.renderErrorState()
      }

      // Focus search input by default, or first history item if search has text
      setTimeout(() => {
        try {
          if (this.searchInput?.value) {
            // If search has text, focus first item
            const firstItem = this.listContainer?.querySelector('.history-item') as HTMLElement
            if (firstItem) {
              firstItem.focus()
            } else {
              this.searchInput.focus()
            }
          } else {
            // Otherwise, focus search input for easy filtering
            this.searchInput?.focus()
          }
        } catch (focusError) {
          console.warn('Failed to set initial focus in history modal:', focusError)
        }
      }, 50)

      // Prevent body scrolling with error handling
      try {
        document.body.style.overflow = 'hidden'
      } catch (styleError) {
        console.warn('Failed to prevent body scrolling:', styleError)
      }

      console.log('History modal opened successfully')
    } catch (error) {
      console.error('Failed to show history modal:', error)
      this.isOpen = false
      this.hide()
    }
  }

  /**
   * Hide the history modal
   */
  hide(): void {
    if (!this.isOpen || !this.modal) return

    try {
      this.isOpen = false
      this.modal.classList.add('hidden')

      // Restore body scrolling
      document.body.style.overflow = ''

      // Return focus to composer
      focusComposerInput()

      console.log('History modal closed')
    } catch (error) {
      console.error('Failed to hide history modal:', error)
    }
  }

  /**
   * Toggle modal visibility
   */
  toggle(): void {
    if (this.isOpen) {
      this.hide()
    } else {
      this.show()
    }
  }

  /**
   * Initialize DOM elements
   */
  private initializeElements(): void {
    this.modal = document.getElementById('historyModal')
    this.listContainer = document.getElementById('historyList')
    this.showAllCheckbox = document.getElementById('historyShowAll') as HTMLInputElement
    this.searchInput = document.getElementById('historySearchInput') as HTMLInputElement
    this.searchClearBtn = document.getElementById('historySearchClear') as HTMLButtonElement

    if (!this.modal || !this.listContainer || !this.showAllCheckbox || !this.searchInput || !this.searchClearBtn) {
      console.error('History modal elements not found in DOM')
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (!this.modal) return

    // Close button
    const closeBtn = document.getElementById('historyCloseBtn')
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide())
    }

    // Backdrop click to close
    const backdrop = this.modal.querySelector('.history-modal-backdrop')
    if (backdrop) {
      backdrop.addEventListener('click', () => this.hide())
    }

    // Keyboard navigation
    document.addEventListener('keydown', (event) => {
      if (!this.isOpen) return

      if (event.key === 'Escape') {
        event.preventDefault()
        this.hide()
        return
      }

      // Arrow key navigation between history items
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        this.navigateHistoryItems(event.key === 'ArrowDown' ? 1 : -1)
      }
    })

    // Filter toggle with immediate re-render
    if (this.showAllCheckbox) {
      this.showAllCheckbox.addEventListener('change', () => {
        console.log('Filter toggled:', this.showAllCheckbox?.checked ? 'all projects' : 'current project')
        this.renderHistory()

        // Focus first item after filter change
        setTimeout(() => {
          const firstItem = this.listContainer?.querySelector('.history-item') as HTMLElement
          if (firstItem) {
            firstItem.focus()
          }
        }, 50)
      })
    }

    // Search input with debounced filtering
    if (this.searchInput) {
      let searchTimeout: number | null = null
      // If blur happens while we are re-rendering the list (e.g., scrollbar toggles),
      // immediately restore focus to keep typing uninterrupted.
      this.searchInput.addEventListener('blur', () => {
        if (this.isOpen && this.isRenderingHistory && this.searchInput) {
          // minimal delay to let blur finish, then refocus
          setTimeout(() => this.searchInput?.focus({ preventScroll: true }), 0)
        }
      })
      this.searchInput.addEventListener('input', () => {
        // Show/hide clear button
        if (this.searchClearBtn) {
          this.searchClearBtn.style.display = this.searchInput?.value ? 'flex' : 'none'
        }

        // Capture current focus and caret to restore after re-render
        const hadFocus = document.activeElement === this.searchInput
        const selStart = this.searchInput?.selectionStart ?? undefined
        const selEnd = this.searchInput?.selectionEnd ?? selStart

        // Debounce the search to avoid excessive re-renders
        if (searchTimeout !== null) {
          clearTimeout(searchTimeout)
        }
        searchTimeout = window.setTimeout(() => {
          console.log('Search query:', this.searchInput?.value)
          this.renderHistory()
          // Restore focus and caret after rendering and layout reflow
          // Use requestAnimationFrame to wait for layout to complete (especially scrollbar changes)
          requestAnimationFrame(() => {
            // One more frame to ensure painting with new scrollbar state is done
            requestAnimationFrame(() => {
              if (hadFocus && this.searchInput) {
                try {
                  this.searchInput.focus({ preventScroll: true })
                  // If caret positions are known, restore them
                  if (selStart !== undefined && selEnd !== undefined) {
                    this.searchInput.setSelectionRange(selStart, selEnd)
                  }
                } catch {
                  // no-op: best-effort focus restore
                }
              }
            })
          })
        }, 300)
      })
    }

    // Clear button
    if (this.searchClearBtn) {
      this.searchClearBtn.addEventListener('click', () => {
        if (this.searchInput) {
          this.searchInput.value = ''
          this.searchClearBtn!.style.display = 'none'
          this.searchInput.focus()
          this.renderHistory()
        }
      })
    }

    // Prevent modal content clicks from closing modal
    const modalContent = this.modal.querySelector('.history-modal-content')
    if (modalContent) {
      modalContent.addEventListener('click', (event) => {
        event.stopPropagation()
      })
    }
  }

  /**
   * Navigate between history items with keyboard
   */
  private navigateHistoryItems(direction: number): void {
    if (!this.listContainer) return

    const items = Array.from(this.listContainer.querySelectorAll('.history-item')) as HTMLElement[]
    if (items.length === 0) return

    const currentFocused = document.activeElement as HTMLElement
    let currentIndex = -1

    // Find current index - check if focused element is a history item or its child
    for (let i = 0; i < items.length; i++) {
      if (items[i] === currentFocused || items[i].contains(currentFocused)) {
        currentIndex = i
        break
      }
    }

    let nextIndex: number
    if (currentIndex === -1) {
      // No item focused, focus first or last based on direction
      nextIndex = direction > 0 ? 0 : items.length - 1
    } else {
      // Move to next/previous item
      nextIndex = currentIndex + direction
      if (nextIndex < 0) nextIndex = items.length - 1
      if (nextIndex >= items.length) nextIndex = 0
    }

    items[nextIndex]?.focus()
  }

  /**
   * Remove a history item
   */
  private removeHistoryItem(entry: PromptHistoryEntry): void {
    try {
      // Validate entry
      if (!entry || !entry.id) {
        console.error('Invalid history entry for removal:', entry)
        return
      }

      // Remove from history manager (this will also send to backend)
      promptHistoryManager.removePrompt(entry.id)

      // Re-render the history list to reflect the removal
      this.renderHistory()

      // Focus the first item after removal, or the filter checkbox if no items
      setTimeout(() => {
        const firstItem = this.listContainer?.querySelector('.history-item') as HTMLElement
        if (firstItem) {
          firstItem.focus()
        } else if (this.showAllCheckbox) {
          this.showAllCheckbox.focus()
        }
      }, 50)

      console.log('Successfully removed history item:', entry.id)
    } catch (error) {
      console.error('Failed to remove history item:', error)
    }
  }

  /**
   * Render the history list
   */
  private renderHistory(): void {
    if (!this.listContainer || !this.showAllCheckbox) return

    try {
      this.isRenderingHistory = true
      const filter: HistoryFilter = {
        showAllProjects: this.showAllCheckbox.checked,
        searchText: this.searchInput?.value || ''
      }

      let entries = promptHistoryManager.getFilteredHistory(filter)

      // Sort entries in reverse chronological order (newest first)
      entries = entries.sort((a, b) => b.timestamp - a.timestamp)

      // Clear existing content
      this.listContainer.innerHTML = ''

      if (entries.length === 0) {
        this.renderEmptyState()
        return
      }

      // Create document fragment for efficient DOM manipulation
      const fragment = document.createDocumentFragment()

      // Render each entry
      entries.forEach(entry => {
        const itemElement = this.createHistoryItem(entry)
        fragment.appendChild(itemElement)
      })

      // Append all items at once
      this.listContainer.appendChild(fragment)

      console.log(`Rendered ${entries.length} history entries in reverse chronological order`)
    } catch (error) {
      console.error('Failed to render history:', error)
      this.renderErrorState()
    } finally {
      this.isRenderingHistory = false
    }
  }

  /**
   * Create a history item element
   */
  private createHistoryItem(entry: PromptHistoryEntry): HTMLElement {
    // Restore original structure: single button element as the main card
    const item = document.createElement('button')
    item.className = 'history-item'
    item.setAttribute('data-entry-id', entry.id)
    item.style.cssText = `
      position: relative;
      border-radius: 0;
    `

    // Content container with 75px max height (restored original)
    const content = document.createElement('div')
    content.className = 'history-item-content'

    // Render HTML content (preserving chips and formatting)
    pasteWithMarkupParsing(content, entry.serializedContent)

    // Check for truncation after DOM insertion
    requestAnimationFrame(() => {
      this.checkAndApplyTruncation(content)
    })

    // Metadata overlay (always visible project name and timestamp) - replaces bottom row
    const projectName = this.getProjectDisplayName(entry.projectCwd)
    const metaOverlay = document.createElement('div')
    metaOverlay.className = 'history-item-meta-overlay'
    metaOverlay.textContent = `${projectName}, ${this.formatTimestamp(entry.timestamp)}`
    metaOverlay.title = entry.projectCwd || 'Unknown project'
    metaOverlay.style.cssText = `
      position: absolute;
      top: 8px;
      right: 32px;
      font-size: 11px;
      color: #888;
      background: rgba(255, 255, 255, 0.9);
      padding: 2px 6px;
      border-radius: 3px;
      z-index: 1;
      pointer-events: none;
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `

    // Add content and overlay to the main button (no bottom metadata row)
    item.appendChild(content)
    item.appendChild(metaOverlay)

    // Remove button as overlay
    const removeBtn = document.createElement('button')
    removeBtn.className = 'history-item-remove'
    removeBtn.innerHTML = '×'
    removeBtn.title = 'Remove prompt'
    removeBtn.setAttribute('tabindex', '0')
    removeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      width: 20px;
      height: 20px;
      border: none;
      background: rgba(0, 0, 0, 0.1);
      color: #666;
      border-radius: 0;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s, background-color 0.2s;
      z-index: 2;
    `

    // Show remove button on hover/focus (metadata overlay is always visible)
    item.addEventListener('mouseenter', () => {
      removeBtn.style.opacity = '1'
    })
    item.addEventListener('mouseleave', () => {
      removeBtn.style.opacity = '0'
    })
    item.addEventListener('focusin', () => {
      removeBtn.style.opacity = '1'
    })
    item.addEventListener('focusout', (event) => {
      // Only hide if focus is moving outside the item
      if (!item.contains(event.relatedTarget as Node)) {
        removeBtn.style.opacity = '0'
      }
    })

    // Remove button hover effects
    removeBtn.addEventListener('mouseenter', () => {
      removeBtn.style.backgroundColor = 'rgba(231, 76, 60, 0.2)'
      removeBtn.style.color = '#e74c3c'
    })
    removeBtn.addEventListener('mouseleave', () => {
      removeBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.1)'
      removeBtn.style.color = '#666'
    })

    // Remove button click handler
    removeBtn.addEventListener('click', (event) => {
      event.stopPropagation()
      event.preventDefault()
      this.removeHistoryItem(entry)
    })

    // Remove button keyboard handler
    removeBtn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.stopPropagation()
        event.preventDefault()
        this.removeHistoryItem(entry)
      }
    })

    // Add remove button as overlay
    item.appendChild(removeBtn)

    // Click handler for prompt selection (on the main button)
    item.addEventListener('click', (event) => {
      // Don't trigger selection if clicking the remove button
      if (event.target === removeBtn) {
        return
      }
      this.selectHistoryItem(entry)
    })

    // Keyboard navigation for selection
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        // Don't trigger selection if remove button is focused
        if (document.activeElement === removeBtn) {
          return
        }
        event.preventDefault()
        this.selectHistoryItem(entry)
      }
    })

    return item
  }

  /**
   * Check if content overflows 75px and apply truncation styling
   */
  private checkAndApplyTruncation(contentElement: HTMLElement): void {
    const maxHeight = 75

    if (contentElement.scrollHeight > maxHeight) {
      contentElement.classList.add('truncated')

      // Add visual truncation indicator
      const indicator = document.createElement('span')
      indicator.className = 'truncation-indicator'
      indicator.textContent = '...'
      indicator.style.cssText = `
        position: absolute;
        bottom: 0;
        right: 0;
        background: white;
        color: #666;
        font-weight: 500;
        padding-left: 4px;
        z-index: 1;
      `

      contentElement.style.position = 'relative'
      contentElement.appendChild(indicator)
    }
  }

  /**
   * Get display name for project path
   */
  private getProjectDisplayName(projectCwd: string | undefined): string {
    if (!projectCwd) return 'Unknown project'

    // Extract just the project folder name from the full path
    const parts = projectCwd.split('/')
    const projectName = parts[parts.length - 1] || parts[parts.length - 2] || 'Root'

    return projectName
  }

  /**
   * Handle history item selection
   */
  private selectHistoryItem(entry: PromptHistoryEntry): void {
    try {
      // Validate entry
      if (!entry || !entry.serializedContent) {
        console.error('Invalid history entry for selection:', entry)
        return
      }

      const composerInput = getComposerInput()
      if (!composerInput) {
        console.error('Composer input not found, cannot paste history item')
        return
      }

      // Use existing clipboard paste logic for consistency with error handling
      try {
        pasteWithMarkupParsing(composerInput, entry.serializedContent)
      } catch (pasteError) {
        console.error('Failed to paste history content to composer:', pasteError)
        // Try fallback: direct text insertion
        try {
          composerInput.textContent = (composerInput.textContent || '') + entry.serializedContent
        } catch (fallbackError) {
          console.error('Fallback paste also failed:', fallbackError)
          return
        }
      }

      // Close modal and focus composer
      this.hide()

      console.log('Successfully selected history item:', entry.id)
    } catch (error) {
      console.error('Failed to select history item:', error)
      // Don't close modal on error so user can try again
    }
  }

  /**
   * Render empty state
   */
  private renderEmptyState(): void {
    if (!this.listContainer) return

    const emptyState = document.createElement('div')
    emptyState.className = 'history-empty-state'
    emptyState.style.cssText = `
      text-align: center;
      padding: 60px 20px;
      color: #666;
      font: 14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    `

    const currentProject = promptHistoryManager.getCurrentCwd()
    const projectName = this.getProjectDisplayName(currentProject)
    const hasSearchText = this.searchInput?.value?.trim()

    let message: string
    let suggestion: string

    if (hasSearchText) {
      message = 'No prompts match your search'
      suggestion = 'Try a different search term or clear the search to see all prompts.'
    } else if (this.showAllCheckbox?.checked) {
      message = 'No prompts in history yet'
      suggestion = 'Send your first prompt to start building your history!'
    } else {
      message = `No prompts found for "${projectName}"`
      suggestion = 'Try toggling "Show all projects" to see prompts from other projects.'
    }

    const messageEl = document.createElement('div')
    messageEl.textContent = message
    messageEl.style.marginBottom = '8px'
    messageEl.style.fontWeight = '500'

    const suggestionEl = document.createElement('div')
    suggestionEl.textContent = suggestion
    suggestionEl.style.fontSize = '13px'
    suggestionEl.style.opacity = '0.8'

    emptyState.appendChild(messageEl)
    emptyState.appendChild(suggestionEl)

    this.listContainer.appendChild(emptyState)
  }

  /**
   * Render error state
   */
  private renderErrorState(): void {
    if (!this.listContainer) return

    try {
      // Clear existing content
      this.listContainer.innerHTML = ''

      const errorState = document.createElement('div')
      errorState.className = 'history-error-state'
      errorState.style.cssText = `
        text-align: center;
        padding: 40px 20px;
        color: #e74c3c;
        font: 14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      `

      const errorIcon = document.createElement('div')
      errorIcon.style.cssText = `
        font-size: 24px;
        margin-bottom: 12px;
      `
      errorIcon.textContent = '⚠️'

      const errorMessage = document.createElement('div')
      errorMessage.style.cssText = `
        font-weight: 500;
        margin-bottom: 8px;
      `
      errorMessage.textContent = 'Failed to load history'

      const errorSuggestion = document.createElement('div')
      errorSuggestion.style.cssText = `
        font-size: 13px;
        opacity: 0.8;
      `
      errorSuggestion.textContent = 'Try closing and reopening the history modal'

      errorState.appendChild(errorIcon)
      errorState.appendChild(errorMessage)
      errorState.appendChild(errorSuggestion)

      this.listContainer.appendChild(errorState)
    } catch (error) {
      console.error('Failed to render error state:', error)
      // Fallback: just set text content
      if (this.listContainer) {
        this.listContainer.textContent = 'Error loading history'
      }
    }
  }

  /**
   * Format timestamp for display
   */
  private formatTimestamp(timestamp: number): string {
    try {
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        // Today - show time
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      } else if (diffDays === 1) {
        // Yesterday
        return 'Yesterday'
      } else if (diffDays < 7) {
        // This week - show day name
        return date.toLocaleDateString([], { weekday: 'short' })
      } else {
        // Older - show date
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
      }
    } catch (error) {
      console.error('Failed to format timestamp:', error)
      return 'Unknown'
    }
  }
}

// Global instance
export const historyModal = new HistoryModal()