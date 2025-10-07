import {state} from './state'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {Unicode11Addon} from '@xterm/addon-unicode11'
import {showToast} from './toast'
import {addChips} from './chips'
import {ensureWriteParsedWatcher} from './segments'
import {sendTextToStdin} from './session'
import {baseName, quotePath, toRelativeIfWithin} from './utils'

export function initTerminal(): void {
  if (state.uiMode !== 'Terminal') {
    const termEl = document.getElementById('term')!
    termEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Canvas mode is not yet implemented. Please use Terminal mode.</div>'
    console.log('Canvas mode selected but not yet implemented')
    return
  }

  state.term = new Terminal({
    allowProposedApi: true,
    convertEol: true,
    cursorBlink: true,
    fontSize: state.fontSize,
    fontFamily: 'Fira Code, Menlo, Consolas, monospace',
  })
  state.fit = new FitAddon()
  state.term.loadAddon(state.fit)
  const uni = new Unicode11Addon()
  state.term.loadAddon(uni)
  state.term.unicode.activeVersion = '11'
  state.term.open(document.getElementById('term')!)
  state.fit.fit()

  // Override copy shortcuts: prevent sending to backend and copy selected text instead
  // Supported: Windows/Linux: Ctrl+C, Ctrl+Shift+C; macOS: Cmd+C
  // On copy, show a small toast. If no selection, toast indicates no selection.
  try {
    const handler = (ev: KeyboardEvent) => {
      const key = ev.key
      const isC = key === 'c' || key === 'C'
      // Copy chords: Ctrl+C, Ctrl+Shift+C, Cmd+C
      const isCopyChord = (
        ((ev.ctrlKey || ev.metaKey) && !ev.altKey && isC) ||
        (ev.ctrlKey && ev.shiftKey && !ev.altKey && isC)
      ) && !!(state.term && state.term.hasSelection && state.term.hasSelection())

      if (isCopyChord) {
        try {
          const hasSel = !!(state.term && state.term.hasSelection && state.term.hasSelection())
          if (hasSel) {
            // Build transformed text (replace registered segment tokens with chip markup)
            const sel = (state.term && typeof state.term.getSelection === 'function') ? state.term.getSelection() : ''
            let toCopy = sel || ''
            try {
              const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const map = new Map<string, string>()
              state.segments.forEach((seg) => {
                if (!seg || !seg.path || !seg.text) return
                const token = seg.text
                const tokenNoSpace = seg.text.trimEnd()
                const display = baseName(seg.path)
                if (token) map.set(token, `<[#${seg.path}][${display}]> `)
                if (tokenNoSpace) map.set(tokenNoSpace, `<[#${seg.path}][${display}]>`)
              })
              if (map.size > 0 && sel) {
                const keys = Array.from(map.keys())
                keys.sort((a, b) => b.length - a.length)
                const pattern = keys.map((k) => escapeRegExp(k)).join('|')
                const bigRe = new RegExp(pattern, 'g')
                toCopy = sel.replace(bigRe, (m: string) => map.get(m) || m)
              }
            } catch {}

            // Use hidden textarea selection to satisfy VSCode webview's copy behavior
            let ok = false
            try {
              const ta = document.createElement('textarea')
              ta.value = toCopy
              ta.setAttribute('readonly', 'true')
              ta.style.position = 'fixed'
              ta.style.opacity = '0'
              ta.style.left = '-10000px'
              ta.style.top = '-10000px'
              document.body.appendChild(ta)
              ta.focus()
              ta.select()
              if (typeof (document as any).execCommand === 'function') {
                ok = document.execCommand('copy')
              }
              ta.remove()
            } catch {}
            try { showToast(ok ? 'Copied selection' : 'Copy failed') } catch {}
          } else {
            // No selection: do not intercept, allow default so Ctrl+C can act as SIGINT in shell
            return true
          }
        } catch {}
        try { ev.preventDefault() } catch {}
        return false
      }

      // Detect paste chords and handle manually to avoid control characters on some platforms
      const isPasteChord = (
        ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (key === 'v' || key === 'V')) ||
        (ev.ctrlKey && ev.shiftKey && !ev.altKey && (key === 'v' || key === 'V')) ||
        (ev.shiftKey && !ev.ctrlKey && !ev.metaKey && key === 'Insert')
      )
      if (isPasteChord) {
        // Check if terminal input is enabled before allowing paste
        if ((state as any).terminalInputEnabled === false) {
          // Skip paste when terminal input is disabled
          try { ev.preventDefault() } catch {}
          return false
        }
        
        // Native-like paste: focus xterm's textarea and let the browser dispatch a real paste event
        try {
          const ta = ((state.term as any).textarea as HTMLTextAreaElement) || (state.term?.element?.querySelector?.('textarea') as HTMLTextAreaElement | null)
          if (ta && typeof ta.focus === 'function') ta.focus()
          else if (state.term && typeof state.term.focus === 'function') state.term.focus()
        } catch {}
        // Do not preventDefault; returning false stops xterm from handling the key
        // while allowing the browser to perform its native paste into the focused textarea
        return false
      }

      return true
    }
    if (state.term && typeof (state.term as any).attachCustomKeyEventHandler === 'function') {
      (state.term as any).attachCustomKeyEventHandler(handler)
    }
  } catch {}

  // Populate clipboard contents for terminal copies via the 'copy' event.
  // This mirrors the composer approach and is compatible with VSCode webview restrictions.
  try {
    if (!(document as any).__cascadeTermCopyBound) {
      document.addEventListener('copy', (ev: ClipboardEvent) => {
        try {
          // Only handle copies we initiated from the terminal key handler
          const intent = (document as any).__cascadeTermCopyIntent === true
          if (!intent) return
          if (!state.term || !(state.term as any).hasSelection || !state.term.hasSelection()) return

          const sel = (state.term && typeof state.term.getSelection === 'function') ? state.term.getSelection() : ''
          if (!sel) return

          // Replace any registered segment tokens within the selection with chip markup <[#path][display]>
          const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          let toCopy = sel
          try {
            const map = new Map<string, string>()
            state.segments.forEach((seg) => {
              if (!seg || !seg.path || !seg.text) return
              const token = seg.text
              const tokenNoSpace = seg.text.trimEnd()
              const display = baseName(seg.path)
              if (token) map.set(token, `<[#${seg.path}][${display}]> `)
              if (tokenNoSpace) map.set(tokenNoSpace, `<[#${seg.path}][${display}]>`)
            })
            if (map.size > 0) {
              const keys = Array.from(map.keys())
              keys.sort((a, b) => b.length - a.length)
              const pattern = keys.map((k) => escapeRegExp(k)).join('|')
              const bigRe = new RegExp(pattern, 'g')
              toCopy = sel.replace(bigRe, (m: string) => map.get(m) || m)
            }
          } catch {}

          if (ev.clipboardData) {
            ev.preventDefault()
            ev.clipboardData.setData('text/plain', toCopy)
            try { ev.stopImmediatePropagation() } catch {}
            try { ev.stopPropagation() } catch {}
          }
        } catch {}
      }, true)
      ;(document as any).__cascadeTermCopyBound = true
    }
  } catch {}

  // Intercept paste into xterm textarea to parse chip tokens and normalize newlines
  try {
    const ta = ((state.term as any).textarea as HTMLTextAreaElement) || (state.term?.element?.querySelector?.('textarea') as HTMLTextAreaElement | null)
    if (ta && !(ta as any).__cascadePasteBound) {
      ta.addEventListener('paste', (ev: ClipboardEvent) => {
        try {
          // Check if terminal input is enabled before processing paste
          if ((state as any).terminalInputEnabled === false) {
            // Skip paste when terminal input is disabled
            ev.preventDefault()
            try { ev.stopImmediatePropagation() } catch {}
            try { ev.stopPropagation() } catch {}
            return
          }
          
          const dt = ev.clipboardData
          if (!dt) return
          
          // Check if clipboard contains image data
          // Method 1: Check MIME types (for copied image data)
          const hasImageType = dt.types.some(type => type.startsWith('image/'))
          // Method 2: Check files array (for copied image files)
          const hasImageFile = dt.files && dt.files.length > 0 && 
            Array.from(dt.files).some(file => file.type.startsWith('image/'))
          
          if (hasImageType || hasImageFile) {
            // Prevent the default paste behavior and send Ctrl+V key sequence to terminal
            ev.preventDefault()
            try { ev.stopImmediatePropagation() } catch {}
            try { ev.stopPropagation() } catch {}
            
            // Send Ctrl+V as key sequence to the underlying terminal application
            // ASCII control code for Ctrl+V is \x16 (22 in decimal)
            sendTextToStdin('\x16')
            return
          }
          
          const plain = dt.getData('text/plain')
          const html = dt.getData('text/html')
          let text = ''
          if (plain) text = plain
          else if (html) {
            const tmp = document.createElement('div')
            tmp.innerHTML = html
            text = tmp.textContent || ''
          }
          // Always suppress xterm's internal paste handler; we'll no-op if no text
          ev.preventDefault()
          try { ev.stopImmediatePropagation() } catch {}
          try { ev.stopPropagation() } catch {}
          if (!text) return

          // Split by chip tokens <[#path][display]>
          const parts: Array<{type: 'text'|'chip', text?: string, path?: string}> = []
          // Because JS doesn't support conditional groups well, run a simpler loop mirroring composer
          const re2 = /<\[#([^\]]+)\]\[([^\]]*)\]>/g
          let last = 0
          let m: RegExpExecArray | null
          while ((m = re2.exec(text)) !== null) {
            if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) })
            parts.push({ type: 'chip', path: m[1] })
            last = m.index + m[0].length
          }
          if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })

          const cwd = (state.boot && (state.boot as any).cwd) || ''
          const paths: string[] = []
          let out = ''

          const uniq = new Set<string>()
          for (const part of parts) {
            if (part.type === 'text') {
              out += part.text || ''
            } else {
              const raw = part.path || ''
              // Keep as relative if it already looks relative; otherwise relativize to cwd when possible
              let p = raw
              const looksAbsolute = /^[A-Za-z]:[\\\/]/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')
              if (looksAbsolute) {
                const rel = toRelativeIfWithin(raw, cwd)
                if (rel !== null) p = rel
              }
              if (!uniq.has(p)) { uniq.add(p); paths.push(p) }
              const token = quotePath(p) + ' '
              out += token
            }
          }

          // Update chipbar/registry and register segments for newly seen paths
          if (paths.length > 0) {
            addChips(paths)
            for (const p of paths) {
              if (!state.segmentsByPath.has(p)) {
                const token = quotePath(p) + ' '
                const id = state.nextSegId++
                state.segments.set(id, { id, path: p, text: token, marker: null })
                state.segmentsByPath.set(p, id)
              }
            }
          }

          // Convert all newlines to backslash+CR and send
          const normalized = out.replace(/\r\n|\n|\r/g, "\\\r")
          ensureWriteParsedWatcher()
          sendTextToStdin(normalized)
          try { if ((state as any).terminalInputEnabled !== false && state.term) state.term.focus() } catch {}
        } catch {}
      }, true)
      ;(ta as any).__cascadePasteBound = true
    }
  } catch {}

}
