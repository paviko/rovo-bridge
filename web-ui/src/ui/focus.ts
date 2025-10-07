import {state} from './state'
import {isComposerVisible} from "./utils";

export function getComposerInput(): HTMLElement | null {
    return document.getElementById('composerInput')
}

export function placeCaretAtEnd(el: HTMLElement) {
    try {
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()!
        sel.removeAllRanges();
        sel.addRange(range)
    } catch {
    }
}

// Public helper to focus the composer input and place the caret at the end
export function focusComposerInput(): void {
    const input = getComposerInput()
    if (!input) return
    try {
        // If a selection already exists inside the composer, preserve caret position.
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0 && input.contains(sel.focusNode)) {
            input.focus()
            return
        }
    } catch {}
    // Otherwise, focus and move caret to the end.
    placeCaretAtEnd(input)
}

export function focus(): void {
    try { if (isComposerVisible()) { focusComposerInput() } else if (state.term) state.term.focus() } catch {}
    try { setTimeout(() => { try { if (isComposerVisible()) { focusComposerInput() } else if (state.term) state.term.focus() } catch {} }, 0) } catch {}
}