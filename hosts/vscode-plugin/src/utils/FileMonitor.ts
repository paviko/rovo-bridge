import * as vscode from 'vscode';
import * as path from 'path';

/**
 * File monitoring utility - mirrors IdeOpenFilesUpdater.kt
 * Tracks open files and sends updates to the web UI
 */

export class FileMonitor {
    private disposables: vscode.Disposable[] = [];
    private onFilesChanged?: (files: string[], current?: string) => void;
    private periodicUpdateInterval?: NodeJS.Timeout;

    /**
     * Start monitoring open files and editor changes
     * @param callback Callback function for file list changes
     */
    startMonitoring(callback: (files: string[], current?: string) => void): void {
        this.onFilesChanged = callback;

        // Listen to tab changes - when active editor changes
        const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
            this.handleTabChange();
        });
        this.disposables.push(activeEditorDisposable);

        // Listen to visible editors changes - when tabs are opened/closed
        const visibleEditorsDisposable = vscode.window.onDidChangeVisibleTextEditors(() => {
            this.handleTabChange();
        });
        this.disposables.push(visibleEditorsDisposable);

        // Periodic updates as fallback (every 5 seconds, like JetBrains implementation)
        this.periodicUpdateInterval = setInterval(() => {
            this.handleTabChange();
        }, 5000);

        // Initial push
        this.handleTabChange();
    }

    /**
     * Stop monitoring and clean up resources
     */
    stopMonitoring(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        
        if (this.periodicUpdateInterval) {
            clearInterval(this.periodicUpdateInterval);
            this.periodicUpdateInterval = undefined;
        }
        
        this.onFilesChanged = undefined;
    }

    /**
     * Get list of currently open files
     * @returns Array of open file paths
     */
    private getOpenFiles(): string[] {
        const openFiles: string[] = [];
        
        // Get all visible text editors (open tabs)
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document && editor.document.uri.scheme === 'file') {
                const filePath = this.getRelativePath(editor.document.uri.fsPath);
                if (filePath && !openFiles.includes(filePath)) {
                    openFiles.push(filePath);
                }
            }
        }

        // Also include tabs that might not be visible but are open
        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'file') {
                    const filePath = this.getRelativePath(tab.input.uri.fsPath);
                    if (filePath && !openFiles.includes(filePath)) {
                        openFiles.push(filePath);
                    }
                }
            }
        }

        return openFiles;
    }

    /**
     * Get currently active file
     * @returns Active file path or undefined
     */
    private getCurrentFile(): string | undefined {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.uri.scheme === 'file') {
            return this.getRelativePath(activeEditor.document.uri.fsPath);
        }
        return undefined;
    }

    /**
     * Convert absolute path to relative path based on workspace
     * Mirrors the vfPath logic from JetBrains implementation
     */
    private getRelativePath(absolutePath: string): string | undefined {
        if (!absolutePath) {
            return undefined;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(absolutePath));
        if (workspaceFolder) {
            // Get relative path within workspace
            const relativePath = path.relative(workspaceFolder.uri.fsPath, absolutePath);
            return relativePath || path.basename(absolutePath);
        }

        // If no workspace or file is outside workspace, return absolute path
        return absolutePath;
    }

    /**
     * Handle editor tab changes
     */
    private handleTabChange(): void {
        if (!this.onFilesChanged) {
            return;
        }

        try {
            const openFiles = this.getOpenFiles();
            const currentFile = this.getCurrentFile();
            this.onFilesChanged(openFiles, currentFile);
        } catch (error) {
            console.error('Error in FileMonitor.handleTabChange:', error);
        }
    }
}