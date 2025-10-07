import {state} from '../state'
import {addChips} from '../chips'
import {ensureWriteParsedWatcher} from '../segments'
import {baseName, quotePath, toRelativeIfWithin} from '../utils'
import {getComposerInput} from '../focus'
import {composerUndoRedoManager} from './init'

// Bind checkbox and interactions on a composer chip element and mirror state with chipbar
export function bindAndSyncComposerChip(span: HTMLElement, relPath: string) {
  try {
    const composerCheck = span.querySelector('.chip-check') as HTMLInputElement | null
    if (!composerCheck) return

    // Open in IDE when clicking on the chip area (excluding the checkbox)
    if (!(span as any).__openClickBound) {
      span.addEventListener('click', (ev) => {
        const target = ev.target as HTMLElement | null
        if (target && target.closest('.chip-check')) return
        try { const fn = (window as any).__openInIDE; if (typeof fn === 'function') fn(relPath) } catch {}
      })
      ;(span as any).__openClickBound = true
    }

    // Mirror from chipbar -> composer using the CURRENT registry entry
    const updateFromBar = () => {
      try {
        const info = state.fileRegistry.get(relPath)
        if (!info) return
        try { composerCheck.checked = !!info.checkEl?.checked } catch {}
        try {
          const perm = !!(info.chipEl && info.chipEl.classList.contains('permanent'))
          if (perm) span.classList.add('permanent'); else span.classList.remove('permanent')
        } catch {}
      } catch {}
    }

    // Attach/change the chipbar -> composer listener if chipbar checkbox changed (e.g., after re-add)
    try {
      const info = state.fileRegistry.get(relPath)
      const currentBarCheck: HTMLInputElement | null = (info && info.checkEl) ? info.checkEl : null
      const lastBound = (span as any).__boundBarCheckEl || null
      if (currentBarCheck && currentBarCheck !== lastBound) {
        currentBarCheck.addEventListener('change', updateFromBar)
        ;(span as any).__boundBarCheckEl = currentBarCheck
      }
    } catch {}

    // Initial mirror
    updateFromBar()

    // composer -> chipbar: bind once; always target the CURRENT chipbar checkbox on each change
    if (!(span as any).__composerChangeBound) {
      composerCheck.addEventListener('change', () => {
        try {
          const info = state.fileRegistry.get(relPath)
          const barCheck = info?.checkEl
          // Persist composer checked state for non-permanent chips
          try {
            const isPermanent = !!(info && (info.permanent || (info.chipEl && info.chipEl.classList.contains('permanent'))))
            if (!isPermanent) state.composerChecked.set(relPath, !!composerCheck.checked)
            else state.composerChecked.delete(relPath)
          } catch {}
          if (barCheck) {
            barCheck.checked = composerCheck.checked
            barCheck.dispatchEvent(new Event('change'))
            // Resync after chips.ts potentially altered permanence
            setTimeout(updateFromBar, 0)
          }
        } catch {}
      })
      ;(span as any).__composerChangeBound = true
    }

    // Keep composer focused after toggle but DO NOT change caret position
    if (!(span as any).__composerClickBound) {
      const saveCaret = () => {
        try {
          const input = getComposerInput()
          if (!input) return
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0 && input.contains(sel.focusNode)) {
            ;(span as any).__savedRange = sel.getRangeAt(0).cloneRange()
          }
        } catch {}
      }
      const restoreCaret = () => {
        try {
          const input = getComposerInput()
          if (!input) return
          input.focus()
          const saved: Range | null = (span as any).__savedRange || null
          if (saved && input.contains(saved.startContainer)) {
            const sel = window.getSelection()
            if (sel) { sel.removeAllRanges(); sel.addRange(saved) }
          }
        } catch {}
      }
      // Save caret before the checkbox grabs focus
      composerCheck.addEventListener('mousedown', saveCaret)
      // Mouse click
      composerCheck.addEventListener('click', () => { setTimeout(restoreCaret, 0) })
      // Keyboard toggle on the checkbox (space/enter)
      composerCheck.addEventListener('keyup', (ev: KeyboardEvent) => {
        if (ev.key === ' ' || ev.key === 'Enter') setTimeout(restoreCaret, 0)
      })
      ;(span as any).__composerClickBound = true
    }

    // After initial mirror, reapply saved non-permanent state (if any) and propagate to chipbar
    try {
      const info = state.fileRegistry.get(relPath)
      const saved = state.composerChecked.get(relPath)
      const isPermanent = !!(info && (info.permanent || (info.chipEl && info.chipEl.classList.contains('permanent'))))
      if (saved !== undefined && !isPermanent) {
        if (composerCheck) composerCheck.checked = !!saved
        const barCheck = info?.checkEl
        if (barCheck) {
          barCheck.checked = !!saved
          barCheck.dispatchEvent(new Event('change'))
          setTimeout(() => updateFromBar(), 0)
        }
      }
    } catch {}
  } catch {}
}

export function insertChipToken(root: HTMLElement, relPath: string): void {
  // Start chip insertion mode to prevent duplicate saves
  if (composerUndoRedoManager) {
    composerUndoRedoManager.startChipInsertion()
  }
  
  const span = document.createElement('span')
  span.className = 'composer-chip'
  span.setAttribute('contenteditable', 'false')
  span.dataset.path = relPath
  const disp = baseName(relPath)
  span.dataset.display = disp
  span.title = relPath
  span.setAttribute('data-tip', relPath)
  const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const m = disp.match(/:(\d+)-(\d+)$/)
  const label = m ? disp.slice(0, m.index!) : disp
  const range = m ? `:${m[1]}-${m[2]}` : ''
  const rangeHtml = range ? `<span class="chip-range" title="Selected lines" data-tip="Selected lines">${esc(range)}</span>` : ''
  span.innerHTML = `<span class="chip-at">#</span><span class="chip-label">${esc(label)}</span>${rangeHtml} <input type="checkbox" class="chip-check">`
  bindAndSyncComposerChip(span, relPath)
  // Place into current selection or at end
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(span)
    range.collapse(false)
    const space = document.createTextNode(' ')
    span.after(space)
    sel.removeAllRanges(); const r = document.createRange(); r.setStartAfter(space); r.collapse(true); sel.addRange(r)
  } else {
    // Append
    if (!root.lastChild || (root.lastChild.nodeType === Node.ELEMENT_NODE)) root.appendChild(document.createTextNode(''))
    root.appendChild(span)
    const space = document.createTextNode(' ')
    span.after(space)
    const sel = window.getSelection()
    if (sel) { sel.removeAllRanges(); const r = document.createRange(); r.setStartAfter(space); r.collapse(true); sel.addRange(r) }
  }
  
  // End chip insertion mode and save final state
  if (composerUndoRedoManager) {
    composerUndoRedoManager.endChipInsertion()
  }
}

export function buildChipToken(el: HTMLElement): string {
  const path = el.dataset.path || ''
  const disp = el.dataset.display || el.textContent || ''
  return `<[#${path}][${disp}]>`
}

export function insertPathsAsChips(paths: string[]): void {
  const input = getComposerInput()
  if (!input || !paths || paths.length === 0) return
  const cwd = (state.boot && (state.boot as any).cwd) || ''
  const relOrAbs: string[] = []
  const outOfScope: string[] = []
  for (const p of paths) {
    if (!p) continue
    // If path already looks relative, accept as-is (backend may provide project-relative paths)
    const looksAbsolute = /^[A-Za-z]:[\\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\')
    if (!looksAbsolute) { relOrAbs.push(p); continue }
    const rel = toRelativeIfWithin(p, cwd)
    if (rel !== null) relOrAbs.push(rel); else outOfScope.push(p)
  }
  if (relOrAbs.length > 0) {
    // Update chipbar/registry
    addChips(relOrAbs)
    // Ensure segments registered like processPathsInsert
    for (const p of relOrAbs) {
      if (!state.segmentsByPath.has(p)) {
        const token = quotePath(p) + ' '
        const id = state.nextSegId++
        state.segments.set(id, { id, path: p, text: token, marker: null })
        state.segmentsByPath.set(p, id)
      }
    }
    // Insert visual chips followed by a space
    for (const p of relOrAbs) insertChipToken(input, p)
    ensureWriteParsedWatcher()
  }
  // Place caret at end (optional)
}
