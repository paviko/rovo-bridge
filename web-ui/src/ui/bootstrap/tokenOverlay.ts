export function showTokenOverlay(): void {
  try {
    if (document.getElementById('token-overlay')) return
    const overlay = document.createElement('div')
    overlay.id = 'token-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.background = 'rgba(0,0,0,0.6)'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.zIndex = '9999'

    const card = document.createElement('div')
    card.style.background = '#1e1e1e'
    card.style.color = '#eee'
    card.style.border = '1px solid #444'
    card.style.borderRadius = '8px'
    card.style.padding = '16px'
    card.style.width = 'min(520px, 90vw)'
    card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)'

    const title = document.createElement('div')
    title.textContent = 'Enter access token'
    title.style.fontSize = '16px'
    title.style.marginBottom = '8px'
    title.style.fontWeight = '600'
    card.appendChild(title)

    const desc = document.createElement('div')
    desc.textContent = 'Paste the token issued by RovoBridge (printed in logs)'
    desc.style.fontSize = '13px'
    desc.style.opacity = '0.85'
    desc.style.marginBottom = '12px'
    card.appendChild(desc)

    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.gap = '8px'

    const input = document.createElement('input')
    input.type = 'password'
    input.placeholder = 'Token'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.style.flex = '1'
    input.style.padding = '8px 10px'
    input.style.borderRadius = '6px'
    input.style.border = '1px solid #555'
    input.style.background = '#111'
    input.style.color = '#eee'
    input.id = 'token-overlay-input'

    const btn = document.createElement('button')
    btn.textContent = 'Connect'
    btn.style.padding = '8px 12px'
    btn.style.border = '1px solid #3a7bd5'
    btn.style.background = '#2d89ef'
    btn.style.color = 'white'
    btn.style.borderRadius = '6px'
    btn.style.cursor = 'pointer'
    btn.onclick = () => {
      try {
        const v = (document.getElementById('token-overlay-input') as HTMLInputElement | null)?.value?.trim() || ''
        if (v) { (window as any).__setToken(v) }
      } catch { }
    }

    row.appendChild(input)
    row.appendChild(btn)
    card.appendChild(row)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    setTimeout(() => { try { input.focus() } catch { } }, 0)
  } catch { }
}
