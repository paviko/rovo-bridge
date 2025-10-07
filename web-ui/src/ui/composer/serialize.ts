// Get text before caret inside a contenteditable input
export function getTextBeforeCaret(input: HTMLElement): string {
  try {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !input.contains(sel.focusNode)) return input.textContent || ''
    const range = document.createRange()
    range.selectNodeContents(input)
    range.setEnd(sel.focusNode!, sel.focusOffset)
    return range.toString()
  } catch {
    return input.textContent || ''
  }
}

// Serialize DOM to text preserving newlines and allowing chip serialization
export function serializeDomToText(root: Node, opts?: { chipSerializer?: (el: HTMLElement) => string, blockTags?: RegExp }): string {
  const blockRx = (opts && opts.blockTags) || /^(DIV|P|LI|PRE)$/i
  let out = ''

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (el.classList.contains('composer-chip')) {
        const chipText = opts && opts.chipSerializer ? opts.chipSerializer(el) : (el.textContent || '')
        out += chipText
        return
      }
      if (el.classList.contains('composer-image-placeholder')) {
        // Image placeholders should not contribute to the serialized text
        return
      }
      if (el.tagName === 'BR') { out += '\n'; return }
      // If this is a block element and previous sibling isn't a block or BR, ensure separation from preceding inline/text
      if ((blockRx.test(el.tagName))) {
        const prev = el.previousSibling
        const prevIsBlock = !!(prev && prev.nodeType === Node.ELEMENT_NODE && blockRx.test((prev as HTMLElement).nodeName))
        const prevIsBR = !!(prev && prev.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).nodeName === 'BR')
        if (!prevIsBlock && !prevIsBR && out && !out.endsWith('\n')) {
          out += '\n'
        }
      }
      const startLen = out.length
      for (let i = 0; i < el.childNodes.length; i++) walk(el.childNodes[i])
      if (blockRx.test(el.tagName) && out.length > startLen && !out.endsWith('\n')) out += '\n'
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node as Text).nodeValue || ''
    }
  }

  // Iterate children of root to avoid adding a trailing newline for the root element itself
  const children = (root as any).childNodes as NodeListOf<Node> | undefined
  if (children && typeof (children as any).length === 'number') {
    for (let i = 0; i < (children as any).length; i++) walk((children as any)[i])
  } else {
    walk(root)
  }
  return out
}
