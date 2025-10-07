import * as assert from 'assert';
import * as vscode from 'vscode';
import {AddLinesToContextCommand} from '../../commands/AddLinesToContextCommand';
import {PathInserter} from '../../utils/PathInserter';

suite('AddLinesToContextCommand Test Suite', () => {
    let mockWebview: any;
    let originalInsertPaths: any;

    setup(() => {
        // Mock webview for PathInserter
        mockWebview = {
            postMessage: (message: any) => {
                // Store the message for verification
                mockWebview.lastMessage = message;
            }
        };

        // Mock PathInserter.insertPaths to capture calls
        originalInsertPaths = PathInserter.insertPaths;
        PathInserter.insertPaths = (paths: string[]) => {
            mockWebview.lastPaths = paths;
        };
    });

    teardown(() => {
        // Restore original PathInserter.insertPaths
        PathInserter.insertPaths = originalInsertPaths;
    });

    test('handleSelectedLines should format path with line range correctly', async () => {
        // Create a test document
        const document = await vscode.workspace.openTextDocument({
            content: 'line 1\nline 2\nline 3\nline 4\nline 5',
            language: 'typescript'
        });

        // Show the document in an editor
        const editor = await vscode.window.showTextDocument(document);

        // Set a selection from line 1 to line 3 (0-based)
        const selection = new vscode.Selection(
            new vscode.Position(1, 0), // Start at line 2, column 0
            new vscode.Position(3, 5)  // End at line 4, column 5
        );
        editor.selection = selection;

        // Call the command
        await AddLinesToContextCommand.handleSelectedLines();

        // Verify the path was formatted correctly
        assert.ok(mockWebview.lastPaths, 'Paths should be sent to webview');
        assert.strictEqual(mockWebview.lastPaths.length, 1, 'Should send exactly one path');

        const pathWithRange = mockWebview.lastPaths[0];
        assert.ok(pathWithRange.includes(':1-3'), 'Should include correct line range (0-based)');
        // The file might not have .ts extension in test environment, just check for line range
        assert.ok(pathWithRange.match(/:1-3$/), 'Should end with correct line range format');
    });

    test('handleSelectedLines should handle single line selection', async () => {
        // Create a test document
        const document = await vscode.workspace.openTextDocument({
            content: 'line 1\nline 2\nline 3',
            language: 'javascript'
        });

        // Show the document in an editor
        const editor = await vscode.window.showTextDocument(document);

        // Set a selection on a single line (line 1, 0-based)
        const selection = new vscode.Selection(
            new vscode.Position(1, 2), // Start at line 2, column 2
            new vscode.Position(1, 6)  // End at line 2, column 6
        );
        editor.selection = selection;

        // Call the command
        await AddLinesToContextCommand.handleSelectedLines();

        // Verify the path was formatted correctly for single line
        assert.ok(mockWebview.lastPaths, 'Paths should be sent to webview');
        assert.strictEqual(mockWebview.lastPaths.length, 1, 'Should send exactly one path');

        const pathWithRange = mockWebview.lastPaths[0];
        assert.ok(pathWithRange.includes(':1-1'), 'Should include correct single line range');
    });

    test('handleSelectedLines should handle selection ending at line start', async () => {
        // Create a test document
        const document = await vscode.workspace.openTextDocument({
            content: 'line 1\nline 2\nline 3\nline 4',
            language: 'typescript'
        });

        // Show the document in an editor
        const editor = await vscode.window.showTextDocument(document);

        // Set a selection that ends at the beginning of the next line
        const selection = new vscode.Selection(
            new vscode.Position(1, 0), // Start at line 2, column 0
            new vscode.Position(3, 0)  // End at line 4, column 0 (beginning of line)
        );
        editor.selection = selection;

        // Call the command
        await AddLinesToContextCommand.handleSelectedLines();

        // Verify the path excludes the line where selection ends at column 0
        assert.ok(mockWebview.lastPaths, 'Paths should be sent to webview');
        const pathWithRange = mockWebview.lastPaths[0];
        assert.ok(pathWithRange.includes(':1-2'), 'Should exclude line 4 when selection ends at column 0');
    });

    test('handleSelectedLines should show warning when no editor is active', async () => {
        // Close all editors
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        // Mock showWarningMessage to capture calls
        let warningMessage = '';
        const originalShowWarningMessage = vscode.window.showWarningMessage;
        vscode.window.showWarningMessage = (message: string) => {
            warningMessage = message;
            return Promise.resolve(undefined);
        };

        try {
            // Call the command with no active editor
            await AddLinesToContextCommand.handleSelectedLines();

            // Verify warning was shown
            assert.strictEqual(warningMessage, 'No active file to add lines to context');
            assert.ok(!mockWebview.lastPaths, 'No paths should be sent when no editor is active');
        } finally {
            // Restore original function
            vscode.window.showWarningMessage = originalShowWarningMessage;
        }
    });

    test('handleSelectedLines should show warning when no text is selected', async () => {
        // Create a test document
        const document = await vscode.workspace.openTextDocument({
            content: 'line 1\nline 2\nline 3',
            language: 'typescript'
        });

        // Show the document in an editor with no selection
        const editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(
            new vscode.Position(1, 2),
            new vscode.Position(1, 2) // Empty selection (cursor position)
        );

        // Mock showWarningMessage to capture calls
        let warningMessage = '';
        const originalShowWarningMessage = vscode.window.showWarningMessage;
        vscode.window.showWarningMessage = (message: string) => {
            warningMessage = message;
            return Promise.resolve(undefined);
        };

        try {
            // Call the command with no selection
            await AddLinesToContextCommand.handleSelectedLines();

            // Verify warning was shown
            assert.strictEqual(warningMessage, 'No text selected to add to context');
            assert.ok(!mockWebview.lastPaths, 'No paths should be sent when no text is selected');
        } finally {
            // Restore original function
            vscode.window.showWarningMessage = originalShowWarningMessage;
        }
    });
});