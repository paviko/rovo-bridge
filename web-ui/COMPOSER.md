# Composer (Rich Command Editor) – Technical Notes

This document summarizes how the new composer/editor integrates with the existing terminal, chips, segments, and plugin.

## Overview
- Adds a multiline contenteditable editor below the terminal to compose commands with embedded file "chips".
- When visible, xterm input is disabled; Ctrl+Enter sends composer content to backend; Enter inserts normal newlines in the editor.
- Chips behave like in xterm flow: only newly-checked chips are injected for the current iteration, then marked permanent, others are removed.
- Copy/cut/paste keeps full path metadata via a lightweight token format.

## Key Files
- `web-ui/src/ui/composer/`: The core module implementing the editor.
  - **`init.ts`**: Creates the `contenteditable` input, binds DnD, key, and clipboard handlers.
  - **`send.ts`**: Normalizes and sends composer content to the backend, mirroring the xterm iteration flow.
  - **`overlay.ts`**: Manages the `#` mention and `/` command overlay, including search and selection.
  - **`chips.ts`**: Handles the creation and synchronization of file chips within the composer.
  - **`reconcile.ts`**: Keeps the central `fileRegistry` in sync with the chips present in the editor.

- `web-ui/src/ui/bootstrap/`: The main application startup and integration module.
  - **`bootstrap.ts`**: The main entry point that initializes all UI components.
  - **`messageDispatcher/`**: A critical sub-module that handles all `postMessage` communication from the host IDE. It validates, routes, and ensures compatibility.
  - **`globals.ts`**: Defines all `window.__*` functions that serve as the API for host IDEs to interact with the web UI.

- `web-ui/src/ui/websocket.ts`: Manages the WebSocket connection to the Go backend, handling PTY streams and session lifecycle. Terminal input is gated by `state.terminalInputEnabled`.

- `web-ui/src/ui/chips.ts` & `web-ui/src/ui/segments.ts`: These modules manage the central registry of file chips and their corresponding markers in the terminal buffer. They are updated by both the composer and terminal interactions.

- `web-ui/src/ui/dnd.ts`: Handles drag-and-drop operations, routing file drops to the composer if it's visible.

## Behavior Details
- Editor Newlines
  - Editor shows real newlines. On send, composer converts newlines to backslash+CR per line and appends one final CR.
- Injecting Files
  - Only chips that were checked during the current iteration are injected (`injectFiles`). They’re then marked permanent, and other non-permanent chips/segments are removed – same as xterm.
- Chips/Segments Sync
  - Adding chips in composer registers segments and chipbar entries.
  - Hiding/showing composer reconciles registry and preserves segments for paths present in editor while visible.
- Clipboard Tokens
  - `<[#path][display]>` used in `text/plain`. Paste recognizes these to reconstruct chips.

## Host/Plugin Integration (JetBrains)
- The plugin calls `__insertPaths`/`__pastePath` in the web UI; with composer visible, inserts go into the editor.
- It also pushes opened/current files for # overlay:
  - In JCEF tool window: gather using IntelliJ APIs (FileEditorManager.getInstance(project).openFiles, selectedEditor?.file) and call:
    - window.__updateOpenedFiles([...absPaths], currentAbsPath)
  - This repo includes a reference implementation: hosts/jetbrains-plugin/src/main/kotlin/com/example/rovobridge/ui/ChatToolWindowFactory.kt
    - It launches rovo-bridge and loads the UI.
    - Integrates `IdeOpenFilesUpdater` to observe file open/close/selection changes and periodically push updates to the webview via `window.__updateOpenedFiles`.
- For other hosts (VS Code), send the opened/current lists via postMessage to the webview and call `__updateOpenedFiles` in the panel script.
- The plugin calls `__insertPaths` and `__pastePath` in the web UI. With composer visible, inserts go into the editor; otherwise, into xterm.
- Drag-and-drop from the IDE component lands in the composer when visible.

## Quick Pointers (What to read for what)
- Editor behaviors: `web-ui/src/ui/composer/`
- Visibility toggles: `web-ui/src/ui/controls.ts`, `web-ui/src/ui/bootstrap.ts`
- Terminal input/send: `web-ui/src/ui/websocket.ts`
- Chips registry and chipbar: `web-ui/src/ui/chips.ts`
- Segment scanning & preservation: `web-ui/src/ui/segments.ts`
- DnD extraction and routing: `web-ui/src/ui/dnd.ts`
- Styling: `web-ui/src/app.css`

## Troubleshooting Tips
- Newlines not acting as continuations: ensure `sendComposer()` normalization runs ("\r?\n" → "\\\r") and that a final CR is sent.
- Chips inject unexpectedly: verify `checkedSinceIterStart` and `permanent` flags in `sendComposer()` mirror `endIterationAndSendEnter`.
- Terminal accepting input while editor visible: check `state.terminalInputEnabled` and `__composerVisibilityChanged()`.
- Missing segments for composer chips: confirm the preservation check in `segments.ts` (composerVisible + presentPaths.has(seg.path)).

## JetBrains Integration Update
- Reference implementation now lives in `hosts/jetbrains-plugin/src/main/kotlin/com/example/rovobridge/ui/ChatToolWindowFactory.kt`.
- It integrates `IdeOpenFilesUpdater` which observes `FileEditorManager` open/close/selection events and periodically calls:
  - `window.__updateOpenedFiles(opened: string[], current?: string)`
- This powers the Composer "#" overlay suggestions for current/opened files inside the JCEF webview.
