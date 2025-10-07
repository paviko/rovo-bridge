# Unified Message Protocol Developer Guide

## Overview

The Unified Message Protocol provides a standardized communication layer between IDE plugins (JetBrains and VSCode) and the web UI. This guide covers how to work with the protocol, add new message types, and troubleshoot common issues.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Message Format Standards](#message-format-standards)
- [Adding New Message Types](#adding-new-message-types)
- [JetBrains Plugin Implementation](#jetbrains-plugin-implementation)
- [VSCode Plugin Implementation](#vscode-plugin-implementation)
- [Testing New Message Types](#testing-new-message-types)
- [Troubleshooting Guide](#troubleshooting-guide)
- [Best Practices](#best-practices)

## Architecture Overview

The unified message protocol uses a centralized dispatcher pattern:

```
┌─────────────────┐    postMessage    ┌──────────────────┐
│ JetBrains Plugin│ ──────────────────▶│                  │
└─────────────────┘                   │  MessageDispatcher│
                                      │   (Web UI)       │
┌─────────────────┐    postMessage    │                  │
│ VSCode Plugin   │ ──────────────────▶│                  │
└─────────────────┘                   └──────────────────┘
                                               │
                                               ▼
                                      ┌──────────────────┐
                                      │ Message Handlers │
                                      │ & Web UI Functions│
                                      └──────────────────┘
```

### Key Components

1. **MessageDispatcher**: Central message router in the web UI
2. **Message Handlers**: Functions that process specific message types
3. **Plugin Communicators**: IDE-specific message sending implementations
4. **Validation Layer**: Ensures message integrity and format compliance

## Message Format Standards

### Base Message Structure

All messages must extend the `BaseMessage` interface:

```typescript
interface BaseMessage {
  type: string;        // Required: Message type identifier
  timestamp?: number;  // Optional: Creation timestamp (milliseconds)
}
```

### Message Type Conventions

- Use camelCase for message types: `setFontSize`, `updateUIState`
- Use descriptive, action-oriented names: `insertPaths` not `paths`
- Prefix with action verb when appropriate: `set`, `update`, `insert`, `paste`

### Field Naming Standards

- Use camelCase for all field names
- Use descriptive names that indicate the data type and purpose
- Avoid abbreviations unless they're widely understood
- Use consistent naming across related message types

### Example Message

```typescript
interface SetFontSizeMessage extends BaseMessage {
  type: 'setFontSize';
  size: number;        // Integer between 8-72
  timestamp?: number;
}
```

## Adding New Message Types

### Step 1: Define the Message Interface

Add your message interface to `web-ui/src/ui/messages.ts`:

```typescript
/**
 * Message for your new functionality.
 * Describe what this message does and when it's used.
 * 
 * @example
 * ```typescript
 * const message: YourNewMessage = {
 *   type: 'yourNewAction',
 *   data: 'example data',
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface YourNewMessage extends BaseMessage {
  type: 'yourNewAction';
  data: string;        // Describe the field and its constraints
  optionalField?: boolean;
}
```

### Step 2: Update the Union Type

Add your message to the `UnifiedMessage` union type:

```typescript
export type UnifiedMessage = 
  | SetTokenMessage 
  | SetFontSizeMessage 
  | InsertPathsMessage 
  | PastePathMessage 
  | UpdateSessionCommandMessage 
  | UpdateUIStateMessage
  | YourNewMessage;  // Add your message here
```

### Step 3: Add Validation Logic

Update the `validateMessageType` method in `MessageDispatcher`:

```typescript
private validateMessageType(message: any): ValidationResult {
  switch (message.type) {
    // ... existing cases ...
    
    case 'yourNewAction':
      if (!message.data || typeof message.data !== 'string') {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'yourNewAction message must have a non-empty string data field'
        };
      }
      if (message.optionalField !== undefined && typeof message.optionalField !== 'boolean') {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'yourNewAction optionalField must be a boolean if provided'
        };
      }
      break;
      
    // ... rest of cases ...
  }
  
  return { isValid: true };
}
```

### Step 4: Register a Message Handler

Add a handler in the `registerDefaultHandlers` method:

```typescript
private registerDefaultHandlers(): void {
  // ... existing handlers ...
  
  // Your new message handler
  this.registerHandler('yourNewAction', (message) => {
    try {
      // Connect to existing web UI function or implement new functionality
      const existingFunc = this.originalGlobalFunctions.get('__yourNewFunction') || 
                          (window as any).__yourNewFunction;
      if (typeof existingFunc === 'function') {
        existingFunc(message.data, message.optionalField);
        console.log('[MessageDispatcher] yourNewAction executed successfully');
      } else {
        // Implement the functionality directly if no existing function
        this.handleYourNewAction(message);
      }
    } catch (error) {
      console.error('[MessageDispatcher] yourNewAction handler error:', error);
    }
  });
}

private handleYourNewAction(message: YourNewMessage): void {
  // Implement your new functionality here
  console.log('Processing new action:', message.data);
  // ... your implementation ...
}
```

### Step 5: Add Global Function (if needed)

If you need a global function for standalone compatibility, add it to `defineGlobals`:

```typescript
function defineGlobals() {
  // ... existing functions ...
  
  ;(window as any).__yourNewFunction = function (data: string, optional?: boolean) {
    try {
      // Implement the functionality
      console.log('Your new function called:', data, optional);
      // ... implementation ...
    } catch (e) {
      console.error('Failed to execute your new function:', e);
    }
  };
}
```

## JetBrains Plugin Implementation

### Sending Messages from JetBrains Plugin

In JetBrains plugins, use `executeJavaScript` to send postMessage calls:

```kotlin
// In your Kotlin code (e.g., synchronizer class)
class YourNewSynchronizer {
    private val browser: JBCefBrowser
    
    fun sendYourNewMessage(data: String, optional: Boolean? = null) {
        val optionalField = if (optional != null) ", optionalField: $optional" else ""
        val script = """
            window.postMessage({
                type: 'yourNewAction',
                data: ${JsonUtil.escapeStringValue(data)},
                timestamp: ${System.currentTimeMillis()}$optionalField
            }, '*');
        """.trimIndent()
        
        browser.cefBrowser.executeJavaScript(script, browser.cefBrowser.url, 0)
    }
}
```

### JSON Escaping Utility

For safe string escaping in JetBrains plugins:

```kotlin
import com.fasterxml.jackson.core.JsonGenerator
import com.fasterxml.jackson.databind.ObjectMapper
import java.io.StringWriter

object JsonUtil {
    private val objectMapper = ObjectMapper()
    
    fun escapeStringValue(value: String): String {
        val writer = StringWriter()
        val generator = objectMapper.factory.createGenerator(writer)
        generator.writeString(value)
        generator.close()
        return writer.toString()
    }
}
```

### Integration with WebViewScripts

Add helper methods to `WebViewScripts.kt`:

```kotlin
object WebViewScripts {
    fun generateYourNewActionScript(data: String, optional: Boolean? = null): String {
        val optionalField = if (optional != null) ", optionalField: $optional" else ""
        return """
            window.postMessage({
                type: 'yourNewAction',
                data: ${JsonUtil.escapeStringValue(data)},
                timestamp: ${System.currentTimeMillis()}$optionalField
            }, '*');
        """.trimIndent()
    }
}
```

## VSCode Plugin Implementation

### Sending Messages from VSCode Plugin

Update your `CommunicationBridge.ts`:

```typescript
class CommunicationBridge {
    private webviewPanel: vscode.WebviewPanel;
    
    // Add your new method
    sendYourNewAction(data: string, optionalField?: boolean): void {
        this.sendMessage({
            type: 'yourNewAction',
            data,
            optionalField,
            timestamp: Date.now()
        });
    }
    
    private sendMessage(message: UnifiedMessage): void {
        this.webviewPanel.webview.postMessage(message);
    }
}
```

### Integration with Settings Synchronizer

If your message relates to settings, update `SettingsSynchronizer.ts`:

```typescript
class SettingsSynchronizer {
    private communicationBridge: CommunicationBridge;
    
    syncYourNewSetting(value: string): void {
        this.communicationBridge.sendYourNewAction(value, true);
    }
}
```

## Testing New Message Types

### Unit Tests

Create tests for your message validation and handling:

```typescript
// In web-ui/src/ui/messages.test.ts or create a new test file
describe('YourNewMessage', () => {
    let dispatcher: MessageDispatcher;
    
    beforeEach(() => {
        dispatcher = new MessageDispatcher();
    });
    
    it('should validate valid yourNewAction message', () => {
        const message = {
            type: 'yourNewAction',
            data: 'test data',
            timestamp: Date.now()
        };
        
        const result = dispatcher.validateMessage(message);
        expect(result.isValid).toBe(true);
    });
    
    it('should reject yourNewAction message with invalid data', () => {
        const message = {
            type: 'yourNewAction',
            data: 123, // Invalid: should be string
            timestamp: Date.now()
        };
        
        const result = dispatcher.validateMessage(message);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(MessageError.INVALID_DATA_TYPE);
    });
    
    it('should handle yourNewAction message correctly', () => {
        const mockHandler = jest.fn();
        dispatcher.registerHandler('yourNewAction', mockHandler);
        
        const message = {
            type: 'yourNewAction',
            data: 'test data'
        };
        
        dispatcher.handleMessage(message);
        expect(mockHandler).toHaveBeenCalledWith(message);
    });
});
```

### Integration Tests

Test the full message flow from plugin to web UI:

```typescript
// JetBrains integration test
describe('JetBrains YourNewAction Integration', () => {
    it('should send yourNewAction message via executeJavaScript', async () => {
        const mockBrowser = createMockJBCefBrowser();
        const synchronizer = new YourNewSynchronizer(mockBrowser);
        
        synchronizer.sendYourNewMessage('test data', true);
        
        expect(mockBrowser.cefBrowser.executeJavaScript).toHaveBeenCalledWith(
            expect.stringContaining('yourNewAction'),
            expect.any(String),
            0
        );
    });
});

// VSCode integration test
describe('VSCode YourNewAction Integration', () => {
    it('should send yourNewAction message via webview.postMessage', () => {
        const mockWebview = createMockWebview();
        const bridge = new CommunicationBridge(mockWebview);
        
        bridge.sendYourNewAction('test data', true);
        
        expect(mockWebview.postMessage).toHaveBeenCalledWith({
            type: 'yourNewAction',
            data: 'test data',
            optionalField: true,
            timestamp: expect.any(Number)
        });
    });
});
```

### Manual Testing

1. **Standalone Mode Testing**:
   ```javascript
   // Open browser console and test direct function call
   window.__yourNewFunction('test data', true);
   ```

2. **IDE Mode Testing**:
   ```javascript
   // Open browser console in IDE webview and test postMessage
   window.postMessage({
     type: 'yourNewAction',
     data: 'test data',
     optionalField: true,
     timestamp: Date.now()
   }, '*');
   ```

3. **Plugin Testing**:
   - Test from JetBrains plugin actions
   - Test from VSCode command palette
   - Verify message appears in browser console logs

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Message Not Received

**Symptoms**: Message sent from plugin but no handler called in web UI.

**Debugging Steps**:
1. Check browser console for message reception logs
2. Verify message format matches interface definition
3. Check if handler is registered for the message type

**Solutions**:
```javascript
// Check if message listener is active
console.log('Message dispatcher active:', !!window.messageDispatcher);

// Check registered handlers
console.log('Registered handlers:', Array.from(window.messageDispatcher.handlers.keys()));

// Test message manually
window.postMessage({ type: 'yourNewAction', data: 'test' }, '*');
```

#### 2. Message Validation Fails

**Symptoms**: Validation error logs in console, handler not called.

**Debugging Steps**:
1. Check validation error details in console
2. Compare message structure with interface definition
3. Verify data types and required fields

**Solutions**:
```typescript
// Add debug logging to validation
private validateMessageType(message: any): ValidationResult {
  console.log('Validating message:', message);
  // ... validation logic ...
}
```

#### 3. Handler Execution Fails

**Symptoms**: Handler called but execution fails with errors.

**Debugging Steps**:
1. Check handler error logs in console
2. Verify target function exists and is callable
3. Check for runtime errors in handler implementation

**Solutions**:
```typescript
// Add try-catch and detailed logging
this.registerHandler('yourNewAction', (message) => {
  console.log('Handler called with:', message);
  try {
    // ... handler logic ...
    console.log('Handler completed successfully');
  } catch (error) {
    console.error('Handler failed:', error);
    // Add fallback behavior if needed
  }
});
```

#### 4. Standalone Mode Issues

**Symptoms**: Messages work in IDE but not in standalone browser.

**Debugging Steps**:
1. Check standalone mode detection logs
2. Verify global functions are preserved
3. Test direct function calls

**Solutions**:
```javascript
// Check standalone mode detection
console.log('Standalone mode:', window.messageDispatcher.isStandalone);

// Check preserved functions
console.log('Preserved functions:', window.messageDispatcher.originalGlobalFunctions);

// Test direct function call
if (typeof window.__yourNewFunction === 'function') {
  window.__yourNewFunction('test');
} else {
  console.error('Global function not available');
}
```

#### 5. Cross-Plugin Compatibility Issues

**Symptoms**: Messages work from one plugin but not another.

**Debugging Steps**:
1. Compare message formats between plugins
2. Check for plugin-specific message modifications
3. Verify both plugins use same message structure

**Solutions**:
```typescript
// Standardize message creation
function createYourNewMessage(data: string, optional?: boolean): YourNewMessage {
  return {
    type: 'yourNewAction',
    data,
    ...(optional !== undefined && { optionalField: optional }),
    timestamp: Date.now()
  };
}
```

### Debug Mode

Enable debug mode for detailed logging:

```typescript
// In browser console
window.messageDispatcher.debugMode = true;

// Or set environment variable
process.env.NODE_ENV = 'development';
```

### Performance Issues

If message handling becomes slow:

1. **Check Handler Complexity**:
   ```typescript
   // Use performance timing
   this.registerHandler('yourNewAction', (message) => {
     const start = performance.now();
     // ... handler logic ...
     const end = performance.now();
     console.log(`Handler took ${end - start} milliseconds`);
   });
   ```

2. **Optimize Validation**:
   ```typescript
   // Cache validation results for repeated message types
   private validationCache = new Map<string, boolean>();
   ```

3. **Batch Messages**:
   ```typescript
   // For high-frequency messages, consider batching
   interface BatchMessage extends BaseMessage {
     type: 'batchUpdate';
     messages: YourNewMessage[];
   }
   ```

## Best Practices

### Message Design

1. **Keep Messages Simple**: Each message should have a single, clear purpose
2. **Use Descriptive Types**: Message types should clearly indicate their function
3. **Validate Thoroughly**: Always validate message data to prevent runtime errors
4. **Handle Errors Gracefully**: Never let message handling break the system
5. **Document Everything**: Provide clear documentation and examples

### Implementation Guidelines

1. **Maintain Backward Compatibility**: Always preserve existing global functions
2. **Test Both Modes**: Ensure functionality works in standalone and IDE modes
3. **Use Consistent Patterns**: Follow established patterns for new message types
4. **Log Appropriately**: Provide useful logs without overwhelming the console
5. **Handle Edge Cases**: Consider error scenarios and provide fallbacks

### Performance Considerations

1. **Avoid Heavy Processing**: Keep message handlers lightweight
2. **Use Debouncing**: For high-frequency messages, consider debouncing
3. **Cache When Appropriate**: Cache validation results or computed values
4. **Clean Up Resources**: Ensure proper cleanup of event listeners and handlers

### Security Guidelines

1. **Validate All Input**: Never trust message data without validation
2. **Sanitize Strings**: Properly escape strings in JavaScript generation
3. **Limit Message Size**: Consider size limits for message data
4. **Avoid Sensitive Data**: Don't include sensitive information in messages

This guide provides a comprehensive foundation for working with the unified message protocol. For additional help or questions, refer to the code documentation or create an issue in the project repository.