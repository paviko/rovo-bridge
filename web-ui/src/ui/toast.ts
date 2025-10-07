export function showToast(msg: string): void {
  try {
    const root = document.getElementById('root')!
    const el = document.createElement('div')
    el.className = 'toast'
    el.textContent = msg
    root.appendChild(el)
    setTimeout(() => { el.classList.add('hide') }, 2200)
    setTimeout(() => { el.remove() }, 2600)
  } catch (e) {
    console.error('Failed to show toast:', e)
  }
}

// Generic banner helper used for notices like process exit or input-disabled hints
// The banner is appended to #root with absolute positioning.
export type BannerOptions = {
  id?: string
  color?: string
  background?: string
  timeoutMs?: number
  buttonText?: string
  onButtonClick?: () => void
  left?: string
  right?: string
  top?: string
  bottom?: string
}

export function removeBanner(id: string): void {
  try {
    const root = document.getElementById('root')
    if (!root) return
    const existing = root.querySelector(`[data-banner-id="${id}"]`)
    if (existing) (existing as HTMLElement).remove()
  } catch {}
}

export function showBanner(message: string, opts: BannerOptions = {}): HTMLElement | null {
  try {
    const root = document.getElementById('root')!
    if (!root) return null

    // Deduplicate by id
    if (opts.id) removeBanner(opts.id)

    const banner = document.createElement('div')
    if (opts.id) banner.setAttribute('data-banner-id', opts.id)
    banner.style.position = 'absolute'
    banner.style.left = opts.left ?? '10px'
    banner.style.bottom = opts.bottom ?? '10px'
    if (opts.right != null) banner.style.right = opts.right
    if (opts.top != null) banner.style.top = opts.top
    banner.style.background = opts.background ?? 'rgba(0,0,0,0.7)'
    banner.style.color = opts.color ?? '#fff'
    banner.style.padding = '6px 10px'
    banner.style.borderRadius = '6px'
    banner.style.font = '12px monospace'
    banner.textContent = message

    if (opts.buttonText) {
      const btn = document.createElement('button')
      btn.textContent = opts.buttonText
      btn.style.marginLeft = '8px'
      btn.onclick = () => {
        try { if (typeof opts.onButtonClick === 'function') opts.onButtonClick() } finally { try { banner.remove() } catch {} }
      }
      banner.appendChild(btn)
    }

    root.appendChild(banner)

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      setTimeout(() => { try { banner.remove() } catch {} }, opts.timeoutMs)
    }

    return banner
  } catch (e) {
    console.error('Failed to show banner:', e)
    return null
  }
}
