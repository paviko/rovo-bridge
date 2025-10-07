# RovoBridge VSCode Extension - Error Handling System

This document describes the comprehensive error handling and recovery system implemented in the RovoBridge VSCode extension.

## Overview

The error handling system provides:
- Centralized error management and logging
- User-friendly error notifications with recovery options
- Comprehensive diagnostic information
- Automatic recovery mechanisms
- Detailed troubleshooting support

## Architecture

### Core Components

1. **ErrorHandler** (`src/utils/ErrorHandler.ts`)
   - Centralized error handling and recovery coordination
   - Error categorization and severity management
   - User notification and recovery option presentation
   - Diagnostic information generation

2. **RecoveryUtils** (`src/utils/RecoveryUtils.ts`)
   - System diagnostic utilities
   - Recovery action implementations
   - Health checks for various system components
   - System report generation

### Error Categories

The system categorizes errors into the following types:

- `BACKEND_LAUNCH` - Backend process startup failures
- `WEBVIEW_LOAD` - Web UI loading issues
- `COMMUNICATION` - Extension ↔ WebUI communication errors
- `FILE_OPERATION` - File system operation failures
- `SETTINGS` - Configuration management errors
- `COMMAND_EXECUTION` - Command execution failures
- `RESOURCE_EXTRACTION` - Binary extraction issues
- `NETWORK` - Network connectivity problems
- `PERMISSION` - File/system permission issues
- `VALIDATION` - Data validation errors

### Error Severity Levels

- `INFO` - Informational messages
- `WARNING` - Non-critical issues that may affect functionality
- `ERROR` - Errors that prevent specific operations
- `CRITICAL` - Critical failures that prevent extension operation

## Usage

### Basic Error Handling

```typescript
import {errorHandler, ErrorCategory, ErrorSeverity} from './utils/ErrorHandler';

try {
    // Some operation that might fail
    await riskyOperation();
} catch (error) {
    await errorHandler.handleError(errorHandler.createErrorContext(
        ErrorCategory.BACKEND_LAUNCH,
        ErrorSeverity.ERROR,
        'ComponentName',
        'operationName',
        error instanceof Error ? error : new Error(String(error)),
        { additionalContext: 'value' }
    ));
}
```

### Specialized Error Handlers

The system provides specialized handlers for common error scenarios:

```typescript
// Backend launch errors
await errorHandler.handleBackendLaunchError(error, {
    workspaceRoot: '/path/to/workspace',
    customCommand: 'custom command'
});

// Webview load errors
await errorHandler.handleWebviewLoadError(error, {
    connection: connectionInfo
});

// Communication errors
await errorHandler.handleCommunicationError(error, {
    operation: 'insertPaths',
    paths: filePaths
});

// File operation errors
await errorHandler.handleFileOperationError(error, {
    operation: 'openFile',
    filePath: '/path/to/file'
});

// Settings errors
await errorHandler.handleSettingsError(error, {
    key: 'fontSize',
    value: 14
});
```

## Recovery Options

The system automatically generates context-appropriate recovery options:

### Backend Launch Errors
- **Retry Launch** - Attempt to launch the backend again
- **Check Binary Path** - Verify binary exists and is executable
- **Reset Settings** - Reset configuration to defaults
- **Show Troubleshooting Guide** - Open documentation

### Webview Load Errors
- **Reload Webview** - Recreate the webview panel
- **Check Network Connection** - Verify backend accessibility
- **Clear Extension Cache** - Clear cached data
- **Show System Report** - Generate diagnostic report

### Communication Errors
- **Reconnect Bridge** - Re-establish communication bridge
- **Validate Settings** - Check configuration validity

### File Operation Errors
- **Refresh Workspace** - Reload workspace files
- **Check Permissions** - Verify file access permissions

## Diagnostic Information

### Available Diagnostics

The system collects comprehensive diagnostic information:

```typescript
const diagnostics = await errorHandler.generateDiagnosticInfo();
```

Includes:
- Extension version and VSCode version
- Platform and architecture information
- Workspace information (folders, active files)
- Current settings configuration
- Recent error history
- System information (Node.js version, memory usage)

### System Health Checks

```typescript
import {RecoveryUtils} from './utils/RecoveryUtils';

// Check binary status
const binaryStatus = await RecoveryUtils.checkBinaryStatus();

// Check network connectivity
const networkStatus = await RecoveryUtils.checkLocalNetworkConnectivity();

// Check workspace health
const workspaceHealth = RecoveryUtils.checkWorkspaceHealth();

// Check extension health
const extensionHealth = RecoveryUtils.checkExtensionHealth();

// Check system requirements
const systemReqs = RecoveryUtils.checkSystemRequirements();
```

### System Report Generation

Generate a comprehensive system report:

```typescript
// Show in new document
await RecoveryUtils.showSystemReport();

// Get as string
const report = await RecoveryUtils.generateSystemReport();
```

## User Commands

The extension provides user-accessible commands for diagnostics:

- `RovoBridge: Show Diagnostics` - Display diagnostic information
- Available through Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)

## Automatic Recovery

The system attempts automatic recovery for non-critical errors:

1. **Warning-level errors** - Automatic retry with default recovery option
2. **Error-level errors** - User notification with recovery options
3. **Critical errors** - Immediate user notification with comprehensive recovery options

## Logging

### Output Channels

The system uses multiple VSCode output channels:

- **RovoBridge Error Handler** - Error handling logs
- **RovoBridge Diagnostics** - Diagnostic information
- **RovoBridge Recovery** - Recovery operation logs

### Log Levels

All error handling operations are logged with:
- Timestamp
- Error category and severity
- Component and operation context
- Original error details
- Recovery actions taken

## Integration Points

### Extension Components

All major extension components integrate with the error handler:

1. **Extension Main** (`extension.ts`)
   - Activation/deactivation errors
   - Command execution errors

2. **BackendLauncher** (`backend/BackendLauncher.ts`)
   - Process launch failures
   - Binary extraction issues
   - Process monitoring errors

3. **WebviewManager** (`ui/WebviewManager.ts`)
   - Webview creation failures
   - UI loading errors
   - Component initialization issues

4. **CommunicationBridge** (`ui/CommunicationBridge.ts`)
   - Message handling errors
   - Script execution failures
   - State synchronization issues

5. **SettingsManager** (`settings/SettingsManager.ts`)
   - Configuration update failures
   - Validation errors

6. **Command Handlers** (`commands/`)
   - File operation failures
   - Context menu action errors

### Global Error Handling

The system sets up global error handlers for:
- Unhandled promise rejections
- Uncaught exceptions
- Process-level errors

## Testing

### Test Coverage

The error handling system includes comprehensive tests:

```bash
npm test
```

Tests cover:
- Error context creation
- Specialized error handlers
- Diagnostic information generation
- Recovery option generation
- Error statistics tracking
- System health checks

### Test Files

- `src/test/suite/errorHandler.test.ts` - Core error handler tests
- Integration tests in component-specific test files

## Configuration

### Settings

The error handling system respects extension settings:

```json
{
  "rovobridge.customCommand": "custom command",
  "rovobridge.uiMode": "Terminal",
  "rovobridge.fontSize": 14,
  "rovobridge.chipsCollapsed": false,
  "rovobridge.composerCollapsed": false
}
```

### Environment Variables

- `ROVOBRIDGE_BIN` - Override backend binary path for testing

## Troubleshooting

### Common Issues

1. **Backend Launch Failures**
   - Check binary permissions: `ls -la resources/bin/*/rovo-bridge*`
   - Verify platform support: Windows, macOS, Linux
   - Check custom command configuration

2. **Webview Load Failures**
   - Verify network connectivity to localhost
   - Check VSCode webview security settings
   - Clear extension cache

3. **Communication Errors**
   - Restart extension: `Developer: Reload Window`
   - Check output channels for detailed logs
   - Verify webview panel is active

### Debug Information

Enable detailed logging by:
1. Opening Command Palette (`Ctrl+Shift+P`)
2. Running `RovoBridge: Show Diagnostics`
3. Checking output channels: `View > Output > RovoBridge Error Handler`

### Recovery Actions

If automatic recovery fails:
1. Reset settings: Use recovery option in error dialog
2. Clear cache: Use recovery option or restart VSCode
3. Reinstall extension: Uninstall and reinstall from marketplace
4. Report issue: Include diagnostic information and system report

## Best Practices

### For Developers

1. **Always use error handler** for error management
2. **Provide context** in error metadata
3. **Use appropriate categories** and severity levels
4. **Test error scenarios** in development
5. **Document recovery procedures** for new components

### For Users

1. **Read error messages** carefully
2. **Try suggested recovery options** before reporting issues
3. **Include diagnostic information** when reporting bugs
4. **Keep extension updated** for latest error handling improvements

## Future Enhancements

Planned improvements:
- Telemetry integration for error tracking
- Machine learning-based error prediction
- Enhanced recovery automation
- User preference-based error handling
- Integration with VSCode problem matcher