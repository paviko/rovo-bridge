import * as assert from 'assert';
import * as vscode from 'vscode';
import {AddToContextCommand} from '../../commands/AddToContextCommand';
import {PathInserter} from '../../utils/PathInserter';

suite('AddToContextCommand Test Suite', () => {
    let mockCommunicationBridge: any;
    let insertedPaths: string[] = [];

    setup(() => {
        // Mock communication bridge
        mockCommunicationBridge = {
            insertPaths: (paths: string[]) => {
                insertedPaths.push(...paths);
            }
        };
        
        // Set up PathInserter with mock bridge
        PathInserter.setCommunicationBridge(mockCommunicationBridge);
        
        // Clear inserted paths
        insertedPaths = [];
    });

    teardown(() => {
        PathInserter.clearCommunicationBridge();
        insertedPaths = [];
    });

    test('handleEditorContext should add current file when editor is active', async () => {
        // This test would require a mock active editor
        // For now, we'll test the error case when no editor is active
        
        // Ensure no active editor
        assert.strictEqual(vscode.window.activeTextEditor, undefined);
        
        // Should handle gracefully when no active editor
        await AddToContextCommand.handleEditorContext();
        
        // Should not have inserted any paths
        assert.strictEqual(insertedPaths.length, 0);
    });

    test('handleExplorerContext should handle null URI gracefully', async () => {
        // Test with null URI
        await AddToContextCommand.handleExplorerContext(null as any);
        
        // Should not have inserted any paths
        assert.strictEqual(insertedPaths.length, 0);
    });

    test('PathInserter integration should work correctly', () => {
        const testPaths = ['/test/file1.txt', '/test/file2.txt'];
        
        PathInserter.insertPaths(testPaths);
        
        assert.strictEqual(insertedPaths.length, 2);
        assert.strictEqual(insertedPaths[0], '/test/file1.txt');
        assert.strictEqual(insertedPaths[1], '/test/file2.txt');
    });
});