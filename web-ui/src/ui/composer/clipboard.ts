import {buildChipToken, insertChipToken} from './chips'
import {getComposerInput} from '../focus'
import {serializeDomToText} from './serialize'
import {reconcileRegistryWithComposer} from './reconcile'
import {sendTextToStdin} from '../session'

export function handleCopy(ev: ClipboardEvent) {
  try {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    // Build a container once for plain text serialization
    const container = document.createElement('div')
    container.appendChild(range.cloneContents())
    // Compute plain text preserving newlines and serializing chips to tokens
    const plain = serializeDomToText(container, { chipSerializer: (el) => buildChipToken(el) })
    // Build a second container for HTML with chips replaced by tokens
    const htmlContainer = document.createElement('div')
    htmlContainer.appendChild(range.cloneContents())
    const chips = htmlContainer.querySelectorAll('.composer-chip')
    chips.forEach((n) => {
      const el = n as HTMLElement
      const textToken = buildChipToken(el)
      const textNode = document.createTextNode(textToken)
      el.replaceWith(textNode)
    })
    if (ev.clipboardData) {
      ev.preventDefault()
      ev.clipboardData.setData('text/plain', plain)
      ev.clipboardData.setData('text/html', htmlContainer.innerHTML)
    }
  } catch {}
}

export function handlePaste(ev: ClipboardEvent) {
  try {
    const input = getComposerInput()
    if (!input) return
    const dt = ev.clipboardData
    if (!dt) return
    ev.preventDefault()
    
    // Check if clipboard contains image data
    // Method 1: Check MIME types (for copied image data)
    const hasImageType = dt.types.some(type => type.startsWith('image/'))
    // Method 2: Check files array (for copied image files)
    const hasImageFile = dt.files && dt.files.length > 0 && 
      Array.from(dt.files).some(file => file.type.startsWith('image/'))
    
    if (hasImageType || hasImageFile) {
      // Send Ctrl+V to backend terminal and insert placeholder in composer
      sendTextToStdin('\x16')
      insertImagePlaceholder(input)
      return
    }
    
    const text = dt.getData('text/plain')
    if (text) {
      pasteWithMarkupParsing(input, text)
      return
    }
    const html = dt.getData('text/html')
    if (html) {
      // naive: strip tags, then parse markup
      const tmp = document.createElement('div')
      tmp.innerHTML = html
      pasteWithMarkupParsing(input, tmp.textContent || '')
    }
  } catch {}
}

export function pasteWithMarkupParsing(root: HTMLElement, text: string) {
  // Split by our chip tokens <[#path][display]>
  const parts: Array<{type: 'text'|'chip', text?: string, path?: string, display?: string}> = []
  const re = /<\[#([^\]]+)\]\[([^\]]*)\]>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) })
    parts.push({ type: 'chip', path: m[1], display: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })

  for (const part of parts) {
    if (part.type === 'text') {
      insertPlainText(root, part.text || '')
    } else {
      insertChipToken(root, part.path || '')
    }
  }
  //placeCaretAtEnd(root)
  reconcileRegistryWithComposer()
}

export function insertPlainText(root: HTMLElement, text: string) {
  if (!text) return
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(document.createTextNode(text))
    range.collapse(false)
    sel.removeAllRanges(); sel.addRange(range)
  } else {
    root.appendChild(document.createTextNode(text))
  }
}

export function insertImagePlaceholder(root: HTMLElement): void {
  const span = document.createElement('span')
  span.className = 'composer-image-placeholder'
  span.setAttribute('contenteditable', 'false')
  span.title = 'Image pasted to terminal'
  span.setAttribute('data-tip', 'Image pasted to terminal')
  const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  span.innerHTML = `<span class="chip-at">📷</span><span class="chip-label">Image</span>`
  
  // Place into current selection or at end
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(span)
    range.collapse(false)
    const space = document.createTextNode(' ')
    span.after(space)
    sel.removeAllRanges(); const r = document.createRange(); r.setStartAfter(space); r.collapse(true); sel.addRange(r)
  } else {
    // Append
    if (!root.lastChild || (root.lastChild.nodeType === Node.ELEMENT_NODE)) root.appendChild(document.createTextNode(''))
    root.appendChild(span)
    root.appendChild(document.createTextNode(' '))
  }
}
