import {state} from './state'
import {connect} from './websocket'
import {notifyFontSizeChanged, sendTextToStdin} from './session'
import {clearChips} from './chips'
import {clearSegmentsAndMarkers} from './segments'
import {historyModal} from './historyModal'

export function initControls(): void {
  const btnReconnect = document.getElementById('btnReconnect') as HTMLButtonElement | null
  const btnRestart = document.getElementById('btnRestart') as HTMLButtonElement | null
  const btnSimDrop = document.getElementById('btnSimDrop') as HTMLButtonElement | null
  const btnStop = document.getElementById('btnStop') as HTMLButtonElement | null
  const btnSimDrop2 = document.getElementById('btnSimDrop2') as HTMLButtonElement | null
  const inputFont = document.getElementById('fontSize') as HTMLInputElement | null
  const btnToggleChips = document.getElementById('btnToggleChips') as HTMLButtonElement | null
  const btnToggleComposer = document.getElementById('btnToggleComposer') as HTMLButtonElement | null
  const btnClear = document.getElementById('btnClear') as HTMLButtonElement | null
  const btnHistory = document.getElementById('btnHistory') as HTMLButtonElement | null

  if (btnReconnect) btnReconnect.onclick = () => connect()
  if (btnRestart) btnRestart.onclick = () => { const fn = (window as any).__restartSession; if (typeof fn === 'function') fn() }
  if (btnStop) btnStop.onclick = () => { try { sendTextToStdin("\x03") } catch {} }

  if (btnSimDrop) {
    btnSimDrop.onclick = () => {
      const cwd = (state.boot && (state.boot as any).cwd) || ''
      let base = cwd.replace(/\\/g, '/'); if (base.length > 1 && base.endsWith('/')) base = base.slice(0, -1)
      const rel = base.endsWith('/backend') ? 'internal/httpapi/ui/app1.js' : 'backend/internal/httpapi/ui/app1.js'
      const abs = base + '/' + rel.replace(/^\/+/, '')
      // When composer visible, route to composer
      getRoute()([abs])
    }
  }
  if (btnSimDrop2) {
    btnSimDrop2.onclick = () => {
      const cwd = (state.boot && (state.boot as any).cwd) || ''
      let base = cwd.replace(/\\/g, '/'); if (base.length > 1 && base.endsWith('/')) base = base.slice(0, -1)
      const rel = base.endsWith('/backend') ? 'internal/httpapi/ui/app2.js' : 'backend/internal/httpapi/ui/app2.js'
      const abs = base + '/' + rel.replace(/^\/+/, '')
      // When composer visible, route to composer
      getRoute()([abs])
    }
  }

  if (btnToggleChips) {
    const chipbar = document.getElementById('chipbar')
    const updateChipButtonUi = () => {
      const collapsed = chipbar?.classList.contains('collapsed')
      const label = collapsed ? 'Show Chips' : 'Hide Chips'
      btnToggleChips.title = label
      btnToggleChips.setAttribute('data-tip', label)
      btnToggleChips.setAttribute('aria-label', label)
      btnToggleChips.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    }
    btnToggleChips.onclick = () => {
      chipbar?.classList.toggle('collapsed')
      updateChipButtonUi()
      try { if (state.fit) state.fit.fit() } catch {}
    }
    updateChipButtonUi()
  }

  if (btnToggleComposer) {
    const composer = document.getElementById('composer')
    const updateComposerButtonUi = () => {
      const collapsed = composer?.classList.contains('collapsed')
      const label = collapsed ? 'Show Editor' : 'Hide Editor'
      btnToggleComposer.title = label
      btnToggleComposer.setAttribute('data-tip', label)
      btnToggleComposer.setAttribute('aria-label', label)
      btnToggleComposer.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    }
    btnToggleComposer.onclick = () => {
      composer?.classList.toggle('collapsed')
      updateComposerButtonUi()
      try { if (state.fit) state.fit.fit() } catch {}
      try { const r = (window as any).__composerVisibilityChanged; if (typeof r === 'function') r() } catch {}
    }
    updateComposerButtonUi()
  }

  if (btnClear) {
    btnClear.onclick = () => {
      try { clearChips() } catch {}
      try { clearSegmentsAndMarkers() } catch {}
    }
  }

  if (btnHistory) {
    btnHistory.onclick = () => {
      try { historyModal.toggle() } catch {}
    }
  }

  if (inputFont) {
    inputFont.value = String(state.fontSize)
    inputFont.onchange = () => {
      const v = parseInt(inputFont.value, 10)
      if (!isNaN(v) && v >= 8 && v <= 72) {
        if (state.term) {
          state.term.options.fontSize = v
          state.fontSize = v
          if (state.fit) state.fit.fit()
          // Fallback: explicitly send resize after a frame in case onResize doesn't fire
          requestAnimationFrame(() => {
            try {
              const sid = (window as any).__SESSION_ID__
              if (sid && state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
                const { cols, rows } = state.term
                console.log('[ui] font input -> explicit resize', { cols, rows })
                state.currentWs.send(JSON.stringify({ type: 'resize', sessionId: sid, cols, rows }))
              }
            } catch {}
          })
        }
        notifyFontSizeChanged(v)
      }
    }
  }
}

function getRoute() {
  return (paths: string[]) => {
    try {
      const r = (window as any).__insertPaths;
      if (typeof r === 'function') r(paths)
    } catch {
    }
  };
}