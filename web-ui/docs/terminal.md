# Terminal Architecture (Frontend + Backend)

This document explains how the terminal works end-to-end in this project: how screen data flows from the backend to the browser, how xterm.js renders it, and how the UI-side scanning logic interacts with xterm’s buffer. It also covers what the backend decides to send, whether it can resend screen portions, and potential consistency issues.

---

## Frontend (xterm.js + UI)

Files:
- `backend/internal/httpapi/ui/index.html`
- `web-ui/src/main.ts` (Vite entry)
- `web-ui/src/ui/*` (modular TS: `terminal.ts`, `websocket.ts`, `dnd.ts`, `chips.ts`, `segments.ts`, `state.ts`, `controls.ts`, `toast.ts`, `utils.ts`)

### Initialization
- `index.html` includes:
  - xterm.js `5.3.0`, fit addon `0.7.0`, unicode11 addon `0.4.0`.
  - Loads the Vite entry script `/src/main.ts` as a module.
- TypeScript modules (Terminal mode):
  - `terminal.ts` creates `new Terminal({ allowProposedApi: true, convertEol: true, cursorBlink: true, fontSize, fontFamily })`.
  - `terminal.ts` loads `FitAddon` and `Unicode11Addon`, opens into `#term`, runs `fit.fit()`.

### Transport and protocol
- WebSocket to `ws://{host}/ws`.
  - Authentication: Sec-WebSocket-Protocol subprotocol `auth.bearer.<token>` (no token in URL).
  - Origin: loopback-only allowed; `Origin: null` (JCEF) accepted.
  - Token provisioning: host injects the token via `window.__setToken('<token>')`. In standalone mode, the UI prompts and the user pastes the token printed by the backend.
- Message types handled by the frontend:
  - `welcome` → stores session config and calls `openSession`.
  - `opened` → stores `sessionId` and sends initial `resize` with `cols/rows`.
  - `stdout` → base64 decode → `term.write(bytes)`; includes `seq` for gap detection.
  - `snapshot` → recent replay bytes; frontend resets terminal and applies them. The snapshot is sanitized to strip truncated OSC 10/11 sequences to prevent artifacts like `]11;rgb:0000/0000/0000`.
  - `exit` → shows banner and allows restart.
  - `sessionConfigUpdated` → updates session config.
  - `setFontSize` (from plugin) → updates `term.options.fontSize` and refits.
- Messages sent by the frontend:
  - `hello` (handshake).
  - `openSession` (with `cmd/args/pty/env`, and on reconnect `resume: true` to adopt an existing session without restarting it).
  - `stdin` (user keystrokes).
  - `resize` (after fit or font-size/viewport change).
  - `injectFiles` (backend reads files, injects to stdin directly).
  - `fontSizeChanged` (notify backend and plugin of changes).
  - `snapshot` (request recent replay for resynchronization).

### Where the terminal gets screen data
- From backend `stdout` messages. Frontend decodes `dataBase64` and calls `term.write(bytes)`. xterm parses and updates its internal buffer and schedules rendering.

### Who decides what to repaint
- xterm.js does. The app never tells xterm which lines to refresh. The renderer tracks dirty rows and repaints them.

### UI scanning of buffer (chips/segments)
- The UI tracks "segments" for text it inserted (e.g., dropped file paths).
- Hooks installed by `ensureWriteParsedWatcher()`:
  - `onWriteParsed`: marks buffer as dirty and debounces.
  - `onRender`: if quiet since last write, runs a scan.
- Scan region: `computeScanRange()`:
  - Anchors at bottom-most non-empty viewport line.
  - Searches up to 10 lines for bottom border starting with `╰─`.
  - Walks upward to find top border `╭─...─╮` and ensures an input-cursor line `│ >` exists in-between.
  - Only that viewport slice is scanned.
- Scanning logic:
  - For each segment, attempts to match its text at each column within the region, wrap-aware (uses terminal `cols`).
  - Reads strings from `term.buffer.active` via `getLine().translateToString()`.
  - If a segment is not found, it’s removed (and chip UI removed). This logic is purely for UI state management; it does not affect xterm rendering.

### Resizes and font size
- `fit.fit()` called on open, window resize, and font-size changes.
- After each fit, frontend sends `resize` with `cols/rows` so the backend PTY can reflow.

---

## Backend (WebSocket router + session/PTY)

Files:
- `backend/internal/ws/router.go`
- `backend/internal/ws/server.go`
- `backend/internal/session/session.go`

### WebSocket server
- `Server.HandleWS` upgrades the connection, loops reading messages, and dispatches to `Router.handle`.
- `SendJSON` writes JSON frames; ordered delivery is ensured within a single WS connection (TCP).

### Session lifecycle
- `openSession` (from frontend):
  - Chooses command/args from request or server `--cmd` override.
  - Starts a process using `session.Start` with mode `AutoPTY` by default.
  - On success: stores session under id `"s1"`, sends `opened` with `sessionId = "s1"`.
  - If a session with the same id already exists, it is closed and replaced to prevent leaks.
  - Starts `pipeStdout` goroutine to stream stdout.
- `stdin`: decodes base64 and writes to the session’s stdin.
- `resize`: if a PTY exists, calls `pty.Setsize` to apply `cols/rows`.
- `injectFiles`: reads requested files on the server and writes their processed contents directly to session stdin (newlines normalized and escaped as `\
`).
- `exit`: Emitted when the process exits (code computed via `exec.ExitError`).
- Per-connection tracking: sessions opened over a WebSocket connection are tracked; on WS close, sessions are detached from the connection but kept alive. An orphan timer (grace period) is started; if the client does not resume within the grace window, the process is terminated.

### How stdout is chunked and sent
- `pipeStdout`:
  - Reads from the session stdout using a 32 KiB buffer.
  - For each `Read`, sends a `stdout` message `{ type: "stdout", sessionId, dataBase64, seq }`.
  - `seq` is monotonically increasing per session; the frontend tracks it to detect gaps and trigger resynchronization.
  - If sending to the WebSocket fails, the piping goroutine exits early to avoid stale loops and resource leaks.
  - When no client is attached (e.g., during a disconnect), stdout continues to be read and appended to the replay buffer. Frames are only sent when a connection is attached again.
- The backend does not parse or emulate the terminal; it streams raw PTY/process bytes. It does not maintain a screen model.

### PTY vs pipes
- `session.Start` tries PTY using `creack/pty`. If PTY fails (and mode is not `ForcePTY`), falls back to pipes and merges stdout+stderr.
- `resize` has an effect only when PTY is active.

---

## Can the backend resend a portion of the screen?
- Partially. The backend keeps a replay buffer of the last 256 KiB of raw output per session.
- The client can request `{ type: "snapshot", sessionId }` and receive `{ type: "snapshot", sessionId, dataBase64, lastSeq }`.
- This is a raw byte replay (not a screen model). Snapshots may begin/end mid-escape sequence; to avoid artifacts, the backend sanitizes the start of the snapshot to drop any truncated OSC 10/11 sequence, and the frontend applies an additional sanitizer as a safeguard.

## Could this cause inconsistencies?

Potential issues to be aware of:
- Limited replay window: only the last 256 KiB are retained; large bursts during disconnect may exceed the buffer.
- Raw snapshot bytes: snapshots are raw PTY bytes, not a reconstructed screen; they may start/end mid-escape.
- Sequence reset and gaps: frontend resets `sessionLastSeq` on new session; unexpected gaps trigger a snapshot request.
- Mid-output resync: applying a snapshot resets xterm then writes replay data; brief visual flicker is possible.
- Frontend scanning region: viewport heuristics might mis-detect; effects are UI-only (chips), not xterm rendering.

---

## Practical implications
- Reliability: Within one WS connection, ordering and delivery are reliable. Across disconnects, the client can resync using the last 256 KiB snapshot.
- Performance: 32 KiB chunking is typical and safe for xterm; arbitrary chunk boundaries are fine.
- Resynchronization and reconnection flow:
  - Frontend tracks `seq` on `stdout` frames and detects gaps.
  - On reconnect, the frontend sends `openSession` with `resume: true` to reattach to the existing process. The backend responds with `opened` followed by a proactive `snapshot` of the replay buffer.
  - On detected gaps during an active connection, the frontend sends `{ type: "snapshot", sessionId }` and applies the returned snapshot.
  - Frontend resets xterm and writes snapshot bytes; sets `sessionLastSeq = lastSeq`. Subsequent `stdout` resumes from `lastSeq + 1`.
  - During disconnect, the process keeps running for the grace period while output is buffered.
  - After the grace period expires without resume, the backend terminates the session process and clears state.

---

## Message schema (current)

From backend to frontend:
- `welcome`: `{ type, sessionId: "ctrl", features, sessionConfig }`
- `opened`: `{ type, id: "o1", sessionId: "s1" }`
- `stdout`: `{ type, sessionId: "s1", dataBase64, seq }`
- `snapshot`: `{ type, sessionId: "s1", dataBase64, lastSeq }`
- `exit`: `{ type, sessionId: "s1", code }`
- `error`: `{ type, message }`
- `sessionConfigUpdated`: `{ type, sessionConfig }`

From frontend to backend:
- `hello`: `{ type: "hello", protocolVersion }`
- `openSession`: `{ type, id: "o1", cmd, args, pty, env, resume?: true }`
- `stdin`: `{ type, sessionId, dataBase64 }`
- `resize`: `{ type, sessionId, cols, rows }`
- `injectFiles`: `{ type, sessionId, paths }`
- `fontSizeChanged`: `{ type, fontSize }` (stored server-side; not otherwise used)
- `updateSessionConfig`: `{ type, customCommand }`
- `snapshot`: `{ type, sessionId }` (request replay)

---

## Reconnection protocol and grace period

- **Detachment on disconnect**: When the WebSocket disconnects, the backend detaches the connection from the session but keeps the process running.
- **Grace period**: The session remains alive for 30 seconds. Output continues to be read and appended to the replay buffer.
- **Resuming**: If the client reconnects within the grace period and sends `openSession` with `resume: true`, the backend reattaches the session, sends `opened`, and proactively sends a `snapshot` with the latest replay bytes and `lastSeq`.
- **Sanitization**: Before sending a snapshot, the backend sanitizes the start of the replay to remove any truncated OSC 10/11 sequence. The frontend additionally sanitizes the snapshot bytes before applying them.
- **Expiry**: If the grace period elapses without a resume, the backend terminates the process and clears session state.

---

## Summary
- Frontend: xterm renders bytes from `stdout` frames; the app scans a bounded viewport slice for UI segments and tracks `seq` to request/apply snapshots on gaps.
- Backend: Streams raw PTY/process output in 32 KiB base64 frames with a `seq`; maintains a 256 KiB replay buffer per session; responds to `snapshot`.
- Resend/snapshot: Supported as recent-byte replay (not a full screen model). Reconnects/gaps are mitigated within the buffer window.
- Consistency: WS send failures stop piping; `openSession` replaces prior same-id sessions; per-connection cleanup prevents leaks.
