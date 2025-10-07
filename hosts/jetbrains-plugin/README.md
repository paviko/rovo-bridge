# RovoBridge JetBrains Plugin

A JetBrains IDE plugin that mirrors the functionality of the RovoBridge VSCode extension, providing a terminal bridge with web UI integration. This plugin enables developers to use the same RovoBridge workflow in JetBrains IDEs (like IntelliJ IDEA, GoLand, etc.) that they enjoy in VSCode.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Architecture](#architecture)
- [Component Relationships](#component-relationships)
- [Development](#development)
- [Configuration](#configuration)
- [Commands](#commands)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Features

- **Terminal Bridge**: Embeds a web-based terminal interface using the JCEF (Java Chromium Embedded Framework).
- **Backend Process Management**: Automatically launches and manages the `rovo-bridge` Go backend.
- **Context Menu Integration**: Add files, folders, and selected code to the terminal context via right-click menus.
- **Settings Synchronization**: Real-time synchronization of UI preferences and font settings.
- **Drag & Drop Support**: Drop files from the Project view into the terminal interface.
- **Cross-Platform**: Supports Windows, macOS, and Linux with appropriate binaries.
- **Bi-directional Communication**: Open files from the terminal interface back into the IDE editor.
- **Font Size Synchronization**: Automatic font size sync between the IDE plugin and the web UI.
- **File Monitoring**: Real-time tracking of open files and the active editor tab.

## Installation

### From JetBrains Marketplace

1.  Open your JetBrains IDE (e.g., IntelliJ IDEA).
2.  Go to `File > Settings > Plugins` (or `IntelliJ IDEA > Preferences > Plugins` on macOS).
3.  Select the `Marketplace` tab.
4.  Search for "RovoBridge".
5.  Click `Install`.

### Manual Installation

1.  Download the plugin `.zip` file from the releases page.
2.  Go to `File > Settings > Plugins`.
3.  Click the gear icon and select "Install Plugin from Disk...".
4.  Select the downloaded `.zip` file.

### Development Installation

1.  Clone the repository.
2.  Open the `hosts/jetbrains-plugin` directory as a project in IntelliJ IDEA.
3.  Run the `runIde` Gradle task. This will launch a new instance of the IDE with the plugin installed.

## Architecture

This plugin mirrors the VSCode extension architecture, adapted for the JetBrains Platform SDK.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    JetBrains IDE Host                        │
├─────────────────────────────────────────────────────────────┤
│  Plugin Main Process (Kotlin/JVM)                          │
│  ├── BackendLauncher (process management)                  │
│  ├── ChatToolWindowFactory (UI hosting via JCEF)           │
│  ├── Context Actions (context menu integration)            │
│  ├── RovoBridgeConfigurable (settings UI)                     │
│  └── Communication Components (IDE ↔ WebUI)                │
├─────────────────────────────────────────────────────────────┤
│  Tool Window with JCEF Browser                             │
│  └── Embedded Web UI (same as VSCode)                      │
├─────────────────────────────────────────────────────────────┤
│  Go Backend Process (rovo-bridge)                          │
│  └── HTTP/WebSocket Server + Terminal Interface            │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
hosts/jetbrains-plugin/
├── build.gradle.kts                # Gradle build script (equivalent to package.json)
├── README.md                       # This documentation
├── src/
│   ├── main/kotlin/paviko/rovobridge/
│   │   ├── ui/
│   │   │   ├── ChatToolWindowFactory.kt # Main entry point, creates the tool window
│   │   │   ├── BackendLauncher.kt     # Process management
│   │   │   ├── PathInserter.kt        # Path communication utility
│   │   │   ├── WebViewLoadHandler.kt  # Handles web UI loading events
│   │   │   ├── OpenInIdeHandler.kt    # Handles requests from web UI to open files
│   │   │   └── ...                    # Other UI and communication components
│   │   ├── actions/
│   │   │   ├── EditorAddToContextAction.kt  # Context menu actions for the editor
│   │   │   └── ProjectAddToContextAction.kt # Context menu actions for the project view
│   │   ├── settings/
│   │   │   ├── RovoBridgeSettings.kt     # Settings data model and persistence
│   │   │   └── RovoBridgeConfigurable.kt # Settings UI panel
│   │   └── util/
│   │       └── ResourceExtractor.kt   # Extracts the Go binary from resources
│   └── resources/
│       ├── META-INF/plugin.xml       # Plugin manifest
│       └── bin/                      # Cross-platform binaries
│           ├── windows/amd64/rovo-bridge.exe
│           ├── macos/{arm64,amd64}/rovo-bridge
│           └── linux/{amd64,arm64}/rovo-bridge
└── unitTest/                         # Test suite
```

## Component Relationships

### JetBrains to VSCode Component Mapping

| JetBrains Component | VSCode Equivalent | Purpose | Key Responsibilities |
|---------------------|-------------------|---------|----------------------|
| `ChatToolWindowFactory.kt` | `extension.ts` | Main entry point and coordination | Plugin lifecycle, component initialization, JCEF browser creation. |
| `BackendLauncher.kt` | `BackendLauncher.ts` | Process lifecycle management | Binary extraction, process spawning, cleanup. |
| `util/ResourceExtractor.kt` | `backend/ResourceExtractor.ts` | Binary extraction utility | OS detection, file extraction from JAR, permissions. |
| `plugin.xml` | `package.json` | Plugin Manifest | Declares actions, services, and dependencies. |
| `settings/RovoBridgeSettings.kt` | `settings/SettingsManager.ts` | Configuration management | Settings persistence, validation, defaults. |
| `settings/RovoBridgeConfigurable.kt` | `settings/SettingsSynchronizer.ts` | Settings UI & real-time sync | Provides settings panel UI, pushes updates to webview. |
| `ui/PathInserter.kt` | `utils/PathInserter.ts` | Path communication utility | Sends file paths from actions to the webview. |
| `ui/IdeOpenFilesUpdater.kt` | `utils/FileMonitor.ts` | Open files tracking | Listens to editor events and pushes open file list to webview. |
| `ui/FontSizeMonitor.kt` | `utils/FontSizeMonitor.ts` | Font size synchronization | Polls backend to sync font size from webview back to IDE settings. |
| `ui/DragAndDropInstaller.kt` | `ui/DragAndDropHandler.ts` | File drop handling | Implements AWT DropTarget for dropping files onto the webview. |
| `actions/*` | `commands/*` | Context menu operations | Implement `AnAction` to provide IDE context menu items. |
| `ui/OpenInIdeHandler.kt` | (Part of `CommunicationBridge.ts`) | Open file requests | Handles `window.__openInIDE` calls from webview to open files in the editor. |

### Communication Flow

1.  **Plugin Activation**: User opens the "RovoBridge" tool window.
2.  **Backend Launch**: `BackendLauncher.kt` extracts and starts the Go backend. It reads the connection JSON from the process's stdout.
3.  **Webview Creation**: `ChatToolWindowFactory.kt` creates a `JBCefBrowser` instance and loads the UI URL from the connection info.
4.  **Bridge Setup**: `WebViewLoadHandler.kt` and other components inject JavaScript functions (`__setToken`, `__openInIDE`, etc.) and set up `JBCefJSQuery` handlers for bi-directional communication.
5.  **Settings Sync**: `RovoBridgeConfigurable.kt` and synchronizer objects keep settings in sync.
6.  **File Monitoring**: `IdeOpenFilesUpdater.kt` tracks open editor tabs.
7.  **Command Handling**: `AnAction` implementations in the `actions/` package respond to user interactions and send data to the web UI via `PathInserter.kt`.

## Development

### Prerequisites

-   **JDK**: Version 17 or higher.
-   **IntelliJ IDEA**: Community or Ultimate edition.
-   **Go**: For building the `rovo-bridge` backend.

### Setup Development Environment

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Build the backend binaries**:
    The Go backend must be built and placed in the plugin's resources directory.
    ```bash
    # On Linux/macOS
    ./scripts/build_rovo_bridge.sh

    # On Windows
    .\scripts\build_rovo_bridge.bat
    ```

3.  **Open the project in IntelliJ IDEA**:
    -   Open IntelliJ IDEA.
    -   Select `File > Open...` and choose the `hosts/jetbrains-plugin` directory.
    -   The project will be automatically configured as a Gradle project.

### Development Workflow

1.  **Launch the IDE with Plugin**:
    -   Find the `runIde` task in the Gradle tool window (`View > Tool Windows > Gradle`).
    -   Double-click `runIde` to start a sandboxed instance of IntelliJ IDEA with the RovoBridge plugin installed.

2.  **Test Plugin**:
    -   In the sandboxed IDE, open a project.
    -   Find the "RovoBridge" tool window on the right-hand side and open it.
    -   Test context menu commands in the Project view and editor.

3.  **Debug Plugin**:
    -   Set breakpoints in the Kotlin code.
    -   Run the `runIde` task in Debug mode (click the bug icon next to the task).
    -   The debugger will attach to the sandboxed IDE instance.

### Gradle Tasks

-   `runIde`: Starts a development instance of the IDE with the plugin.
-   `buildPlugin`: Builds the distributable `.zip` file for the plugin.
-   `test`: Runs integration tests against an IDE instance.
-   `unitTest`: Runs standalone unit tests that do not require an IDE environment.

## Configuration

The plugin provides configuration options accessible via `File > Settings > Tools > RovoBridge Plug`.

### Settings Schema

-   **`Command`**: Custom command to run in the terminal (overrides the default `acli rovodev run`).
-   **`Mode`**: UI mode for the interface (`Terminal` or `Canvas`). Requires a restart of the tool window.
-   **`Font Size`**: Font size for the web UI.

These settings are stored in `rovobridge.xml` in the IDE's configuration directory and managed by `RovoBridgeSettings.kt`.

## Commands

The plugin provides commands via context menus and keyboard shortcuts.

### Context Menu Commands

#### Project View Context Menu
-   **`RovoBridge: Add to context`**: Available on files and folders. Recursively adds all file paths.
-   **`RovoBridge: paste path`**: Available on folders only. Pastes the directory path into the input.

#### Editor Context Menu
-   **`RovoBridge: Add to context`**: Adds the current file's path to the context.
-   **`RovoBridge: Add lines to context`**: Adds the selected text with line numbers (e.g., `path/to/file.kt:10-20`).

### Keyboard Shortcuts

-   **Add to context (file)**: `Cmd+\` on macOS, `Ctrl+,` on Windows/Linux.
-   **Add lines to context**: `Cmd+Shift+\` on macOS, `Ctrl+Shift+,` on Windows/Linux.

## Troubleshooting

### Common Issues

#### Plugin Won't Activate

**Symptoms**: "RovoBridge" tool window is not visible.

**Solutions**:
1.  Ensure the plugin is enabled in `Settings > Plugins`.
2.  Check the IDE logs for errors (`Help > Show Log in ...`). The log may indicate a dependency issue or a startup failure.
3.  Invalidate caches and restart the IDE (`File > Invalidate Caches / Restart...`).

#### Backend Process Fails to Start

**Symptoms**: Webview shows "Failed to start backend" or is stuck on "Starting backend...".

**Solutions**:
1.  **Check Backend Logs**: The "Backend logs" panel at the bottom of the tool window contains the `stdout` and `stderr` from the `rovo-bridge` process. Look for errors there.
2.  **Verify Binaries**: Ensure the `rovo-bridge` binaries were correctly built and exist in `hosts/jetbrains-plugin/src/main/resources/bin/`.
3.  **Permissions**: On macOS/Linux, the extracted binary might lack execution permissions. The plugin attempts to set this, but security software could interfere.
4.  **Custom Command Issues**: If you've set a custom command, it might be failing. Try clearing the custom command in the settings and restarting.

## Contributing

We welcome contributions to improve the RovoBridge JetBrains plugin!

### Development Setup

1.  Fork the repository.
2.  Follow the development setup instructions above.
3.  Create a feature branch.
4.  Make your changes.
5.  Add tests for new functionality.
6.  Submit a pull request.

### Code Style

-   Follow Kotlin coding conventions.
-   Ensure code is formatted correctly (use the IDE's formatter).
-   Add KDoc comments for public APIs.

## Documentation

### Development & Architecture
- [Developer Guide](docs/DEVELOPER_GUIDE.md) - Development guidelines and architecture overview
- [Component Interactions](docs/COMPONENT_INTERACTIONS.md) - How components communicate and interact
