import {state} from '../state'
import {getComposerEl} from '../utils'
import {reconcileRegistryWithComposer} from './reconcile'

export function showComposer(show: boolean): void {
  const el = getComposerEl()
  if (!el) return
  if (show) el.classList.remove('collapsed'); else el.classList.add('collapsed')
  // Toggle terminal input enable/disable
  // Disable only when composer is visible and terminal expects a prompt
  const disabled = show && (state.terminalInputState === 'PromptWaiting' || state.terminalInputState === 'Unknown')
  ;(state as any).terminalInputEnabled = !disabled
  try { if (state.term && !show) state.term.focus() } catch {}
  reconcileRegistryWithComposer()
}
