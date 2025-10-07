// Shared state and types for the Composer overlay

export type MentionItem = { short: string, path: string, isDir?: boolean, special?: 'all-opened' | 'current' }

export const overlayState = {
  el: null as HTMLElement | null,
  listEl: null as HTMLElement | null,
  visible: false,
  items: [] as MentionItem[],
  activeIndex: 0,
  anchorRect: null as DOMRect | null,
  inputEl: null as HTMLElement | null,
}

export const slashCommands: string[] = [
  '/models',
  '/sessions',
  '/clear',
  '/prune',
  '/instructions',
  '/memory',
  '# <note>',
  '#! <note>',
  '/usage',
  '/copy',
  '/directories',
  '/mcp',
  '/feedback',
  '/yolo',
  '/exit',
]

// Which character triggered the overlay ('#' or '/')
export let overlayTrigger: '#' | '/' = '#'
export function setOverlayTrigger(t: '#' | '/') { overlayTrigger = t }

// Current pattern after trigger char
export let currentAtPattern = ''
export function setCurrentAtPattern(v: string) { currentAtPattern = v }
