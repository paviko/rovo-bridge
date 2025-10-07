/**
 * Example usage of PathInserter with WebviewManager
 * This demonstrates how the PathInserter integrates with the webview system
 */

import * as vscode from 'vscode';
import {PathInserter} from './PathInserter';
import {WebviewManager} from '../ui/WebviewManager';

/**
 * Example integration showing how PathInserter works with WebviewManager
 */
export class PathInserterExample {
    private webviewManager: WebviewManager;

    constructor(webviewManager: WebviewManager) {
        this.webviewManager = webviewManager;
    }

    /**
     * Initialize PathInserter with the webview panel
     */
    initializePathInserter(): void {
        const panel = this.webviewManager.getPanel();
        PathInserter.setWebviewPanel(panel);
    }

    /**
     * Example: Add selected files from explorer to context
     */
    addFilesToContext(fileUris: vscode.Uri[]): void {
        const paths = fileUris.map(uri => uri.fsPath);
        PathInserter.insertPaths(paths);
    }

    /**
     * Example: Add current editor file with line range to context
     */
    addCurrentFileWithLines(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        
        let path = document.uri.fsPath;
        
        // Add line range if text is selected
        if (!selection.isEmpty) {
            const startLine = selection.start.line + 1; // VSCode uses 0-based, display uses 1-based
            const endLine = selection.end.line + 1;
            path = `${path}:${startLine}-${endLine}`;
        }

        PathInserter.insertPaths([path]);
    }

    /**
     * Example: Paste directory path from explorer
     */
    pasteDirectoryPath(folderUri: vscode.Uri): void {
        PathInserter.pastePath(folderUri.fsPath);
    }

    /**
     * Example: Clean up when webview is disposed
     */
    dispose(): void {
        PathInserter.clearWebviewPanel();
    }
}

/**
 * Example command handlers that would be used in the actual extension
 */
export class ExampleCommandHandlers {
    
    /**
     * Handler for "Add to context" command from explorer
     */
    static async handleAddToContext(uri: vscode.Uri): Promise<void> {
        if (!PathInserter.isReady()) {
            vscode.window.showWarningMessage('RovoBridge: Please open the RovoBridge panel first');
            return;
        }

        PathInserter.insertPaths([uri.fsPath]);
        vscode.window.showInformationMessage(`Added ${uri.fsPath} to context`);
    }

    /**
     * Handler for "Add lines to context" command from editor
     */
    static async handleAddLinesToContext(): Promise<void> {
        if (!PathInserter.isReady()) {
            vscode.window.showWarningMessage('RovoBridge: Please open the RovoBridge panel first');
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        
        if (selection.isEmpty) {
            // No selection, add entire file
            PathInserter.insertPaths([document.uri.fsPath]);
            vscode.window.showInformationMessage(`Added ${document.uri.fsPath} to context`);
        } else {
            // Add file with line range
            const startLine = selection.start.line + 1;
            const endLine = selection.end.line + 1;
            const pathWithLines = `${document.uri.fsPath}:${startLine}-${endLine}`;
            
            PathInserter.insertPaths([pathWithLines]);
            vscode.window.showInformationMessage(`Added ${pathWithLines} to context`);
        }
    }

    /**
     * Handler for "Paste path" command from explorer
     */
    static async handlePastePath(uri: vscode.Uri): Promise<void> {
        if (!PathInserter.isReady()) {
            vscode.window.showWarningMessage('RovoBridge: Please open the RovoBridge panel first');
            return;
        }

        PathInserter.pastePath(uri.fsPath);
        vscode.window.showInformationMessage(`Pasted path: ${uri.fsPath}`);
    }
}