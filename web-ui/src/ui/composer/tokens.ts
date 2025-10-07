import {getComposerInput} from '../focus'
import {overlayState} from './state'
import {getTextBeforeCaret} from './serialize'

export function removeLoneAtFromInput() {
  // Remove the entire '#pattern' token (from last '#' to caret), including the '#'
  const input = overlayState.inputEl || getComposerInput()
  if (!input) return
  try {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !input.contains(sel.focusNode)) return
    const before = getTextBeforeCaret(input)
    const atPos = before.lastIndexOf('#')
    if (atPos < 0) return
    // Build a range from start of '#' to current caret
    const r = document.createRange()
    // Find caret range
    const caretRange = sel.getRangeAt(0).cloneRange()
    // Find node/offset at '#'
    const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null)
    let acc = 0
    let node: Node | null = walker.nextNode()
    while (node) {
      const t = node as Text
      const len = t.nodeValue ? t.nodeValue.length : 0
      if (acc + len > atPos) {
        const local = Math.max(0, atPos - acc)
        r.setStart(t, local)
        r.setEnd(caretRange.endContainer, caretRange.endOffset)
        break
      }
      acc += len
      node = walker.nextNode()
    }
    // Delete the range
    r.deleteContents()
  } catch {}
}

export function removeLoneSlashFromInput() {
  // Remove the entire '/pattern' token (from last '/' to caret), including the '/'
  const input = overlayState.inputEl || getComposerInput()
  if (!input) return
  try {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !input.contains(sel.focusNode)) return
    const before = getTextBeforeCaret(input)
    const sPos = before.lastIndexOf('/')
    if (sPos < 0) return
    const r = document.createRange()
    const caretRange = sel.getRangeAt(0).cloneRange()
    const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null)
    let acc = 0
    let node: Node | null = walker.nextNode()
    while (node) {
      const t = node as Text
      const len = t.nodeValue ? t.nodeValue.length : 0
      if (acc + len > sPos) {
        const local = Math.max(0, sPos - acc)
        r.setStart(t, local)
        r.setEnd(caretRange.endContainer, caretRange.endOffset)
        break
      }
      acc += len
      node = walker.nextNode()
    }
    r.deleteContents()
  } catch {}
}

export function replaceSlashTokenWithText(text: string) {
  const input = overlayState.inputEl || getComposerInput()
  if (!input) return
  try {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !input.contains(sel.focusNode)) return
    const before = getTextBeforeCaret(input)
    const slashPos = before.lastIndexOf('/')
    if (slashPos < 0) return
    // Range covering /..caret
    const r = document.createRange()
    const caretRange = sel.getRangeAt(0).cloneRange()
    const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null)
    let acc = 0
    let node: Node | null = walker.nextNode()
    while (node) {
      const t = node as Text
      const len = t.nodeValue ? t.nodeValue.length : 0
      if (acc + len > slashPos) {
        const local = Math.max(0, slashPos - acc)
        r.setStart(t, local)
        r.setEnd(caretRange.endContainer, caretRange.endOffset)
        break
      }
      acc += len
      node = walker.nextNode()
    }
    // Replace contents with plain text
    r.deleteContents()
    const tn = document.createTextNode(text + ' ')
    r.insertNode(tn)
    const sel2 = window.getSelection()
    if (sel2) { sel2.removeAllRanges(); const nr = document.createRange(); nr.setStartAfter(tn); nr.collapse(true); sel2.addRange(nr) }
  } catch {}
}
