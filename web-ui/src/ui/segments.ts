import {type Segment, state} from './state'
import {IBuffer} from "@xterm/xterm";
import {showToast} from './toast'

function computeEndPosition(startX: number, startY: number, textLen: number, cols: number) {
  const total = startX + textLen
  const wraps = Math.floor(total / cols)
  const endX = total % cols
  const endY = startY + wraps
  return { endX, endY, wraps }
}

function readBufferRange(startLine: number, startX: number, endLine: number, endX: number): string {
  try {
    const buf = state.term.buffer.active
    if (startLine < 0 || endLine < 0) return ''
    if (startLine === endLine) {
      const line = buf.getLine(startLine)
      return line?.translateToString(false, startX, endX) || ''
    }
    let text = ''
    let line = buf.getLine(startLine)
    text += line?.translateToString(false, startX) || ''
    for (let y = startLine + 1; y < endLine; y++) {
      line = buf.getLine(y)
      text += line?.translateToString(false) || ''
    }
    line = buf.getLine(endLine)
    text += line?.translateToString(false, 0, endX) || ''
    return text
  } catch {
    return ''
  }
}

function computeScanRange(top: number): { startVy: number; endVy: number } | null {
  try {
    const buf = state.term.buffer.active
    const rows = state.term.rows || 0
    if (rows <= 0) return null

    // find first non-empty from bottom
    let anchorVy = -1
    for (let vy = rows - 1; vy >= 0; vy--) {
      const s = lineStrByVy(vy, buf, top)
      if (/^\S/.test(s)) { anchorVy = vy; break }
    }
    if (anchorVy === -1) return null

    // bottom border within last 10 lines
    const bottomStart = Math.max(0, anchorVy - 9)
    let endVy = -1
    for (let vy = anchorVy; vy >= bottomStart; vy--) {
      const s = lineStrByVy(vy, buf, top)
      if (s.startsWith('╰─')) { endVy = vy; break }
    }
    if (endVy === -1) return null

    // walk upward for top border, ensure we saw input cursor
    let inputCursorFound = false
    for (let vy = endVy - 1; vy >= 0; vy--) {
      const s = lineStrByVy(vy, buf, top)
      if (s.startsWith('│ >')) inputCursorFound = true
      if (s.startsWith('╭─')) {
        const trimmed = s.replace(/\s+$/, '')
        if (trimmed.endsWith('─╮')) {
          const inner = trimmed.slice(1, trimmed.length - 1)
          const onlyDashes = /^[─]+$/.test(inner)
          if (onlyDashes) return inputCursorFound ? { startVy: vy, endVy } : null
          break
        } else {
          break
        }
      }
    }
    return null
  } catch {
    return null
  }
}

function lineStrByVy(vy: number, buf: IBuffer, top: number): string {
  const line = buf.getLine(top + vy)
  return line?.translateToString(false) || ''
}

function findLastNonEmptyLine(top: number): string | null {
  try {
    const buf = state.term.buffer.active
    const rows = state.term.rows || 0
    for (let vy = rows - 1; vy >= 0; vy--) {
      const s = lineStrByVy(vy, buf, top)
      if (/^\S/.test(s)) return s
    }
    return null
  } catch {
    return null
  }
}

// Returns up to the last `count` non-empty lines, starting from the bottom-most.
function findLastNonEmptyLines(top: number, count: number): string[] {
  const out: string[] = []
  try {
    const buf = state.term.buffer.active
    const rows = state.term.rows || 0
    for (let vy = rows - 1; vy >= 0 && out.length < count; vy--) {
      const s = lineStrByVy(vy, buf, top)
      if (/^\S/.test(s)) out.push(s)
    }
  } catch {
    // ignore
  }
  return out
}

function extractState(lastLine: string, st: typeof state): typeof st.terminalInputState {
  const s = lastLine || ''
  let newState = st.terminalInputState as typeof st.terminalInputState

  // 1) Prompt waiting phrases (case-insensitive)
  const rePrompt1 = /type\s+["']\/["']\s+for\s+available\s+commands/i
  const rePrompt2 = /type\s+["']\\["']\s+and\s+press\s+enter\s+to\s+start\s+a\s+new\s+line/i
  const rePrompt3 = /ctrl\+d to copy last response/i

  // 2) Navigation needed (starts with "↑↓: Navigate")
  const reNavigate1 = /^\s*↑↓:\s*Navigate/i
  const reNavigate2 = /^\s*↑ ↓: Navigate/i
  const reNavigate3 = /b: Back/i
  const reNavigate4 = /q: Exit/i

  // 3) Processing spinners (starts with one of common braille/block spinner glyphs)
  const reSpinner = /^\s*(?:⡿|⣯|⣷|⣾|⣽|⣻|⢿|⣟|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏)/i

  if (rePrompt1.test(s) || rePrompt2.test(s) || rePrompt3.test(s)) newState = 'PromptWaiting'
  else if (reNavigate1.test(s) || reNavigate2.test(s) || reNavigate3.test(s) || reNavigate4.test(s)) newState = 'NavigationNeeded'
  else if (reSpinner.test(s)) newState = 'Processing'
  else newState = 'Unknown'

  if (newState !== 'Unknown' && st.terminalInputState !== newState) {
    let msg = ''
    if (newState === 'PromptWaiting') msg = 'Waiting for your message'
    else if (newState === 'NavigationNeeded') msg = 'Waiting for you to choose an option'
    else if (newState === 'Processing') msg = 'Processing your request'
    if (msg) { try { showToast(msg) } catch {} }
    st.terminalInputState = newState
    try { const el = document.getElementById('state'); if (el) el.textContent = st.terminalInputState }
    catch {}
    // On state change, manage focus per UX rules
    try {
      if (newState === 'PromptWaiting') {
        const comp = document.getElementById('composer')
        const visible = !!comp && !comp.classList.contains('collapsed')
        if (visible) {
          const input = document.getElementById('composerInput') as HTMLElement | null
          if (input) input.focus()
        }
      } else if (newState === 'NavigationNeeded') {
        try { if (st.term) st.term.focus() } catch {}
      }
    } catch {}
  }

  // Recompute terminal input enablement when composer is visible
  try {
    const comp = document.getElementById('composer')
    const visible = !!comp && !comp.classList.contains('collapsed')
    if (visible) {
      ;(st as any).terminalInputEnabled = !(st.terminalInputState === 'PromptWaiting' || st.terminalInputState === 'Unknown')
    }
  } catch {}
  return newState
}

export function removeSegment(id: number): void {
  const seg = state.segments.get(id)
  if (!seg) return
  try { if (seg.marker && !seg.marker.isDisposed) seg.marker.dispose() } catch {}
  state.segments.delete(id)
  if (seg.path) removeChipAndRegistration(seg.path)
}

// Forward declaration to avoid circular import; chips.ts will rebind at runtime
let removeChipAndRegistration: (path: string) => void = () => {}
export function bindRemoveChip(fn: (path: string) => void) { removeChipAndRegistration = fn }

export function ensureWriteParsedWatcher(): void {
  if (state.writeParsedInstalled || !state.term) return

  let dirty = false
  let lastWriteTs = 0
  let debounceTimer: any = null
  const QUIET_MS = 30

  const performScan = () => {
    // Safety: require terminal instance
    if (!state.term) { dirty = false; return }
    const active = state.term.buffer?.active
    const viewportY = (active && typeof active.viewportY === 'number') ? active.viewportY : null
    const baseY = (active && typeof active.baseY === 'number') ? active.baseY : 0
    const top = (viewportY != null) ? viewportY : Math.max(0, baseY - (state.term.rows - 1))
    // Derive terminal input state from up to the last 3 non-empty lines (helps when lines wrap)
    const lastLines = findLastNonEmptyLines(top, 3)
    for (const s of lastLines) {
      const detected = extractState(s, state)
      if (detected !== 'Unknown') break
    }
    // For segment scanning below
    const cols = state.term.cols || 80
    if (!state.segments || state.segments.size === 0) { dirty = false; return }
    const range = computeScanRange(top)
    if (!range) return
    const startVy = Math.max(0, range.startVy)
    const endVy = Math.min(state.term.rows - 1, range.endVy)
    const toRemove: number[] = []

    // Collect composer-present paths to protect them from removal during scanning
    const composer = document.getElementById('composer')
    const composerVisible = !!composer && !composer.classList.contains('collapsed')
    const composerInput = composerVisible ? (document.getElementById('composerInput') as HTMLElement | null) : null
    const presentPaths = new Set<string>()
    if (composerInput) {
      try {
        const els = composerInput.querySelectorAll('.composer-chip')
        els.forEach((el) => {
          const p = (el as HTMLElement).dataset.path || ''
          if (p) presentPaths.add(p)
        })
      } catch {}
    }

    state.segments.forEach((seg: Segment, id: number) => {
      let found = false
      const needle = (seg.text || '').trimEnd()
      const len = needle.length
      if (!needle) return

      for (let vy = startVy; vy <= endVy && !found; vy++) {
        for (let x = 0; x < cols; x++) {
          const { endX, endY, wraps } = computeEndPosition(x, vy, len, cols)
          if (endY >= state.term.rows) break
          const got = readBufferRange(top + vy, x, top + endY, endX).trimEnd()
          if (got === needle) {
            found = true
            seg.startX = x
            seg.endX = endX
            seg.endLineOffset = wraps
          }
        }
      }
      if (!found) {
        // If composer is visible and contains this path, consider it found to preserve registration
        if (composerVisible && seg.path && presentPaths.has(seg.path)) {
          found = true
        }
      }
      if (!found) toRemove.push(id)
    })

    toRemove.forEach(removeSegment)
    dirty = false
  }

  const scheduleIfQuiet = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    const delay = Math.max(0, QUIET_MS - (Date.now() - lastWriteTs))
    debounceTimer = setTimeout(() => {
      requestAnimationFrame(() => { if (dirty) performScan() })
    }, delay)
  }

  state.writeParsedDisposable = state.term.onWriteParsed(() => {
    dirty = true
    lastWriteTs = Date.now()
    scheduleIfQuiet()
  })
  state.terminalDisposables.push(state.writeParsedDisposable)

  const renderDisposable = state.term.onRender(() => {
    if (!dirty) return
    if (Date.now() - lastWriteTs < QUIET_MS) return
    performScan()
  })
  state.terminalDisposables.push(renderDisposable)

  const timerCleanup = { dispose: () => { try { if (debounceTimer) clearTimeout(debounceTimer) } catch {}; debounceTimer = null; dirty = false } }
  state.terminalDisposables.push(timerCleanup)

  state.writeParsedInstalled = true
}

export function clearSegmentsAndMarkers(): void {
  try {
    state.segments.forEach((seg) => { try { if (seg && seg.marker && !seg.marker.isDisposed) seg.marker.dispose() } catch {} })
    state.segments.clear()
    state.segmentsByPath.clear()
  } catch {}
}
