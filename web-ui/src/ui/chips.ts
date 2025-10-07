import {type FileChipInfo, state} from './state'
import {baseName, quotePath} from './utils'
import {bindRemoveChip} from './segments'
import {focus} from "./focus";

export function addChips(paths: string[]): string {
  const chipbar = document.getElementById('chipbar')!
  let fullText = ''

  for (const p of paths) {
    const name = baseName(p)
    let info = state.fileRegistry.get(p)
    if (!info) {
      const chip = document.createElement('span')
      chip.className = 'chip'
      chip.title = p
      chip.setAttribute('data-tip', p)
      const m = name.match(/:(\d+)-(\d+)$/)
      const label = m ? name.slice(0, m.index!) : name
      const range = m ? `:${m[1]}-${m[2]}` : ''
      const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const labelHtml = `<span class="chip-at">#</span><span class="chip-label">${esc(label)}</span>`
      const rangeHtml = range ? `<span class=\"chip-range\" title=\"Selected lines\" data-tip=\"Selected lines\">${esc(range)}</span>` : ''
      chip.innerHTML = labelHtml + rangeHtml + ` <input type=\"checkbox\" class=\"chip-check\">`
      chipbar.appendChild(chip)
      // Open in IDE when clicking on the chip (outside the checkbox)
      chip.addEventListener('click', (ev) => {
        const target = ev.target as HTMLElement | null
        if (target && target.closest('.chip-check')) return
        try { const fn = (window as any).__openInIDE; if (typeof fn === 'function') fn(p) } catch {}
      })
      const check = chip.querySelector('.chip-check') as HTMLInputElement
      info = { chipEl: chip, checkEl: check, permanent: false, wasPermanent: false, checkedSinceIterStart: false } as FileChipInfo
      check.addEventListener('change', () => {
        const i = info!
        if (i.permanent) {
          // Toggle off permanence but remember it was permanent; keep checkbox checked
          i.permanent = false
          i.wasPermanent = true
          try { if (i.chipEl) i.chipEl.classList.remove('permanent') } catch {}
          check.checked = true
          // Do not treat as newly checked this iteration
          i.checkedSinceIterStart = true
        } else if (i.wasPermanent) {
          // Toggle back to permanent; keep checkbox checked
          i.permanent = true
          i.wasPermanent = false
          try { if (i.chipEl) i.chipEl.classList.add('permanent') } catch {}
          check.checked = true
          // Do not treat as newly checked this iteration
          i.checkedSinceIterStart = false
        } else {
          // Normal non-permanent behavior: track changes for this iteration
          i.checkedSinceIterStart = !!check.checked
          state.composerChecked.set(p, !!check.checked)
        }
        focus();
      })
      state.fileRegistry.set(p, info)
    }
    const textWithSpace = quotePath(p) + ' '
    fullText += textWithSpace
  }
  return fullText
}

export function removeChipAndRegistration(path: string): void {
  const info = state.fileRegistry.get(path)
  if (info && info.permanent) {
    const existingId = state.segmentsByPath.get(path)
    if (existingId !== undefined) {
      const seg = state.segments.get(existingId)
      if (seg) { try { if (seg.marker && !seg.marker.isDisposed) seg.marker.dispose() } catch {}; state.segments.delete(existingId) }
      state.segmentsByPath.delete(path)
    }
    return
  }
  if (info && info.chipEl) info.chipEl.remove()
  state.fileRegistry.delete(path)
  const existingId = state.segmentsByPath.get(path)
  if (existingId !== undefined) {
    const seg = state.segments.get(existingId)
    if (seg) { try { if (seg.marker && !seg.marker.isDisposed) seg.marker.dispose() } catch {}; state.segments.delete(existingId) }
    state.segmentsByPath.delete(path)
  }
}

// bind back so segments.ts can call chip removal without circular import at runtime
bindRemoveChip(removeChipAndRegistration)

export function clearChips(): void {
  try {
    state.fileRegistry.forEach((info) => { try { if (info && info.chipEl) info.chipEl.remove() } catch {} })
    state.fileRegistry.clear()
  } catch {}
}
