# RovoBridge VSCode Extension

A VSCode extension that provides a terminal bridge with web UI integration for Rovo Dev CLI.

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

- **Terminal Bridge**: Embeds a web-based terminal interface using VSCode's webview API
- **Backend Process Management**: Automatically launches and manages the rovo-bridge Go backend
- **Context Menu Integration**: Add files, folders, and selected text to the terminal context
- **Settings Synchronization**: Real-time synchronization of UI preferences and font settings
- **Drag & Drop Support**: Drop files from VSCode Explorer into the terminal interface
- **Cross-Platform**: Supports Windows, macOS, and Linux with appropriate binaries
- **Bi-directional Communication**: Open files from terminal interface back into VSCode
- **Font Size Synchronization**: Automatic font size sync between VSCode and web UI
- **File Monitoring**: Real-time tracking of open files and active editor

## Installation

### From VSCode Marketplace

1. Open VSCode
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "RovoBridge"
4. Click Install

### Manual Installation

1. Download the `.vsix` file from the releases page
2. Open VSCode
3. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
4. Click the "..." menu and select "Install from VSIX..."
5. Select the downloaded `.vsix` file

### Development Installation

1. Clone the repository
2. Navigate to `hosts/vscode-plugin`
3. Run `pnpm install`
4. Run `pnpm run compile`
5. Press F5 to launch Extension Development Host

## Architecture

This extension mirrors the JetBrains plugin architecture while adapting to VSCode's extension model. The architecture follows a modular design with clear separation of concerns.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VSCode Extension Host                     │
├─────────────────────────────────────────────────────────────┤
│  Extension Main Process (Node.js)                          │
│  ├── BackendLauncher (process management)                  │
│  ├── WebviewManager (UI hosting)                           │
│  ├── CommandHandler (context menu actions)                 │
│  ├── SettingsManager (configuration)                       │
│  └── CommunicationBridge (IDE ↔ WebUI)                    │
├─────────────────────────────────────────────────────────────┤
│  Webview Panel                                             │
│  └── Embedded Web UI (same as JetBrains)                   │
├─────────────────────────────────────────────────────────────┤
│  Go Backend Process (rovo-bridge)                          │
│  └── HTTP/WebSocket Server + Terminal Interface            │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
hosts/vscode-plugin/
├── package.json                    # Extension manifest (equivalent to plugin.xml)
├── README.md                       # This documentation
├── src/
│   ├── extension.ts                # Main entry point (equivalent to ChatToolWindowFactory.kt)
│   ├── backend/
│   │   ├── BackendLauncher.ts      # Process management (mirrors BackendLauncher.kt)
│   │   └── ResourceExtractor.ts    # Binary extraction (mirrors ResourceExtractor.kt)
│   ├── ui/
│   │   ├── WebviewManager.ts       # Webview lifecycle management
│   │   ├── CommunicationBridge.ts  # IDE ↔ WebUI communication
│   │   ├── DragAndDropHandler.ts   # File drop handling
│   │   └── WebviewScripts.ts       # JavaScript injection helpers (mirrors WebviewScripts.kt)
│   ├── commands/
│   │   ├── AddToContextCommand.ts  # File/folder context actions
│   │   ├── AddLinesToContextCommand.ts # Selected text context
│   │   └── PastePathCommand.ts     # Directory path pasting
│   ├── settings/
│   │   ├── SettingsManager.ts      # Configuration management (mirrors RovoBridgeSettings.kt)
│   │   └── SettingsSynchronizer.ts # Real-time settings sync
│   └── utils/
│       ├── PathInserter.ts         # Path communication utility (mirrors PathInserter.kt)
│       ├── FileMonitor.ts          # Open files tracking (mirrors IdeOpenFilesUpdater.kt)
│       ├── FontSizeMonitor.ts      # Font size synchronization
│       └── ErrorHandler.ts         # Error handling and recovery
├── resources/
│   └── bin/                        # Cross-platform binaries
│       ├── windows/amd64/rovo-bridge.exe
│       ├── macos/{arm64,amd64}/rovo-bridge
│       └── linux/{amd64,arm64}/rovo-bridge
└── test/                           # Test suite
    └── suite/                      # Test files
```

## Component Relationships

### VSCode to JetBrains Component Mapping

| VSCode Component | JetBrains Equivalent | Purpose | Key Responsibilities |
|------------------|---------------------|---------|---------------------|
| `extension.ts` | `ChatToolWindowFactory.kt` | Main entry point and coordination | Extension lifecycle, component initialization |
| `BackendLauncher.ts` | `BackendLauncher.kt` | Process lifecycle management | Binary extraction, process spawning, cleanup |
| `ResourceExtractor.ts` | `ResourceExtractor.kt` | Binary extraction utility | OS detection, file extraction, permissions |
| `WebviewManager.ts` | JCEF webview portions | Webview lifecycle management | Panel creation, HTML generation, CSP setup |
| `CommunicationBridge.ts` | `OpenInIdeHandler.kt`, `WebViewLoadHandler.kt` | Bi-directional communication | Message routing, JavaScript injection |
| `SettingsManager.ts` | `RovoBridgeSettings.kt` | Configuration management | Settings persistence, validation, defaults |
| `SettingsSynchronizer.ts` | `RovoBridgeConfigurable.kt`, `FontSizeSynchronizer.kt` | Real-time settings sync | Change detection, UI updates |
| `PathInserter.ts` | `PathInserter.kt` | Path communication utility | File path handling, webview messaging |
| `FileMonitor.ts` | `IdeOpenFilesUpdater.kt` | Open files tracking | Editor monitoring, file list updates |
| `FontSizeMonitor.ts` | `FontSizeMonitor.kt` | Font size synchronization | Backend polling, settings updates |
| `DragAndDropHandler.ts` | `DragAndDropInstaller.kt` | File drop handling | Drop event processing, path extraction |
| `AddToContextCommand.ts` | `ProjectAddToContextAction.kt`, `EditorAddToContextAction.kt` | Context menu operations | File/folder context actions |
| `AddLinesToContextCommand.ts` | `EditorAddLinesToContextAction.kt` | Selected text context | Line range calculation, editor integration |
| `PastePathCommand.ts` | `ProjectPastePathAction.kt` | Directory path pasting | Path extraction, webview communication |

### Communication Flow

1. **Extension Activation**: `extension.ts` initializes all components
2. **Backend Launch**: `BackendLauncher.ts` extracts and starts the Go backend
3. **Webview Creation**: `WebviewManager.ts` creates the webview panel
4. **UI Loading**: Web UI loads with authentication token and initial state
5. **Bridge Setup**: `CommunicationBridge.ts` establishes bi-directional communication
6. **Settings Sync**: `SettingsSynchronizer.ts` maintains real-time configuration sync
7. **File Monitoring**: `FileMonitor.ts` tracks open files and editor changes
8. **Command Handling**: Context menu commands send data to web UI

### Data Flow Diagram

```
VSCode IDE ←→ Extension Host ←→ Webview Panel ←→ Go Backend ←→ Terminal Process
     ↑              ↑              ↑              ↑              ↑
Settings      Commands      JavaScript      WebSocket      PTY/Pipes
Monitoring    Context       Bridge          Messages       I/O
File Events   Menus         Functions       JSON           Terminal
```

## Development

### Prerequisites

- **Node.js**: 18.0.0 or higher
- **VSCode**: 1.74.0 or higher
- **TypeScript**: 5.0.0 or higher
- **pnpm**: Latest version (recommended) or npm

### Setup Development Environment

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd <repository-name>
   ```

2. **Navigate to VSCode plugin directory**:
   ```bash
   cd hosts/vscode-plugin
   ```

3. **Install dependencies**:
   ```bash
   pnpm install
   ```

4. **Compile TypeScript**:
   ```bash
   pnpm run compile
   ```

### Development Workflow

1. **Open in VSCode**:
   ```bash
   code .
   ```

2. **Launch Extension Development Host**:
   - Press `F5` or use "Run and Debug" panel
   - Select "Launch Extension" configuration
   - New VSCode window opens with extension loaded

3. **Test Extension**:
   - Open a workspace in the Extension Development Host
   - Use Command Palette: "RovoBridge: Open Panel"
   - Test context menu commands and drag-and-drop

4. **Debug Extension**:
   - Set breakpoints in TypeScript files
   - Use Debug Console for logging
   - Inspect webview content with Developer Tools

### Build Commands

```bash
# Compile TypeScript
pnpm run compile

# Watch mode for development
pnpm run watch

# Run tests
pnpm run test

# Package extension
pnpm run package

# Lint code
pnpm run lint

# Format code
pnpm run format
```

### Testing

The extension includes comprehensive test coverage:

```bash
# Run all tests
pnpm run test

# Run specific test suite
pnpm run test -- --grep "BackendLauncher"

# Run tests with coverage
pnpm run test:coverage
```

Test structure:
- **Unit Tests**: Individual component testing
- **Integration Tests**: Component interaction testing
- **End-to-End Tests**: Full extension workflow testing

### Debugging Tips

1. **Extension Host Debugging**:
   - Use `console.log()` for simple debugging
   - Set breakpoints in TypeScript files
   - Use VSCode's built-in debugger

2. **Webview Debugging**:
   - Right-click webview → "Open Webview Developer Tools"
   - Inspect JavaScript bridge functions
   - Monitor WebSocket messages

3. **Backend Process Debugging**:
   - Check extension output channel for backend logs
   - Monitor process lifecycle in Task Manager/Activity Monitor
   - Verify binary extraction in temp directory

## Configuration

The extension provides comprehensive configuration options accessible through VSCode settings:

### Settings Schema

```json
{
  "rovobridge.customCommand": {
    "type": "string",
    "default": "",
    "description": "Custom command to run in the terminal (overrides default)"
  },
  "rovobridge.uiMode": {
    "type": "string",
    "enum": ["Terminal", "Canvas"],
    "default": "Terminal",
    "description": "UI mode for the interface"
  },
  "rovobridge.fontSize": {
    "type": "number",
    "default": 14,
    "minimum": 8,
    "maximum": 72,
    "description": "Font size for the terminal interface"
  },
  "rovobridge.chipsCollapsed": {
    "type": "boolean",
    "default": false,
    "description": "Whether chips panel is collapsed by default"
  },
  "rovobridge.composerCollapsed": {
    "type": "boolean",
    "default": false,
    "description": "Whether composer panel is collapsed by default"
  }
}
```

### Accessing Settings

1. **Via VSCode UI**:
   - File → Preferences → Settings (Ctrl+,)
   - Search for "RovoBridge"
   - Modify settings in the UI

2. **Via settings.json**:
   ```json
   {
     "rovobridge.customCommand": "my-custom-cli",
     "rovobridge.fontSize": 16,
     "rovobridge.chipsCollapsed": true
   }
   ```

### Real-time Synchronization

Settings changes are automatically synchronized:
- **VSCode → Web UI**: Immediate updates via JavaScript injection
- **Web UI → VSCode**: Settings saved back to VSCode configuration
- **Font Size**: Bidirectional sync with backend HTTP endpoint

## Commands

The extension provides several commands accessible via Command Palette and context menus:

### Command Palette Commands

- **`RovoBridge: Open Panel`**: Opens the main RovoBridge interface
- **`RovoBridge: Restart Backend`**: Restarts the backend process
- **`RovoBridge: Show Logs`**: Opens the extension output channel

### Context Menu Commands

#### Explorer Context Menu
- **`RovoBridge: Add to context`**: Available on files and folders
- **`RovoBridge: Paste path`**: Available on folders only

#### Editor Context Menu
- **`RovoBridge: Add to context`**: Adds current file to context
- **`RovoBridge: Add lines to context`**: Adds selected text with line numbers (when text is selected)

### Keyboard Shortcuts

Default keyboard shortcuts (can be customized):
- **`Ctrl+Shift+R`** (Windows/Linux) / **`Cmd+Shift+R`** (macOS): Open RovoBridge panel

## Troubleshooting

### Common Issues

#### Extension Won't Activate

**Symptoms**: Extension doesn't appear in Command Palette or context menus

**Solutions**:
1. Check VSCode version compatibility (requires 1.74.0+)
2. Verify extension is enabled in Extensions panel
3. Reload VSCode window (Ctrl+Shift+P → "Developer: Reload Window")
4. Check VSCode output panel for error messages

#### Backend Process Fails to Start

**Symptoms**: Webview shows connection error or loading indefinitely

**Solutions**:
1. **Check binary extraction**:
   ```bash
   # Check if binary exists in temp directory
   ls /tmp/rovo-bridge-* # Linux/macOS
   dir %TEMP%\rovo-bridge-* # Windows
   ```

2. **Verify binary permissions**:
   ```bash
   # Make binary executable (Linux/macOS)
   chmod +x /path/to/extracted/binary
   ```

3. **Check system requirements**:
   - Ensure your OS/architecture is supported
   - Verify no antivirus blocking execution
   - Check available disk space for extraction

4. **Manual backend testing**:
   ```bash
   # Test backend manually
   ./rovo-bridge --http 127.0.0.1:0 --serve-ui --print-conn-json
   ```

#### Webview Communication Issues

**Symptoms**: Context menu commands don't work, settings don't sync

**Solutions**:
1. **Check webview developer tools**:
   - Right-click webview → "Open Webview Developer Tools"
   - Look for JavaScript errors in console
   - Verify bridge functions are defined

2. **Verify WebSocket connection**:
   - Check Network tab for WebSocket connection
   - Ensure token authentication is working
   - Monitor message flow

3. **Reset webview state**:
   - Close and reopen RovoBridge panel
   - Restart VSCode if issues persist

#### Settings Not Synchronizing

**Symptoms**: Changes in VSCode settings don't reflect in web UI or vice versa

**Solutions**:
1. **Check settings format**:
   - Verify settings.json syntax is valid
   - Ensure setting names match schema exactly

2. **Monitor settings changes**:
   - Use VSCode Developer Tools to inspect configuration changes
   - Check extension output for synchronization logs

3. **Reset to defaults**:
   ```json
   {
     "rovobridge.fontSize": 14,
     "rovobridge.chipsCollapsed": false,
     "rovobridge.composerCollapsed": false
   }
   ```

#### Drag and Drop Not Working

**Symptoms**: Files dropped into webview don't appear in context

**Solutions**:
1. **Check webview focus**: Ensure webview panel has focus before dropping
2. **Verify file types**: Some file types may be filtered
3. **Test with simple files**: Try dropping a single .txt file first
4. **Check developer tools**: Look for drop event errors in console

#### Performance Issues

**Symptoms**: Extension is slow, high CPU/memory usage

**Solutions**:
1. **Monitor backend process**: Check if backend is consuming excessive resources
2. **Reduce file monitoring**: Large workspaces may cause performance issues
3. **Check for memory leaks**: Restart extension if memory usage grows over time
4. **Disable unnecessary features**: Temporarily disable drag-and-drop or file monitoring

### Diagnostic Information

To gather diagnostic information for bug reports:

1. **Extension version**: Check in Extensions panel
2. **VSCode version**: Help → About
3. **Operating system**: Include version and architecture
4. **Extension logs**: 
   - View → Output → Select "RovoBridge" from dropdown
   - Copy relevant log entries

5. **Backend logs**: Check temp directory for backend log files
6. **Settings**: Export current RovoBridge settings from settings.json

### Getting Help

1. **Check existing issues**: Search the GitHub repository for similar problems
2. **Create detailed bug report**: Include diagnostic information and steps to reproduce
3. **Community support**: Join discussions in the repository
4. **Documentation**: Refer to the design document for technical details

### Known Limitations

1. **Binary size**: Extension package includes binaries for all platforms, increasing size
2. **Webview restrictions**: Some advanced web features may be limited by VSCode's webview CSP
3. **Process management**: Backend processes may not always clean up properly on system shutdown
4. **File watching**: Large workspaces may impact performance of file monitoring features

## Contributing

We welcome contributions to improve the RovoBridge VSCode extension!

### Development Setup

1. Fork the repository
2. Follow the development setup instructions above
3. Create a feature branch
4. Make your changes
5. Add tests for new functionality
6. Submit a pull request

### Code Style

- Follow TypeScript best practices
- Use ESLint and Prettier for code formatting
- Add JSDoc comments for public APIs
- Include unit tests for new features

### Testing Guidelines

- Write unit tests for individual components
- Add integration tests for component interactions
- Test cross-platform compatibility
- Verify error handling and edge cases

For more detailed contribution guidelines, see the main repository documentation.

## Documentation

### Development & Architecture
- [Developer Guide](docs/DEVELOPER_GUIDE.md) - Development guidelines and architecture overview
- [Component Interactions](docs/COMPONENT_INTERACTIONS.md) - How components communicate and interact
- [Error Handling](docs/ERROR_HANDLING.md) - Error handling patterns and recovery mechanisms
- [Message Compatibility](docs/MESSAGE_COMPATIBILITY.md) - Cross-plugin message compatibility

### Testing & Quality
- [Testing Guide](docs/TESTING.md) - Testing strategies and procedures
- [Integration Tests](src/test/INTEGRATION_TESTS.md) - Integration testing overview
- [Test Suite](src/test/README.md) - Test organization and execution

### Build & Distribution
- [Packaging Guide](docs/PACKAGING.md) - Build and packaging instructions
- [Changelog](CHANGELOG.md) - Version history and changes

### Configuration
- [Settings Documentation](src/settings/README.md) - Settings management and synchronization