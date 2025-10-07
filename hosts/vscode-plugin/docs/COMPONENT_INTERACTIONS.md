# VSCode RovoBridge Extension - Component Interactions

## Overview

This document provides detailed diagrams and explanations of how the various components in the VSCode RovoBridge extension interact with each other. Understanding these interactions is crucial for maintaining and extending the extension.

## High-Level Architecture

```mermaid
graph TB
    subgraph "VSCode Extension Host"
        A[Extension Main<br/>extension.ts]
        B[BackendLauncher<br/>backend/]
        C[WebviewManager<br/>ui/]
        D[SettingsManager<br/>settings/]
        E[Commands<br/>commands/]
        F[Utilities<br/>utils/]
    end
    
    subgraph "External Processes"
        G[Go Backend<br/>rovo-bridge]
        H[Web UI<br/>Browser Context]
    end
    
    A --> B
    A --> C
    A --> D
    A --> E
    B --> G
    C --> H
    E --> F
    
    style A fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    style G fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    style H fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
```

## Extension Lifecycle Flow

```mermaid
sequenceDiagram
    participant VSCode
    participant Extension
    participant BackendLauncher
    participant WebviewManager
    participant SettingsManager
    participant Backend
    participant WebUI
    
    VSCode->>Extension: activate()
    Extension->>Extension: initialize()
    Extension->>SettingsManager: initialize()
    Extension->>Extension: registerCommands()
    
    Note over Extension: Extension ready, waiting for user action
    
    VSCode->>Extension: rovobridge.openPanel command
    Extension->>WebviewManager: createWebviewPanel()
    Extension->>BackendLauncher: launchBackend()
    BackendLauncher->>Backend: spawn process
    Backend-->>BackendLauncher: connection JSON
    BackendLauncher-->>Extension: BackendConnection
    Extension->>WebviewManager: loadWebUI(connection)
    WebviewManager->>WebUI: load HTML with iframe
    WebUI-->>WebviewManager: uiLoaded message
    WebviewManager->>WebviewManager: initializeWebUI()
    
    Note over WebUI: Extension fully operational
    
    VSCode->>Extension: deactivate()
    Extension->>BackendLauncher: terminate()
    Extension->>WebviewManager: dispose()
    BackendLauncher->>Backend: kill process
```

## Component Communication Patterns

### 1. Settings Synchronization Flow

```mermaid
sequenceDiagram
    participant User
    participant VSCode
    participant SettingsManager
    participant SettingsSynchronizer
    participant CommunicationBridge
    participant WebUI
    
    User->>VSCode: Change setting in UI
    VSCode->>SettingsManager: configuration change event
    SettingsManager->>SettingsSynchronizer: notifyListeners()
    SettingsSynchronizer->>CommunicationBridge: setFontSize() / setChipsCollapsed()
    CommunicationBridge->>WebUI: execute JavaScript
    
    Note over WebUI: Setting applied in web interface
    
    WebUI->>CommunicationBridge: settingsChanged message
    CommunicationBridge->>SettingsSynchronizer: handleWebviewSettingsChange()
    SettingsSynchronizer->>SettingsManager: updateSetting()
    SettingsManager->>VSCode: update configuration
```

### 2. File Context Operations Flow

```mermaid
sequenceDiagram
    participant User
    participant VSCode
    participant AddToContextCommand
    participant PathInserter
    participant CommunicationBridge
    participant WebUI
    
    User->>VSCode: Right-click file → "Add to context"
    VSCode->>AddToContextCommand: handleExplorerContext(uri)
    AddToContextCommand->>AddToContextCommand: collectFilePaths(uri)
    AddToContextCommand->>PathInserter: insertPaths(paths)
    PathInserter->>CommunicationBridge: insertPaths(paths)
    CommunicationBridge->>WebUI: execute __insertPaths() JavaScript
    
    Note over WebUI: Files added to context chips
```

### 3. File Opening Flow (WebUI → VSCode)

```mermaid
sequenceDiagram
    participant WebUI
    participant CommunicationBridge
    participant VSCode
    participant Editor
    
    WebUI->>CommunicationBridge: openFile message with path
    CommunicationBridge->>CommunicationBridge: handleOpenFile(path)
    CommunicationBridge->>CommunicationBridge: parse line numbers from path
    CommunicationBridge->>VSCode: workspace.openTextDocument()
    VSCode->>Editor: showTextDocument()
    CommunicationBridge->>Editor: revealRange() for line numbers
    
    Note over Editor: File opened at specified line
```

## Detailed Component Interactions

### BackendLauncher Component Flow

```mermaid
graph TB
    A[BackendLauncher.launchBackend] --> B[extractBinary]
    B --> C[ResourceExtractor.extractBinary]
    C --> D[Detect OS/Architecture]
    D --> E[Copy binary to temp location]
    E --> F[Make executable]
    F --> G[buildCommandArgs]
    G --> H[Get custom command from settings]
    H --> I[spawn process]
    I --> J[parseConnectionInfo]
    J --> K[Read stdout for JSON]
    K --> L[setupErrorHandling]
    L --> M[Return BackendConnection]
    
    style A fill:#e3f2fd
    style M fill:#c8e6c9
```

### WebviewManager Component Flow

```mermaid
graph TB
    A[WebviewManager.createWebviewPanel] --> B[Create vscode.WebviewPanel]
    B --> C[setupWebviewOptions - CSP]
    C --> D[setupMessageHandlers]
    D --> E[WebviewManager.loadWebUI]
    E --> F[Initialize CommunicationBridge]
    F --> G[Initialize DragAndDropHandler]
    G --> H[Initialize FileMonitor]
    H --> I[Initialize SettingsSynchronizer]
    I --> J[generateHtmlContent]
    J --> K[Set webview.html]
    K --> L[initializeWebUI via CommunicationBridge]
    
    style A fill:#e3f2fd
    style L fill:#c8e6c9
```

### CommunicationBridge Message Flow

```mermaid
graph LR
    subgraph "VSCode → WebUI"
        A[insertPaths] --> B[WebviewScripts.insertPathsScript]
        C[setFontSize] --> D[WebviewScripts.setFontSizeScript]
        E[pastePath] --> F[WebviewScripts.pastePathScript]
        B --> G[executeScript]
        D --> G
        F --> G
        G --> H[webview.postMessage]
    end
    
    subgraph "WebUI → VSCode"
        I[webview.onDidReceiveMessage] --> J[Message Router]
        J --> K[handleOpenFile]
        J --> L[handleStateChange]
        J --> M[handleBridgeValidation]
    end
    
    H --> N[WebUI JavaScript]
    N --> O[User Interaction]
    O --> P[postMessage to VSCode]
    P --> I
    
    style G fill:#ffecb3
    style J fill:#ffecb3
```

## Error Handling Flow

```mermaid
graph TB
    A[Component Error] --> B[ErrorHandler.handleError]
    B --> C[Determine Error Category]
    C --> D{Error Type}
    
    D -->|Backend Launch| E[handleBackendLaunchError]
    D -->|Webview Load| F[handleWebviewLoadError]
    D -->|File Operation| G[handleFileOperationError]
    D -->|Communication| H[handleCommunicationError]
    D -->|Settings| I[handleSettingsError]
    
    E --> J[Show user notification]
    F --> J
    G --> J
    H --> J
    I --> J
    
    J --> K[Log to output channel]
    K --> L[Attempt recovery if possible]
    
    style A fill:#ffcdd2
    style B fill:#fff3e0
    style L fill:#c8e6c9
```

## File Monitoring Integration

```mermaid
sequenceDiagram
    participant FileMonitor
    participant VSCode
    participant CommunicationBridge
    participant WebUI
    
    FileMonitor->>VSCode: onDidChangeActiveTextEditor
    FileMonitor->>VSCode: onDidOpenTextDocument
    FileMonitor->>VSCode: onDidCloseTextDocument
    VSCode-->>FileMonitor: editor change events
    FileMonitor->>FileMonitor: updateOpenFilesList()
    FileMonitor->>CommunicationBridge: updateOpenedFiles(files, current)
    CommunicationBridge->>WebUI: execute __updateOpenedFiles()
    
    Note over WebUI: Open files list updated in UI
```

## Drag and Drop Flow

```mermaid
sequenceDiagram
    participant User
    participant VSCodeExplorer
    participant DragAndDropHandler
    participant CommunicationBridge
    participant WebUI
    
    User->>VSCodeExplorer: Start drag operation
    VSCodeExplorer->>DragAndDropHandler: drag event with file URIs
    DragAndDropHandler->>DragAndDropHandler: validateDroppedFiles()
    DragAndDropHandler->>CommunicationBridge: insertPaths(filePaths)
    CommunicationBridge->>WebUI: execute __insertPaths()
    
    Note over WebUI: Files appear as chips in interface
```

## Settings Architecture

```mermaid
graph TB
    subgraph "VSCode Configuration"
        A[package.json configuration schema]
        B[workspace settings.json]
        C[user settings.json]
    end
    
    subgraph "Extension Settings Layer"
        D[SettingsManager]
        E[RovoBridgeSettings interface]
        F[DEFAULT_SETTINGS]
        G[validateSettingValue]
    end
    
    subgraph "Synchronization Layer"
        H[SettingsSynchronizer]
        I[onDidChangeConfiguration listener]
        J[CommunicationBridge integration]
    end
    
    subgraph "WebUI Layer"
        K[JavaScript bridge functions]
        L[UI state management]
        M[User interaction handlers]
    end
    
    A --> D
    B --> D
    C --> D
    D --> E
    E --> F
    E --> G
    D --> H
    H --> I
    H --> J
    J --> K
    K --> L
    L --> M
    M --> J
    
    style D fill:#e1f5fe
    style H fill:#f3e5f5
    style J fill:#e8f5e8
```

## Command Registration and Execution

```mermaid
graph TB
    subgraph "Extension Activation"
        A[extension.ts activate()] --> B[registerCommands()]
        B --> C[vscode.commands.registerCommand]
        C --> D[Add to context.subscriptions]
    end
    
    subgraph "Command Execution"
        E[User Action] --> F[VSCode Command Palette / Context Menu]
        F --> G[Command Handler in extension.ts]
        G --> H{Command Type}
        
        H -->|File Context| I[AddToContextCommand.handleExplorerContext]
        H -->|Editor Context| J[AddToContextCommand.handleEditorContext]
        H -->|Lines Context| K[AddLinesToContextCommand.handleSelectedLines]
        H -->|Paste Path| L[PastePathCommand.handleDirectoryPaste]
        H -->|Open Panel| M[handleOpenPanel]
        
        I --> N[PathInserter.insertPaths]
        J --> N
        K --> N
        L --> O[PathInserter.pastePath]
        M --> P[WebviewManager + BackendLauncher]
        
        N --> Q[CommunicationBridge]
        O --> Q
        Q --> R[WebUI]
    end
    
    style A fill:#e3f2fd
    style E fill:#fff3e0
    style R fill:#c8e6c9
```

## Resource Management and Cleanup

```mermaid
graph TB
    A[Extension Deactivation] --> B[RovoBridgeExtension.dispose()]
    B --> C[WebviewManager.dispose()]
    B --> D[BackendLauncher.terminate()]
    B --> E[SettingsManager.dispose()]
    
    C --> F[CommunicationBridge.dispose()]
    C --> G[DragAndDropHandler.dispose()]
    C --> H[FileMonitor.stopMonitoring()]
    C --> I[SettingsSynchronizer.dispose()]
    C --> J[webviewPanel.dispose()]
    
    D --> K[Process.kill('SIGTERM')]
    D --> L[Timeout → Process.kill('SIGKILL')]
    
    E --> M[configurationListener.dispose()]
    E --> N[Clear changeListeners array]
    
    F --> O[messageHandlerDisposable.dispose()]
    G --> P[Clear drag event listeners]
    H --> Q[Clear file watchers]
    I --> R[Clear settings listeners]
    
    style A fill:#ffcdd2
    style B fill:#fff3e0
    style K fill:#c8e6c9
    style L fill:#c8e6c9
```

## Key Integration Points

### 1. Extension ↔ Backend Communication
- **Protocol**: HTTP/WebSocket via localhost
- **Authentication**: Random 192-bit tokens
- **Data Format**: JSON messages
- **Security**: Loopback-only binding (127.0.0.1)

### 2. Extension ↔ WebUI Communication
- **Protocol**: VSCode webview messaging API
- **Data Format**: Structured message objects
- **Security**: Content Security Policy restrictions
- **Bridge Functions**: JavaScript injection for UI control

### 3. VSCode API Integration
- **Configuration**: `vscode.workspace.getConfiguration()`
- **Commands**: `vscode.commands.registerCommand()`
- **File System**: `vscode.workspace.fs` and `vscode.Uri`
- **UI**: `vscode.window` for notifications and editors

### 4. Cross-Component Dependencies
- **PathInserter** depends on **CommunicationBridge**
- **WebviewManager** coordinates multiple components
- **SettingsSynchronizer** bridges **SettingsManager** and **CommunicationBridge**
- **Commands** use **PathInserter** for WebUI communication

## Performance Considerations

### Initialization Sequence
1. **Synchronous**: Extension registration and basic setup
2. **Asynchronous**: Component initialization and backend launch
3. **Lazy**: WebUI loading only when panel is opened
4. **Background**: File monitoring and settings synchronization

### Resource Usage Patterns
- **Memory**: Components are disposed when not needed
- **CPU**: Background tasks are throttled and debounced
- **I/O**: File operations are batched and validated
- **Network**: Only localhost connections are used

This component interaction documentation should be referenced when making architectural changes or debugging complex issues that span multiple components.