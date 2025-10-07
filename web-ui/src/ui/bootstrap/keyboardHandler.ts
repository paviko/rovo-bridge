import {isDev} from './env';
import {state} from '../state';
import {getComposerInput} from '../focus';
import {pasteWithMarkupParsing} from '../composer/clipboard';

/**
 * Handles macOS keyboard event forwarding for VSCode webview iframe compatibility
 */
export class KeyboardHandler {
  private keydownListener: ((event: KeyboardEvent) => void) | null = null;
  private keyupListener: ((event: KeyboardEvent) => void) | null = null;

  constructor() {
    this.setupKeyboardHandlers();
  }

  private setupKeyboardHandlers(): void {
    this.keydownListener = (event: KeyboardEvent) => {
      const { ctrlKey, metaKey, shiftKey, altKey, code, key } = event;
      
      // Detect if we're in VSCode iframe (has parent window)
      const isInVSCodeIframe = window.parent && window.parent !== window;

      // Helper: check if focus is in editable field
      const activeElement = document.activeElement as (HTMLInputElement | HTMLTextAreaElement | HTMLElement | null);
      const isInInput = !!activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
      const isInContentEditable = !!activeElement && ((activeElement as HTMLElement).isContentEditable || !!activeElement.closest('[contenteditable="true"]'))
      const inputSelLength = isInInput ? Math.abs(((activeElement as HTMLInputElement | HTMLTextAreaElement).selectionEnd ?? 0) - ((activeElement as HTMLInputElement | HTMLTextAreaElement).selectionStart ?? 0)) : 0;
      const domSel = window.getSelection && window.getSelection();
      const hasDomSelection = !!domSel && !domSel.isCollapsed && (domSel.toString() || '').length > 0;
      const hasTerminalSelection = !!(state.term && (state.term as any).hasSelection && state.term.hasSelection && state.term.hasSelection());
      const hasSelection = (inputSelLength > 0) || hasDomSelection || hasTerminalSelection;
      const isEditable = isInInput || isInContentEditable;

      // Clipboard shortcuts: let native behavior run when editing inside inputs/contenteditable
      if ((ctrlKey || metaKey) && code === "KeyC") {
        if (isEditable || hasSelection) {
          if (isInVSCodeIframe) {
            // VSCode: perform copy ourselves and stop here (prevents host forwarding)
            try { document.execCommand("copy"); } catch {}
            event.preventDefault();
            return;
          } else {
            // Browsers/JCEF: let native copy event fire so composer handleCopy can set clipboardData
            return; // do not forward
          }
        }
        // Not editable: fall through so it gets forwarded to host (e.g., VSCode)
      } else if ((ctrlKey || metaKey) && code === "KeyX") {
        if (isEditable || hasSelection) {
          if (isInVSCodeIframe) {
            // VSCode: perform cut ourselves and stop here
            try { document.execCommand("cut"); } catch {}
            event.preventDefault();
            return;
          } else {
            // Browsers/JCEF: let native cut event fire
            return;
          }
        }
        // Not editable: fall through for forwarding
      } else if ((ctrlKey || metaKey) && code === "KeyV") {
        if (isEditable || hasSelection) {
          if (isInVSCodeIframe) {
            // VSCode: handle paste via clipboard API when available to trigger composer chip parsing
            try {
              if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(text => {
                  const comp = getComposerInput();
                  if (text && comp) { pasteWithMarkupParsing(comp, text); }
                }).catch(() => { try { document.execCommand('paste'); } catch {} });
              } else {
                try { document.execCommand('paste'); } catch {}
              }
            } catch {}
            event.preventDefault();
            return;
          } else {
            // Browsers/JCEF: let native paste event fire so handlePaste runs
            return;
          }
        }
        // Not editable: fall through for forwarding
      } else if ((ctrlKey || metaKey) && code === "KeyA") {
        // Handle Cmd+A (Select All) - check if we're in a contentEditable element
        const activeElement = document.activeElement;
        const isInContentEditable = activeElement && (
          (activeElement as HTMLElement).contentEditable === 'true' || 
          activeElement.closest('[contenteditable="true"]')
        );
        const isInInput = activeElement && (
          activeElement.tagName === 'INPUT' || 
          activeElement.tagName === 'TEXTAREA'
        );
        
        if (isInContentEditable || isInInput) {
          // Let the browser handle select all in editable elements
          try {
            document.execCommand("selectAll");
            event.preventDefault(); // Prevent forwarding to parent
            return; // Don't forward this event
          } catch (e) {
            if (isDev) console.debug('Select all command failed in editable element');
          }
        }
        // If not in an editable element, let it fall through to be forwarded
      } else if ((ctrlKey || metaKey) && code === "KeyZ") {
        // Handle Cmd+Z (Undo) and Cmd+Shift+Z (Redo) - check if we're in an editable element
        const activeElement = document.activeElement;
        const isInContentEditable = activeElement && (
          (activeElement as HTMLElement).contentEditable === 'true' || 
          activeElement.closest('[contenteditable="true"]')
        );
        const isInInput = activeElement && (
          activeElement.tagName === 'INPUT' || 
          activeElement.tagName === 'TEXTAREA'
        );
        
        if (isInContentEditable || isInInput) {
          // Let the browser handle undo/redo in editable elements
          try {
            if (shiftKey) {
              document.execCommand("redo");
            } else {
              document.execCommand("undo");
            }
            event.preventDefault(); // Prevent forwarding to parent
            return; // Don't forward this event
          } catch (e) {
            if (isDev) console.debug('Undo/redo command failed in editable element');
          }
        }
        // If not in an editable element, let it fall through to be forwarded
      }
      
      // Forward all modifier key combinations to VSCode for handling
      if (ctrlKey || metaKey || shiftKey || altKey) {
        this.forwardKeyEvent('keydown-event', { ctrlKey, metaKey, shiftKey, altKey, code, key, hasSelection, inEditable: isEditable });
      }
    };

    this.keyupListener = (event: KeyboardEvent) => {
      const { ctrlKey, metaKey, shiftKey, altKey, code, key } = event;
      
      // Forward modifier key releases to VSCode
      if (ctrlKey || metaKey || shiftKey || altKey) {
        this.forwardKeyEvent('keyup-event', { ctrlKey, metaKey, shiftKey, altKey, code, key });
      }
    };

    // Attach event listeners
    window.addEventListener('keydown', this.keydownListener);
    window.addEventListener('keyup', this.keyupListener);
    
    if (isDev) console.log('[KeyboardHandler] macOS keyboard event handlers registered');
  }

  private forwardKeyEvent(eventType: string, payload: any): void {
    try {
      // Check if we're in an iframe (parent window exists and is different)
      if (window.parent && window.parent !== window) {
        const targetOrigin = state.boot?.parentOrigin;
        if (targetOrigin) {
          window.parent.postMessage({
            type: eventType,
            payload
          }, targetOrigin);
        } else {
          console.warn('Parent origin not available, falling back to wildcard');
          window.parent.postMessage({
            type: eventType,
            payload
          }, '*');
        }
      }
    } catch (e) {
      if (isDev) console.debug(`Failed to forward ${eventType} to parent:`, e);
    }
  }

  /**
   * Clean up event listeners
   */
  public destroy(): void {
    if (this.keydownListener) {
      window.removeEventListener('keydown', this.keydownListener);
      this.keydownListener = null;
    }
    if (this.keyupListener) {
      window.removeEventListener('keyup', this.keyupListener);
      this.keyupListener = null;
    }
    if (isDev) console.log('[KeyboardHandler] Event listeners removed');
  }
}

// Global instance for easy access
let keyboardHandlerInstance: KeyboardHandler | null = null;

/**
 * Initialize the keyboard handler
 */
export function initKeyboardHandler(): KeyboardHandler {
  if (!keyboardHandlerInstance) {
    keyboardHandlerInstance = new KeyboardHandler();
  }
  return keyboardHandlerInstance;
}

/**
 * Destroy the keyboard handler
 */
export function destroyKeyboardHandler(): void {
  if (keyboardHandlerInstance) {
    keyboardHandlerInstance.destroy();
    keyboardHandlerInstance = null;
  }
}
