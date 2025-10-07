# RovoBridge Web UI

This is the shared web-based user interface for RovoBridge, designed to be embedded within different IDEs like VSCode and JetBrains products. It provides the core terminal emulation, rich input composer, and communication layer that interacts with the Go backend.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Key Components](#key-components)
- [Communication Protocol](#communication-protocol)
- [Development](#development)
- [Testing](#testing)

## Features

- **Embedded Terminal**: Uses Xterm.js to provide a fast and reliable terminal interface.
- **Rich Input Composer**: A `contenteditable`-based input area that supports file "chips" for adding context, replacing a standard `<textarea>`.
- **File Mention System**: An autocomplete-style overlay (`#` trigger) for searching and adding files to the context.
- **Drag & Drop**: Supports dropping files from the host IDE or OS directly into the UI.
- **WebSocket Communication**: Handles all communication with the Go backend for PTY streams and session management.
- **Unified Message Protocol**: A standardized JSON-based message system for communication with the host IDE (VSCode, JetBrains), ensuring cross-plugin compatibility.
- **Standalone Mode**: Can run as a standalone web application for development and testing, with a fallback for providing the auth token.
- **Dynamic UI**: Features like collapsible panels, font size control, and connection status indicators.

## Architecture

The Web UI is a modern, dependency-light single-page application built with TypeScript and Vite. It avoids heavy frameworks in favor of vanilla TypeScript modules that manage specific parts of the UI.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    IDE Host (VSCode/JetBrains)              │
├─────────────────────────────────────────────────────────────┤
│  Webview (VSCode) or JCEF Browser (JetBrains)              │
│  └── Embedded Web UI (this project)                        │
│      ├── MessageDispatcher (receives messages from host)   │
│      ├── WebSocket Client (connects to Go backend)         │
│      ├── Xterm.js Terminal                                 │
│      └── Rich Input Composer                               │
└─────────────────────────────────────────────────────────────┘
```

The application bootstraps by initializing the terminal, WebSocket connection, and all UI controls. It communicates with the host IDE (e.g., for adding files from a context menu) via a unified `postMessage`-based protocol, handled by the `MessageDispatcher`. It communicates with the Go backend via WebSockets for terminal I/O and session control.

## Directory Structure

```
web-ui/
├── src/
│   ├── main.ts                   # Main application entry point
│   ├── app.css                   # Core application styles
│   ├── ui/
│   │   ├── bootstrap.ts          # Main bootstrap sequence orchestrator
│   │   ├── terminal.ts           # Xterm.js setup and configuration
│   │   ├── websocket.ts          # WebSocket connection management
│   │   ├── composer/             # Rich input editor component
│   │   ├── chips.ts              # File chip management
│   │   ├── messages.ts           # Unified message protocol type definitions
│   │   ├── state.ts              # Global application state
│   │   └── bootstrap/
│   │       └── messageDispatcher/  # Core message handling logic
│   └── test/
│       ├── *.test.ts             # Vitest unit and integration tests
│       └── setup.ts              # Test environment setup
├── index.html                    # Main HTML file
├── package.json                  # Project scripts and dependencies
└── vite.config.ts                # Vite build and test configuration
```

## Key Components

- **`bootstrap.ts`**: The main entry point. It initializes all other modules in the correct order: state, terminal, controls, composer, and WebSocket connection.
- **`MessageDispatcher` (`src/ui/bootstrap/messageDispatcher/`)**: A critical component that handles all incoming `postMessage` events from the host IDE. It is responsible for:
    - Detecting the environment (IDE vs. standalone).
    - Validating incoming messages against the `UnifiedMessage` protocol.
    - Routing messages to the correct handlers.
    - Ensuring compatibility with global functions for standalone mode.
- **`websocket.ts`**: Manages the WebSocket lifecycle, including connecting, handling incoming backend messages (like `stdout`), and sending client messages (like `stdin` or resize events).
- **`terminal.ts`**: Configures and manages the `Xterm.js` instance, including custom key handlers for copy/paste and addons.
- **`composer/`**: A collection of modules that implement the rich input editor:
    - **`init.ts`**: Sets up the `contenteditable` div and its event listeners.
    - **`chips.ts`**: Creates and manages the visual "chip" elements for files.
    - **`overlay.ts`**: Implements the popup for searching and inserting files via the `#` trigger.
    - **`send.ts`**: Serializes the composer's content into a plain text string to be sent to the terminal.
- **`state.ts`**: A simple object that holds the shared application state, such as the WebSocket instance, terminal instance, session info, and file registry.
- **`messages.ts`**: The "source of truth" for the communication protocol between the IDE host and the web UI. It defines the TypeScript interfaces for all supported messages.

## Communication Protocol

The web UI uses a well-defined, unified message protocol to communicate with its host IDE (VSCode or JetBrains). This ensures that both plugins behave identically and that the UI has a single, consistent API to interact with.

- **Transport**: `window.postMessage`
- **Format**: JSON objects conforming to the `UnifiedMessage` type defined in `src/ui/messages.ts`.
- **Key Messages**:
    - `setToken`: Provides the authentication token to connect to the WebSocket.
    - `insertPaths`: Instructs the UI to add one or more file paths to the context.
    - `setFontSize`: Synchronizes the font size from the IDE settings.
    - `updateUIState`: Updates the state of UI elements, like collapsible panels.

All messages are processed by the `MessageDispatcher`, which validates them and routes them to the appropriate handlers.

## Development

### Prerequisites

-   Node.js (v18+)
-   pnpm

### Setup

1.  Navigate to the `web-ui` directory.
2.  Install dependencies:
    ```bash
    pnpm install
    ```

### Scripts

-   **`pnpm dev`**: Starts the Vite development server. The UI will be available at `http://localhost:5173`.
-   **`pnpm build`**: Builds the production-ready static assets. The output is placed in `hosts/vscode-plugin/out/ui` and `backend/internal/httpapi/ui` by default, as configured in `vite.config.ts`.
-   **`pnpm build:debug`**: Builds with sourcemaps enabled for easier debugging in production environments.
-   **`pnpm preview`**: Serves the production build locally for inspection.

## Testing

The project uses [Vitest](https://vitest.dev/) for unit and integration testing.

-   **`pnpm test`**: Runs all tests in the console.
-   **`pnpm test:watch`**: Runs tests in watch mode, re-running on file changes.
-   **`pnpm test:ui`**: Opens the Vitest UI for an interactive testing experience.

The test suite in `src/test/` covers several key areas:
-   **Cross-Plugin Compatibility**: Ensures message formats are identical.
-   **Message Dispatching**: Verifies the `MessageDispatcher` correctly validates and routes messages.
-   **Standalone Mode**: Tests the UI's ability to function outside of an IDE webview.
-   **Throughput**: Performance tests to ensure the UI can handle a high volume of messages without slowing down.

## Documentation

### Technical Design
- [Composer Technical Notes](COMPOSER.md) - Rich command editor implementation details
- [Drop & Chips Design](DROP_CHIPS_DESIGN.md) - File drop and chip rendering mechanism

### Protocol & Integration
- [Message Protocol Guide](docs/MESSAGE_PROTOCOL_GUIDE.md) - Communication protocol documentation
- [Standalone Mode Guide](docs/STANDALONE_MODE_GUIDE.md) - Running web UI independently
- [UI Specification](docs/spec.md) - Web UI technical specification

### Terminal & Components
- [Terminal Documentation](docs/terminal.md) - Terminal emulation implementation details
