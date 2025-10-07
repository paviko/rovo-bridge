import * as vscode from 'vscode';
import {WebviewManager} from './ui/WebviewManager';
import {BackendLauncher} from './backend/BackendLauncher';
import {SettingsManager} from './settings/SettingsManager';
import {ActivityBarProvider} from './ui/ActivityBarProvider';
import {ErrorCategory, errorHandler, ErrorSeverity} from './utils/ErrorHandler';
import {logger} from "./globals";

/**
 * Main extension entry point - equivalent to ChatToolWindowFactory.kt
 * Handles extension activation, deactivation, and component coordination
 * 
 * This class serves as the central coordinator for all extension components,
 * managing their lifecycle and ensuring proper initialization and cleanup.
 */

/**
 * Main extension class that coordinates all components
 * Mirrors the functionality of ChatToolWindowFactory.kt from the JetBrains plugin
 */
class RovoBridgeExtension {
    private webviewManager?: WebviewManager;
    private backendLauncher?: BackendLauncher;
    private settingsManager?: SettingsManager;
    private activityBarProvider?: ActivityBarProvider;
    private context?: vscode.ExtensionContext;

    /**
     * Initialize the extension with all components
     * @param context VSCode extension context
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.context = context;
        logger.appendLine('Initializing RovoBridge extension...');

        try {
            // Initialize core components
            this.initializeComponents();
            
            // Register all commands
            this.registerCommands(context);
            
            // Set up component coordination
            this.setupComponentCoordination();
            
            logger.appendLine('RovoBridge extension initialized successfully');
        } catch (error) {
            logger.appendLine(`Failed to initialize extension: ${error}`);
            
            // Use error handler for comprehensive error handling
            await errorHandler.handleError(errorHandler.createErrorContext(
                ErrorCategory.COMMAND_EXECUTION,
                ErrorSeverity.CRITICAL,
                'RovoBridgeExtension',
                'initialize',
                error instanceof Error ? error : new Error(String(error)),
                { phase: 'initialization' }
            ));
            
            throw error;
        }
    }

    /**
     * Initialize core extension components
     */
    private initializeComponents(): void {
        logger.appendLine('Initializing core components...');
        
        // Initialize settings manager first as other components may depend on it
        this.settingsManager = new SettingsManager();
        const settingsDisposable = this.settingsManager.initialize();
        this.context?.subscriptions.push(settingsDisposable);
        
        // Initialize backend launcher
        this.backendLauncher = new BackendLauncher();
        
        // Initialize webview manager
        this.webviewManager = new WebviewManager();
        
        // Initialize activity bar provider as WebviewViewProvider so the content renders directly in the view
        this.activityBarProvider = new ActivityBarProvider(this.context!, this.backendLauncher, this.settingsManager);
        vscode.window.registerWebviewViewProvider('rovobridge.main', this.activityBarProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        });
        
        logger.appendLine('Core components initialized');
    }

    /**
     * Register all extension commands and menu contributions
     * @param context Extension context for command registration
     */
    private registerCommands(context: vscode.ExtensionContext): void {
        logger.appendLine('Registering extension commands...');

        // Main command to open the RovoBridge panel
        const openPanelCommand = vscode.commands.registerCommand('rovobridge.openPanel', async () => {
            await this.handleOpenPanel({ forceNewBackend: true });
        });

        // Context menu commands for file operations
        const addFileToContextCommand = vscode.commands.registerCommand('rovobridge.addFileToContext', async (uri?: vscode.Uri) => {
            await this.handleAddFileToContext(uri);
        });

        const addLinesToContextCommand = vscode.commands.registerCommand('rovobridge.addLinesToContext', async () => {
            await this.handleAddLinesToContext();
        });

        const pastePathCommand = vscode.commands.registerCommand('rovobridge.pastePath', async (uri?: vscode.Uri) => {
            await this.handlePastePath(uri);
        });

        // Add all commands to context subscriptions for proper cleanup
        context.subscriptions.push(
            openPanelCommand,
            addFileToContextCommand,
            addLinesToContextCommand,
            pastePathCommand
        );

        logger.appendLine('Extension commands registered successfully');
    }

    /**
     * Set up coordination between components
     */
    private setupComponentCoordination(): void {
        if (!this.settingsManager) {
            return;
        }

        // Set up settings change handling
        const settingsListener = this.settingsManager.onSettingsChange((settings) => {
            logger.appendLine(`Settings changed: ${JSON.stringify(settings)}, coordinating component updates...`);
            // Settings synchronization is handled by SettingsSynchronizer in WebviewManager
            // This is just for logging and any extension-level coordination
        });

        this.context?.subscriptions.push(settingsListener);
        
        logger.appendLine('Component coordination set up');
    }

    /**
     * Handle opening the RovoBridge panel
     */
    private async handleOpenPanel(opts?: { forceNewBackend?: boolean }): Promise<void> {
        try {
            if (!this.webviewManager || !this.backendLauncher || !this.context) {
                const error = new Error('Extension components not properly initialized');
                await errorHandler.handleError(errorHandler.createErrorContext(
                    ErrorCategory.COMMAND_EXECUTION,
                    ErrorSeverity.ERROR,
                    'RovoBridgeExtension',
                    'handleOpenPanel',
                    error,
                    { 
                        hasWebviewManager: !!this.webviewManager,
                        hasBackendLauncher: !!this.backendLauncher,
                        hasContext: !!this.context
                    }
                ));
                return;
            }

            logger.appendLine('Opening RovoBridge panel...');

            // Create webview panel with settings manager
            this.webviewManager.createWebviewPanel(this.context, this.settingsManager);
            
            // Show loading progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Starting RovoBridge...",
                cancellable: false
            }, async (progress) => {
                try {
                    progress.report({ increment: 0, message: "Launching backend..." });
                    
                    // Launch backend process with error handling
                    const connection = await this.backendLauncher!.launchBackend(undefined, { forceNew: opts?.forceNewBackend });
                    
                    progress.report({ increment: 50, message: "Loading web UI..." });
                    
                    // Load web UI with connection info
                    await this.webviewManager!.loadWebUI(connection);
                    
                    progress.report({ increment: 100, message: "Ready!" });
                } catch (progressError) {
                    // Handle errors during the progress operation
                    if (progressError instanceof Error && progressError.message.includes('backend')) {
                        await errorHandler.handleBackendLaunchError(progressError, {
                            workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                        });
                    } else if (progressError instanceof Error && progressError.message.includes('webview')) {
                        await errorHandler.handleWebviewLoadError(progressError);
                    } else {
                        await errorHandler.handleError(errorHandler.createErrorContext(
                            ErrorCategory.COMMAND_EXECUTION,
                            ErrorSeverity.ERROR,
                            'RovoBridgeExtension',
                            'handleOpenPanel',
                            progressError instanceof Error ? progressError : new Error(String(progressError))
                        ));
                    }
                    throw progressError; // Re-throw to stop progress
                }
            });

            logger.appendLine('RovoBridge panel opened successfully');

        } catch (error) {
            logger.appendLine(`Failed to open RovoBridge panel: ${error}`);
            
            // Don't show additional error message if error handler already handled it
            if (!(error instanceof Error && error.message.includes('Extension components not properly initialized'))) {
                await errorHandler.handleError(errorHandler.createErrorContext(
                    ErrorCategory.COMMAND_EXECUTION,
                    ErrorSeverity.ERROR,
                    'RovoBridgeExtension',
                    'handleOpenPanel',
                    error instanceof Error ? error : new Error(String(error))
                ));
            }
        }
    }

    /**
     * Handle adding file to context command
     * @param uri Optional URI from context menu
     */
    private async handleAddFileToContext(uri?: vscode.Uri): Promise<void> {
        try {
            // Dynamically import to avoid circular dependencies and improve startup time
            const { AddToContextCommand } = await import('./commands/AddToContextCommand');
            
            if (uri) {
                // Called from explorer context menu with URI
                await AddToContextCommand.handleExplorerContext(uri);
            } else {
                // Called from editor context menu or command palette
                await AddToContextCommand.handleEditorContext();
            }
        } catch (error) {
            logger.appendLine(`Error in add file to context: ${error}`);
            
            await errorHandler.handleFileOperationError(
                error instanceof Error ? error : new Error(String(error)),
                { 
                    operation: 'addFileToContext',
                    filePath: uri?.fsPath,
                    hasUri: !!uri
                }
            );
        }
    }

    /**
     * Handle adding lines to context command
     */
    private async handleAddLinesToContext(): Promise<void> {
        try {
            const { AddLinesToContextCommand } = await import('./commands/AddLinesToContextCommand');
            await AddLinesToContextCommand.handleSelectedLines();
        } catch (error) {
            logger.appendLine(`Error in add lines to context: ${error}`);
            
            await errorHandler.handleFileOperationError(
                error instanceof Error ? error : new Error(String(error)),
                { 
                    operation: 'addLinesToContext',
                    activeFile: vscode.window.activeTextEditor?.document.fileName
                }
            );
        }
    }

    /**
     * Handle paste path command
     * @param uri Optional URI from context menu
     */
    private async handlePastePath(uri?: vscode.Uri): Promise<void> {
        try {
            const { PastePathCommand } = await import('./commands/PastePathCommand');
            if (uri) {
                await PastePathCommand.handleDirectoryPaste(uri);
            } else {
                vscode.window.showWarningMessage('Paste path command requires a folder selection');
            }
        } catch (error) {
            logger.appendLine(`Error in paste path: ${error}`);
            
            await errorHandler.handleFileOperationError(
                error instanceof Error ? error : new Error(String(error)),
                { 
                    operation: 'pastePath',
                    directoryPath: uri?.fsPath,
                    hasUri: !!uri
                }
            );
        }
    }

    /**
     * Get the webview manager instance
     * @returns WebviewManager instance or undefined
     */
    getWebviewManager(): WebviewManager | undefined {
        return this.webviewManager;
    }

    /**
     * Get the backend launcher instance
     * @returns BackendLauncher instance or undefined
     */
    getBackendLauncher(): BackendLauncher | undefined {
        return this.backendLauncher;
    }

    /**
     * Get the settings manager instance
     * @returns SettingsManager instance or undefined
     */
    getSettingsManager(): SettingsManager | undefined {
        return this.settingsManager;
    }

    /**
     * Check if the extension is properly initialized
     * @returns True if all components are initialized
     */
    isInitialized(): boolean {
        return !!(this.webviewManager && this.backendLauncher && this.settingsManager && this.context);
    }

    /**
     * Dispose of all extension resources
     */
    dispose(): void {
        logger.appendLine('Disposing RovoBridge extension...');
        
        // Clean up components in reverse order of initialization
        if (this.webviewManager) {
            this.webviewManager.dispose();
            this.webviewManager = undefined;
        }
        
        if (this.backendLauncher) {
            this.backendLauncher.terminate();
            this.backendLauncher = undefined;
        }
        
        if (this.settingsManager) {
            this.settingsManager.dispose();
            this.settingsManager = undefined;
        }
        
        this.context = undefined;
        logger.appendLine('RovoBridge extension disposed');
    }
}

// Global extension instance
let extensionInstance: RovoBridgeExtension | undefined;

/**
 * Extension activation function - called when the extension is activated
 * This is the main entry point that VSCode calls when the extension starts
 * 
 * @param context VSCode extension context providing access to extension lifecycle and resources
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('RovoBridge extension is now active');
    context.subscriptions.push(logger); // Add to subscriptions for proper disposal
    
    try {
        // Create and initialize the main extension instance
        extensionInstance = new RovoBridgeExtension();
        await extensionInstance.initialize(context);

        // Add extension instance to subscriptions for proper cleanup
        context.subscriptions.push({
            dispose: () => {
                if (extensionInstance) {
                    extensionInstance.dispose();
                    extensionInstance = undefined;
                }
            }
        });

        // Add error handler to subscriptions for proper cleanup
        context.subscriptions.push({
            dispose: () => {
                errorHandler.dispose();
            }
        });

        // Register diagnostic command
        const diagnosticCommand = vscode.commands.registerCommand('rovobridge.showDiagnostics', async () => {
            await errorHandler.showDiagnosticInfo();
        });
        context.subscriptions.push(diagnosticCommand);

        console.log('RovoBridge extension activation completed successfully');
        
    } catch (error) {
        console.error('Failed to activate RovoBridge extension:', error);
        
        // Use error handler for activation failures
        await errorHandler.handleError(errorHandler.createErrorContext(
            ErrorCategory.COMMAND_EXECUTION,
            ErrorSeverity.CRITICAL,
            'Extension',
            'activate',
            error instanceof Error ? error : new Error(String(error)),
            { 
                vscodeVersion: vscode.version,
                extensionVersion: context.extension.packageJSON.version
            }
        ));
        
        // Clean up on activation failure
        if (extensionInstance) {
            extensionInstance.dispose();
            extensionInstance = undefined;
        }
        
        throw error;
    }
}

/**
 * Extension deactivation function - called when the extension is deactivated
 * This ensures proper cleanup of all resources and processes
 */
export function deactivate(): void {
    console.log('RovoBridge extension is being deactivated');
    
    try {
        // Dispose of the extension instance if it exists
        if (extensionInstance) {
            extensionInstance.dispose();
            extensionInstance = undefined;
        }
        
        console.log('RovoBridge extension deactivation completed successfully');
        
    } catch (error) {
        console.error('Error during RovoBridge extension deactivation:', error);
        // Continue with deactivation even if there are errors
    }
}

/**
 * Get the current extension instance (for testing or advanced usage)
 * @returns The current extension instance or undefined
 */
export function getExtensionInstance(): RovoBridgeExtension | undefined {
    return extensionInstance;
}