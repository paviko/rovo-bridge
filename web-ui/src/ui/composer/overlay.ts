import {baseName, getComposerEl} from '../utils'
import {state} from '../state'
import {getComposerInput} from '../focus'
import {
  currentAtPattern,
  MentionItem,
  overlayState,
  overlayTrigger,
  setCurrentAtPattern,
  setOverlayTrigger,
  slashCommands
} from './state'
import {getTextBeforeCaret} from './serialize'
import {insertChipToken, insertPathsAsChips} from './chips'
import {reconcileRegistryWithComposer} from './reconcile'
import {removeLoneAtFromInput, removeLoneSlashFromInput, replaceSlashTokenWithText} from './tokens'

// Helper for other modules to know if overlay should intercept keys
export function isOverlayActive(): boolean {
  try { return !!(overlayState.visible && overlayState.items && overlayState.items.length > 0) } catch { return false }
}

export function ensureOverlay(input: HTMLElement): HTMLElement {
  if (overlayState.el) return overlayState.el
  const overlay = document.createElement('div')
  overlay.className = 'composer-mention-overlay hidden'
  const list = document.createElement('div')
  overlay.appendChild(list)
  overlayState.el = overlay
  overlayState.listEl = list
  // Attach overlay to composer root for stacking and relative positioning
  const composer = getComposerEl()!
  composer.style.position = 'relative'
  composer.appendChild(overlay)
  return overlay
}

export function showOverlay(input: HTMLElement) {
  overlayState.inputEl = input
  ensureOverlay(input)
  overlayState.visible = true
  overlayState.el!.classList.remove('hidden')
  try { overlayState.el!.style.display = '' } catch {}
  positionOverlay(input)
}

export function hideOverlay(removeAtChar: boolean) {
  overlayState.visible = false
  if (overlayState.el) { overlayState.el.classList.add('hidden'); try { overlayState.el.style.display = 'none' } catch {} }
  if (removeAtChar) {
    if (overlayTrigger === '/') removeLoneSlashFromInput(); else removeLoneAtFromInput()
  }
  // Reset current mention pattern to avoid stale state
  try { setCurrentAtPattern('') } catch {}
}

function caretRect(input: HTMLElement): DOMRect | null {
  try {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    if (!input.contains(range.endContainer)) return null
    const rects = range.getClientRects()
    if (rects && rects.length) return rects[rects.length - 1]
  } catch {}
  return null
}

// Compute overlay anchor rect for the current trigger character
function getTriggerCharRect(input: HTMLElement): DOMRect | null {
  try {
    const before = getTextBeforeCaret(input)
    const pos = overlayTrigger === '/' ? before.lastIndexOf('/') : before.lastIndexOf('#')
    if (pos < 0) return null
    const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null)
    let acc = 0
    let node: Node | null = walker.nextNode()
    while (node) {
      const t = node as Text
      const len = t.nodeValue ? t.nodeValue.length : 0
      if (acc + len > pos) {
        const local = Math.max(0, pos - acc)
        const r = document.createRange()
        r.setStart(t, local)
        r.setEnd(t, Math.min(local + 1, len))
        const rects = r.getClientRects()
        if (rects && rects.length) return rects[0]
        const br = r.getBoundingClientRect()
        return br
      }
      acc += len
      node = walker.nextNode()
    }
  } catch {}
  return null
}

export function positionOverlay(input: HTMLElement) {
  try {
    // Prefer the trigger char rect; fallback to caret rect, then input box
    const atRect = getTriggerCharRect(input) || caretRect(input) || input.getBoundingClientRect()
    overlayState.anchorRect = atRect
    const compRect = getComposerEl()!.getBoundingClientRect()
    const el = overlayState.el!

    // Measure container and anchor
    const gap = 8
    const anchorX = atRect.left - compRect.left
    const anchorTop = atRect.top - compRect.top
    const compWidth = compRect.width

    // Decide left vs right alignment relative to trigger char
    const elWidth = el.offsetWidth || 300
    const distLeft = anchorX
    const distRight = compWidth - anchorX
    let left: number
    if (distLeft <= distRight) {
      // Closer to left: place left edge near '#'
      left = Math.max(0, Math.min(anchorX, compWidth - elWidth))
    } else {
      // Closer to right: align overlay right border with '#'
      left = Math.max(0, Math.min(anchorX - elWidth, compWidth - elWidth))
    }

    // Check if cursor is in top 50% of viewport to decide positioning
    const viewportHeight = window.innerHeight
    const cursorScreenY = atRect.top
    const isInTopHalf = cursorScreenY < viewportHeight / 2
    
    if (isInTopHalf) {
      // Position below the cursor when in top half
      const topBase = anchorTop + atRect.height + gap
      el.style.top = `${Math.round(topBase)}px`
      el.style.transform = 'translateY(0)'
    } else {
      // Position above the cursor when in bottom half (original behavior)
      const topBase = Math.max(0, anchorTop - gap)
      el.style.top = `${Math.round(topBase)}px`
      el.style.transform = 'translateY(-100%)'
    }
    el.style.left = `${Math.round(left)}px`

    // Let CSS control the height (min-height and max-height). Ensure no inline override remains.
    el.style.maxHeight = ''
  } catch {}
}

export function updateOverlayList(items: MentionItem[]) {
  overlayState.items = items.slice(0, 20)
  overlayState.activeIndex = 0
  const list = overlayState.listEl!
  list.innerHTML = ''
  if (overlayState.items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'mention-empty'
    const msg = currentAtPattern ? `No matches for "${currentAtPattern}"` : 'No matches'
    empty.textContent = msg
    list.appendChild(empty)
  } else {
    overlayState.items.forEach((it, idx) => {
      const row = document.createElement('div')
      row.className = 'mention-item' + (idx === overlayState.activeIndex ? ' active' : '')
      row.setAttribute('role', 'option')
      row.setAttribute('aria-selected', idx === overlayState.activeIndex ? 'true' : 'false')
      const shortSpan = document.createElement('span')
      shortSpan.className = 'mention-short'
      shortSpan.textContent = it.special === 'all-opened' ? 'All opened files' : it.short
      if (it.special) shortSpan.classList.add('mention-special')
      row.appendChild(shortSpan)
      // Prevent focus change so selection stays in input
      row.onmousedown = (ev) => { ev.preventDefault(); try { overlayState.inputEl?.focus() } catch {} }
      row.onclick = () => { overlayState.activeIndex = idx; applyCurrentSelection() }
      list.appendChild(row)
    })
  }
  try { const inp = getComposerInput(); if (overlayState.visible && inp) positionOverlay(inp) } catch {}
}

export function moveSelection(delta: number) {
  if (!overlayState.visible || overlayState.items.length === 0) return
  overlayState.activeIndex = (overlayState.activeIndex + delta + overlayState.items.length) % overlayState.items.length
  const rows = overlayState.listEl!.children as any as HTMLElement[]
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    if (i === overlayState.activeIndex) {
      r.classList.add('active'); r.setAttribute('aria-selected', 'true'); r.scrollIntoView({ block: 'nearest' })
    } else {
      r.classList.remove('active'); r.setAttribute('aria-selected', 'false')
    }
  }
}

function buildDefaultItems(): MentionItem[] {
  const items: MentionItem[] = []
  try {
    const seen = new Set<string>()
    if (state.ideCurrentFile) {
      items.push({ short: baseName(state.ideCurrentFile), path: state.ideCurrentFile, isDir: false, special: 'current' })
      seen.add(state.ideCurrentFile)
    }
    const opened = Array.isArray(state.ideOpenedFiles) ? state.ideOpenedFiles : []
    if (opened.length > 0) items.push({ short: 'Add all opened files', path: '', isDir: false, special: 'all-opened' })
    for (const p of opened) {
      if (p && !seen.has(p)) { items.push({ short: baseName(p), path: p, isDir: false }); seen.add(p) }
    }
  } catch {}
  return items
}

function replaceAtTokenWithChip(path: string) {
  const input = overlayState.inputEl || getComposerInput()
  if (!input) return
  try {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !input.contains(sel.focusNode)) return
    const before = getTextBeforeCaret(input)
    const atPos = before.lastIndexOf('#')
    if (atPos < 0) return
    // Range covering #..caret
    const r = document.createRange()
    const caretRange = sel.getRangeAt(0).cloneRange()
    const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null)
    let acc = 0
    let node: Node | null = walker.nextNode()
    while (node) {
      const t = node as Text
      const len = t.nodeValue ? t.nodeValue.length : 0
      if (acc + len > atPos) {
        const local = Math.max(0, atPos - acc)
        r.setStart(t, local)
        r.setEnd(caretRange.endContainer, caretRange.endOffset)
        break
      }
      acc += len
      node = walker.nextNode()
    }
    // Delete contents and insert chip
    r.deleteContents()
    insertChipToken(input, path)
    reconcileRegistryWithComposer()
  } catch {}
}

export function applyCurrentSelection() {
  const it = overlayState.items[overlayState.activeIndex]
  if (!it) { hideOverlay(false); return }
  // Slash-command mode: insert selected text and exit
  if (overlayTrigger === '/') {
    if (it.short) replaceSlashTokenWithText(it.short)
    hideOverlay(false)
    return
  }
  if (it.special === 'all-opened') {
    if (state.ideOpenedFiles && state.ideOpenedFiles.length) {
      removeLoneAtFromInput()
      insertPathsAsChips(state.ideOpenedFiles)
    }
    hideOverlay(false)
    return
  }
  if (it.special === 'current') {
    if (state.ideCurrentFile) {
      replaceAtTokenWithChip(state.ideCurrentFile)
    }
    hideOverlay(false)
    return
  }
  if (it.path) replaceAtTokenWithChip(it.path)
  hideOverlay(false)
}

export function handleTriggerInput(input: HTMLElement) {
  try {
    const before = getTextBeforeCaret(input)
    const hashPos = before.lastIndexOf('#')
    // '/' trigger: must be the very first char in the entire editor and be the only '/', and caret must be after it
    const fullText = (input.textContent || '')
    const allowSlash = fullText.startsWith('/') && fullText.indexOf('/', 1) === -1 && before.startsWith('/')
    const slashPos = allowSlash ? 0 : -1
    let pos = -1
    if (hashPos === -1 && slashPos === -1) { hideOverlay(false); return }
    if (slashPos > hashPos) { setOverlayTrigger('/'); pos = slashPos } else { setOverlayTrigger('#'); pos = hashPos }
    const patternRaw = before.slice(pos + 1)
    setCurrentAtPattern(patternRaw)
    // If any whitespace appears after trigger, hide the overlay (user moved on)
    if (/\s/.test(patternRaw)) { hideOverlay(false); return }
    showOverlay(input)
    positionOverlay(input)
    const pattern = (patternRaw || '').trim()
    if (overlayTrigger === '#') {
      if (!pattern) {
        const items: MentionItem[] = buildDefaultItems()
        updateOverlayList(items)
      } else {
        scheduleSearch(pattern)
      }
    } else {
      // Slash commands: filter predefined list (case-insensitive)
      const items: MentionItem[] = (pattern ? slashCommands.filter(c => c.toLowerCase().includes(pattern.toLowerCase())) : slashCommands).map(c => ({ short: c, path: '' }))
      updateOverlayList(items)
    }
  } catch {}
}

// Search support
let searchTimer: any = null
function sendSearch(pattern: string) {
  try {
    if (!state.currentWs || state.currentWs.readyState !== WebSocket.OPEN) return
    const opened = Array.isArray(state.ideOpenedFiles) ? state.ideOpenedFiles : []
    state.currentWs.send(JSON.stringify({ type: 'searchIndex', pattern, opened, limit: 20 }))
  } catch {}
}
export function scheduleSearch(pattern: string) {
  try { if (searchTimer) clearTimeout(searchTimer) } catch {}
  searchTimer = setTimeout(() => sendSearch(pattern), 200)
}

;(window as any).__composerOnSearchResult = function(m: any) {
  try {
    // Ignore results if we're currently in '/' mode
    if (overlayTrigger === '/') return
    const results = Array.isArray(m.results) ? m.results : []
    const ores = Array.isArray(m.openedResults) ? m.openedResults : []
    const items: MentionItem[] = []
    const seen = new Set<string>()
    // When pattern empty, special entries + current + opened (from host)
    if (!currentAtPattern) {
      if (state.ideCurrentFile) { items.push({ short: baseName(state.ideCurrentFile), path: state.ideCurrentFile, isDir: false, special: 'current' }); seen.add(state.ideCurrentFile) }
      if (state.ideOpenedFiles && state.ideOpenedFiles.length) items.push({ short: 'Add all opened files', path: '', isDir: false, special: 'all-opened' })
      const openedList = state.ideOpenedFiles || []
      for (const p of openedList) { if (p && !seen.has(p)) { items.push({ short: baseName(p), path: p, isDir: false }); seen.add(p) } }
    } else {
      // Pattern present: show backend openedResults first, then general results (dedup by path)
      for (const e of ores) { if (e && e.path && !seen.has(e.path)) { items.push({ short: e.short || baseName(e.path), path: e.path, isDir: !!e.isDir }); seen.add(e.path) } }
      for (const e of results) { if (e && e.path && !seen.has(e.path)) { items.push({ short: e.short || baseName(e.path), path: e.path, isDir: !!e.isDir }); seen.add(e.path) } }
    }
    updateOverlayList(items)
  } catch {}
}
