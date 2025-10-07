# RovoBridge — Architecture and Implementation Spec

Purpose
- Provide a concise reference for how the system is structured, how pieces talk to each other, and where to implement changes.

High-level architecture
- Backend (Go):
  - Spawns and mediates the CLI (default: `acli rovodev run`).
  - Exposes a local WebSocket API (ws://127.0.0.1:<port>/ws) protected by a per-launch token.
  - Serves the web UI (embedded static assets) at http://127.0.0.1:<port>/.
  - Uses PTY when available, falls back to pipes if not. Handles resize, exit codes, robust shutdown.
- Web UI (xterm.js):
  - Connects to the backend over WebSocket, renders terminal, forwards keystrokes.
  - Unicode-friendly (xterm-addon-unicode11), raw bytes write (allowProposedApi).
  - Top bar: status indicator, reconnect/restart, font-size control.
  - Drag & Drop: dropping files into the terminal inserts their absolute path(s) into xterm input.
  - On exit, shows a banner with Restart.
- JetBrains plugin (JCEF):
  - Launches the backend; reads connection JSON; loads the served UI in JCEF.
  - Supports drag & drop from the IDE into the embedded UI: dropped files are converted to absolute paths and inserted into terminal input.
  - Shows a collapsible log panel streaming backend stdout/stderr.
  - Can bundle per-OS backend binaries and extract at runtime.
  - Provides settings UI for custom commands and dynamically synchronizes changes with the web UI via WebSocket messages.

Transport and protocol (v1 draft)
- Transport: WebSocket (loopback only). Messages are JSON text.
- Authentication: Bearer token via Sec-WebSocket-Protocol subprotocol `auth.bearer.<token>` (no token in URL). Server validates the token on `/ws`.
- Messages (client -> server):
  - hello: { type: "hello", protocolVersion: "1.0" }
  - openSession: { type: "openSession", id: "o1", cmd: "acli", args: ["rovodev","run"], pty: true, env: ["KEY=VALUE"], cwd: "/path" }
  - stdin: { type: "stdin", sessionId: "s1", dataBase64: "..." }
  - resize: { type: "resize", sessionId: "s1", cols: 120, rows: 30 }
  - close: { type: "close", sessionId: "s1" } [reserved]
  - injectFiles: { type: "injectFiles", sessionId: "s1", paths: ["path/one", "path/two"] }
    - Sent by UI right before finalizing an input iteration, asking the backend to directly inject file contents to stdin.
  - updateSessionConfig: { type: "updateSessionConfig", customCommand: "echo hello" }
    - Sent by UI to dynamically update the session command configuration without restarting the backend process.
  - searchIndex: { type: "searchIndex", pattern: "KonK20", opened: ["/abs/path", "rel/path"], limit: 50 }
    - Searches the background file index (camel/subsequence fuzzy). '*' and spaces in pattern are ignored. Returns first matches.
- Messages (server -> client):
  - welcome: { type: "welcome", sessionId: "ctrl", features: { streaming: true, pty: true }, sessionConfig: { cmd: "acli", args: ["rovodev", "run"], pty: true, env: ["LANG=C.UTF-8"] } }
  - opened: { type: "opened", id: "o1", sessionId: "s1" }
  - stdout: { type: "stdout", sessionId: "s1", dataBase64: "...", seq: 42 }
  - exit: { type: "exit", sessionId: "s1", code: 0 }
  - error: { type: "error", message: "..." }
  - sessionConfigUpdated: { type: "sessionConfigUpdated", sessionConfig: { cmd: "echo", args: ["hello"], pty: true, env: ["LANG=C.UTF-8"] } }
    - Sent by backend to confirm session configuration updates and provide the new configuration to all connected clients.


Security
- Bind to 127.0.0.1 only. Loopback origins and `Origin: null` (JCEF) are accepted; cross-site WS is blocked.
- Random per-launch token (>= 128-bit) required for `/ws`; authenticate via WS subprotocol `auth.bearer.<token>`; token is never placed in URLs.
- UI consumes relative `ws://{host}/ws` and supplies token via a JS bridge (e.g., `window.__setToken`).
- HTTP endpoints that require auth (e.g., `/font-size`) use `Authorization: Bearer <token>` headers.

Implementation map (files and roles)
- backend/
  - cmd/rovo-bridge/main.go
    - Entrypoint. Generates token, starts HTTP server (loopback), registers /ws and static UI, prints {port, token, uiBase} as JSON.
  - internal/ws/server.go
    - WebSocket upgrade, token check, JSON send helpers.
  - internal/ws/router.go
    - Routes incoming JSON messages: hello, openSession, stdin, resize, injectFiles, updateSessionConfig, searchIndex.
    - Manages session map; pumps stdout as base64 frames; emits exit with exit code.
    - Treats EOF/EIO from PTY as normal termination.
    - Handles injectFiles by reading file contents and injecting directly to stdin.
    - Supports dynamic session configuration updates via updateSessionConfig message.
    - Exposes file index search via searchIndex. Returns first-matching results, not best-match scored.
  - internal/index/index.go
    - Background file indexer with .gitignore support. Builds short names and supports fuzzy/camel search.
    - Starts with a full scan and automatically chooses strategy:
      - If massive tree (>= ~40k entries): use fsnotify watchers (if available) with debounce, else fallback to polling.
      - Otherwise: periodic polling (default ~5s). Both strategies swap the full index atomically on rescan.
    - Respects .gitignore (including nested files); does not traverse ignored directories.
    - Handles up to ~100k entries efficiently; logs to stdout how many files were indexed on start.
  - internal/session/session.go
    - Wraps process execution (PTY via creack/pty or pipes).
    - Supports env overrides (merged with os.Environ), cwd override, resize, Wait/Close.
  - internal/fileutil/reader.go
    - File content reading utilities with syntax highlighting detection.
    - Formats file contents similar to rdcb tool with line numbers and language detection.
  - internal/httpapi/http.go
    - Embeds and serves UI; does not inject tokens into HTML. Token is provided at runtime via a JS bridge (`window.__setToken`).
  - internal/httpapi/ui/index.html
    - Web UI: xterm.js terminal with unicode11, bytes write, fit addon.
    - Top bar with status dot/text, Reconnect, Restart, font size.
    - Connects to /ws, sends hello/openSession, forwards stdin, handles stdout, resize after opened, shows exit banner.
    - Iterations: Enter finalizes an iteration unless directly preceded by a single backslash ("\\"). If another key is pressed after the backslash, Enter ends the iteration.
    - Chips: Dropped paths render as chips with checkboxes. On iteration end: checked chips become permanent (cannot be unchecked); unchecked chips are removed. File contents are injected directly via injectFiles message for efficiency.

- hosts/jetbrains-plugin/
  - build.gradle.kts, settings.gradle.kts
    - IntelliJ Platform plugin setup; Jackson dependency for JSON parsing.
  - src/main/resources/META-INF/plugin.xml
    - Registers Tool Window: com.example.rovobridge.ui.ChatToolWindowFactory.
  - src/main/kotlin/com/example/rovobridge/ui/ChatToolWindowFactory.kt
    - Tool window factory. Creates a top/bottom splitter: top JCEF browser, bottom logs (collapsible with toggle).
    - Launches backend (from bundled resource, env ROVOBRIDGE_BIN, or PATH), merges stderr->stdout, streams logs.
    - Detects connection JSON in log and loads UI when available.
  - src/main/kotlin/com/example/rovobridge/util/ResourceExtractor.kt
    - Extracts bundled binaries from resources to a temp file and marks them executable.
  - src/main/resources/bin/
    - Place platform binaries here: bin/<os>/<arch>/rovo-bridge[.exe].

Build & run
- Backend standalone:
  - cd backend && go build ./cmd/rovo-bridge
  - ./rovo-bridge --http 127.0.0.1:0 --serve-ui --print-conn-json
  - Open printed uiBase URL in browser.
- JetBrains plugin:
  - Provide a rovo-bridge binary:
    - Option A: set env ROVOBRIDGE_BIN=/absolute/path/to/rovo-bridge
    - Option B: put binaries under hosts/jetbrains-plugin/src/main/resources/bin/<os>/<arch>/
    - Option C: ensure rovo-bridge is on PATH
  - Run plugin sandbox: cd hosts/jetbrains-plugin && ./gradlew runIde
  - Open the RovoBridge tool window, expand logs if needed.

Notes & conventions
- Default session command: `acli rovodev run` (pty:true). UI can restart this.
- Session commands can be dynamically updated via plugin settings without restarting the backend process.
- UI writes bytes to xterm (proposed API), so "allowProposedApi: true" is set.
- env and cwd can be provided in openSession to control locales (e.g., LANG=C.UTF-8) or working directory.
- Initial resize is sent after receiving "opened"; subsequent resizes on window resize and font size change.

Extensibility roadmap (short)
- Web UI settings panel to configure cwd/env/PTY before opening a session.
- Detectors for prompts/menus/diffs using xterm link providers and decorations.
- Optional stdio transport mode for IDE-only adapter.
- VS Code host adapter using the same Web UI and backend.
- Security hardening (Origin checks/CSP), idle shutdown.
