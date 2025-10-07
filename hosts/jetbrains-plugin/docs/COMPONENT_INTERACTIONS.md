# JetBrains RovoBridge Plugin - Component Interactions

## Overview

This document provides detailed diagrams and explanations of how the various components in the JetBrains RovoBridge plugin interact. Understanding these interactions is crucial for maintaining and extending the plugin's functionality.

## High-Level Architecture

```mermaid
graph TB
    subgraph "JetBrains IDE Host (Kotlin/JVM)"
        A[Plugin Main<br/>plugin.xml]
        B[BackendLauncher<br/>ui/BackendLauncher.kt]
        C[ChatToolWindowFactory<br/>ui/ChatToolWindowFactory.kt]
        D[Settings<br/>settings/]
        E[Actions<br/>actions/]
        F[Utilities<br/>ui/, util/]
    end
    
    subgraph "External Processes"
        G[Go Backend<br/>rovo-bridge]
        H[Web UI<br/>JCEF Browser Context]
    end
    
    A --> C
    A --> D
    A --> E
    C --> B
    B --> G
    C --> H
    E --> F
    
    style A fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    style G fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    style H fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
```

## Plugin Lifecycle Flow

```mermaid
sequenceDiagram
    participant IDE
    participant Plugin
    participant ChatToolWindowFactory
    participant BackendLauncher
    participant JBCefBrowser
    participant Backend
    participant WebUI
    
    IDE->>Plugin: Load plugin (on startup)
    Note over Plugin: Plugin loaded, waiting for user action
    
    User->>IDE: Open "RovoBridge" Tool Window
    IDE->>ChatToolWindowFactory: createToolWindowContent()
    ChatToolWindowFactory->>BackendLauncher: launchBackend()
    BackendLauncher->>Backend: spawn process
    Backend-->>BackendLauncher: connection JSON via stdout
    BackendLauncher-->>ChatToolWindowFactory: Process & ConnInfo
    ChatToolWindowFactory->>JBCefBrowser: new JBCefBrowser(url)
    JBCefBrowser->>WebUI: Load HTML content
    WebUI-->>ChatToolWindowFactory: onLoadEnd event
    ChatToolWindowFactory->>ChatToolWindowFactory: initializeBridges() (e.g., WebViewLoadHandler)
    
    Note over WebUI: Plugin fully operational
    
    User->>IDE: Close Tool Window / Shutdown
    IDE->>ChatToolWindowFactory: dispose()
    ChatToolWindowFactory->>BackendLauncher: proc.destroy()
    BackendLauncher->>Backend: kill process
```

## Component Communication Patterns

### 1. Settings Synchronization Flow

```mermaid
sequenceDiagram
    participant User
    participant RovoBridgeConfigurable
    participant RovoBridgeSettings
    participant Synchronizer
    participant JBCefBrowser
    participant WebUI
    
    User->>RovoBridgeConfigurable: Change setting in UI & Clicks Apply
    RovoBridgeConfigurable->>RovoBridgeConfigurable: apply()
    RovoBridgeConfigurable->>RovoBridgeSettings: state.fontSize = ...
    RovoBridgeConfigurable->>Synchronizer: updateFrontendFontSize(size)
    Synchronizer->>JBCefBrowser: executeJavaScript("window.postMessage(...)")
    
    Note over WebUI: Setting applied in web interface
    
    WebUI->>JBCefBrowser: Calls window.__notify...() (JS->Kotlin Bridge)
    JBCefBrowser->>ChatToolWindowFactory: JBCefJSQuery handler triggers
    ChatToolWindowFactory->>RovoBridgeSettings: state.chipsCollapsed = ...
```

### 2. File Context Operations Flow

```mermaid
sequenceDiagram
    participant User
    participant IDE
    participant ProjectAddToContextAction
    participant PathInserter
    participant JBCefBrowser
    participant WebUI
    
    User->>IDE: Right-click file → "Add to context"
    IDE->>ProjectAddToContextAction: actionPerformed(event)
    ProjectAddToContextAction->>ProjectAddToContextAction: collectFilePaths(files)
    ProjectAddToContextAction->>PathInserter: insertPaths(paths)
    PathInserter->>JBCefBrowser: executeJavaScript("window.postMessage(...)")
    
    Note over WebUI: Files added to context chips
```

### 3. File Opening Flow (WebUI → IDE)

```mermaid
sequenceDiagram
    participant WebUI
    participant JBCefBrowser
    participant OpenInIdeHandler
    participant FileEditorManager
    
    WebUI->>JBCefBrowser: Calls window.__openInIDE(path)
    JBCefBrowser->>OpenInIdeHandler: JBCefJSQuery handler triggers
    OpenInIdeHandler->>OpenInIdeHandler: Parse path and line numbers
    OpenInIdeHandler->>FileEditorManager: openTextEditor(new OpenFileDescriptor(...))
    
    Note over FileEditorManager: File opened at specified line in IDE
```

## Detailed Component Interactions

### BackendLauncher Component Flow

```mermaid
graph TB
    A[launchBackend] --> B[findBundledBinary]
    B --> C[util.ResourceExtractor.extractToTemp]
    C --> D[Detect OS/Architecture]
    D --> E[Copy binary from JAR to temp file]
    E --> F[Set file as executable]
    F --> G[Build command arguments]
    G --> H[Read custom command from RovoBridgeSettings]
    H --> I[new ProcessBuilder().start()]
    I --> J[Read stdout for connection JSON]
    J --> K[Setup error handling & fallback]
    K --> L[Return Process object]
    
    style A fill:#e3f2fd
    style L fill:#c8e6c9
```

### ChatToolWindowFactory Flow

```mermaid
graph TB
    A[createToolWindowContent] --> B[launchBackend]
    B --> C[Parse Connection JSON]
    C --> D[new JBCefBrowser]
    D --> E[Install Handlers]
    subgraph E
        F[WebViewLoadHandler]
        G[DragAndDropInstaller]
        H[OpenInIdeHandler]
        I[IdeOpenFilesUpdater]
        J[JBCefJSQuery Handlers for state]
    end
    E --> K[Add browser component to panel]
    
    style A fill:#e3f2fd
    style K fill:#c8e6c9
```

### CommunicationBridge Message Flow

```mermaid
graph LR
    subgraph "Kotlin → JS"
        A[PathInserter] --> B[WebViewScripts.generatePostMessage]
        C[FontSizeSynchronizer] --> B
        B --> D[browser.cefBrowser.executeJavaScript]
        D --> E[WebUI JavaScript]
    end
    
    subgraph "JS → Kotlin"
        F[JBCefJSQuery.create] --> G[WebViewScripts.define...BridgeScript]
        G --> H[Injects window.__functionName]
        I[WebUI JavaScript] --> H
        H --> J[Handler in Kotlin]
        J --> K[IDE Action]
    end
    
    style D fill:#ffecb3
    style J fill:#ffecb3
```

## Error Handling Flow

```mermaid
graph TB
    A[Component Error] --> B[try-catch block]
    B --> C[Logger.getInstance().error()]
    C --> D[Log to idea.log]
    
    B --> E{Is it a UI-blocking error?}
    E -->|Yes| F[Display error message in Tool Window panel]
    E -->|No| G[Log and continue]
    
    style A fill:#ffcdd2
    style C fill:#fff3e0
```

## File Monitoring Integration

```mermaid
sequenceDiagram
    participant IdeOpenFilesUpdater
    participant MessageBus
    participant JBCefBrowser
    participant WebUI
    
    IdeOpenFilesUpdater->>MessageBus: project.messageBus.connect().subscribe(...)
    Note over MessageBus: Subscribes to FileEditorManagerListener
    
    User->>IDE: Opens/closes/switches editor tab
    IDE->>MessageBus: Dispatches event
    MessageBus-->>IdeOpenFilesUpdater: selectionChanged() / fileOpened() / fileClosed()
    IdeOpenFilesUpdater->>IdeOpenFilesUpdater: push()
    IdeOpenFilesUpdater->>JBCefBrowser: executeJavaScript("window.postMessage({type:'updateOpenedFiles',...})")
    
    Note over WebUI: Open files list updated in UI
```

## Drag and Drop Flow

```mermaid
sequenceDiagram
    participant User
    participant ProjectView
    participant DragAndDropInstaller
    participant PathInserter
    participant WebUI
    
    User->>ProjectView: Start drag operation
    ProjectView->>DragAndDropInstaller: AWT drop event
    DragAndDropInstaller->>DragAndDropInstaller: Extract List<java.io.File> from transferable
    DragAndDropInstaller->>PathInserter: insertPaths(filePaths) / pastePath(dirPaths)
    PathInserter->>WebUI: postMessage with paths
    
    Note over WebUI: Files appear as chips in interface
```

## Resource Management and Cleanup

```mermaid
graph TB
    A[Tool Window disposed or IDE shutdown] --> B[Disposer.register(disposable)]
    B --> C[Backend Process.destroy()]
    B --> D[JBCefBrowser.dispose()]
    B --> E[Singleton.clearBrowser()]
    B --> F[MessageBus connection.disconnect()]
    
    C --> G[Backend process terminated]
    D --> H[JCEF resources released]
    E --> I[Prevents memory leaks from static refs]
    F --> J[Event listeners removed]
    
    style A fill:#ffcdd2
```

This component interaction documentation should be referenced when making architectural changes or debugging complex issues that span multiple components of the JetBrains plugin.
