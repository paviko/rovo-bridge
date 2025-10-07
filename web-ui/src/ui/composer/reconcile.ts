import {state} from '../state'
import {getComposerInput} from '../focus'
import {isComposerVisible} from '../utils'
import {addChips, removeChipAndRegistration} from '../chips'
import {bindAndSyncComposerChip} from './chips'

export function reconcileRegistryWithComposer(): void {
  const input = getComposerInput()
  if (!input) return
  // If composer is hidden, prune any non-permanent chips not backed by an active segment marker
  if (!isComposerVisible()) {
    const toRemove: string[] = []
    state.fileRegistry.forEach((info, path) => {
      if (info.permanent || info.wasPermanent) return
      const segId = state.segmentsByPath.get(path)
      if (segId === undefined) { toRemove.push(path); return }
      const seg = state.segments.get(segId)
      if (seg?.startX === undefined) toRemove.push(path)
    })
    if (toRemove.length) toRemove.forEach((p) => removeChipAndRegistration(p))
    return
  }
  // Collect chips present
  const chipEls = Array.from(input.querySelectorAll('.composer-chip')) as HTMLElement[]
  const presentPaths = new Set<string>()
  for (const el of chipEls) { const p = el.dataset.path || ''; if (p) presentPaths.add(p) }
  // Any registered segments/chips not present should be removed (non-permanent only)
  const toRemove: string[] = []
  state.fileRegistry.forEach((info, path) => {
    if (info.permanent || presentPaths.has(path)) return
    const segId = state.segmentsByPath.get(path)
    if (segId === undefined) { toRemove.push(path); return }
    const seg = state.segments.get(segId)
    if (seg?.startX === undefined) toRemove.push(path)
  })
  if (toRemove.length) toRemove.forEach((p) => removeChipAndRegistration(p))
  // Any present paths missing from registry should be added
  const toAdd: string[] = []
  presentPaths.forEach((p) => { if (!state.fileRegistry.has(p)) toAdd.push(p) })
  if (toAdd.length) addChips(toAdd)
  // Ensure each composer chip is bound and mirrors chipbar state (permanent + checkbox)
  for (const el of chipEls) {
    const p = el.dataset.path || ''
    if (p) bindAndSyncComposerChip(el, p)
  }
  // If we just added to registry, bind again on next tick to catch late-created chipbar checkboxes
  if (toAdd.length) {
    setTimeout(() => {
      try {
        const chipEls2 = Array.from(input.querySelectorAll('.composer-chip')) as HTMLElement[]
        for (const el of chipEls2) {
          const p = el.dataset.path || ''
          if (p) bindAndSyncComposerChip(el, p)
        }
      } catch {}
    }, 0)
  }
}
