import {type SessionConfig, state} from './state'
import {bytesToB64, enc} from './utils'
import {removeChipAndRegistration} from './chips'

// Centralized helpers related to session I/O and iteration lifecycle

// Parse a chip path that may include a ":start-end" range suffix
function parsePathRange(p: string): { base: string; start?: number; end?: number } {
  const m = p.match(/^(.*?)(?::(\d+)-(\d+))?$/)
  if (!m) return { base: p }
  const base = m[1]
  const start = m[2] !== undefined ? parseInt(m[2], 10) : undefined
  const end = m[3] !== undefined ? parseInt(m[3], 10) : undefined
  return { base, start, end }
}

// Whether path a contains path b (same base; full file contains any range; wider range contains narrower)
function pathContains(a: string, b: string): boolean {
  const A = parsePathRange(a)
  const B = parsePathRange(b)
  if (A.base !== B.base) return false
  // Full-file contains anything on same base
  if (A.start === undefined) return true
  // A has range but B is full-file => cannot contain
  if (B.start === undefined) return false
  // Both have ranges
  return (A.start as number) <= (B.start as number) && (A.end as number) >= (B.end as number)
}

export function sendTextToStdin(text: string) {
  sendTextToStdinWithHistory(text, null)
}

export function sendTextToStdinWithHistory(text: string, historyEntry: any) {
  if (!state.currentWs || state.currentWs.readyState !== WebSocket.OPEN) {
    console.warn('Cannot send text to stdin: WebSocket not connected')
    return
  }
  
  try {
    // Validate input parameters
    if (typeof text !== 'string') {
      console.error('Invalid text parameter for stdin:', typeof text)
      return
    }

    const sid = (window as any).__SESSION_ID__ || 's1'
    const message: any = { 
      type: 'stdin', 
      sessionId: sid, 
      dataBase64: bytesToB64(enc.encode(text)) 
    }
    
    // Add history entry if provided with validation
    if (historyEntry) {
      try {
        // Validate history entry structure
        if (typeof historyEntry === 'object' &&
            historyEntry.serializedContent !== undefined) {
          message.historyEntry = historyEntry
        } else {
          console.warn('Invalid history entry structure, skipping history save:', historyEntry)
        }
      } catch (historyError) {
        console.error('Error processing history entry:', historyError)
        // Continue without history entry rather than failing the entire send
      }
    }
    
    state.currentWs.send(JSON.stringify(message))
  } catch (e) {
    console.error('Failed to send text to stdin with history:', e)

    // Priority: ensure history is saved even if stdin send fails
    const sid = (window as any).__SESSION_ID__ || 's1'
    try {
      if (historyEntry && state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
        const saveOnly = {
          type: 'savePrompt',
          sessionId: sid,
          historyEntry,
        }
        state.currentWs.send(JSON.stringify(saveOnly))
        console.log('Sent savePrompt message as fallback to persist history')
      }
    } catch (saveErr) {
      console.error('Failed to send savePrompt fallback:', saveErr)
    }

    // Attempt to still send the stdin payload (without history) as best-effort
    try {
      if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
        const fallbackMessage = { 
          type: 'stdin', 
          sessionId: sid, 
          dataBase64: bytesToB64(enc.encode(text)) 
        }
        state.currentWs.send(JSON.stringify(fallbackMessage))
        console.log('Sent text to stdin after savePrompt fallback')
      }
    } catch (fallbackError) {
      console.error('Fallback stdin send also failed:', fallbackError)
    }
  }
}

export function notifyFontSizeChanged(newFontSize: number) {
  if (typeof newFontSize !== 'number' || newFontSize < 8 || newFontSize > 72) {
    console.warn('Invalid font size for notification:', newFontSize)
    return
  }
  if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
    try {
      state.currentWs.send(JSON.stringify({ type: 'fontSizeChanged', fontSize: newFontSize }))
      console.log('Font size change sent to backend:', newFontSize)
    } catch (e) {
      console.error('Failed to send font size change to backend:', e)
    }
  } else {
    console.warn('Cannot send font size change: WebSocket not connected')
  }
  window.postMessage({ type: 'setFontSize', size: newFontSize } as any)
}

export function finalizeIterationAndSendEnter(): void {
  try {
    const newlyChecked: string[] = []
    state.fileRegistry.forEach((info, path) => {
      if (!info.permanent && info.checkEl && info.checkEl.checked) {
        if (info.checkedSinceIterStart !== false) newlyChecked.push(path)
      }
    })

    // Prune newly checked that are contained in existing permanent chips, then within themselves
    const permanentPaths = Array.from(state.fileRegistry.entries())
      .filter(([, info]) => !!info.permanent)
      .map(([p]) => p)
    const toRemove = new Set<string>()
    for (const n of newlyChecked) {
      if (permanentPaths.some((perm) => pathContains(perm, n))) {
        toRemove.add(n)
      }
    }

    // Prune containment within newlyChecked themselves (keep the wider/superset)
    for (let i = 0; i < newlyChecked.length; i++) {
      const a = newlyChecked[i]
      if (toRemove.has(a)) continue
      for (let j = i + 1; j < newlyChecked.length; j++) {
        const b = newlyChecked[j]
        if (toRemove.has(b)) continue
        if (pathContains(a, b)) {
          toRemove.add(b)
        } else if (pathContains(b, a)) {
          toRemove.add(a)
          break
        }
      }
    }

    // Physically remove pruned chips and keep state in sync
    if (toRemove.size > 0) {
      for (const p of toRemove) removeChipAndRegistration(p)
    }

    // Keep only remaining not-removed newly checked
    const filteredNewlyChecked = newlyChecked.filter((p) => !toRemove.has(p))

    // Mark new ones permanent and dispose any existing markers/segments
    for (const path of filteredNewlyChecked) {
      const info = state.fileRegistry.get(path)
      if (info && !info.permanent) {
        info.permanent = true
        info.wasPermanent = false
        if (info.checkEl) {
          info.checkEl.checked = true
        }
        if (info.chipEl) info.chipEl.classList.add('permanent')
        const segId = state.segmentsByPath.get(path)
        if (segId !== undefined) {
          const s = state.segments.get(segId)
          try {
            if (s && s.marker && !s.marker.isDisposed) s.marker.dispose()
          } catch {}
          if (s) state.segments.delete(segId)
          state.segmentsByPath.delete(path)
        }
      }
    }

    // Remove all remaining non-permanent chips/segments (iteration cleanup)
    state.fileRegistry.forEach((info, path) => {
      if (!info.permanent) removeChipAndRegistration(path)
    })

    // Inject newly checked files if any
    if (filteredNewlyChecked.length > 0 && state.currentWs) {
      const sid = (window as any).__SESSION_ID__ || 's1'
      state.currentWs.send(
        JSON.stringify({ type: 'injectFiles', sessionId: sid, paths: filteredNewlyChecked })
      )
    }

    // Send CR to execute
    sendTextToStdin('\r')

    // Advance iteration and reset flags
    state.iterationId++
    state.backslashPending = false
    state.fileRegistry.forEach((info) => {
      if (info) info.checkedSinceIterStart = false
    })
  } catch (e) {
    // Best-effort: still send CR to avoid getting stuck in UI state
    try { sendTextToStdin('\r') } catch {}
  }
}

// Optional: allow updating session config outside websocket
export function setSessionConfig(config: Partial<SessionConfig>) {
  try {
    if (config && typeof config === 'object') {
      state.sessionConfig = {
        cmd: (config.cmd ?? (state.sessionConfig?.cmd ?? 'acli'))!,
        args: Array.isArray(config.args)
          ? config.args
          : (state.sessionConfig?.args ?? ['rovodev', 'run']),
        pty: (config.pty ?? (state.sessionConfig?.pty ?? true))!,
        env: Array.isArray(config.env)
          ? config.env
          : (state.sessionConfig?.env ?? ['LANG=C.UTF-8']),
      }
      console.log('Session configuration updated:', state.sessionConfig)
    }
  } catch (e) {
    console.error('Failed to set session config:', e)
  }
}
