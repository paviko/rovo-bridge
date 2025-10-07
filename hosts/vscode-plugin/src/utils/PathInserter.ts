import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {CommunicationBridge} from '../ui/CommunicationBridge';
import {logger} from "../globals";

/**
 * Path communication utility - mirrors PathInserter.kt
 * Handles sending paths to the webview with proper validation and error handling
 * Now uses CommunicationBridge for improved functionality
 */
export class PathInserter {
    private static communicationBridge: CommunicationBridge | undefined;
    
    /**
     * Set the communication bridge for path operations
     * @param bridge The communication bridge to use for communication
     */
    static setCommunicationBridge(bridge: CommunicationBridge | undefined): void {
        this.communicationBridge = bridge;
        if (bridge) {
            logger.appendLine('Communication bridge set for PathInserter');
        } else {
            logger.appendLine('Communication bridge cleared from PathInserter');
        }
    }

    /**
     * Set the webview panel for JavaScript execution (deprecated - use setCommunicationBridge)
     * @param panel The webview panel to use for communication
     * @deprecated Use setCommunicationBridge instead
     */
    static setWebviewPanel(panel: vscode.WebviewPanel | undefined): void {
        // For backward compatibility, but recommend using setCommunicationBridge
        logger.appendLine('setWebviewPanel is deprecated, use setCommunicationBridge instead');
    }

    /**
     * Insert file paths into the web UI
     * Mirrors the insertPaths functionality from PathInserter.kt
     * @param paths Array of file paths to insert
     */
    static insertPaths(paths: string[]): void {
        try {
            if (!this.communicationBridge) {
                logger.appendLine('No communication bridge available to insert paths');
                vscode.window.showWarningMessage('RovoBridge: No active communication bridge to insert paths');
                return;
            }

            if (!paths || paths.length === 0) {
                logger.appendLine('No paths provided to insert');
                return;
            }

            // Use CommunicationBridge for improved path handling
            this.communicationBridge.insertPaths(paths);
            logger.appendLine(`Requested insertion of ${paths.length} paths via CommunicationBridge`);

        } catch (error) {
            logger.appendLine(`Unexpected error inserting paths: ${error}`);
            vscode.window.showErrorMessage(`RovoBridge: Failed to insert paths - ${error}`);
        }
    }

    /**
     * Paste a directory path into the web UI input
     * Mirrors the pastePath functionality from PathInserter.kt
     * @param path Directory path to paste
     */
    static pastePath(path: string): void {
        try {
            if (!this.communicationBridge) {
                logger.appendLine('No communication bridge available to paste path');
                vscode.window.showWarningMessage('RovoBridge: No active communication bridge to paste path');
                return;
            }

            if (!path || path.trim().length === 0) {
                logger.appendLine('No path provided to paste');
                return;
            }

            // Use CommunicationBridge for improved path handling
            this.communicationBridge.pastePath(path.trim());
            logger.appendLine(`Requested paste of path via CommunicationBridge: ${path}`);

        } catch (error) {
            logger.appendLine(`Unexpected error pasting path: ${error}`);
            vscode.window.showErrorMessage(`RovoBridge: Failed to paste path - ${error}`);
        }
    }

    /**
     * Validate file paths before sending to web UI
     * @param paths Array of paths to validate
     * @returns Array of valid paths
     */
    private static validatePaths(paths: string[]): string[] {
        const validPaths: string[] = [];

        for (const rawPath of paths) {
            try {
                const normalizedPath = this.normalizePath(rawPath);
                if (normalizedPath && this.isValidPath(normalizedPath)) {
                    validPaths.push(normalizedPath);
                } else {
                    logger.appendLine(`Skipping invalid path: ${rawPath}`);
                }
            } catch (error) {
                logger.appendLine(`Error validating path ${rawPath}: ${error}`);
            }
        }

        return validPaths;
    }

    /**
     * Normalize a file path for consistent handling
     * @param rawPath Raw path string
     * @returns Normalized path or null if invalid
     */
    private static normalizePath(rawPath: string): string | null {
        try {
            if (!rawPath || rawPath.trim().length === 0) {
                return null;
            }

            let normalizedPath = rawPath.trim();

            // Handle VSCode URI format
            if (normalizedPath.startsWith('file://')) {
                normalizedPath = vscode.Uri.parse(normalizedPath).fsPath;
            }

            // Resolve relative paths against workspace
            if (!path.isAbsolute(normalizedPath)) {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    normalizedPath = path.resolve(workspaceFolder.uri.fsPath, normalizedPath);
                } else {
                    // No workspace, can't resolve relative path
                    return null;
                }
            }

            // Normalize path separators
            normalizedPath = path.normalize(normalizedPath);

            return normalizedPath;

        } catch (error) {
            logger.appendLine(`Error normalizing path ${rawPath}: ${error}`);
            return null;
        }
    }

    /**
     * Check if a path is valid and accessible
     * @param normalizedPath Normalized path to check
     * @returns True if path is valid
     */
    private static isValidPath(normalizedPath: string): boolean {
        try {
            // Check if path exists and is accessible
            fs.accessSync(normalizedPath, fs.constants.R_OK);
            return true;
        } catch (error) {
            // Path doesn't exist or isn't accessible
            // We still allow it since it might be a valid path that just doesn't exist yet
            // or the user might have different permissions
            logger.appendLine(`Path not accessible but allowing: ${normalizedPath} (${error})`);
            return true;
        }
    }

    /**
     * Clear the communication bridge reference
     */
    static clearCommunicationBridge(): void {
        this.setCommunicationBridge(undefined);
    }

    /**
     * Clear the webview panel reference (deprecated)
     * @deprecated Use clearCommunicationBridge instead
     */
    static clearWebviewPanel(): void {
        this.clearCommunicationBridge();
    }

    /**
     * Check if PathInserter is ready to send paths
     * @returns True if communication bridge is available
     */
    static isReady(): boolean {
        return this.communicationBridge !== undefined;
    }
}