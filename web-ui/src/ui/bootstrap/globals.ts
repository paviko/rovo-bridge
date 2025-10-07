import {state} from '../state'
import {processPathsInsert} from '../dnd'
import {reconcileRegistryWithComposer, routeInsertPaths} from '../composer'
import {clearSegmentsAndMarkers, ensureWriteParsedWatcher} from '../segments'
import {clearChips} from '../chips'
import {connect, startSession} from '../websocket'
import {sendTextToStdin} from '../session'
import {quotePath, toRelativeIfWithin} from '../utils'
import {focusComposerInput} from '../focus'

/**
 * Defines global functions that serve as the core API for web UI operations.
 * Keeps all window.__* bridges centralized for both standalone and IDE modes.
 */
export function defineGlobals() {
  // Host can push opened tabs/files for IDE integrations (JetBrains JCEF, VS Code, etc.)
  ; (window as any).__updateOpenedFiles = function (opened: string[] = [], current?: string | null) {
    try {
      state.ideOpenedFiles = Array.isArray(opened) ? opened.slice(0, 200) : []
      state.ideCurrentFile = current || null
    } catch { }
  }

  // Toggle tooltip polyfill from host (to avoid double tooltips outside JCEF)
  ; (window as any).__setTooltipPolyfill = function (enabled: boolean) {
    try { document.documentElement.classList.toggle('tip-polyfill', !!enabled) } catch { }
  }
  ; (window as any).__setCurrentFile = function (current?: string | null) { try { state.ideCurrentFile = current || null } catch { } }
  ; (window as any).__setOpenedFiles = function (opened: string[] = []) { try { state.ideOpenedFiles = Array.isArray(opened) ? opened.slice(0, 200) : [] } catch { } }

  // direct path insert (bypass composer); used internally by composer routing
  ; (window as any).__insertPaths_direct = function (paths: string[]) {
    try { processPathsInsert(paths) } catch { }
  }
  ; (window as any).__insertPaths = function (paths: string[]) {
    try { routeInsertPaths(paths) } catch { }
  }

  ; (window as any).__pastePath = function (path: string) {
    try {
      const cwd = (state.boot && (state.boot as any).cwd) || ''
      const rel = toRelativeIfWithin(path, cwd)
      const toSend = rel !== null ? rel : path
      const text = quotePath(toSend) + ' '
      const comp = document.getElementById('composer')
      if (comp && !comp.classList.contains('collapsed')) {
        try { const f = (window as any).__composerAddText; if (typeof f === 'function') f(text) } catch { }
      } else {
        if (state.term) state.term.focus()
        ensureWriteParsedWatcher()
        sendTextToStdin(text)
      }
    } catch { }
  }

  ; (window as any).__setSessionConfig = function (config: any) {
    try {
      if (config && typeof config === 'object') {
        state.sessionConfig = {
          cmd: config.cmd || (state.sessionConfig ? state.sessionConfig.cmd : 'acli'),
          args: Array.isArray(config.args) ? config.args : (state.sessionConfig ? state.sessionConfig.args : ['rovodev', 'run']),
          pty: config.pty !== undefined ? config.pty : (state.sessionConfig ? state.sessionConfig.pty : true),
          env: Array.isArray(config.env) ? config.env : (state.sessionConfig ? state.sessionConfig.env : ['LANG=C.UTF-8'])
        }
        console.log('Session configuration updated:', state.sessionConfig)
      }
    } catch (e) { console.error('Failed to set session config:', e) }
  }

  ; (window as any).__restartSession = function () {
    try {
      state.iterationId = 1
      state.backslashPending = false
      clearSegmentsAndMarkers()
      clearChips()
      if (state.term) state.term.reset()
      state.sessionLastSeq = 0
      if (state.term && state.fit) {
        try { state.fit.fit() } catch { }
      }
      if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
        startSession(state.currentWs, false)
      } else {
        state.forceFreshStart = true
        connect()
      }
    } catch (e) { console.error('Failed to restart session:', e) }
  }

  ; (window as any).__updateSessionCommand = function (customCommand: string) {
    try {
      if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
        state.currentWs.send(JSON.stringify({ type: 'updateSessionConfig', customCommand: customCommand || '' }))
        console.log('Session command update sent to backend:', customCommand)
      } else { console.warn('Cannot update session command: WebSocket not connected') }
    } catch (e) { console.error('Failed to update session command:', e) }
  }

  ; (window as any).__setFontSize = function (newFontSize: number | string) {
    try {
      const v = parseInt(String(newFontSize), 10)
      if (!isNaN(v) && v >= 8 && v <= 72) {
        state.fontSize = v
        if (state.term) {
          state.term.options.fontSize = v
          if (state.fit) state.fit.fit()
          // Fallback: explicitly send resize after a frame in case onResize doesn't fire
          requestAnimationFrame(() => {
            try {
              const sid = (window as any).__SESSION_ID__
              if (sid && state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
                const { cols, rows } = state.term
                console.log('[ui] __setFontSize -> explicit resize', { cols, rows })
                state.currentWs.send(JSON.stringify({ type: 'resize', sessionId: sid, cols, rows }))
              }
            } catch { }
          })
          const targetOrigin = state.boot?.parentOrigin || '*';
          window.parent.postMessage({
            type: 'settingsChanged',
            key: 'fontSize',
            value: state.term.options.fontSize
          }, targetOrigin);
        }
        const inputFont = document.getElementById('fontSize') as HTMLInputElement | null
        if (inputFont) inputFont.value = v.toString()
      }
    } catch (e) { console.error('Failed to set font size:', e) }
  }

  // Token injection bridge from host (JetBrains JCEF etc.) or manual overlay
  ; (window as any).__setToken = function (token: string) {
    try {
      if (typeof token !== 'string' || !token) return
      state.boot = state.boot || ({} as any)
      const isNew = state.boot.token !== token
      state.boot.token = token
      try { const ov = document.getElementById('token-overlay'); if (ov) ov.remove() } catch { }
      if (isNew) {
        // Connect now that token is available
        if (!state.currentWs || state.currentWs.readyState !== WebSocket.OPEN) {
          connect()
        }
      }
    } catch (e) { console.error('Failed to set token:', e) }
  }

  // Parent origin injection bridge from host (VS Code webview etc.)
  ; (window as any).__setParentOrigin = function (origin: string) {
    try {
      if (typeof origin !== 'string' || !origin) return
      state.boot = state.boot || ({} as any)
      state.boot.parentOrigin = origin
      console.log('Parent origin set:', origin)
    } catch (e) { console.error('Failed to set parent origin:', e) }
  }

  // expose helpers for IDE host (composer visibility)
  ; (window as any).__composerVisibilityChanged = function () {
    const comp = document.getElementById('composer')
    if (!comp) return
    const visible = !comp.classList.contains('collapsed')
    // Disable terminal input only when composer is visible and terminal expects a prompt
    const disabled = visible && (state.terminalInputState === 'PromptWaiting' || state.terminalInputState === 'Unknown')
    ; (state as any).terminalInputEnabled = !disabled
    if (visible) {
      // switching on: ensure registry reflects chips in composer
      try { reconcileRegistryWithComposer() } catch { }
      try { focusComposerInput() } catch { }
    } else {
      // switching off: perform a scan to remove missing segments
      try { reconcileRegistryWithComposer() } catch { }
      try { if (state.term) state.term.focus() } catch { }
    }
    if (window.parent && window.parent !== window) {
      const targetOrigin = state.boot?.parentOrigin || '*';
      window.parent.postMessage({
        type: 'settingsChanged',
        key: 'composerCollapsed',
        value: !visible
      }, targetOrigin);
    }
  }

  ; (window as any).__openInIDE = function(path: any) {
    try {
      if (window.parent && window.parent !== window) {
        const targetOrigin = state.boot?.parentOrigin;
        if (targetOrigin) {
          window.parent.postMessage({type: 'openFile', path: path}, targetOrigin);
        } else {
          console.warn('Parent origin not available, falling back to wildcard');
          window.parent.postMessage({type: 'openFile', path: path}, '*');
        }
      }
    } catch(e) {
      console.warn('Failed to open file in IDE:', e);
    }
  }
}
