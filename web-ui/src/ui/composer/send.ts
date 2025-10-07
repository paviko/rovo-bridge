import {getComposerInput} from '../focus'
import {quotePath} from '../utils'
import {serializeDomToText} from './serialize'
import {finalizeIterationAndSendEnter, sendTextToStdinWithHistory} from '../session'
import {state} from '../state'
import {reconcileRegistryWithComposer} from './reconcile'
import {composerUndoRedoManager} from './init'
import {promptHistoryManager} from '../history'
import {buildChipToken} from "./chips";

export function extractComposerPayload(root: HTMLElement): { textToSend: string } {
  const text = serializeDomToText(root, {
    chipSerializer: (el) => {
      // Skip image placeholders - they should not be included in the text to send
      if (el.classList.contains('composer-image-placeholder')) {
        return ''
      }
      const p = el.dataset.path || ''
      return p ? quotePath(p) : ''
    },
    blockTags: /^(DIV|P|LI|PRE)$/i,
  })
  // Keep newlines as-is inside composer; they represent user intent. Sending will normalize as needed.
  return { textToSend: text }
}

export function sendComposer(): void {
  // Normalize text before sending: convert lone newlines to backslash+CR to match terminal iteration semantics
  // i.e., each newline becomes "\\\r" so that multi-line composer input maps to multiple terminal lines with continuations

  const input = getComposerInput()
  if (!input) return
  const { textToSend } = extractComposerPayload(input)
  
  // Capture prompt for history before sending with enhanced error handling
  let historyEntry: any = null
  try {
    if (state.historyInitialized && textToSend.trim()) {
      // Get display content (HTML) and serialized content for history
      const serializedContent = serializeDomToText(input, { chipSerializer: (el) => buildChipToken(el) })
      
      // Validate content before creating history entry
      if (!serializedContent) {
        console.warn('Skipping history capture for empty content')
      } else {
        // Generate ID that will be used by both frontend cache and backend
        const entryId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
        
        // Create history entry data for backend
        historyEntry = {
          id: entryId,
          serializedContent
        }
        
        // Add to history cache with the same ID
        try {
          promptHistoryManager.addPromptWithId(entryId, serializedContent)
        } catch (cacheError) {
          console.error('Failed to add prompt to history cache:', cacheError)
          // Continue - cache failure shouldn't prevent backend history save
        }
      }
    } else {
      if (!state.historyInitialized) {
        console.warn('History not initialized, skipping history capture')
      }
    }
  } catch (error) {
    console.error('Failed to capture prompt for history:', error)
    // Continue with sending even if history capture fails completely
    historyEntry = null
  }
  
  // Transform newlines into "\\\r" (backslash + CR) to emulate backslash+Enter behavior for each line break
  // Handles \r\n, \n, or \r uniformly
  const normalized = textToSend.replace(/\r\n|\n|\r/g, "\\\r")

  // Send normalized text for the iteration body with history data, then finalize iteration (which sends CR)
  if (normalized) sendTextToStdinWithHistory(normalized, historyEntry)
  try {
    finalizeIterationAndSendEnter()
  } finally {
    // Clear composer after send and resync registry
    input.innerHTML = ''
    try { state.composerChecked.clear() } catch {}
    reconcileRegistryWithComposer()
    // Clear undo/redo history after sending
    if (composerUndoRedoManager) {
      composerUndoRedoManager.clear()
      composerUndoRedoManager.initialize()
    }
  }
}
