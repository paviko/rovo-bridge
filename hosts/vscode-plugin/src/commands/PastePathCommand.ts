import * as vscode from 'vscode';
import {PathInserter} from '../utils/PathInserter';
import {logger} from "../globals";

/**
 * Directory path pasting command - mirrors ProjectPastePathAction.kt
 * Handles pasting directory paths to the RovoBridge input field
 * Only operates on directories, not files
 */

export class PastePathCommand {
    
    /**
     * Handle pasting directory path from explorer context menu
     * @param uri Directory URI from context menu
     */
    static async handleDirectoryPaste(uri: vscode.Uri): Promise<void> {
        try {
            if (!uri) {
                logger.appendLine('No URI provided for directory paste');
                return;
            }

            logger.appendLine(`Handling directory paste for: ${uri.fsPath}`);
            
            // Verify this is actually a directory
            const isDirectory = await this.isDirectory(uri);
            if (!isDirectory) {
                logger.appendLine(`URI is not a directory: ${uri.fsPath}`);
                vscode.window.showWarningMessage('Paste path is only available for directories');
                return;
            }

            // Convert to absolute path
            const dirPath = this.asAbsolutePath(uri);
            if (!dirPath) {
                logger.appendLine('Could not resolve directory path');
                vscode.window.showWarningMessage('Could not resolve directory path');
                return;
            }

            // Send to web UI using PathInserter
            PathInserter.pastePath(dirPath);
            logger.appendLine(`Successfully pasted directory path: ${dirPath}`);
            
        } catch (error) {
            logger.appendLine(`Error handling directory paste: ${error}`);
            vscode.window.showErrorMessage(`Failed to paste directory path: ${error}`);
        }
    }

    /**
     * Handle pasting multiple directory paths (when multiple directories are selected)
     * @param uris Array of directory URIs from context menu
     */
    static async handleMultipleDirectoryPaste(uris: vscode.Uri[]): Promise<void> {
        try {
            if (!uris || uris.length === 0) {
                logger.appendLine('No URIs provided for multiple directory paste');
                return;
            }

            logger.appendLine(`Handling multiple directory paste for ${uris.length} items`);
            
            // Filter to only directories and convert to paths
            const directoryPaths: string[] = [];
            
            for (const uri of uris) {
                try {
                    const isDirectory = await this.isDirectory(uri);
                    if (isDirectory) {
                        const dirPath = this.asAbsolutePath(uri);
                        if (dirPath) {
                            directoryPaths.push(dirPath);
                        }
                    } else {
                        logger.appendLine(`Skipping non-directory: ${uri.fsPath}`);
                    }
                } catch (error) {
                    logger.appendLine(`Error processing URI ${uri.fsPath}: ${error}`);
                    // Continue with other URIs
                }
            }

            if (directoryPaths.length === 0) {
                logger.appendLine('No valid directories found to paste');
                vscode.window.showWarningMessage('No valid directories found to paste');
                return;
            }

            // Paste each directory path individually (mirrors JetBrains behavior)
            for (const dirPath of directoryPaths) {
                PathInserter.pastePath(dirPath);
                logger.appendLine(`Pasted directory path: ${dirPath}`);
            }
            
            logger.appendLine(`Successfully pasted ${directoryPaths.length} directory paths`);
            
        } catch (error) {
            logger.appendLine(`Error handling multiple directory paste: ${error}`);
            vscode.window.showErrorMessage(`Failed to paste directory paths: ${error}`);
        }
    }

    /**
     * Check if a URI represents a directory
     * @param uri URI to check
     * @returns True if URI is a directory
     */
    private static async isDirectory(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return stat.type === vscode.FileType.Directory;
        } catch (error) {
            logger.appendLine(`Error checking if URI is directory ${uri.fsPath}: ${error}`);
            return false;
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