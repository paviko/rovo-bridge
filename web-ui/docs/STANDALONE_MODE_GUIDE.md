# Standalone Mode Guide

## Overview

Standalone mode allows the RovoBridge web UI to function independently in a regular browser without IDE integration. In this mode, the web UI provides full terminal functionality including drag-and-drop file operations, manual configuration, and direct browser console access. This mode preserves all core functionality while operating without IDE plugin communication.

## Table of Contents

- [What is Standalone Mode](#what-is-standalone-mode)
- [Standalone Detection](#standalone-detection)
- [Feature Availability](#feature-availability)
- [Global Function Preservation](#global-function-preservation)
- [Testing Standalone Functionality](#testing-standalone-functionality)
- [Limitations and Differences](#limitations-and-differences)
- [Troubleshooting](#troubleshooting)

## What is Standalone Mode

Standalone mode is automatically activated when the web UI detects it's running in a regular browser rather than an IDE webview. In this mode:

- **Full drag-and-drop functionality**: Files can be dragged from the file system into the terminal
- **Manual configuration**: Settings can be changed via browser console or UI controls
- **Direct browser access**: No IDE plugin required for core functionality
- **Global function interface**: All operations use `window.__*` functions as the primary API
- **Complete terminal experience**: All terminal features work independently

### Key Characteristics

- **Browser-Native Operations**: Drag-and-drop uses standard browser APIs
- **Console Access**: All functions accessible via browser developer console
- **No IDE Dependencies**: Works without JetBrains or VSCode plugins
- **Full Feature Set**: Terminal, file operations, session management all available
- **Manual Token Entry**: Authentication via overlay prompt or console commands

## Standalone Detection

The system uses multiple heuristics to detect standalone mode:

### Detection Logic

```typescript
private detectStandaloneMode(): boolean {
  // Check for parent window relationship
  const hasParent = window.parent && window.parent !== window;
  
  // Check URL and protocol patterns
  const isLocalhost = window.location.hostname === '127.0.0.1' || 
                     window.location.hostname === 'localhost';
  const hasFileProtocol = window.location.protocol === 'file:';
  
  // Check for IDE-specific APIs
  const isJetBrains = window.location.href.includes('jcef') || 
                     (window as any).cefQuery !== undefined ||
                     navigator.userAgent.includes('Chrome') && hasParent;
  const isVSCode = (window as any).acquireVsCodeApi !== undefined;
  
  // IDE detected = not standalone
  if (isJetBrains || isVSCode) {
    return false;
  }
  
  // Standalone indicators
  return !hasParent || hasFileProtocol || 
         (!isLocalhost && window.location.hostname !== '');
}
```

### Detection Indicators

**Standalone Mode Indicators:**
- No parent window (direct browser access)
- `file://` protocol (local HTML file)
- Non-localhost hostname (served from different domain)
- Absence of IDE-specific APIs

**IDE Mode Indicators:**
- Presence of `cefQuery` (JetBrains JCEF)
- Presence of `acquireVsCodeApi` (VSCode webview)
- Parent window different from current window
- Localhost/127.0.0.1 with specific URL patterns

### Detection Debugging

Check detection results in browser console:

```javascript
// View detection details
console.log('Detection details:', {
  hasParent: window.parent && window.parent !== window,
  hostname: window.location.hostname,
  protocol: window.location.protocol,
  href: window.location.href,
  userAgent: navigator.userAgent,
  cefQuery: window.cefQuery !== undefined,
  acquireVsCodeApi: window.acquireVsCodeApi !== undefined,
  isStandalone: window.messageDispatcher?.isStandalone
});
```

## Feature Availability

### Fully Available Features

All core web UI features work in standalone mode through direct browser APIs and global functions:

#### Terminal Operations
- Terminal display and interaction via xterm.js
- Command execution and output through WebSocket connection
- Terminal resizing and font size changes via console or UI
- Session management and restart through global functions

#### File Operations (Core Functionality)
- **Drag and drop**: Files dragged from file system are processed by `extractPathsFromDrop()`
- **Path insertion**: Calls `__insertPaths()` or `__insertPaths_direct()` to add files to terminal
- **File routing**: Composer integration via `routeInsertPaths()` automatically routes to appropriate target
- **Chip UI**: Visual file tracking and management in the interface

#### UI Controls
- Composer panel functionality with file chip management
- Settings and configuration via global functions
- Font size adjustments through `__setFontSize()`
- Panel collapse/expand states managed by UI state functions

#### Session Management
- Custom session commands via `__updateSessionCommand()`
- Environment configuration through `__setSessionConfig()`
- Session restart via `__restartSession()`
- WebSocket communication with backend (same as IDE mode)

### Direct Function Interface

In standalone mode, these global functions provide the primary API for all operations:

```javascript
// Authentication (required for WebSocket connection)
window.__setToken('your-token-here');

// Font size control (affects terminal display)
window.__setFontSize(14);

// File operations (used by drag-and-drop system)
window.__insertPaths(['/path/to/file1.js', '/path/to/file2.ts']);  // Routes through composer
window.__insertPaths_direct(['/path/to/file1.js']);                // Direct to terminal
window.__pastePath('/path/to/directory');                          // Single path insertion

// Session management (control terminal behavior)
window.__updateSessionCommand('npm test');
window.__restartSession();
window.__setSessionConfig({ cmd: 'node', args: ['script.js'] });

// UI state management
window.__setTooltipPolyfill(true);

// Manual file tracking (normally handled by IDE)
window.__updateOpenedFiles(['file1.js', 'file2.ts'], 'file1.js');
window.__setCurrentFile('file1.js');
window.__setOpenedFiles(['file1.js', 'file2.ts']);
```

### Function Call Flow in Standalone Mode

```
User drags file → extractPathsFromDrop() → routeInsertPaths() → __insertPaths() → UI update
User in console → __setFontSize(16) → terminal font update
User drops on terminal → processPathsInsert() → __insertPaths_direct() → terminal insertion
```

## Drag-and-Drop Architecture

The drag-and-drop functionality is a core feature that works fully in standalone mode:

### How Drag-and-Drop Works

1. **Event Setup**: `initDnd()` registers drag/drop event listeners on the terminal element
2. **File Detection**: `extractPathsFromDrop()` processes the drag event using browser APIs
3. **Path Processing**: Files are filtered (directories excluded) and paths are extracted
4. **Routing Decision**: `routeInsertPaths()` checks if composer is visible
5. **Function Call**: Calls either `__insertPaths()` (composer) or `__insertPaths_direct()` (terminal)
6. **UI Update**: Files appear as chips and/or are inserted into terminal

### Code Flow Example

```typescript
// 1. User drags files from file system to browser
// 2. Browser fires 'drop' event on terminal element
// 3. Event handler in initDnd() processes the drop:

termEl.addEventListener('drop', (ev) => {
  // Check if composer is visible for routing
  const comp = document.getElementById('composer')
  if (comp && !comp.classList.contains('collapsed')) {
    // Route to composer
    const paths = extractPathsFromDrop(ev)
    window.__insertPaths(paths)  // Global function call
  } else {
    // Route directly to terminal
    const paths = extractPathsFromDrop(ev)
    processPathsInsert(paths)    // Calls __insertPaths_direct()
  }
})
```

### Why Global Functions Are Essential

The drag-and-drop system **requires** global functions to work:

- `extractPathsFromDrop()` → `routeInsertPaths()` → `__insertPaths()` or `__insertPaths_direct()`
- No IDE plugin involved - this is pure browser-to-browser communication
- Global functions provide the interface between drag-and-drop events and UI updates
- Without these functions, drag-and-drop would not work in standalone mode

This is why the MessageDispatcher preserves and maintains these functions rather than replacing them.

## Global Function Architecture

The system relies on global functions as the primary API in standalone mode. These functions are not just "preserved for compatibility" - they are the core interface that enables drag-and-drop and manual operations.

### Why Global Functions Are Essential

1. **Drag-and-Drop Integration**: The `initDnd()` system calls `__insertPaths()` when files are dropped
2. **Composer Routing**: The `routeInsertPaths()` function calls `__insertPaths_direct()` for direct terminal insertion
3. **Manual Operations**: Browser console access requires these functions for user control
4. **UI State Management**: Functions like `__setFontSize()` and `__restartSession()` provide direct control

### Function Preservation Process

1. **Function Detection**: Identifies existing `window.__*` functions during initialization
2. **Reference Storage**: Stores function references in `originalGlobalFunctions` map
3. **Dual-Mode Support**: Functions work both via direct calls and message handlers
4. **Non-Interference**: Message dispatcher enhances rather than replaces existing behavior

### Preserved Functions

```typescript
const preservedFunctions = [
  '__setToken',              // Authentication token setting
  '__setFontSize',           // Font size updates
  '__insertPaths',           // File path insertion
  '__pastePath',             // Single path pasting
  '__updateSessionCommand',  // Session command updates
  '__updateOpenedFiles',     // IDE file list updates
  '__setTooltipPolyfill',    // Tooltip configuration
  '__setCurrentFile',        // Current file tracking
  '__setOpenedFiles',        // Opened files list
  '__insertPaths_direct',    // Direct path insertion
  '__setSessionConfig',      // Session configuration
  '__restartSession'         // Session restart
];
```

### Verification

Check preserved functions in browser console:

```javascript
// List all preserved functions
console.log('Preserved functions:', 
  Array.from(window.messageDispatcher.originalGlobalFunctions.keys())
);

// Test a specific function
if (typeof window.__setFontSize === 'function') {
  console.log('Font size function available');
  window.__setFontSize(16);
} else {
  console.log('Font size function not available');
}
```

## Testing Standalone Functionality

### Basic Functionality Test

1. **Open in Browser**: Access the web UI directly in a browser
2. **Check Detection**: Verify standalone mode is detected
3. **Test Functions**: Try calling global functions from console
4. **Verify UI**: Ensure all UI elements work correctly

### Comprehensive Test Suite

```javascript
// Test suite for standalone mode
function testStandaloneMode() {
  console.log('=== Standalone Mode Test Suite ===');
  
  // 1. Check mode detection
  const isStandalone = window.messageDispatcher?.isStandalone;
  console.log('✓ Standalone mode detected:', isStandalone);
  
  // 2. Test global functions availability
  const functions = [
    '__setToken', '__setFontSize', '__insertPaths', 
    '__pastePath', '__updateSessionCommand', '__restartSession'
  ];
  
  functions.forEach(funcName => {
    const available = typeof window[funcName] === 'function';
    console.log(`${available ? '✓' : '✗'} ${funcName}:`, available);
  });
  
  // 3. Test function execution
  try {
    window.__setFontSize(14);
    console.log('✓ Font size function executed successfully');
  } catch (error) {
    console.log('✗ Font size function failed:', error);
  }
  
  // 4. Test file operations
  try {
    window.__insertPaths(['/test/path']);
    console.log('✓ Insert paths function executed successfully');
  } catch (error) {
    console.log('✗ Insert paths function failed:', error);
  }
  
  // 5. Test session operations
  try {
    window.__updateSessionCommand('echo "test"');
    console.log('✓ Update session command executed successfully');
  } catch (error) {
    console.log('✗ Update session command failed:', error);
  }
  
  console.log('=== Test Suite Complete ===');
}

// Run the test
testStandaloneMode();
```

### Manual Testing Checklist

- [ ] Web UI loads correctly in browser
- [ ] Standalone mode is detected and logged
- [ ] Terminal displays and accepts input
- [ ] File drag and drop works
- [ ] Font size can be changed via console
- [ ] Session commands can be updated
- [ ] All UI panels function correctly
- [ ] No console errors related to missing functions

### Automated Testing

```javascript
// Jest test for standalone mode
describe('Standalone Mode', () => {
  beforeEach(() => {
    // Mock standalone environment
    Object.defineProperty(window, 'parent', { value: window });
    delete window.cefQuery;
    delete window.acquireVsCodeApi;
  });
  
  it('should detect standalone mode correctly', () => {
    const dispatcher = new MessageDispatcher();
    expect(dispatcher.isStandalone).toBe(true);
  });
  
  it('should preserve global functions', () => {
    window.__setToken = jest.fn();
    const dispatcher = new MessageDispatcher();
    
    expect(dispatcher.originalGlobalFunctions.has('__setToken')).toBe(true);
    expect(typeof window.__setToken).toBe('function');
  });
  
  it('should not interfere with direct function calls', () => {
    const mockSetToken = jest.fn();
    window.__setToken = mockSetToken;
    
    const dispatcher = new MessageDispatcher();
    window.__setToken('test-token');
    
    expect(mockSetToken).toHaveBeenCalledWith('test-token');
  });
});
```

## Limitations and Differences

### Standalone vs IDE Mode Differences

| Feature | Standalone Mode | IDE Mode |
|---------|----------------|----------|
| **Communication** | Direct global function calls | postMessage → handlers → global functions |
| **File Integration** | Drag/drop from file system | Context menu + drag/drop from IDE |
| **Settings Sync** | Manual via console/UI | Automatic synchronization from IDE settings |
| **File Tracking** | Manual file list management | Automatic IDE file list synchronization |
| **Authentication** | Manual token entry (overlay/console) | Automatic token injection from IDE |
| **Error Handling** | Direct function errors | Message validation + handler error handling |
| **Function Access** | Primary API interface | Fallback interface (postMessage preferred) |

### Standalone Mode Limitations

1. **No IDE Integration**:
   - No automatic file list updates from IDE (must use `__updateOpenedFiles()` manually)
   - No context menu "Add to Context" from IDE file explorer
   - No automatic settings synchronization from IDE preferences

2. **Manual Configuration Required**:
   - Font size changes via `__setFontSize()` or UI controls
   - Session commands via `__updateSessionCommand()` 
   - Authentication token via overlay prompt or `__setToken()`

3. **File System Access Limitations**:
   - Drag-and-drop works but no IDE file tree integration
   - No automatic current file tracking (must use `__setCurrentFile()`)
   - File paths must be dragged from OS file manager or entered manually

4. **Reduced Automation**:
   - No automatic token injection (must copy from backend logs)
   - No automatic UI state synchronization with IDE
   - No IDE-triggered actions or commands

**Important**: Despite these limitations, all core functionality including drag-and-drop file operations, terminal interaction, and session management works fully in standalone mode.

### Workarounds for Limitations

1. **Manual Token Entry**:
   ```javascript
   // Use token overlay or console
   window.__setToken('your-token-from-backend-logs');
   ```

2. **Manual File Addition**:
   ```javascript
   // Add files via console
   window.__insertPaths(['/path/to/your/file.js']);
   ```

3. **Manual Configuration**:
   ```javascript
   // Configure settings via console
   window.__setFontSize(16);
   window.__updateSessionCommand('your-custom-command');
   ```

### Feature Parity Considerations

While standalone mode maintains core functionality, some advanced features require IDE integration:

- **Real-time file synchronization**: Requires IDE plugin
- **Context-aware operations**: Requires IDE file system access
- **Automatic configuration**: Requires IDE settings integration
- **Advanced file operations**: Requires IDE API access

## Troubleshooting

### Common Issues

#### 1. Standalone Mode Not Detected

**Symptoms**: IDE mode detected when running in browser

**Causes**:
- Browser running in iframe or embedded context
- URL patterns matching IDE detection logic
- Presence of IDE-specific APIs in browser

**Solutions**:
```javascript
// Force standalone mode (for testing)
window.messageDispatcher.isStandalone = true;

// Check detection factors
console.log('Detection factors:', {
  hasParent: window.parent !== window,
  protocol: window.location.protocol,
  hostname: window.location.hostname,
  cefQuery: !!window.cefQuery,
  acquireVsCodeApi: !!window.acquireVsCodeApi
});
```

#### 2. Global Functions Not Working

**Symptoms**: `window.__setToken` etc. are undefined

**Causes**:
- Functions not defined before MessageDispatcher initialization
- Functions overwritten by other code
- Initialization order issues

**Solutions**:
```javascript
// Check function availability
console.log('Available functions:', Object.keys(window).filter(k => k.startsWith('__')));

// Manually define missing functions
if (typeof window.__setToken !== 'function') {
  console.warn('__setToken not available, defining manually');
  window.__setToken = function(token) {
    console.log('Token set:', token);
    // Add your implementation
  };
}
```

#### 3. Message Dispatcher Interference

**Symptoms**: Functions work but behavior is different

**Causes**:
- Message dispatcher overriding existing functions
- Handler conflicts with direct calls
- Initialization timing issues

**Solutions**:
```javascript
// Check if dispatcher is interfering
console.log('Dispatcher mode:', window.messageDispatcher?.isStandalone);

// Verify function preservation
console.log('Preserved functions:', 
  window.messageDispatcher?.originalGlobalFunctions?.size || 0
);

// Test direct function call
const originalFunc = window.messageDispatcher?.originalGlobalFunctions?.get('__setToken');
if (originalFunc) {
  originalFunc('test-token');
}
```

#### 4. Console Errors in Standalone Mode

**Symptoms**: Errors about missing handlers or validation failures

**Causes**:
- Message dispatcher trying to process non-message events
- Validation errors on unexpected data
- Handler registration issues

**Solutions**:
```javascript
// Disable message validation logging for standalone
if (window.messageDispatcher?.isStandalone) {
  const originalLog = console.warn;
  console.warn = function(...args) {
    if (args[0]?.includes?.('[MessageDispatcher]')) {
      return; // Suppress dispatcher warnings in standalone
    }
    originalLog.apply(console, args);
  };
}
```

### Debug Mode

Enable detailed logging for troubleshooting:

```javascript
// Enable debug mode
window.messageDispatcher.debugMode = true;

// Check all internal state
console.log('MessageDispatcher state:', {
  isStandalone: window.messageDispatcher.isStandalone,
  handlers: Array.from(window.messageDispatcher.handlers.keys()),
  preservedFunctions: Array.from(window.messageDispatcher.originalGlobalFunctions.keys())
});
```

### Performance Monitoring

Monitor performance in standalone mode:

```javascript
// Monitor function call performance
const originalSetFontSize = window.__setFontSize;
window.__setFontSize = function(...args) {
  const start = performance.now();
  const result = originalSetFontSize.apply(this, args);
  const end = performance.now();
  console.log(`setFontSize took ${end - start} milliseconds`);
  return result;
};
```

## Best Practices for Standalone Mode

1. **Test Both Modes**: Always test functionality in both standalone and IDE modes
2. **Preserve Compatibility**: Ensure new features work with direct function calls
3. **Handle Gracefully**: Provide fallbacks when IDE features aren't available
4. **Document Differences**: Clearly document any standalone mode limitations
5. **Monitor Performance**: Ensure standalone mode doesn't have performance regressions

This guide provides comprehensive information about standalone mode behavior and usage. For additional support, refer to the main documentation or troubleshooting guides.