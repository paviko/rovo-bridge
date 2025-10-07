import * as assert from 'assert';
import * as vscode from 'vscode';
import {PastePathCommand} from '../../commands/PastePathCommand';

suite('PastePathCommand Test Suite', () => {
    vscode.window.showInformationMessage('Start PastePathCommand tests.');

    test('PastePathCommand should be defined', () => {
        assert.ok(PastePathCommand);
        assert.ok(typeof PastePathCommand.handleDirectoryPaste === 'function');
        assert.ok(typeof PastePathCommand.handleMultipleDirectoryPaste === 'function');
    });

    test('handleDirectoryPaste should handle null URI gracefully', async () => {
        // This should not throw an error
        await PastePathCommand.handleDirectoryPaste(null as any);
        // If we get here, the test passed
        assert.ok(true);
    });

    test('handleMultipleDirectoryPaste should handle empty array gracefully', async () => {
        // This should not throw an error
        await PastePathCommand.handleMultipleDirectoryPaste([]);
        // If we get here, the test passed
        assert.ok(true);
    });
});