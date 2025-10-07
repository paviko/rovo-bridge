/**
 * Custom Undo/Redo Manager for the Composer
 * Handles complex contentEditable states including chips, cursor positions, and formatted content
 */

export interface ComposerState {
  html: string
  cursorPosition: CursorPosition | null
  timestamp: number
}

export interface CursorPosition {
  nodeIndex: number[]  // Path to the node from root
  offset: number
  isCollapsed: boolean
  // For non-collapsed selections
  endNodeIndex?: number[]
  endOffset?: number
}

export class UndoRedoManager {
  private undoStack: ComposerState[] = []
  private redoStack: ComposerState[] = []
  private lastSavedState: string = ''
  private lastSavedCursorPosition: CursorPosition | null = null
  private lastActivityTime: number = 0
  private saveTimeout: number | null = null
  private readonly maxStackSize: number = 100
  private readonly debounceMs: number = 500
  public isApplyingState: boolean = false
  private inputEl: HTMLElement | null = null
  private isTracking: boolean = true
  private hasUnsavedChanges: boolean = false
  private isInsertingChip: boolean = false

  constructor(inputEl: HTMLElement) {
    this.inputEl = inputEl
    this.setupKeyboardHandlers()
  }

  /**
   * Save the current state of the composer
   */
  private captureState(): ComposerState | null {
    if (!this.inputEl) return null

    const cursorPos = this.getCursorPosition()
    return {
      html: this.inputEl.innerHTML,
      cursorPosition: cursorPos,
      timestamp: Date.now()
    }
  }

  /**
   * Get current cursor/selection position
   */
  private getCursorPosition(): CursorPosition | null {
    try {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !this.inputEl) return null

      const range = sel.getRangeAt(0)
      if (!this.inputEl.contains(range.commonAncestorContainer)) return null

      const startPath = this.getNodePath(range.startContainer)
      const endPath = this.getNodePath(range.endContainer)

      if (!startPath) return null

      return {
        nodeIndex: startPath,
        offset: range.startOffset,
        isCollapsed: range.collapsed,
        endNodeIndex: range.collapsed ? undefined : endPath || undefined,
        endOffset: range.collapsed ? undefined : range.endOffset
      }
    } catch (e) {
      console.warn('[UndoRedo] Failed to get cursor position:', e)
      return null
    }
  }

  /**
   * Get the path from root to a node as array of child indices
   */
  private getNodePath(node: Node): number[] | null {
    if (!this.inputEl) return null

    const path: number[] = []
    let current: Node | null = node

    while (current && current !== this.inputEl) {
      const parent: Node | null = current.parentNode
      if (!parent) return null

      const index = Array.from(parent.childNodes).indexOf(current as ChildNode)
      if (index === -1) return null

      path.unshift(index)
      current = parent
    }

    return path
  }

  /**
   * Find a node by its path from root
   */
  private getNodeByPath(path: number[]): Node | null {
    if (!this.inputEl) return null

    let current: Node = this.inputEl
    for (const index of path) {
      if (!current.childNodes || index >= current.childNodes.length) {
        return null
      }
      current = current.childNodes[index]
    }
    return current
  }

  /**
   * Restore cursor/selection position
   */
  private restoreCursorPosition(position: CursorPosition): void {
    if (!position || !this.inputEl) return

    try {
      const startNode = this.getNodeByPath(position.nodeIndex)
      if (!startNode) {
        // Fallback: place cursor at end
        this.placeCaretAtEnd()
        return
      }

      const sel = window.getSelection()
      if (!sel) return

      const range = document.createRange()

      // Set start position
      if (startNode.nodeType === Node.TEXT_NODE) {
        const textLength = (startNode as Text).length
        range.setStart(startNode, Math.min(position.offset, textLength))
      } else {
        const childCount = startNode.childNodes.length
        range.setStart(startNode, Math.min(position.offset, childCount))
      }

      // Set end position for non-collapsed selections
      if (!position.isCollapsed && position.endNodeIndex && position.endOffset !== undefined) {
        const endNode = this.getNodeByPath(position.endNodeIndex)
        if (endNode) {
          if (endNode.nodeType === Node.TEXT_NODE) {
            const textLength = (endNode as Text).length
            range.setEnd(endNode, Math.min(position.endOffset, textLength))
          } else {
            const childCount = endNode.childNodes.length
            range.setEnd(endNode, Math.min(position.endOffset, childCount))
          }
        } else {
          range.collapse(true)
        }
      } else {
        range.collapse(true)
      }

      sel.removeAllRanges()
      sel.addRange(range)
    } catch (e) {
      console.warn('[UndoRedo] Failed to restore cursor position:', e)
      this.placeCaretAtEnd()
    }
  }

  /**
   * Place caret at the end of the content
   */
  private placeCaretAtEnd(): void {
    if (!this.inputEl) return

    try {
      const sel = window.getSelection()
      if (!sel) return

      const range = document.createRange()
      range.selectNodeContents(this.inputEl)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    } catch (e) {
      console.warn('[UndoRedo] Failed to place caret at end:', e)
    }
  }

  /**
   * Apply a state to the composer
   */
  private applyState(state: ComposerState): void {
    if (!this.inputEl || this.isApplyingState) return

    this.isApplyingState = true
    try {
      // Restore HTML content
      this.inputEl.innerHTML = state.html

      // Restore cursor position
      if (state.cursorPosition) {
        // Small delay to ensure DOM is updated
        setTimeout(() => {
          if (state.cursorPosition) {
            this.restoreCursorPosition(state.cursorPosition)
          }
          this.isApplyingState = false
        }, 0)
      } else {
        this.isApplyingState = false
      }

      // Trigger any necessary events
      this.inputEl.dispatchEvent(new Event('input', { bubbles: true }))
    } catch (e) {
      console.error('[UndoRedo] Failed to apply state:', e)
      this.isApplyingState = false
    }
  }

  /**
   * Check if two states are different
   */
  private statesAreDifferent(state1: ComposerState | null, state2: ComposerState | null): boolean {
    if (!state1 || !state2) return true
    return state1.html !== state2.html
  }

  /**
   * Check if cursor position is significantly different
   */
  private cursorPositionChanged(pos1: CursorPosition | null, pos2: CursorPosition | null): boolean {
    if (!pos1 || !pos2) return pos1 !== pos2
    
    // Compare node paths
    if (pos1.nodeIndex.length !== pos2.nodeIndex.length) return true
    for (let i = 0; i < pos1.nodeIndex.length; i++) {
      if (pos1.nodeIndex[i] !== pos2.nodeIndex[i]) return true
    }
    
    // Compare offsets
    if (pos1.offset !== pos2.offset) return true
    
    return false
  }

  /**
   * Save current state to undo stack
   */
  private saveState(force: boolean = false): void {
    if (!this.isTracking || this.isApplyingState) return
    
    const currentState = this.captureState()
    if (!currentState) return
    
    // Don't save if content hasn't changed
    if (!force && currentState.html === this.lastSavedState) return
    
    // Add to undo stack
    this.undoStack.push(currentState)
    this.lastSavedState = currentState.html
    this.lastSavedCursorPosition = currentState.cursorPosition
    
    // Limit stack size
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift()
    }
    
    // Clear redo stack when new action is performed
    this.redoStack = []
  }

  /**
   * Handle input changes
   */
  public handleInput(): void {
    if (this.isApplyingState || !this.isTracking || this.isInsertingChip) return

    const now = Date.now()
    const timeSinceLastActivity = now - this.lastActivityTime
    
    // Clear existing timeout
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout)
    }
    
    // If this is the first input after a long pause, save the previous complete state
    if (timeSinceLastActivity > this.debounceMs && this.hasUnsavedChanges) {
      this.saveState()
      this.hasUnsavedChanges = false
    }
    
    // Mark that we have unsaved changes
    this.hasUnsavedChanges = true
    
    // Set new timeout to save state after user stops typing
    this.saveTimeout = window.setTimeout(() => {
      if (this.hasUnsavedChanges) {
        this.saveState()
        this.hasUnsavedChanges = false
      }
      this.saveTimeout = null
    }, this.debounceMs)
    
    this.lastActivityTime = now
  }

  /**
   * Perform undo
   */
  public undo(): boolean {
    // Clear any pending save
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    
    // Save current state if it's different from the last saved
    const currentState = this.captureState()
    if (currentState && currentState.html !== this.lastSavedState) {
      this.saveState(true)
    }
    
    if (this.undoStack.length === 0) {
      return false
    }
    
    // Move current state to redo stack
    const current = this.undoStack.pop()
    if (current) {
      this.redoStack.push(current)
    }
    
    // Apply previous state or clear if empty
    if (this.undoStack.length > 0) {
      const stateToApply = this.undoStack[this.undoStack.length - 1]
      this.applyState(stateToApply)
      this.lastSavedState = stateToApply.html
    } else {
      // Clear composer
      if (this.inputEl) {
        this.inputEl.innerHTML = ''
        this.lastSavedState = ''
        this.inputEl.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    
    return true
  }

  /**
   * Perform redo
   */
  public redo(): boolean {
    if (this.redoStack.length === 0) return false
    
    // Clear any pending save
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    
    const stateToApply = this.redoStack.pop()
    if (stateToApply) {
      // Save current state to undo stack only if different
      const currentState = this.captureState()
      if (currentState && currentState.html !== this.lastSavedState) {
        this.undoStack.push(currentState)
      }
      
      // Move the redo state to undo stack
      this.undoStack.push(stateToApply)
      this.lastSavedState = stateToApply.html
      
      this.applyState(stateToApply)
      return true
    }
    
    return false
  }

  /**
   * Handle cursor position changes (for clicks and arrow keys)
   */
  private handleCursorChange(): void {
    if (this.isApplyingState || !this.isTracking) return
    
    const currentCursorPosition = this.getCursorPosition()
    
    // If cursor position changed and content is the same, save a cursor position state
    if (!this.hasUnsavedChanges && 
        this.lastSavedState && 
        this.inputEl?.innerHTML === this.lastSavedState &&
        this.cursorPositionChanged(this.lastSavedCursorPosition, currentCursorPosition)) {
      
      // Create a state with same content but new cursor position
      const cursorState: ComposerState = {
        html: this.lastSavedState,
        cursorPosition: currentCursorPosition,
        timestamp: Date.now()
      }
      
      this.undoStack.push(cursorState)
      this.lastSavedCursorPosition = currentCursorPosition
      
      // Limit stack size
      if (this.undoStack.length > this.maxStackSize) {
        this.undoStack.shift()
      }
      
      // Clear redo stack when new action is performed
      this.redoStack = []
    }
  }

  /**
   * Setup keyboard handlers for undo/redo
   */
  private setupKeyboardHandlers(): void {
    if (!this.inputEl) return

    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
      const modKey = isMac ? e.metaKey : e.ctrlKey

      // Handle undo
      if (modKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        this.undo()
        return
      }

      // Handle redo
      if ((modKey && e.key === 'z' && e.shiftKey) || 
          (modKey && e.key === 'y')) {
        e.preventDefault()
        this.redo()
        return
      }

      // Track cursor movement keys
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
        setTimeout(() => this.handleCursorChange(), 0)
      }
    })

    // Track mouse clicks for cursor position changes
    this.inputEl.addEventListener('mouseup', () => {
      if (!this.isApplyingState) {
        setTimeout(() => this.handleCursorChange(), 0)
      }
    })

    // Track all input events
    this.inputEl.addEventListener('input', () => {
      if (!this.isApplyingState) {
        this.handleInput()
      }
    })

    // Also track paste and cut events
    this.inputEl.addEventListener('paste', () => {
      if (!this.isApplyingState) {
        setTimeout(() => this.handleInput(), 10)
      }
    })

    this.inputEl.addEventListener('cut', () => {
      if (!this.isApplyingState) {
        setTimeout(() => this.handleInput(), 10)
      }
    })
  }

  /**
   * Initialize with current or empty state
   */
  public initialize(): void {
    this.undoStack = []
    this.redoStack = []
    this.lastSavedState = this.inputEl?.innerHTML || ''
    this.lastSavedCursorPosition = this.getCursorPosition()
    this.lastActivityTime = Date.now()
    this.isTracking = true
    this.hasUnsavedChanges = false
    
    // Save initial state if not empty
    const initialState = this.captureState()
    if (initialState && initialState.html) {
      this.undoStack.push(initialState)
    }
  }

  /**
   * Clear all history
   */
  public clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.lastSavedState = ''
    this.lastSavedCursorPosition = null
    this.lastActivityTime = Date.now()
    this.hasUnsavedChanges = false
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
  }
  
  /**
   * Start chip insertion mode
   */
  public startChipInsertion(): void {
    // Save any pending changes before chip insertion
    if (this.hasUnsavedChanges) {
      this.saveState(true)
      this.hasUnsavedChanges = false
    }
    this.isInsertingChip = true
  }

  /**
   * End chip insertion mode and save the final state
   */
  public endChipInsertion(): void {
    this.isInsertingChip = false
    // Force save the state with the chip
    setTimeout(() => {
      this.saveState(true)
    }, 10)
  }

  /**
   * Force save current state (useful for programmatic changes like chip insertion)
   */
  public forceSave(): void {
    // Only save if there are actual unsaved changes
    if (this.hasUnsavedChanges) {
      this.saveState(true)
      this.hasUnsavedChanges = false
    }
  }

  /**
   * Get statistics about the undo/redo stacks
   */
  public getStats(): { undoCount: number, redoCount: number } {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length
    }
  }
}
