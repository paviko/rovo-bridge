import {state} from './state'
import {fileUrlToPath, quotePath, toRelativeIfWithin} from './utils'
import {addChips} from './chips'
import {ensureWriteParsedWatcher} from './segments'
import {sendTextToStdin} from './session'
import {showToast} from './toast'
import {focus} from "./focus";

export function extractPathsFromDrop(ev: DragEvent): string[] {
  const cwd = (state.boot && (state.boot as any).cwd) || ''
  const chipbar = document.getElementById('chipbar')!
  chipbar.title = 'Dropped files appear here. Hover to see full path.'
  chipbar.setAttribute('data-tip', 'Dropped files appear here. Hover to see full path.')
  const dt = ev.dataTransfer!
  const types: string[] = dt && (dt as any).types ? Array.from((dt as any).types) : []
  const hasFileTypes = types.includes('application/vnd.code.uri-list') ||
                      types.includes('text/uri-list') ||
                      types.includes('application/vnd.code.tree.explorer')

  // Helper: best-effort directory path detection from a string
  const looksLikeDirectoryPath = (p: string): boolean => {
    // Heuristic: trailing slash/backslash typically indicates a directory (e.g., file:///Users/me/Folder/)
    return /[\\/]$/.test(p)
  }

  const collected: string[] = []

  // 1) Prefer DataTransferItem-based extraction when available; this allows reliable directory detection
  try {
    const items = dt.items as any
    if (items && items.length > 0) {
      const fileItems: any[] = []
      for (let i = 0; i < items.length; i++) {
        const it: any = items[i]
        if (it && it.kind === 'file') fileItems.push(it)
      }
      if (fileItems.length > 0) {
        for (let idx = 0; idx < fileItems.length; idx++) {
          const it: any = fileItems[idx]
          try {
            const getEntry = (it as any).webkitGetAsEntry || (it as any).getAsEntry
            const entry = typeof getEntry === 'function' ? getEntry.call(it) : null
            if (entry && entry.isDirectory) {
              // Skip directories entirely
              continue
            }
            const f = typeof it.getAsFile === 'function' ? it.getAsFile() : null
            const p = f && typeof (f as any).path === 'string' ? (f as any).path : null
            if (p) collected.push(p)
          } catch {}
        }
      }
      if (collected.length > 0) return collected
    }
  } catch {}

  // 2) Fallback: parse uri-list and text/plain (filter out directories by trailing slash heuristic)
  const paths: string[] = []
  try {
    let uriList = dt.getData('text/uri-list')
    if (!uriList) {
      uriList = dt.getData('application/vnd.code.uri-list')
    }
    if (uriList) {
      uriList.split(/\r?\n/).forEach((line) => {
        const s = line.trim()
        if (!s || s.startsWith('#')) return
        const p = fileUrlToPath(s)
        if (p && !looksLikeDirectoryPath(p)) paths.push(p)
      })
    }
  } catch {}

  // 2b) VS Code TreeView drops (Explorer)
  try {
    const explorerType = 'application/vnd.code.tree.explorer'
    if (types.includes(explorerType)) {
      const explorerData = dt.getData(explorerType)
      if (explorerData) {
        try {
          const parsed = JSON.parse(explorerData)
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const item of parsed) {
              const uri = (item && (item.uri || (item.resource && item.resource.uri))) || null
              if (typeof uri === 'string') {
                const p = fileUrlToPath(uri)
                if (p && !looksLikeDirectoryPath(p)) paths.push(p)
              }
            }
          }
        } catch {}
      }
    }
  } catch {}
  if (paths.length === 0) {
    try {
      const txt = (!hasFileTypes && (dt.getData('text') || dt.getData('text/plain'))) || ''
      if (txt) {
        txt.split(/\r?\n/).forEach((line) => {
          const s = line.trim()
          if (!s) return
          if (/^file:\/\//i.test(s)) { const p = fileUrlToPath(s); if (p && !looksLikeDirectoryPath(p)) paths.push(p) }
          else if (/^[A-Za-z]:\\\\|^\\\\\\\\/.test(s) || s.startsWith('/')) { if (!looksLikeDirectoryPath(s)) paths.push(s) }
        })
      }
    } catch {}
  }

  // 3) Final fallback: dt.files with index-correlated dt.items when possible; skip directories
  if (paths.length === 0 && dt.files && dt.files.length > 0) {
    try {
      const fileItems: any[] = []
      const items = dt.items as any
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const it: any = items[i]
          if (it && it.kind === 'file') fileItems.push(it)
        }
      }
      for (let i = 0; i < dt.files.length; i++) {
        // If we have a matching DataTransferItem, use it to filter directories
        if (fileItems[i]) {
          try {
            const getEntry = (fileItems[i] as any).webkitGetAsEntry || (fileItems[i] as any).getAsEntry
            const entry = typeof getEntry === 'function' ? getEntry.call(fileItems[i]) : null
            if (entry && entry.isDirectory) continue
          } catch {}
        }
        const f: any = dt.files[i]
        if (typeof f.path === 'string' && f.path && !looksLikeDirectoryPath(f.path)) paths.push(f.path)
      }
    } catch {
      for (let i = 0; i < dt.files.length; i++) {
        const f: any = dt.files[i]
        if (typeof f.path === 'string' && f.path && !looksLikeDirectoryPath(f.path)) paths.push(f.path)
      }
    }
  }
  return paths
}

export function processPathsInsert(paths: string[]): void {
  try {
    focus();
    if (Array.isArray(paths) && paths.length > 0) {
      const cwd = (state.boot && (state.boot as any).cwd) || ''
      const relOrAbs: string[] = []
      const outOfScope: string[] = []
      for (const p of paths) {
        const rel = toRelativeIfWithin(p, cwd)
        if (rel !== null) relOrAbs.push(rel); else outOfScope.push(p)
      }
      if (relOrAbs.length > 0) {
        const preExisting = new Set(relOrAbs.filter((p) => state.fileRegistry.has(p)))
        const text = addChips(relOrAbs)
        for (const p of relOrAbs) {
          if (preExisting.has(p) || state.segmentsByPath.has(p)) continue
          const token = quotePath(p) + ' '
          const id = state.nextSegId++
          state.segments.set(id, { id, path: p, text: token, marker: null })
          state.segmentsByPath.set(p, id)
        }
        ensureWriteParsedWatcher()
        sendTextToStdin(text)
        focus();
      }
      if (outOfScope.length > 0) {
        const msg = `Some files are outside of scope (cwd: ${cwd}):\n` + outOfScope.join('\n')
        showToast(msg)
      }
    }
  } catch {}
}

function setupDnDGuards() {
  if ((document as any).__globalDnDBound) return
  document.addEventListener('dragover', (ev) => { try { ev.preventDefault() } catch {} })
  document.addEventListener('drop', (ev) => { try { ev.preventDefault(); ev.stopPropagation() } catch {}; focus(); })
  ;(document as any).__globalDnDBound = true
}

export function initDnd(termEl: HTMLElement): void {
  setupDnDGuards()
  if ((termEl as any).__dndBound) return
  termEl.addEventListener('dragover', (ev) => { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy' })
  termEl.addEventListener('drop', (ev) => {
    // If composer is visible, route insertion to composer instead of terminal
    const comp = document.getElementById('composer')
    if (comp && !comp.classList.contains('collapsed')) {
      ev.preventDefault(); ev.stopPropagation();
      const paths = extractPathsFromDrop(ev)
      try { const r = (window as any).__insertPaths; if (typeof r === 'function') r(paths) } catch {}
      return
    }

    ev.preventDefault(); ev.stopPropagation(); focus();
    const paths = extractPathsFromDrop(ev)
    if (paths.length > 0) processPathsInsert(paths)
  })
  ;(termEl as any).__dndBound = true
}
