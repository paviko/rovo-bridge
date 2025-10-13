import * as vscode from 'vscode';
import * as path from 'path';
import {errorHandler} from '../utils/ErrorHandler';
import {PluginCommunicator, UnifiedMessage} from '../types/UnifiedMessage';
import {logger} from "../globals";

/**
 * Communication bridge between VSCode and WebUI
 * Handles bi-directional messaging and state synchronization
 * Combines functionality from multiple JetBrains classes:
 * - PathInserter.kt
 * - FontSizeSynchronizer.kt
 * - SessionCommandSynchronizer.kt
 * - OpenInIdeHandler.kt
 * - WebViewLoadHandler.kt
 */

export interface CommunicationBridgeOptions {
    webview?: vscode.Webview;
    context?: vscode.ExtensionContext;
    onStateChange?: (key: string, value: any) => Promise<void>;
}

export class CommunicationBridge implements PluginCommunicator {
    private webview?: vscode.Webview;
    private context?: vscode.ExtensionContext;
    private onStateChange?: (key: string, value: any) => Promise<void>;
    private messageHandlerDisposable?: vscode.Disposable;

    constructor(options: CommunicationBridgeOptions = {}) {
        this.webview = options.webview;
        this.context = options.context;
        this.onStateChange = options.onStateChange;

        if (this.webview) {
            this.setupMessageHandlers();
        }
    }

    /**
     * Set the webview instance for communication
     * @param webview VSCode webview instance
     */
    setWebview(webview: vscode.Webview): void {
        // Clean up existing message handlers
        if (this.messageHandlerDisposable) {
            this.messageHandlerDisposable.dispose();
        }

        this.webview = webview;

        if (webview) {
            this.setupMessageHandlers();
            logger.appendLine('Webview set and message handlers configured');
        } else {
            logger.appendLine('Webview cleared');
        }
    }

    /**
     * Set the extension context
     * @param context VSCode extension context
     */
    setContext(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    /**
     * Set the state change callback
     * @param callback Function to handle state changes
     */
    setStateChangeCallback(callback: (key: string, value: any) => Promise<void>): void {
        this.onStateChange = callback;
    }

    // VSCode → WebUI communication methods

    /**
     * Send a unified message to the webview using postMessage protocol
     * @param message Unified message object
     */
    sendMessage(message: UnifiedMessage): void {
        try {
            if (!this.webview) {
                logger.appendLine('No webview available to send message');
                return;
            }

            // Add timestamp if not present
            const messageWithMetadata = {
                ...message,
                timestamp: message.timestamp || Date.now()
            };

            // Send message using webview.postMessage
            this.webview.postMessage(messageWithMetadata);

            //logger.appendLine(`Sent unified message: ${message.type}`);
            //console.log(`[CommunicationBridge] Sent message: ${message.type}`, messageWithMetadata);

        } catch (error) {
            logger.appendLine(`Error sending unified message: ${error}`);

            errorHandler.handleCommunicationError(
                error instanceof Error ? error : new Error(String(error)),
                {operation: 'sendMessage', messageType: message.type}
            );
        }
    }

    /**
     * Send file paths to the web UI
     * Mirrors PathInserter.kt insertPaths functionality
     * @param paths Array of file paths to insert
     */
    insertPaths(paths: string[]): void {
        try {
            if (!paths || paths.length === 0) {
                logger.appendLine('No paths provided to insert');
                return;
            }

            // Validate and normalize paths
            const validPaths = this.validatePaths(paths);

            if (validPaths.length === 0) {
                logger.appendLine('No valid paths to insert after validation');
                vscode.window.showWarningMessage('RovoBridge: No valid paths to insert');
                return;
            }

            // Send unified message
            this.sendMessage({
                type: 'insertPaths',
                paths: validPaths
            });

            logger.appendLine(`Inserted ${validPaths.length} paths: ${validPaths.join(', ')}`);

        } catch (error) {
            logger.appendLine(`Error inserting paths: ${error}`);

            errorHandler.handleCommunicationError(
                error instanceof Error ? error : new Error(String(error)),
                {operation: 'insertPaths', paths, pathCount: paths?.length}
            );
        }
    }

    /**
     * Send directory path to the web UI for pasting
     * Mirrors PathInserter.kt pastePath functionality
     * @param path Directory path to paste
     */
    pastePath(path: string): void {
        try {
            if (!path || path.trim().length === 0) {
                logger.appendLine('No path provided to paste');
                return;
            }

            // Validate and normalize the path
            const normalizedPath = this.normalizePath(path.trim());
            if (!normalizedPath) {
                logger.appendLine(`Invalid path to paste: ${path}`);
                vscode.window.showWarningMessage(`RovoBridge: Invalid path - ${path}`);
                return;
            }

            // Send unified message
            this.sendMessage({
                type: 'pastePath',
                path: normalizedPath
            });

            logger.appendLine(`Pasted path: ${normalizedPath}`);

        } catch (error) {
            logger.appendLine(`Error pasting path: ${error}`);

            errorHandler.handleCommunicationError(
                error instanceof Error ? error : new Error(String(error)),
                {operation: 'pastePath', path}
            );
        }
    }

    /**
     * Update font size in the web UI
     * Mirrors FontSizeSynchronizer.kt functionality
     * @param size Font size value
     */
    setFontSize(size: number): void {
        try {
            if (typeof size !== 'number' || isNaN(size) || size < 8 || size > 72) {
                logger.appendLine(`Invalid font size: ${size}`);
                return;
            }

            // Send unified message
            this.sendMessage({
                type: 'setFontSize',
                size: Math.floor(size) // Ensure integer
            });

            logger.appendLine(`Set font size to: ${size}`);

        } catch (error) {
            logger.appendLine(`Error setting font size: ${error}`);
        }
    }

    /**
     * Update session command in the web UI
     * Mirrors SessionCommandSynchronizer.kt functionality
     * @param command Session command
     */
    updateSessionCommand(command: string): void {
        try {
            // Send unified message
            this.sendMessage({
                type: 'updateSessionCommand',
                command: command || ''
            });

            logger.appendLine(`Updated session command: ${command}`);

        } catch (error) {
            logger.appendLine(`Error updating session command: ${error}`);
        }
    }

    /**
     * Update useClipboard setting in the web UI
     * Mirrors UseClipboardSynchronizer.kt functionality
     * @param useClipboard Whether to use clipboard for sending prompts
     */
    updateUseClipboard(useClipboard: boolean): void {
        try {
            // Send unified message
            this.sendMessage({
                type: 'updateUseClipboard',
                useClipboard: useClipboard
            });

            logger.appendLine(`Updated useClipboard: ${useClipboard}`);

        } catch (error) {
            logger.appendLine(`Error updating useClipboard: ${error}`);
        }
    }

    /**
     * Update opened files list in the web UI
     * Mirrors IdeOpenFilesUpdater.kt functionality
     * @param files Array of open file paths
     * @param current Currently active file path
     */
    updateOpenedFiles(files: string[], current?: string): void {
        try {
            if (!files) {
                files = [];
            }

            // Validate and normalize file paths
            const validFiles = this.validatePaths(files);

            // Send unified message
            this.sendMessage({
                type: 'updateOpenedFiles',
                openedFiles: validFiles,
                currentFile: current || null
            });

            //logger.appendLine(`Updated opened files: ${validFiles.length} files, current: ${current || 'none'}`);

        } catch (error) {
            logger.appendLine(`Error updating opened files: ${error}`);
        }
    }

    /**
     * Set chips collapsed state in the web UI
     * @param collapsed Whether chips should be collapsed
     */
    /**
     * Update UI state in the web UI
     * @param state UI state object with optional collapsed states
     */
    updateUIState(state: { chipsCollapsed?: boolean; composerCollapsed?: boolean }): void {
        try {
            // Send unified message
            this.sendMessage({
                type: 'updateUIState',
                chipsCollapsed: state.chipsCollapsed,
                composerCollapsed: state.composerCollapsed
            });

            logger.appendLine(`Updated UI state: ${JSON.stringify(state)}`);

        } catch (error) {
            logger.appendLine(`Error updating UI state: ${error}`);
        }
    }

    /**
     * Set chips collapsed state in the web UI
     * @param collapsed Whether chips should be collapsed
     */
    setChipsCollapsed(collapsed: boolean): void {
        this.updateUIState({chipsCollapsed: collapsed});
    }

    /**
     * Set composer collapsed state in the web UI
     * @param collapsed Whether composer should be collapsed
     */
    setComposerCollapsed(collapsed: boolean): void {
        this.updateUIState({composerCollapsed: collapsed});
    }

    /**
     * Set authentication token in the web UI
     * @param token Authentication token
     */
    setToken(token: string): void {
        try {
            // Send unified message
            this.sendMessage({
                type: 'setToken',
                token: token
            });

            logger.appendLine('Authentication token set');

        } catch (error) {
            logger.appendLine(`Error setting token: ${error}`);
        }
    }

    /**
     * Initialize the web UI with comprehensive setup
     * Mirrors WebViewLoadHandler.kt onLoadEnd functionality
     * @param token Authentication token
     * @param fontSize Initial font size
     * @param chipsCollapsed Initial chips collapsed state
     * @param composerCollapsed Initial composer collapsed state
     * @param customCommand Initial session command
     * @param useClipboard Whether to use clipboard for sending prompts
     */
    initializeWebUI(
        token: string,
        fontSize: number = 14,
        chipsCollapsed: boolean = false,
        composerCollapsed: boolean = false,
        customCommand?: string,
        useClipboard: boolean = true
    ): void {
        try {
            // Use unified messaging for initialization
            this.setToken(token);
            this.setFontSize(fontSize);
            this.updateUIState({chipsCollapsed, composerCollapsed});

            if (customCommand && customCommand.trim()) {
                this.updateSessionCommand(customCommand);
            }

            this.updateUseClipboard(useClipboard);

            logger.appendLine('Web UI initialized with unified messaging');

        } catch (error) {
            logger.appendLine(`Error initializing web UI: ${error}`);
        }
    }

    // WebUI → VSCode communication handlers

    /**
     * Handle file open request from web UI
     * Mirrors OpenInIdeHandler.kt functionality
     * @param path File path to open (may include line numbers like "file.js:10-25")
     */
    async handleOpenFile(path: string): Promise<void> {
        try {
            if (!path || path.trim().length === 0) {
                logger.appendLine('No path provided to open');
                return;
            }

            // Parse line range from path (mirrors JetBrains regex logic)
            const rangeRegex = /:(\d+)(?:-(\d+))?$/;
            const match = rangeRegex.exec(path);
            let startLine: number | undefined;
            let endLine: number | undefined;
            let cleanPath = path;

            if (match) {
                startLine = parseInt(match[1], 10);
                if (match[2]) {
                    endLine = parseInt(match[2], 10);
                }
                cleanPath = path.replace(rangeRegex, '');
            }

            // Normalize and resolve the path
            const normalizedPath = this.normalizePath(cleanPath);
            if (!normalizedPath) {
                logger.appendLine(`Invalid path to open: ${cleanPath}`);
                vscode.window.showWarningMessage(`RovoBridge: Invalid file path - ${cleanPath}`);
                return;
            }

            // Convert to VSCode URI
            const fileUri = vscode.Uri.file(normalizedPath);

            // Check if file exists
            try {
                await vscode.workspace.fs.stat(fileUri);
            } catch (error) {
                // File doesn't exist, try to refresh and find it
                logger.appendLine(`File not found, attempting to refresh: ${normalizedPath}`);
            }

            // Open the file
            if (startLine !== undefined) {
                // Open with specific line/column position
                const line = Math.max(0, startLine); // Convert to 0-based indexing
                const column = 0;

                const options: vscode.TextDocumentShowOptions = {
                    selection: new vscode.Range(line, column, line, column),
                    viewColumn: vscode.ViewColumn.Active
                };

                try {
                    const document = await vscode.workspace.openTextDocument(fileUri);
                    const editor = await vscode.window.showTextDocument(document, options);

                    // Scroll to center the line
                    editor.revealRange(
                        new vscode.Range(line, column, line, column),
                        vscode.TextEditorRevealType.InCenter
                    );

                    logger.appendLine(`Opened file at line ${startLine}: ${normalizedPath}`);
                } catch (error) {
                    logger.appendLine(`Failed to open file with line number, trying without: ${error}`);
                    // Fallback to opening without line number
                    await vscode.window.showTextDocument(fileUri);
                    logger.appendLine(`Opened file (fallback): ${normalizedPath}`);
                }
            } else {
                // Open without specific position
                await vscode.window.showTextDocument(fileUri);
                logger.appendLine(`Opened file: ${normalizedPath}`);
            }

        } catch (error) {
            logger.appendLine(`Error opening file: ${error}`);

            await errorHandler.handleFileOperationError(
                error instanceof Error ? error : new Error(String(error)),
                {operation: 'openFile', filePath: path, hasLineNumbers: !!path.match(/:(\d+)(?:-(\d+))?$/)}
            );
        }
    }

    /**
     * Handle state change from web UI
     * @param key Setting key
     * @param value Setting value
     */
    async handleStateChange(key: string, value: any): Promise<void> {
        try {
            logger.appendLine(`Handling state change: ${key} = ${value}`);

            // Use the callback if provided
            if (this.onStateChange) {
                await this.onStateChange(key, value);
                return;
            }

            // Fallback to direct configuration update
            const config = vscode.workspace.getConfiguration('rovobridge');

            switch (key) {
                case 'fontSize':
                    if (typeof value === 'number' && value >= 8 && value <= 72) {
                        await config.update('fontSize', value, vscode.ConfigurationTarget.Global);
                        logger.appendLine(`Font size updated to: ${value}`);
                    } else {
                        logger.appendLine(`Invalid font size value: ${value}`);
                    }
                    break;

                case 'chipsCollapsed':
                    if (typeof value === 'boolean') {
                        await config.update('chipsCollapsed', value, vscode.ConfigurationTarget.Global);
                        logger.appendLine(`Chips collapsed updated to: ${value}`);
                    } else {
                        logger.appendLine(`Invalid chipsCollapsed value: ${value}`);
                    }
                    break;

                case 'composerCollapsed':
                    if (typeof value === 'boolean') {
                        await config.update('composerCollapsed', value, vscode.ConfigurationTarget.Global);
                        logger.appendLine(`Composer collapsed updated to: ${value}`);
                    } else {
                        logger.appendLine(`Invalid composerCollapsed value: ${value}`);
                    }
                    break;

                case 'customCommand':
                    if (typeof value === 'string') {
                        await config.update('customCommand', value, vscode.ConfigurationTarget.Global);
                        logger.appendLine(`Custom command updated to: ${value}`);
                    } else {
                        logger.appendLine(`Invalid customCommand value: ${value}`);
                    }
                    break;

                case 'useClipboard':
                    if (typeof value === 'boolean') {
                        await config.update('useClipboard', value, vscode.ConfigurationTarget.Global);
                        logger.appendLine(`UseClipboard updated to: ${value}`);
                    } else {
                        logger.appendLine(`Invalid useClipboard value: ${value}`);
                    }
                    break;

                default:
                    logger.appendLine(`Unknown settings key: ${key}`);
            }

        } catch (error) {
            logger.appendLine(`Error handling state change: ${error}`);
        }
    }

    // Extended message handling callbacks
    private onUILoadedCallback?: (success: boolean, error?: string) => Promise<void>;
    private onReadUris?: (uris: string[]) => Promise<void>;

    /**
     * Set callback for UI loaded events
     */
    setUILoadedCallback(callback: (success: boolean, error?: string) => Promise<void>): void {
        this.onUILoadedCallback = callback;
    }


    /**
     * Set callback for URI read requests
     */
    setReadUrisCallback(callback: (uris: string[]) => Promise<void>): void {
        this.onReadUris = callback;
    }


    /**
     * Set up message handlers for webview communication
     * Consolidated handler for all webview message types
     * Mirrors WebViewLoadHandler.kt message handling setup
     */
    setupMessageHandlers(): void {
        if (!this.webview) {
            logger.appendLine('No webview available to set up message handlers');
            return;
        }

        // Clean up existing handler
        if (this.messageHandlerDisposable) {
            this.messageHandlerDisposable.dispose();
        }

        this.messageHandlerDisposable = this.webview.onDidReceiveMessage(
            async (message) => {
                try {
                    switch (message.type) {
                        case 'openFile':
                            await this.handleOpenFile(message.path);
                            break;

                        case 'settingsChanged':
                            await this.handleStateChange(message.key, message.value);
                            break;

                        case 'bridgeValidation':
                            logger.appendLine(`Bridge validation: ${message.success ? 'success' : 'failed'}`);
                            if (!message.success && message.missingFunctions) {
                                logger.appendLine(`Missing functions: ${message.missingFunctions.join(', ')}`);
                            }
                            break;

                        case 'uiLoaded':
                            logger.appendLine(`UI loaded: ${message.success ? 'success' : 'failed'}`);
                            if (!message.success && message.error) {
                                logger.appendLine(`UI load error: ${message.error}`);
                            }
                            // Call external callback if provided
                            if (this.onUILoadedCallback) {
                                await this.onUILoadedCallback(message.success, message.error);
                            }
                            break;

                        case 'error':
                            logger.appendLine(`Webview error: ${message.error}`);
                            if (message.filename) {
                                logger.appendLine(`  at ${message.filename}:${message.lineno}`);
                            }
                            break;


                        case 'readUris':
                            if (Array.isArray(message.uris)) {
                                logger.appendLine(`URI read request: ${message.uris.length} URIs`);
                                if (this.onReadUris) {
                                    await this.onReadUris(message.uris);
                                }
                            }
                            break;

                        case 'executeCommand':
                            try {
                                const command: unknown = message.command;
                                const args: unknown[] = Array.isArray(message.args) ? message.args : [];
                                if (typeof command !== 'string' || command.trim() === '') {
                                    logger.appendLine('Invalid executeCommand message: missing command');
                                    break;
                                }
                                // Whitelist allowed commands for safety
                                const allowed = new Set<string>([
                                    'workbench.action.showCommands',
                                    'workbench.action.quickOpen',
                                    'workbench.action.files.save',
                                    'editor.action.selectAll',
                                    'workbench.action.files.newUntitledFile',
                                    'actions.find',
                                    'undo',
                                    'redo',
                                    // Clipboard actions for macOS handling
                                    'editor.action.clipboardCopyAction',
                                    'editor.action.clipboardPasteAction'
                                ]);
                                const cmd = command as string; // safe after type guard above
                                if (!allowed.has(cmd)) {
                                    logger.appendLine(`Blocked executeCommand for non-whitelisted command: ${cmd}`);
                                    break;
                                }
                                await vscode.commands.executeCommand(cmd, ...args);
                                logger.appendLine(`Executed command from webview: ${cmd}`);
                            } catch (e) {
                                logger.appendLine(`Failed to execute command from webview: ${e}`);
                            }
                            break;

                        default:
                            logger.appendLine(`Unknown message type: ${message.type}`);
                    }
                } catch (error) {
                    logger.appendLine(`Error handling message: ${error}`);
                }
            },
            undefined,
            this.context?.subscriptions
        );

        logger.appendLine('Message handlers set up successfully');
    }

    // Private utility methods


    /**
     * Validate file paths before sending to web UI
     * @param paths Array of paths to validate
     * @returns Array of valid paths
     */
    private validatePaths(paths: string[]): string[] {
        const validPaths: string[] = [];

        for (const rawPath of paths) {
            try {
                const normalizedPath = this.normalizePath(rawPath);
                if (normalizedPath) {
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
    private normalizePath(rawPath: string): string | null {
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

            // Convert to POSIX style for webview and testing consistency
            return normalizedPath.split(path.sep).join('/');

        } catch (error) {
            logger.appendLine(`Error normalizing path ${rawPath}: ${error}`);
            return null;
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.messageHandlerDisposable) {
            this.messageHandlerDisposable.dispose();
            this.messageHandlerDisposable = undefined;
        }

        this.webview = undefined;
        this.context = undefined;
        this.onStateChange = undefined;

        logger.appendLine('CommunicationBridge disposed');
    }
}