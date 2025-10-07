import * as vscode from 'vscode';
import {PathInserter} from '../utils/PathInserter';
import {logger} from "../globals";

/**
 * Editor-specific context command for adding selected lines to context
 * Mirrors EditorAddLinesToContextAction.kt functionality
 * Handles adding selected text with line range information to RovoBridge context
 */

export class AddLinesToContextCommand {
    
    /**
     * Handle adding selected lines to context from editor
     * Calculates line range and formats path with line numbers (e.g., file.js:10-25)
     */
    static async handleSelectedLines(): Promise<void> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                logger.appendLine('No active editor for lines context');
                vscode.window.showWarningMessage('No active file to add lines to context');
                return;
            }

            const selection = activeEditor.selection;
            if (selection.isEmpty) {
                logger.appendLine('No text selection for lines context');
                vscode.window.showWarningMessage('No text selected to add to context');
                return;
            }

            const document = activeEditor.document;
            const uri = document.uri;
            
            logger.appendLine(`Handling lines context for: ${uri.fsPath}`);
            logger.appendLine(`Selection: start=${selection.start.line}, end=${selection.end.line}`);

            // Calculate line range (VSCode uses 0-based line numbers)
            const startLine = selection.start.line;
            let endLine = selection.end.line;
            
            // Handle selection that ends at the beginning of a line
            // If selection ends at column 0 of the next line, don't include that line
            // This mirrors the JetBrains logic: if (endOffset > 0) endOffset -= 1
            if (selection.end.character === 0 && endLine > startLine) {
                endLine = endLine - 1;
            }

            // Convert URI to absolute path
            const filePath = this.asAbsolutePath(uri);
            if (!filePath) {
                logger.appendLine('Could not resolve file path');
                vscode.window.showWarningMessage('Could not resolve file path');
                return;
            }

            // Format path with line range (0-based line numbers to match JetBrains and backend expectations)
            const pathWithRange = `${filePath}:${startLine}-${endLine}`;
            
            logger.appendLine(`Sending path with range to web UI: ${pathWithRange}`);
            
            // Send to web UI using PathInserter
            PathInserter.insertPaths([pathWithRange]);
            
            logger.appendLine(`Successfully added lines to context: ${pathWithRange}`);
            
        } catch (error) {
            logger.appendLine(`Error handling lines context: ${error}`);
            vscode.window.showErrorMessage(`Failed to add lines to context: ${error}`);
        }
    }

    /**
     * Convert URI to absolute path (mirrors JetBrains asAbsolutePath logic)
     * @param uri URI to convert
     * @returns Absolute path or null if conversion fails
     */
    private static asAbsolutePath(uri: vscode.Uri): string | null {
        try {
            if (uri.scheme === 'file') {
                return uri.fsPath;
            } else {
                // For non-file schemes, return the path as-is
                return uri.path;
            }
        } catch (error) {
            logger.appendLine(`Error converting URI to path: ${uri.toString()}, error: ${error}`);
            return null;
        }
    }
}