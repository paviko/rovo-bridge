# Settings Management with Real-Time Synchronization

This directory contains the settings management system for the VSCode RovoBridge extension, including real-time synchronization capabilities that mirror the JetBrains plugin functionality.

## Components

### SettingsManager.ts
Core settings management class that handles VSCode configuration integration.

**Features:**
- Type-safe settings interface (`RovoBridgeSettings`)
- Validation and default value handling
- Configuration change listeners
- Batch settings updates

**Usage:**
```typescript
const settingsManager = new SettingsManager();
const settings = settingsManager.getSettings();
await settingsManager.updateSetting('fontSize', 16);
```

### SettingsSynchronizer.ts
Real-time synchronization between VSCode settings and webview UI.

**Features:**
- Automatic propagation of settings changes to webview
- Bi-directional synchronization (VSCode ↔ WebUI)
- JavaScript injection for webview updates
- Configuration change monitoring

**Requirements Implemented:**
- **4.4**: Real-time synchronization to running web UI
- **4.5**: Font size changes execute `window.__setFontSize(fontSize)`
- **4.6**: Custom command changes execute `window.__updateSessionCommand(command)`

**Usage:**
```typescript
const synchronizer = new SettingsSynchronizer(settingsManager);
const disposable = synchronizer.initialize(webviewPanel);
synchronizer.syncAllSettings(); // Initial sync
```

### FontSizeMonitor.ts
Monitors font size changes from the backend HTTP endpoint.

**Features:**
- Periodic polling of backend `/font-size` endpoint
- Automatic VSCode settings updates when backend font size changes
- Configurable polling interval
- Error handling and timeout management

**Usage:**
```typescript
const monitor = new FontSizeMonitor(settingsManager);
monitor.startMonitoring(backendPort);
```

## Settings Schema

The extension supports the following settings (defined in `package.json`):

```json
{
  "rovobridge.customCommand": {
    "type": "string",
    "default": "",
    "description": "Custom command to run in the terminal"
  },
  "rovobridge.uiMode": {
    "type": "string",
    "enum": ["Terminal", "Canvas"],
    "default": "Terminal",
    "description": "UI mode for the RovoBridge interface"
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
    "description": "Whether the chips panel is collapsed"
  },
  "rovobridge.composerCollapsed": {
    "type": "boolean",
    "default": false,
    "description": "Whether the composer panel is collapsed"
  }
}
```

## Real-Time Synchronization Flow

### VSCode → WebUI Synchronization

1. User changes setting in VSCode preferences
2. `vscode.workspace.onDidChangeConfiguration` event fires
3. `SettingsSynchronizer` detects the change
4. Appropriate JavaScript is injected into webview:
   - Font size: `window.__setFontSize(fontSize)`
   - Custom command: `window.__updateSessionCommand(command)`
   - Chips collapsed: `window.__setChipsCollapsed(collapsed)`
   - Composer collapsed: `window.__setComposerCollapsed(collapsed)`

### WebUI → VSCode Synchronization

1. WebUI sends message via `window.vscode.postMessage()`
2. `WebviewManager` receives the message
3. `SettingsSynchronizer.handleWebviewSettingsChange()` is called
4. VSCode configuration is updated
5. Change propagates back to other listeners

### Backend → VSCode Synchronization

1. `FontSizeMonitor` polls backend `/font-size` endpoint
2. If font size differs from VSCode setting, update VSCode
3. VSCode configuration change triggers webview sync
4. Complete synchronization across all components

## JetBrains Plugin Equivalents

| VSCode Component | JetBrains Equivalent | Purpose |
|------------------|---------------------|---------|
| `SettingsManager` | `RovoBridgeSettings.kt` | Core settings management |
| `SettingsSynchronizer` | `RovoBridgeConfigurable.kt` | Real-time sync |
| `FontSizeMonitor` | `FontSizeMonitor.kt` | Backend font size polling |
| WebviewScripts | `WebViewScripts.kt` | JavaScript injection |

## Integration Example

```typescript
// In extension.ts
export function activate(context: vscode.ExtensionContext) {
    const settingsManager = new SettingsManager();
    const settingsDisposable = settingsManager.initialize();
    context.subscriptions.push(settingsDisposable);

    // When creating webview
    const webviewManager = new WebviewManager();
    const panel = webviewManager.createWebviewPanel(context, settingsManager);
    
    // When backend connects
    const connection = await backendLauncher.launchBackend();
    webviewManager.loadWebUI(connection);
    
    // Start font size monitoring
    const fontMonitor = new FontSizeMonitor(settingsManager);
    fontMonitor.startMonitoring(connection.port);
    context.subscriptions.push(new vscode.Disposable(() => {
        fontMonitor.dispose();
    }));
}
```

## Testing

The `SettingsSynchronizer.test.ts` file contains basic tests for the synchronization functionality:

- Initialization and cleanup
- Font size synchronization
- Custom command synchronization
- Message handling

Run tests with:
```typescript
import { runSettingsSynchronizerTests } from './SettingsSynchronizer.test';
await runSettingsSynchronizerTests();
```

## Error Handling

All components include comprehensive error handling:

- **Network errors**: FontSizeMonitor handles timeouts and connection failures
- **Configuration errors**: SettingsManager validates all setting values
- **WebView errors**: SettingsSynchronizer wraps JavaScript in try-catch blocks
- **Disposal errors**: All components properly clean up resources

## Performance Considerations

- **Debouncing**: Settings changes are not debounced to ensure immediate sync
- **Polling interval**: FontSizeMonitor polls every 2 seconds by default
- **Memory management**: All event listeners are properly disposed
- **Error isolation**: JavaScript errors in webview don't crash the extension