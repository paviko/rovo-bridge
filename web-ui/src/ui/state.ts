// Central app state shared across modules
export type SessionConfig = {
  cmd: string
  args: string[]
  pty: boolean
  env: string[]
}

export type Segment = {
  id: number
  path: string
  text: string
  marker?: any
  startX?: number
  endX?: number
  endLineOffset?: number
}

export type FileChipInfo = {
  chipEl: HTMLElement
  checkEl: HTMLInputElement
  permanent: boolean
  wasPermanent: boolean
  checkedSinceIterStart: boolean
}

export type Boot = {
  token?: string
  cwd?: string
  [k: string]: any
}

export const state = {
  boot: {} as Boot,
  uiMode: 'Terminal' as 'Terminal' | 'Canvas',
  term: null as any,
  fit: null as any,
  fontSize: 12,
  // preference pushed by host; used to initialize sessions
  useClipboardPref: undefined as boolean | undefined,
  currentWs: null as WebSocket | null,
  iterationId: 1,
  backslashPending: false,
  terminalDisposables: [] as Array<(() => void) | { dispose: () => void }>,
  sessionConfig: null as SessionConfig | null,
  sessionLastSeq: 0,
  awaitingFirstOutput: false,
  forceFreshStart: false,
  // chips/segments
  fileRegistry: new Map<string, FileChipInfo>(),
  segments: new Map<number, Segment>(),
  segmentsByPath: new Map<string, number>(),
  nextSegId: 1,
  writeParsedInstalled: false,
  writeParsedDisposable: null as any,
  // editor/composer flag to gate xterm input
  terminalInputEnabled: true,
  // terminal input state derived from last non-empty terminal line
  terminalInputState: 'Unknown' as 'NavigationNeeded' | 'PromptWaiting' | 'Processing' | 'Unknown',
  // IDE integration (JCEF/VS Code/etc.)
  ideOpenedFiles: [] as string[],
  ideCurrentFile: null as string | null,
  // Remember composer checkbox state for non-permanent chips across hide/show cycles
  composerChecked: new Map<string, boolean>(),
  // Prompt history state
  historyInitialized: false,
}

export function initBootFromUrl(): void {
  const boot = (window as any).__BOOTSTRAP__ || {}
  const urlParams = new URLSearchParams(window.location.search)
  const uiMode = (urlParams.get('mode') as any) || 'Terminal'
  const fontSizeParam = urlParams.get('fontSize')
  let initialFont = 12
  if (fontSizeParam) {
    const parsed = parseInt(fontSizeParam, 10)
    if (!isNaN(parsed) && parsed >= 8 && parsed <= 72) initialFont = parsed
  }
  state.boot = boot
  state.uiMode = uiMode
  state.fontSize = initialFont
}
