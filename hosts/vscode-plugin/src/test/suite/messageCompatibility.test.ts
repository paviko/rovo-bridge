import * as assert from 'assert';
import {
    compareMessageStructure,
    runCompatibilityTests,
    sampleJetBrainsMessages,
    validateUnifiedMessage
} from '../../utils/MessageCompatibility';
import {CommunicationBridge} from '../../ui/CommunicationBridge';

suite('Message Compatibility Tests', () => {
    test('JetBrains sample messages should be valid', () => {
        const testResults = runCompatibilityTests();
        
        assert.strictEqual(testResults.failed, 0, 
            `Some JetBrains sample messages failed validation: ${JSON.stringify(testResults.results.filter(r => !r.isValid), null, 2)}`);
        
        assert.strictEqual(testResults.passed, Object.keys(sampleJetBrainsMessages).length,
            'All JetBrains sample messages should pass validation');
    });

    test('Individual message validation', () => {
        // Test setToken message
        const setTokenResult = validateUnifiedMessage(sampleJetBrainsMessages.setToken);
        assert.strictEqual(setTokenResult.isValid, true, `setToken validation failed: ${setTokenResult.errors.join(', ')}`);

        // Test setFontSize message
        const setFontSizeResult = validateUnifiedMessage(sampleJetBrainsMessages.setFontSize);
        assert.strictEqual(setFontSizeResult.isValid, true, `setFontSize validation failed: ${setFontSizeResult.errors.join(', ')}`);

        // Test insertPaths message
        const insertPathsResult = validateUnifiedMessage(sampleJetBrainsMessages.insertPaths);
        assert.strictEqual(insertPathsResult.isValid, true, `insertPaths validation failed: ${insertPathsResult.errors.join(', ')}`);

        // Test pastePath message
        const pastePathResult = validateUnifiedMessage(sampleJetBrainsMessages.pastePath);
        assert.strictEqual(pastePathResult.isValid, true, `pastePath validation failed: ${pastePathResult.errors.join(', ')}`);

        // Test updateSessionCommand message
        const updateSessionCommandResult = validateUnifiedMessage(sampleJetBrainsMessages.updateSessionCommand);
        assert.strictEqual(updateSessionCommandResult.isValid, true, `updateSessionCommand validation failed: ${updateSessionCommandResult.errors.join(', ')}`);

        // Test updateUIState message
        const updateUIStateResult = validateUnifiedMessage(sampleJetBrainsMessages.updateUIState);
        assert.strictEqual(updateUIStateResult.isValid, true, `updateUIState validation failed: ${updateUIStateResult.errors.join(', ')}`);
    });

    test('Invalid messages should fail validation', () => {
        // Test message without type
        const noTypeResult = validateUnifiedMessage({ token: 'test' });
        assert.strictEqual(noTypeResult.isValid, false);
        assert.ok(noTypeResult.errors.some(e => e.includes('type')));

        // Test setFontSize with invalid size
        const invalidFontSizeResult = validateUnifiedMessage({
            type: 'setFontSize',
            size: 100 // Too large
        });
        assert.strictEqual(invalidFontSizeResult.isValid, false);
        assert.ok(invalidFontSizeResult.errors.some(e => e.includes('8 and 72')));

        // Test insertPaths with empty array
        const emptyPathsResult = validateUnifiedMessage({
            type: 'insertPaths',
            paths: []
        });
        assert.strictEqual(emptyPathsResult.isValid, false);
        assert.ok(emptyPathsResult.errors.some(e => e.includes('at least one path')));
    });

    test('VSCode CommunicationBridge generates compatible messages', async () => {
        const receivedMessages: any[] = [];
        
        // Create a mock webview with all required methods
        const mockWebview = {
            postMessage: (message: any) => {
                receivedMessages.push(message);
            },
            onDidReceiveMessage: () => ({ dispose: () => {} })
        } as any;

        const bridge = new CommunicationBridge({ webview: mockWebview });

        // Test various methods
        bridge.setToken('test-token');
        bridge.setFontSize(14);
        bridge.insertPaths(['/test/path.js']);
        bridge.pastePath('/test/directory');
        bridge.updateSessionCommand('npm test');
        bridge.updateOpenedFiles(['/test/file.js'], '/test/file.js');
        bridge.updateUIState({ chipsCollapsed: true });

        // Validate all received messages
        assert.ok(receivedMessages.length > 0, 'Should have received messages');
        
        for (const message of receivedMessages) {
            const validation = validateUnifiedMessage(message);
            assert.strictEqual(validation.isValid, true, 
                `CommunicationBridge generated invalid message: ${JSON.stringify(validation.errors)}`);
            
            // Check that it has timestamp
            assert.ok(message.timestamp, 'Message should have timestamp');
        }
    });

    test('Message structure compatibility between VSCode and JetBrains', () => {
        // Create VSCode-style messages and compare with JetBrains samples
        const vscodeMessages = {
            setToken: {
                type: 'setToken',
                token: 'vscode-token',
                timestamp: Date.now()
            },
            setFontSize: {
                type: 'setFontSize',
                size: 16,
                timestamp: Date.now()
            },
            insertPaths: {
                type: 'insertPaths',
                paths: ['/vscode/path.ts'],
                timestamp: Date.now()
            }
        };

        // Compare structures (ignoring timestamp and source differences)
        for (const [messageType, vscodeMessage] of Object.entries(vscodeMessages)) {
            const jetbrainsMessage = (sampleJetBrainsMessages as any)[messageType];
            
            // Create normalized versions for comparison (remove timestamp)
            const normalizedVscode = { ...vscodeMessage };
            const normalizedJetbrains = { ...jetbrainsMessage };
            delete (normalizedVscode as any).timestamp;
            delete (normalizedJetbrains as any).timestamp;

            const comparison = compareMessageStructure(normalizedVscode, normalizedJetbrains);
            assert.strictEqual(comparison.isCompatible, true, 
                `Message structure incompatible for ${messageType}: ${comparison.differences.join(', ')}`);
        }
    });

    test('Field name and type consistency', () => {
        // Ensure field names match exactly between VSCode and JetBrains
        const fieldMappings = {
            setToken: ['type', 'token'],
            setFontSize: ['type', 'size'],
            insertPaths: ['type', 'paths'],
            pastePath: ['type', 'path'],
            updateSessionCommand: ['type', 'command'],
            updateOpenedFiles: ['type', 'openedFiles', 'currentFile'],
            updateUIState: ['type', 'chipsCollapsed', 'composerCollapsed']
        };

        for (const [messageType, expectedFields] of Object.entries(fieldMappings)) {
            const sampleMessage = (sampleJetBrainsMessages as any)[messageType];
            
            for (const field of expectedFields) {
                if (field === 'type') {
                    continue; // Always present
                }
                
                // Check if optional fields are handled correctly
                if (['openedFiles', 'currentFile', 'chipsCollapsed', 'composerCollapsed'].includes(field)) {
                    // These are optional, just check type if present
                    if (sampleMessage.hasOwnProperty(field)) {
                        const fieldValue = sampleMessage[field];
                        switch (field) {
                            case 'openedFiles':
                                assert.ok(Array.isArray(fieldValue), `${field} should be array`);
                                break;
                            case 'currentFile':
                                assert.ok(typeof fieldValue === 'string' || fieldValue === null, `${field} should be string or null`);
                                break;
                            case 'chipsCollapsed':
                            case 'composerCollapsed':
                                assert.ok(typeof fieldValue === 'boolean', `${field} should be boolean`);
                                break;
                        }
                    }
                } else {
                    // Required fields
                    assert.ok(sampleMessage.hasOwnProperty(field), `${messageType} should have ${field} field`);
                }
            }
        }
    });
});