import {initBootFromUrl, state} from './state'
import {initTerminal} from './terminal'
import {initDnd} from './dnd'
import {initControls} from './controls'
import {connect} from './websocket'
import {initComposer, showComposer} from './composer/index'
import {focusComposerInput} from "./focus";
import {MessageDispatcher} from './bootstrap/messageDispatcher/index'
import {showTokenOverlay} from './bootstrap/tokenOverlay'
import {defineGlobals} from './bootstrap/globals'
import {initKeyboardHandler} from './bootstrap/keyboardHandler'
import './historyModal' // Initialize history modal

// Global message dispatcher instance
let messageDispatcher: MessageDispatcher | null = null;

export function bootstrap() {
  initBootFromUrl()
  initTerminal()
  const termEl = document.getElementById('term')!
  initDnd(termEl)
  initControls()
  // Initialize composer and show it before connecting, then focus it
  initComposer()
  // Ensure runtime state reflects that composer is visible by default (HTML has no 'collapsed')
  try { showComposer(true) } catch { }
  try { focusComposerInput() } catch { }

  // Initialize message dispatcher for unified communication
  messageDispatcher = new MessageDispatcher();

  // Initialize keyboard handler for macOS VSCode webview compatibility
  initKeyboardHandler();

  // Defer connect until token exists. If missing, show overlay to prompt user.
  if (state.boot && state.boot.token) { connect() }
  else { showTokenOverlay() }
  defineGlobals()
}

// Export message dispatcher for external access if needed
export function getMessageDispatcher(): MessageDispatcher | null {
  return messageDispatcher;
}

// Auto-run on module import
bootstrap()
