# RovoBridge Backend

The RovoBridge backend is a high-performance, standalone Go application that serves as the engine for the RovoBridge UI. It manages pseudo-terminal (PTY) sessions, handles real-time file indexing and searching, and communicates with the frontend via WebSockets.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Key Components](#key-components)
- [Communication Protocol](#communication-protocol)
- [Development](#development)
- [Testing](#testing)

## Features

- **Cross-Platform PTY Management**: Creates and manages interactive terminal sessions using `go-pty`, providing a true shell experience on Linux, macOS, and Windows.
- **High-Speed File Indexing**: Scans the entire workspace to build an in-memory index of files and directories.
- **`.gitignore` Aware**: Intelligently respects `.gitignore` rules at all levels of the directory tree to exclude irrelevant files.
- **Real-Time File Watching**: Uses `fsnotify` for efficient, low-overhead monitoring of file system changes, keeping the index constantly up-to-date.
- **Incremental Updates**: Processes file system events (create, delete, modify) incrementally, avoiding the need for costly full rescans.
- **Fast, Ranked File Search**: Provides a search API to the frontend with a sophisticated scoring algorithm to rank results by relevance.
- **WebSocket Server**: Handles secure, low-latency communication with the web UI frontend.
- **Token-Based Authentication**: Secures the WebSocket connection by requiring a unique, time-limited token.
- **Embedded Web UI**: Serves the static assets for the web UI, creating a fully self-contained application.
- **Standalone Executable**: Compiles to a single, dependency-free binary for easy distribution and integration with IDE host plugins.

## Architecture

The backend is a monolithic Go application designed for performance and simplicity. It listens on a loopback interface and exposes a WebSocket endpoint for the UI to connect to.

### High-Level Architecture

```
┌────────────────────────────────┐
│      IDE Host (VSCode/JB)      │
│ ┌────────────────────────────┐ │
│ │    Web UI (in Webview)     │ │
│ └─────────────┬──────────────┘ │
└───────────────|────────────────┘
                │ WebSocket (localhost)
┌───────────────▼────────────────┐
│ RovoBridge Backend (Go)        │
│ ├───────────────------------─┐ │
│ │      WebSocket Server      │ │
│ │ ┌─────────┴──────────────┐ │ │
│ │ │      Router            │ │ │
│ │ └─────────┬──────────────┘ │ │
│ │           │                │ │
│ │  ┌────────▼─────────┐      │ │
│ │  │ Session Manager  ├──────┼─► PTY (acli, bash, etc.)
│ │  └──────────────────┘      │ │
│ │  ┌────────▼─────────┐      │ │
│ │  │   File Indexer   ├──────┼─► File System
│ │  └──────────────────┘      │ │
│ │  ┌────────▼─────────┐      │ │
│ │  │   HTTP Server    │◄─────┼─► Serves Web UI
│ │  └──────────────────┘      │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

The application starts an HTTP server on a random available port on `127.0.0.1`. This server is responsible for two things:
1.  Serving the embedded web UI assets.
2.  Upgrading HTTP connections to WebSocket connections on the `/ws` endpoint.

Once a WebSocket connection is established and authenticated, the `Router` takes over, processing JSON messages to manage terminal sessions and perform file searches.

## Directory Structure

```
backend/
├── cmd/                          # Main executables
│   ├── rovo-bridge/              # The main backend server
│   │   └── main.go
│   └── rovo-echo/                # A simple echo utility for testing
│       └── main.go
├── internal/                     # Internal packages (not for external use)
│   ├── fileutil/                 # File reading and language detection utilities
│   ├── httpapi/                  # HTTP handlers, including serving the embedded UI
│   ├── index/                    # File indexing and search logic
│   ├── session/                  # PTY and process session management
│   └── ws/                       # WebSocket server and message routing logic
├── go.mod                        # Go module definition
├── go.sum                        # Go module dependencies
└── test_rovo_echo.sh             # Script to test the rovo-echo utility
```

## Key Components

-   **`cmd/rovo-bridge`**: The main entry point for the application. It parses command-line flags, initializes the `http.Server` and the WebSocket `Router`, and gracefully handles shutdown signals.
-   **`internal/ws`**: The core of the WebSocket communication layer.
    -   `server.go`: Manages the WebSocket connection lifecycle, including the `CheckOrigin` security policy and authentication via the `Sec-WebSocket-Protocol` header.
    -   `router.go`: The central message hub. It decodes incoming JSON messages from the client and routes them to the correct handlers for session management (`openSession`, `stdin`), file search (`searchIndex`), and more. It orchestrates all other backend components.
-   **`internal/session`**: Handles the creation and management of child processes. It uses the `go-pty` library to spawn processes within a pseudo-terminal, enabling full interactive shell capabilities.
-   **`internal/index`**: A highly optimized file indexer and search engine.
    -   `scan.go`: Performs the initial recursive scan of the workspace, building the file list while respecting `.gitignore` rules.
    -   `fsnotify.go`: Binds to the operating system's file notification API to receive real-time events.
    -   `incremental.go`: Applies file system changes to the index state without requiring a full rescan, ensuring the index is always up-to-date with minimal overhead.
    -   `search.go`: Implements the ranked search algorithm, scoring potential matches to return the most relevant results to the user.
-   **`internal/httpapi`**: A simple package responsible for serving the static web UI assets, which are embedded directly into the Go binary using `go:embed`.
-   **`cmd/rovo-echo`**: A small, standalone utility used for testing terminal I/O and PTY functionality.

## Communication Protocol

The backend communicates with the frontend exclusively via a WebSocket connection.

-   **Transport**: WebSocket, typically on `ws://127.0.0.1:<port>/ws`.
-   **Authentication**: The WebSocket handshake must include a `Sec-WebSocket-Protocol` header with the value `auth.bearer.<token>`, where `<token>` is provided by the backend on startup.
-   **Format**: All messages are JSON objects with a `type` field.
-   **Key Messages (Client -> Server)**:
    -   `hello`: Initial message sent by a client to establish a session.
    -   `openSession`: Requests the creation of a new PTY session.
    -   `stdin`: Forwards user input to the PTY's standard input.
    -   `resize`: Informs the backend that the terminal dimensions have changed.
    -   `searchIndex`: Executes a file search query against the index.
    -   `injectFiles`: A request to read files from disk and inject their content into the terminal.
-   **Key Messages (Server -> Client)**:
    -   `welcome`: Acknowledges the `hello` and provides server capabilities.
    -   `opened`: Confirms that a PTY session has been successfully created.
    -   `stdout`: Streams output from the PTY's standard output.
    -   `exit`: Notifies the client that a session has terminated.
    -   `searchResult`: Delivers the results of a file search query.
    -   `error`: Reports a server-side error to the client.

## Development

### Prerequisites

-   Go (v1.22 or later)

### Setup

1.  Navigate to the `backend/` directory.
2.  Install dependencies:
    ```bash
    go mod tidy
    ```

### Building

-   To build the main `rovo-bridge` executable:
    ```bash
    go build -o rovo-bridge ./cmd/rovo-bridge
    ```
-   To build the `rovo-echo` test utility:
    ```bash
    go build -o rovo-echo ./cmd/rovo-echo
    ```
-   You can also use the scripts in the root `scripts/` directory to build for all platforms.

### Running

-   Start the server with default settings:
    ```bash
    ./rovo-bridge
    ```
    The server will start on a random loopback port and print the connection details (port and token) to `stdout` as a JSON object.

-   Start the server with a custom command for the PTY session:
    ```bash
    ./rovo-bridge --cmd "zsh"
    ```

## Testing

The project contains a suite of unit tests for its internal packages.

-   **Run all tests**:
    ```bash
    go test ./...
    ```

-   **Manual PTY Testing**: The `rovo-echo` binary provides a simple way to test terminal interactions. It can be run via the `test_rovo_echo.sh` script or by setting it as the custom command for `rovo-bridge`.
    ```bash
    # Start the test script
    ./test_rovo_echo.sh

    # Or, run it via rovo-bridge
    ./rovo-bridge --cmd "./rovo-echo"
