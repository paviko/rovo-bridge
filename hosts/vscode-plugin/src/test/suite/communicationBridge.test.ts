import * as assert from 'assert';
import {CommunicationBridge} from '../../ui/CommunicationBridge';

suite('CommunicationBridge Test Suite', () => {
    let mockWebview: any;
    let bridge: CommunicationBridge;
    let messages: any[];

    setup(() => {
        // Create mock webview
        messages = [];
        mockWebview = {
            postMessage: (message: any) => {
                messages.push(message);
                return Promise.resolve();
            },
            onDidReceiveMessage: (handler: any) => {
                return {
                    dispose: () => {}
                };
            }
        };

        // Create bridge instance
        bridge = new CommunicationBridge({
            webview: mockWebview
        });
    });

    teardown(() => {
        bridge.dispose();
    });

    test('insertPaths should send valid paths to webview', () => {
        const testPaths = ['/test/file1.txt', '/test/file2.js'];
        
        bridge.insertPaths(testPaths);
        
        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0].type, 'insertPaths');
        assert.deepStrictEqual(messages[0].paths, testPaths);
        assert.ok(messages[0].timestamp);
    });

    test('pastePath should send path to webview', () => {
        const testPath = '/test/directory';
        
        bridge.pastePath(testPath);
        
        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0].type, 'pastePath');
        assert.strictEqual(messages[0].path, testPath);
        assert.ok(messages[0].timestamp);
    });

    test('setFontSize should send font size to webview', () => {
        const fontSize = 16;
        
        bridge.setFontSize(fontSize);
        
        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0].type, 'setFontSize');
        assert.strictEqual(messages[0].size, fontSize);
        assert.ok(messages[0].timestamp);
    });

    test('updateSessionCommand should send command to webview', () => {
        const command = 'test command';
        
        bridge.updateSessionCommand(command);
        
        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0].type, 'updateSessionCommand');
        assert.strictEqual(messages[0].command, command);
        assert.ok(messages[0].timestamp);
    });

    test('setToken should send token to webview', () => {
        const token = 'test-token-123';
        
        bridge.setToken(token);
        
        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0].type, 'setToken');
        assert.strictEqual(messages[0].token, token);
        assert.ok(messages[0].timestamp);
    });

    test('initializeWebUI should send comprehensive setup script', () => {
        const token = 'test-token';
        const fontSize = 14;
        const chipsCollapsed = true;
        const composerCollapsed = false;
        const customCommand = 'test cmd';
        
        bridge.initializeWebUI(token, fontSize, chipsCollapsed, composerCollapsed, customCommand);
        
        // Should send multiple unified messages: setToken, setFontSize, updateUIState, updateSessionCommand
        assert.ok(messages.length >= 4, `Expected at least 4 messages, got ${messages.length}`);
        
        // Check that we have the expected message types
        const messageTypes = messages.map(m => m.type);
        assert.ok(messageTypes.includes('setToken'), 'Should include setToken message');
        assert.ok(messageTypes.includes('setFontSize'), 'Should include setFontSize message');
        assert.ok(messageTypes.includes('updateUIState'), 'Should include updateUIState message');
        assert.ok(messageTypes.includes('updateSessionCommand'), 'Should include updateSessionCommand message');
        
        // Verify message content
        const tokenMessage = messages.find(m => m.type === 'setToken');
        assert.strictEqual(tokenMessage.token, token);
        
        const fontSizeMessage = messages.find(m => m.type === 'setFontSize');
        assert.strictEqual(fontSizeMessage.size, fontSize);
        
        const uiStateMessage = messages.find(m => m.type === 'updateUIState');
        assert.strictEqual(uiStateMessage.chipsCollapsed, chipsCollapsed);
        assert.strictEqual(uiStateMessage.composerCollapsed, composerCollapsed);
        
        const sessionCommandMessage = messages.find(m => m.type === 'updateSessionCommand');
        assert.strictEqual(sessionCommandMessage.command, customCommand);
    });

    test('should handle invalid font size gracefully', () => {
        // Test with invalid font sizes
        bridge.setFontSize(-5);  // Too small
        bridge.setFontSize(100); // Too large
        bridge.setFontSize(NaN); // Invalid
        
        // Should not send any messages for invalid values
        assert.strictEqual(messages.length, 0);
    });

    test('should handle empty paths gracefully', () => {
        bridge.insertPaths([]);
        bridge.pastePath('');
        
        // Should not send messages for empty inputs
        assert.strictEqual(messages.length, 0);
    });

    test('should handle missing webview gracefully', () => {
        const bridgeWithoutWebview = new CommunicationBridge();
        
        // These should not throw errors
        assert.doesNotThrow(() => {
            bridgeWithoutWebview.insertPaths(['/test/path']);
            bridgeWithoutWebview.pastePath('/test/path');
            bridgeWithoutWebview.setFontSize(14);
            bridgeWithoutWebview.updateSessionCommand('test');
        });
        
        bridgeWithoutWebview.dispose();
    });

    test('handleOpenFile should work with line numbers', async () => {
        let stateChanges: any[] = [];
        
        const bridgeWithCallback = new CommunicationBridge({
            webview: mockWebview,
            onStateChange: async (key: string, value: any) => {
                stateChanges.push({ key, value });
            }
        });

        // Test state change handling
        await bridgeWithCallback.handleStateChange('fontSize', 16);
        
        assert.strictEqual(stateChanges.length, 1);
        assert.strictEqual(stateChanges[0].key, 'fontSize');
        assert.strictEqual(stateChanges[0].value, 16);

        bridgeWithCallback.dispose();
    });
});