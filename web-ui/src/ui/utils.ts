export const enc = new TextEncoder()

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function bytesToB64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any)
  }
  return btoa(binary)
}

export function isWindows(): boolean {
  return !!(navigator.platform && /win/i.test(navigator.platform))
}

export function fileUrlToPath(u: string): string | null {
  try {
    const url = new URL(u)
    if (url.protocol !== 'file:') return null
    let p = decodeURIComponent(url.pathname)
    if (isWindows()) {
      if (p.startsWith('/')) p = p.slice(1)
      p = p.replace(/\//g, '\\')
    }
    return p
  } catch {
    return null
  }
}

export function baseName(p: string): string {
  if (!p) return p
  const isWinRoot = /^[A-Za-z]:[\\\/]?$/.test(p)
  if (!isWinRoot) {
    if (p.length > 1) p = p.replace(/[\/]$/, '')
  } else {
    if (!/^[A-Za-z]:[\\\/]$/.test(p)) p = p.replace(/[\\\/]$/, '')
  }
  const parts = p.split(/[\\\/]/)
  const last = parts[parts.length - 1]
  return last || p
}

export function normalizePath(p: string): string {
  if (!p) return ''
  let s = p.replace(/\\/g, '/')
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s
}

export function toRelativeIfWithin(p: string, cwd: string): string | null {
  const n = normalizePath(p)
  const c = normalizePath(cwd)
  if (c && (n === c || n.startsWith(c + '/'))) {
    const rel = n === c ? '.' : n.slice(c.length + 1)
    return rel
  }
  return null
}

export function quotePath(p: string): string {
  if (isWindows()) {
    return /[\s&()^%!"|<>]/.test(p) ? '"' + p.replace(/\"/g, '\\"') + '"' : p
  } else {
    return /[^A-Za-z0-9_./:-]/.test(p) ? '\'' + p.replace(/'/g, "'\\''") + '\'' : p
  }
}

export function getComposerEl(): HTMLElement | null {
    return document.getElementById('composer')
}

export function isComposerVisible(): boolean {
  const el = getComposerEl()
  return !!el && !el.classList.contains('collapsed')
}