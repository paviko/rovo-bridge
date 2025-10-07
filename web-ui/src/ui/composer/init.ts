import {getComposerEl} from '../utils'
import {getComposerInput} from '../focus'
import {sendComposer} from './send'
import {reconcileRegistryWithComposer} from './reconcile'
import {handleCopy, handlePaste} from './clipboard'
import {
  applyCurrentSelection,
  handleTriggerInput,
  hideOverlay,
  isOverlayActive,
  moveSelection,
  positionOverlay
} from './overlay'
import {extractPathsFromDrop} from '../dnd'
import {routeInsertPaths} from './route'
import {state} from '../state'
import {UndoRedoManager} from './undoredo'

// Export the undo/redo manager instance for use in other modules
export let composerUndoRedoManager: UndoRedoManager | null = null

export function initComposer(): void {
  const container = getComposerEl()
  if (!container) return
  if ((container as any).__inited) return

  // Detect macOS to choose the correct send shortcut (Cmd on macOS, Ctrl elsewhere)
  const isMac = typeof navigator !== 'undefined' && (
    (navigator.platform && navigator.platform.toLowerCase().includes('mac')) ||
    (navigator.userAgent && navigator.userAgent.toLowerCase().includes('mac'))
  )

  const input = document.createElement('div')
  input.id = 'composerInput'
  input.contentEditable = 'true'
  input.setAttribute('role', 'textbox')
  input.setAttribute('aria-multiline', 'true')
  input.className = 'composer-input'
  input.dataset.placeholder = `Type here. Enter = new line, ${isMac ? 'Cmd' : 'Ctrl'}+Enter = send.`
  container.appendChild(input)

  // Initialize undo/redo manager
  const undoRedoManager = new UndoRedoManager(input)
  undoRedoManager.initialize()
  composerUndoRedoManager = undoRedoManager
  ;(input as any).__undoRedoManager = undoRedoManager

  // DnD directly into composer
  input.addEventListener('dragover', (ev) => { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy' })
  input.addEventListener('drop', (ev) => {
    ev.preventDefault(); ev.stopPropagation()
    try {
      const paths = extractPathsFromDrop(ev as DragEvent)
      if (paths && paths.length) routeInsertPaths(paths)
    } catch {}
  })

  // Key handling: Enter inserts a normal newline in the editor. Cmd+Enter (macOS) / Ctrl+Enter (others) sends.
  input.addEventListener('keydown', (ev: KeyboardEvent) => {
    const modKey = (isMac && ev.metaKey) || (!isMac && ev.ctrlKey)
    
    // Send message with Cmd/Ctrl+Enter
    if (ev.key === 'Enter' && modKey) {
      ev.preventDefault()
      sendComposer()
      return
    }
    
    // Prevent native undo/redo - handled by UndoRedoManager
    if (modKey && (ev.key === 'z' || ev.key === 'y')) {
      // Already handled by UndoRedoManager
      return
    }
    
    // plain Enter: allow default new line behavior
  })

  // Input changes -> reconcile chips registry and track for undo/redo
  const onMutation = new MutationObserver(() => {
    reconcileRegistryWithComposer()
    // Track changes for undo/redo
    if (undoRedoManager && !(undoRedoManager as any).isApplyingState) {
      undoRedoManager.handleInput()
    }
  })
  onMutation.observe(input, { childList: true, subtree: true, characterData: true })

  // Watch composer size changes and trigger terminal resize
  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => {
      try {
        if (state.fit && state.term) {
          // Small delay to ensure layout has settled
          setTimeout(() => {
            try {
              state.fit.fit()
            } catch (e) {
              console.warn('[composer] failed to resize terminal:', e)
            }
          }, 10)
        }
      } catch (e) {
        console.warn('[composer] resize observer error:', e)
      }
    })
    resizeObserver.observe(container)
  }

  // Clipboard: encode chips into markup on copy/cut, parse on paste
  input.addEventListener('copy', handleCopy)
  input.addEventListener('cut', (e) => { 
    handleCopy(e)
    // Delete the selection after copying
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
    }
    setTimeout(() => reconcileRegistryWithComposer(), 0) 
  })
  input.addEventListener('paste', handlePaste)

  // Overlay navigation key handling (keeps focus in composer)
  input.addEventListener('keydown', (ev: KeyboardEvent) => {
    try {
      const active = isOverlayActive()
      if (!active) return
      if (ev.key === 'ArrowDown' || ev.key === 'Down') { ev.preventDefault(); moveSelection(1); return }
      if (ev.key === 'ArrowUp' || ev.key === 'Up') { ev.preventDefault(); moveSelection(-1); return }
      if (ev.key === 'Enter') { ev.preventDefault(); applyCurrentSelection(); return }
      if (ev.key === 'Escape' || ev.key === 'Esc') { ev.preventDefault(); hideOverlay(false); return }
    } catch {}
  })

  // Mention trigger ('#') and slash-command trigger ('/')
  input.addEventListener('input', () => {
    try { handleTriggerInput(input) } catch {}
  })

  // Reposition overlay on click/mouseup to follow caret
  input.addEventListener('mouseup', () => { try { positionOverlay(input) } catch {} })
  input.addEventListener('keyup', (ev) => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { try { positionOverlay(input) } catch {} } })

  ;(container as any).__inited = true

  // expose simple addText for pastePath routing
  ;(window as any).__composerAddText = function(text: string) {
    try {
      const el = getComposerInput()
      if (!el) return
      // Minimal insert plain text at caret
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        range.insertNode(document.createTextNode(text))
        range.collapse(false)
        sel.removeAllRanges(); sel.addRange(range)
      } else {
        el.appendChild(document.createTextNode(text))
      }
    } catch {}
  }
}
