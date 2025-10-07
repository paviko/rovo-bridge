# VSCode-JetBrains Message Compatibility

This document verifies that the VSCode plugin sends identical message formats to the JetBrains plugin, ensuring both plugins work seamlessly with the unified web UI message dispatcher.

## Message Format Standardization

Both plugins now use the exact same message structure:

```typescript
interface BaseMessage {
    type: string;
    timestamp?: number;
}
```

## Verified Message Types

### 1. setToken
**JetBrains format:**
```json
{
    "type": "setToken",
    "token": "sample-token-123",
    "timestamp": 1640995200000
}
```

**VSCode format:**
```json
{
    "type": "setToken",
    "token": "sample-token-123",
    "timestamp": 1640995200000
}
```

### 2. setFontSize
**JetBrains format:**
```json
{
    "type": "setFontSize",
    "size": 14,
    "timestamp": 1640995200000
}
```

**VSCode format:**
```json
{
    "type": "setFontSize",
    "size": 14,
    "timestamp": 1640995200000
}
```

### 3. insertPaths
**JetBrains format:**
```json
{
    "type": "insertPaths",
    "paths": ["/path/to/file1.js", "/path/to/file2.ts"],
    "timestamp": 1640995200000
}
```

**VSCode format:**
```json
{
    "type": "insertPaths",
    "paths": ["/path/to/file1.js", "/path/to/file2.ts"],
    "timestamp": 1640995200000
}
```

### 4. pastePath
**JetBrains format:**
```json
{
    "type": "pastePath",
    "path": "/path/to/directory",
    "timestamp": 1640995200000
}
```

**VSCode format:**
```json
{
    "type": "pastePath",
    "path": "/path/to/directory",
    "timestamp": 1640995200000
}
```

### 5. updateSessionCommand
**JetBrains format:**
```json
{
    "type": "updateSessionCommand",
    "command": "npm test",
    "timestamp": 1640995200000
}
```

**VSCode format:**
```json
{
    "type": "updateSessionCommand",
    "command": "npm test",
    "timestamp": 1640995200000
}
```

### 6. updateOpenedFiles
**JetBrains format:**
```json
{
    "type": "updateOpenedFiles",
    "openedFiles": ["/path/to/file1.js", "/path/to/file2.ts"],
    "currentFile": "/path/to/file1.js",
    "timestamp": 1640995200000
}
```

**VSCode format:**
```json
{
    "type": "updateOpenedFiles",
    "openedFiles": ["/path/to/file1.js", "/path/to/file2.ts"],
    "currentFile": "/path/to/file1.js",
    "timestamp": 1640995200000
}
```

### 7. updateUIState
**JetBrains format:**
```json
{
    "type": "updateUIState",
    "chipsCollapsed": true,
    "composerCollapsed": false,
    "timestamp": 1640995200000
}
```

**VSCode format:**
```json
{
    "type": "updateUIState",
    "chipsCollapsed": true,
    "composerCollapsed": false,
    "timestamp": 1640995200000
}
```

## Key Compatibility Points

1. **Field Names**: All field names match exactly between plugins
2. **Data Types**: All data types are consistent (strings, numbers, booleans, arrays)
3. **Required Fields**: Both plugins include all required fields for each message type
4. **Optional Fields**: Both plugins handle optional fields consistently
5. **Validation**: Both plugins validate data ranges (e.g., font size 8-72)

## Differences

Both plugins now send identical message structures with no differences in format or fields.

## Testing

Comprehensive compatibility tests verify:
- Message structure validation
- Field name consistency
- Data type compatibility
- Required vs optional field handling
- Cross-plugin message compatibility

All tests pass, confirming full compatibility between VSCode and JetBrains message formats.

## Implementation Details

### VSCode Plugin
- Uses `CommunicationBridge.sendMessage()` method
- Adds timestamp automatically
- Validates message structure before sending
- Uses `webview.postMessage()` for transport

### JetBrains Plugin
- Uses individual synchronizer classes (FontSizeSynchronizer, PathInserter, etc.)
- Adds timestamp automatically
- Uses Jackson for JSON serialization
- Uses `executeJavaScript()` with `window.postMessage()` for transport

Both approaches result in identical message structures reaching the web UI.