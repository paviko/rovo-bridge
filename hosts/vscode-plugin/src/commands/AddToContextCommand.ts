import * as vscode from 'vscode';
import {PathInserter} from '../utils/PathInserter';
import {errorHandler} from '../utils/ErrorHandler';
import {logger} from "../globals";

/**
 * File and folder context commands - mirrors ProjectAddToContextAction.kt and EditorAddToContextAction.kt
 * Handles adding files and folders to the RovoBridge context
 */

export class AddToContextCommand {
    
    /**
     * Handle adding file or folder to context from explorer
     * @param uri File or folder URI from context menu
     */
    static async handleExplorerContext(uri: vscode.Uri): Promise<void> {
        try {
            if (!uri) {
                logger.appendLine('No URI provided for explorer context');
                return;
            }

            logger.appendLine(`Handling explorer context for: ${uri.fsPath}`);
            
            const paths = await this.collectFilePaths(uri);
            if (paths.length > 0) {
                this.sendPathsToWebUI(paths);
                logger.appendLine(`Successfully added ${paths.length} paths to context`);
            } else {
                logger.appendLine('No valid paths found to add to context');
                vscode.window.showWarningMessage('No valid files found to add to context');
            }
        } catch (error) {
            logger.appendLine(`Error handling explorer context: ${error}`);
            
            await errorHandler.handleFileOperationError(
                error instanceof Error ? error : new Error(String(error)),
                { 
                    operation: 'handleExplorerContext',
                    filePath: uri?.fsPath,
                    hasUri: !!uri
                }
            );
        }
    }

    /**
     * Handle adding current file to context from editor
     */
    static async handleEditorContext(): Promise<void> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                logger.appendLine('No active editor for context');
                vscode.window.showWarningMessage('No active file to add to context');
                return;
            }

            const uri = activeEditor.document.uri;
            logger.appendLine(`Handling editor context for: ${uri.fsPath}`);

            // For editor context, we only add the current file (not recursively)
            const filePath = this.asAbsolutePath(uri);
            if (filePath) {
                this.sendPathsToWebUI([filePath]);
                logger.appendLine(`Successfully added current file to context: ${filePath}`);
            } else {
                logger.appendLine('Could not resolve current file path');
                vscode.window.showWarningMessage('Could not resolve current file path');
            }
        } catch (error) {
            logger.appendLine(`Error handling editor context: ${error}`);
            
            await errorHandler.handleFileOperationError(
                error instanceof Error ? error : new Error(String(error)),
                { 
                    operation: 'handleEditorContext',
                    activeFile: vscode.window.activeTextEditor?.document.fileName,
                    hasActiveEditor: !!vscode.window.activeTextEditor
                }
            );
        }
    }

    /**
     * Validate and collect file paths
     * @param uri Starting URI (file or folder)
     * @returns Array of valid file paths
     */
    private static async collectFilePaths(uri: vscode.Uri): Promise<string[]> {
        const paths: string[] = [];
        
        try {
            await this.collectFilePathsRecursive(uri, paths);
        } catch (error) {
            logger.appendLine(`Error collecting file paths: ${error}`);
            // Continue with whatever paths we managed to collect
        }

        return paths;
    }

    /**
     * Recursively collect file paths from a URI (mirrors JetBrains collectFilePaths logic)
     * @param uri URI to process
     * @param paths Array to collect paths into
     */
    private static async collectFilePathsRecursive(uri: vscode.Uri, paths: string[]): Promise<void> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            
            if (stat.type === vscode.FileType.Directory) {
                // Handle directory - recursively collect all files
                try {
                    const entries = await vscode.workspace.fs.readDirectory(uri);
                    for (const [name, type] of entries) {
                        const childUri = vscode.Uri.joinPath(uri, name);
                        await this.collectFilePathsRecursive(childUri, paths);
                    }
                } catch (error) {
                    logger.appendLine(`Error reading directory ${uri.fsPath}: ${error}`);
                    // Continue with other entries
                }
            } else if (stat.type === vscode.FileType.File) {
                // Handle file - add to paths
                const filePath = this.asAbsolutePath(uri);
                if (filePath) {
                    paths.push(filePath);
                }
            }
            // Ignore symbolic links and other file types for now
        } catch (error) {
            logger.appendLine(`Error processing URI ${uri.fsPath}: ${error}`);
            // Continue processing other files
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

    /**
     * Send collected paths to the web UI
     * @param paths Array of file paths
     */
    private static sendPathsToWebUI(paths: string[]): void {
        try {
            if (!paths || paths.length === 0) {
                logger.appendLine('No paths to send to web UI');
                return;
            }

            // Use PathInserter utility to send paths to web UI
            PathInserter.insertPaths(paths);
            logger.appendLine(`Sent ${paths.length} paths to web UI`);
        } catch (error) {
            logger.appendLine(`Error sending paths to web UI: ${error}`);
            
            errorHandler.handleCommunicationError(
                error instanceof Error ? error : new Error(String(error)),
                { 
                    operation: 'sendPathsToWebUI',
                    pathCount: paths?.length,
                    paths: paths?.slice(0, 3) // Only log first 3 paths for brevity
                }
            );
        }
    }
}