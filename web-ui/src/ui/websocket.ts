import {SessionConfig, state} from './state'
import {finalizeIterationAndSendEnter, sendTextToStdin} from './session'
import {b64ToBytes} from './utils'
import {ensureWriteParsedWatcher} from './segments'
import {showBanner, showToast} from './toast'
import {focus} from "./focus"
import {type PromptHistoryEntry, promptHistoryManager} from './history'

function updateSessionConfigFromBackend(config: any) {
  state.sessionConfig = {
    cmd: config.cmd || 'acli',
    args: Array.isArray(config.args) ? config.args : ['rovodev', 'run'],
    pty: config.pty !== undefined ? config.pty : true,
    env: Array.isArray(config.env) ? config.env : ['LANG=C.UTF-8'],
  }
  console.log('Session configuration updated from backend:', state.sessionConfig)
}

export function startSession(websocket: WebSocket, resume: boolean = true) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) { console.warn('Cannot start session: WebSocket not connected'); return }
  if (!state.sessionConfig) { console.warn('Cannot start session: Session configuration not available'); return }
  let cols = 0, rows = 0
  try {
    if (state.term) {
      if (state.fit) { try { state.fit.fit() } catch {} }
      cols = state.term.cols; rows = state.term.rows
    }
  } catch {}
  websocket.send(JSON.stringify({
    type: 'openSession', id: 'o1',
    cmd: state.sessionConfig.cmd,
    args: state.sessionConfig.args,
    pty: state.sessionConfig.pty,
    env: state.sessionConfig.env,
    resume: !!resume,
    cols, rows,
  }))
}

function requestSnapshot(ws: WebSocket) {
  try {
    const sid = (window as any).__SESSION_ID__ || 's1'
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'snapshot', sessionId: sid }))
    }
  } catch (e) { console.warn('Failed to request snapshot:', e) }
}


function notifyFontSizeChanged(newFontSize: number) {
  if (typeof newFontSize !== 'number' || newFontSize < 8 || newFontSize > 72) { console.warn('Invalid font size for notification:', newFontSize); return }
  if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
    try { state.currentWs.send(JSON.stringify({ type: 'fontSizeChanged', fontSize: newFontSize })); console.log('Font size change sent to backend:', newFontSize) } catch (e) { console.error('Failed to send font size change to backend:', e) }
  } else { console.warn('Cannot send font size change: WebSocket not connected') }
  window.postMessage({ type: 'setFontSize', size: newFontSize } as any, '*')
}

function bindTerminalHandlers(ws: WebSocket) {
  if (!state.term) return
  const dataDisposable = state.term.onData((d: string) => {
    if ((state as any).terminalInputEnabled === false) {
      try {
        const root = document.getElementById('root')!
        const existing = root?.querySelector('[data-banner-id="input-disabled"]')
        if (!existing) {
          showBanner('Input disabled, use Editor component below terminal or hide Editor', {
            id: 'input-disabled',
            color: '#ffcccb',
            background: 'rgba(0,0,0,0.7)',
            timeoutMs: 2500,
          })
        }
      } catch {}
      return
    }

    // Filter out focus tracking escape sequences that cause [I and [O to appear on Windows
    // CSI I (\x1b[I) = focus in, CSI O (\x1b[O) = focus out
    // These are sent by xterm.js when focus changes and appear as literal text on Windows
    if (d === '\x1b[I' || d === '\x1b[O') {
      return
    }

    for (let i = 0; i < d.length; i++) {
      const ch = d[i]
      if (ch === '\r') {
        if (state.backslashPending) { sendTextToStdin('\r'); state.backslashPending = false }
        else { finalizeIterationAndSendEnter() }
        continue
      }
      state.backslashPending = (ch === '\\')
      sendTextToStdin(ch)
    }
  })
  state.terminalDisposables.push(dataDisposable)

  // Initialize font size and fit once; rely on term.onResize for geometry changes
  state.term.options.fontSize = state.fontSize
  if (state.fit) state.fit.fit()

  const resizeHandler = () => {
    if (state.fit && state.term) {
      state.fit.fit()
      const { cols, rows } = state.term
      const sid = (window as any).__SESSION_ID__ || 's1'
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', sessionId: sid, cols, rows }))
    }
  }
  window.addEventListener('resize', resizeHandler)
  state.terminalDisposables.push(() => window.removeEventListener('resize', resizeHandler))

  // Send resize to backend whenever xterm geometry actually changes (debounced)
  let resizeDebounceTimer: any = null
  const termResizeDisp = state.term.onResize(() => {
    try { if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer) } catch {}
    console.log('[xterm] onResize event fired (debouncing)')
    resizeDebounceTimer = setTimeout(() => {
      try {
        const sid = (window as any).__SESSION_ID__ || 's1'
        if (ws && ws.readyState === WebSocket.OPEN && sid) {
          const { cols, rows } = state.term
          console.log('[xterm] onResize -> sending resize', { cols, rows })
          ws.send(JSON.stringify({ type: 'resize', sessionId: sid, cols, rows }))
        }
      } catch {}
    }, 80)
  })
  state.terminalDisposables.push(termResizeDisp)
  // Cleanup debounce timer on dispose
  state.terminalDisposables.push({ dispose: () => { try { if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer) } catch {}; resizeDebounceTimer = null } })
}

function stripTruncatedOSC(bytes: Uint8Array): Uint8Array {
  try {
    if (!bytes || bytes.length === 0) return bytes
    const removeRange = (arr: Uint8Array, start: number, end: number) => { const head = arr.subarray(0, start); const tail = arr.subarray(end); const out = new Uint8Array(head.length + tail.length); out.set(head, 0); out.set(tail, head.length); return out }
    let base = 0; while (base < bytes.length && (bytes[base] === 0x0D || bytes[base] === 0x0A)) base++
    const limit = Math.min(bytes.length, base + 64)
    for (let p = base; p + 3 < limit; p++) {
      if (bytes[p] !== 0x5D) continue
      if (p > 0 && bytes[p - 1] === 0x1B) continue
      const isOsc10or11 = bytes[p + 1] === 0x31 && (bytes[p + 2] === 0x30 || bytes[p + 2] === 0x31) && bytes[p + 3] === 0x3B
      if (!isOsc10or11) continue
      for (let q = p + 4; q < bytes.length - 1; q++) {
        const b = bytes[q]
        if (b === 0x07) return removeRange(bytes, p, q + 1)
        if (b === 0x1B && bytes[q + 1] === 0x5C) return removeRange(bytes, p, q + 2)
      }
      return bytes.subarray(0, p)
    }
  } catch {}
  return bytes
}

export function connect() {
  // Dispose previous terminal listeners
  state.terminalDisposables.forEach((d) => { try { typeof d === 'function' ? (d as any)() : d?.dispose?.() } catch (e) { console.warn('Error disposing terminal listener:', e) } })
  state.terminalDisposables = []
  state.writeParsedInstalled = false;

  // Require token to be set before connecting; token is provided via JS bridge or URL param (dev)
  if (!state.boot || !state.boot.token) {
    console.warn('connect(): No token set; skipping connection')
    return
  }
  const protocols = [ `auth.bearer.${state.boot.token}` ]
  const ws = new WebSocket(`ws://${location.host}/ws`, protocols)
  state.currentWs = ws
  const status = document.getElementById('status')!
  const dot = document.getElementById('dot') as HTMLElement
  status.textContent = 'connecting'
  dot.style.background = '#f0b400'

  ws.onopen = () => {
    status.textContent = 'connected'
    dot.style.background = '#2ecc71'
    ws.send(JSON.stringify({ type: 'hello', protocolVersion: '1.0' }))
    focus();
  }

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.type === 'welcome' && m.sessionConfig) { updateSessionConfigFromBackend(m.sessionConfig); startSession(state.currentWs!, !state.forceFreshStart); state.forceFreshStart = false }
    if (m.type === 'sessionConfigUpdated' && m.sessionConfig) updateSessionConfigFromBackend(m.sessionConfig)
    if (m.type === 'stdout') {
      if (typeof m.seq === 'number') {
        const expected = state.sessionLastSeq ? (state.sessionLastSeq + 1) : m.seq
        if (m.seq !== expected) requestSnapshot(ws)
        state.sessionLastSeq = m.seq
      }
      state.awaitingFirstOutput = false
      const bytes = b64ToBytes(m.dataBase64)
      if (state.term) state.term.write(bytes)
    }
    if (m.type === 'snapshot') {
      try {
        let bytes: Uint8Array = m.dataBase64 ? b64ToBytes(m.dataBase64) : new Uint8Array(0)
        bytes = stripTruncatedOSC(bytes)
        if (state.term) { state.term.reset(); if (bytes.length) state.term.write(bytes) }
        if (typeof m.lastSeq === 'number') state.sessionLastSeq = m.lastSeq
      } catch (e) { console.warn('Failed to apply snapshot:', e) }
    }
    if (m.type === 'opened' && m.id === 'o1') {
      ;(window as any).__SESSION_ID__ = m.sessionId
      state.sessionLastSeq = 0
      state.awaitingFirstOutput = true
      try { const resumed = !!m.resumed; const pid = (typeof m.pid === 'number') ? m.pid : 0; console.log('Session opened:', { sessionId: m.sessionId, resumed, pid }); showToast(`Session opened (resumed: ${resumed ? 'yes' : 'no'}, pid: ${pid})`) } catch {}
      
      // Initialize prompt history from session data
      try {
        if (m.promptHistory && Array.isArray(m.promptHistory)) {
          promptHistoryManager.initializeFromSession(m.promptHistory as PromptHistoryEntry[])
          state.historyInitialized = true
        } else {
          // Initialize with empty history if none provided
          promptHistoryManager.initializeFromSession([])
          state.historyInitialized = true
        }
      } catch (error) {
        console.error('Failed to initialize prompt history:', error)
        state.historyInitialized = false
      }
      
      if (state.term) {
        try { if (state.fit) state.fit.fit() } catch {}
        const cols = state.term.cols, rows = state.term.rows
        ws.send(JSON.stringify({ type: 'resize', sessionId: m.sessionId, cols, rows }))
        // Only focus terminal if input is enabled (composer hidden)
        try { if ((state as any).terminalInputEnabled !== false && state.term) state.term.focus() } catch {}
      }
      setTimeout(() => { if (state.awaitingFirstOutput) { requestSnapshot(ws) } }, 400)
    }
    if (m.type === 'exit' && m.sessionId === ((window as any).__SESSION_ID__ || 's1')) {
      showBanner(`Process exited (code ${m.code}).`, {
        id: 'process-exit',
        buttonText: 'Restart',
        onButtonClick: () => {
          try {
            if (typeof (window as any).__restartSession === 'function') (window as any).__restartSession()
            else { if (state.term) state.term.reset(); startSession(ws, false) }
          } catch {}
        },
        timeoutMs: 10000,
      })
    }
    if (m.type === 'searchResult') {
      try {
        const evt = new CustomEvent('rovobridge.searchResult', { detail: m })
        window.dispatchEvent(evt)
        const cb = (window as any).__composerOnSearchResult
        if (typeof cb === 'function') cb(m)
      } catch {}
    }
    if (m.type === 'setFontSize' && m.fontSize != null) {
      const newFontSize = parseInt(m.fontSize, 10)
      if (newFontSize > 0 && newFontSize !== state.fontSize) {
        state.fontSize = newFontSize
        if (state.term) {
          state.term.options.fontSize = state.fontSize
          if (state.fit) state.fit.fit()
          // Ensure geometry settles and push an explicit resize to backend
          const sid = (window as any).__SESSION_ID__ || 's1'
          const send = () => {
            try {
              if (ws && ws.readyState === WebSocket.OPEN && sid) {
                const { cols, rows } = state.term
                ws.send(JSON.stringify({ type: 'resize', sessionId: sid, cols, rows }))
              }
            } catch {}
          }
          requestAnimationFrame(() => { try { if (state.fit) state.fit.fit() } catch {}; send() })
        }
      }
    }
  }

  ws.onclose = (event) => {
    if (state.currentWs === ws) state.currentWs = null
    status.textContent = 'disconnected'; dot.style.background = '#aaa'
    console.log('WebSocket closed:', event.code, event.reason)
    if (event.code !== 1000 && event.code !== 1001) {
      console.log('Attempting to reconnect in 3 seconds...')
      setTimeout(() => { if (state.currentWs === null) { console.log('Reconnecting...'); connect() } }, 3000)
    }
  }

  ws.onerror = (event) => { if (state.currentWs === ws) state.currentWs = null; status.textContent = 'error'; dot.style.background = '#e74c3c'; console.error('WebSocket error:', event) }

  if (state.term) bindTerminalHandlers(ws)
  ensureWriteParsedWatcher()
}

export function setSessionConfig(config: Partial<SessionConfig>) {
  try {
    if (config && typeof config === 'object') {
      state.sessionConfig = {
        cmd: (config.cmd ?? (state.sessionConfig?.cmd ?? 'acli'))!,
        args: Array.isArray(config.args) ? config.args : (state.sessionConfig?.args ?? ['rovodev', 'run']),
        pty: (config.pty ?? (state.sessionConfig?.pty ?? true))!,
        env: Array.isArray(config.env) ? config.env : (state.sessionConfig?.env ?? ['LANG=C.UTF-8']),
      }
      console.log('Session configuration updated:', state.sessionConfig)
    }
  } catch (e) { console.error('Failed to set session config:', e) }
}

export function updateSessionCommand(customCommand: string) {
  try {
    if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
      state.currentWs.send(JSON.stringify({ type: 'updateSessionConfig', customCommand: customCommand || '' }))
      console.log('Session command update sent to backend:', customCommand)
    } else { console.warn('Cannot update session command: WebSocket not connected') }
  } catch (e) { console.error('Failed to update session command:', e) }
}
