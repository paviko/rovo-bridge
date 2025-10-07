import * as vscode from 'vscode';
import {WebviewController} from './WebviewController';
// NOTE: The WebviewController now owns initialization and HTML generation; this manager delegates to it.
import {BackendConnection} from '../backend/BackendLauncher';
import {SettingsManager} from '../settings/SettingsManager';
import {SettingsSynchronizer} from '../settings/SettingsSynchronizer';
import {CommunicationBridge} from './CommunicationBridge';
import {errorHandler} from '../utils/ErrorHandler';
import {logger} from "../globals";

/**
 * Webview management - handles VSCode webview panel lifecycle and content
 * Equivalent to webview portions of ChatToolWindowFactory.kt
 */

export class WebviewManager {
    private panel?: vscode.WebviewPanel;
    private context?: vscode.ExtensionContext;
    private connection?: BackendConnection;
    private settingsManager?: SettingsManager;
    private settingsSynchronizer?: SettingsSynchronizer;
    private communicationBridge?: CommunicationBridge;
    private controller?: WebviewController;
    
    /**
     * Create and configure a webview panel for the RovoBridge UI
     * @param context Extension context for resource access
     * @param settingsManager Settings manager for configuration handling
     * @returns The created webview panel
     */
    createWebviewPanel(context: vscode.ExtensionContext, settingsManager?: SettingsManager): vscode.WebviewPanel {
        this.context = context;
        this.settingsManager = settingsManager;

        // Dispose existing panel if it exists
        if (this.panel) {
            this.panel.dispose();
        }

        // Create webview panel with proper configuration
        this.panel = vscode.window.createWebviewPanel(
            'rovobridge', // Identifies the type of webview
            'RovoBridge', // Title displayed in the tab
            vscode.ViewColumn.One, // Editor column to show the new webview panel in
            {
                // Enable JavaScript in the webview
                enableScripts: true,
                
                // Restrict the webview to only load content from specific sources
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'resources'),
                    vscode.Uri.joinPath(context.extensionUri, 'out')
                ],
                
                // Retain context when webview is not visible
                retainContextWhenHidden: true,
                
                // Enable command URIs
                enableCommandUris: true,
                
                // Enable find widget
                enableFindWidget: true
            }
        );

        // Set up webview options and CSP
        this.setupWebviewOptions();

        // Message handling is delegated to WebviewController via CommunicationBridge

        // Handle panel disposal
        this.panel.onDidDispose(() => {
            logger.appendLine('Webview panel disposed');
            this.cleanup();
        }, null, context.subscriptions);

        // Handle visibility changes
        this.panel.onDidChangeViewState((e) => {
            if (e.webviewPanel.visible) {
                logger.appendLine('Webview panel became visible');
            } else {
                logger.appendLine('Webview panel became hidden');
            }
        }, null, context.subscriptions);

        logger.appendLine('Webview panel created successfully');
        return this.panel;
    }

    /**
     * Set up webview options and Content Security Policy
     */
    private setupWebviewOptions(): void {
        if (!this.panel) {return;}

        // Configure Content Security Policy to allow the backend connection
        // This mirrors the security model from the JetBrains plugin
        const csp = [
            "default-src 'none'",
            "script-src 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:* https://127.0.0.1:*",
            "style-src 'unsafe-inline' http://127.0.0.1:* https://127.0.0.1:*",
            "img-src 'self' data: http://127.0.0.1:* https://127.0.0.1:* https://*.vscode-cdn.net",
            "connect-src ws://127.0.0.1:* wss://127.0.0.1:* http://127.0.0.1:* https://127.0.0.1:*",
            "font-src 'self' data: http://127.0.0.1:* https://127.0.0.1:*",
            "media-src 'self' http://127.0.0.1:* https://127.0.0.1:*",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'none'"
        ].join('; ');

        logger.appendLine(`Setting CSP: ${csp}`);
    }

    /**
     * Load the web UI with backend connection information
     * @param connection Backend connection details
     */
    async loadWebUI(connection: BackendConnection): Promise<void> {
        try {
            if (!this.panel) {
                const error = new Error('Webview panel not created. Call createWebviewPanel first.');
                errorHandler.handleWebviewLoadError(error, {
                    hasPanel: !!this.panel,
                    connection: connection ? 'provided' : 'missing'
                });
                return;
            }

            this.connection = connection;
            logger.appendLine(`Loading web UI with connection: port=${connection.port}, uiBase=${connection.uiBase}`);

            // Delegate setup of bridge, DnD, file monitor, settings sync and HTML to shared controller
            this.controller = new WebviewController({
                webview: this.panel.webview,
                context: this.context!,
                settingsManager: this.settingsManager,
            });
            // Keep references for compatibility APIs
            this.communicationBridge = this.controller.getCommunicationBridge?.();

            // Load UI via controller
            await this.controller.load(connection);

            // Save settings synchronizer reference if created
            this.settingsSynchronizer = undefined; // managed by controller
            // Get UI mode from settings with error handling
            let uiMode = 'Terminal';
            try {
                const config = vscode.workspace.getConfiguration('rovobridge');
                uiMode = config.get<string>('uiMode', 'Terminal');
            } catch (configError) {
                logger.appendLine(`Failed to get UI mode from settings, using default: ${configError}`);
            }

            // WebviewController loads HTML and handles initialization internally
            logger.appendLine('Web UI load delegated to WebviewController');

        } catch (error) {
            logger.appendLine(`Failed to load web UI: ${error}`);
            errorHandler.handleWebviewLoadError(
                error instanceof Error ? error : new Error(String(error)),
                { connection }
            );
            throw error;
        }
    }

    /**
     * Initialize the web UI with comprehensive setup using CommunicationBridge
     */
    private initializeWebUI(): void {
        if (!this.panel || !this.connection || !this.communicationBridge) {
            logger.appendLine('Cannot initialize web UI: panel, connection, or bridge not available');
            return;
        }

        try {
            // Get current settings
            const config = vscode.workspace.getConfiguration('rovobridge');
            const fontSize = config.get<number>('fontSize', 14);
            const chipsCollapsed = config.get<boolean>('chipsCollapsed', false);
            const composerCollapsed = config.get<boolean>('composerCollapsed', false);
            const customCommand = config.get<string>('customCommand', '');

            // Use CommunicationBridge to initialize the web UI
            this.communicationBridge.initializeWebUI(
                this.connection.token,
                fontSize,
                chipsCollapsed,
                composerCollapsed,
                customCommand || undefined
            );

            logger.appendLine('Web UI initialized successfully via CommunicationBridge');

        } catch (error) {
            logger.appendLine(`Failed to initialize web UI: ${error}`);
        }
    }






    /**
     * Get the current webview panel
     * @returns The webview panel or undefined
     */
    getPanel(): vscode.WebviewPanel | undefined {
        return this.panel;
    }

    /**
     * Check if the webview is currently visible
     * @returns True if webview is visible
     */
    isVisible(): boolean {
        return this.panel?.visible ?? false;
    }

    /**
     * Reveal the webview panel
     * @param viewColumn Optional view column to show in
     */
    reveal(viewColumn?: vscode.ViewColumn): void {
        if (this.panel) {
            this.panel.reveal(viewColumn);
        }
    }

    /**
     * Get the communication bridge instance
     * @returns The communication bridge or undefined
     */
    getCommunicationBridge(): CommunicationBridge | undefined {
        return this.communicationBridge;
    }

    
    /**
     * Clean up resources
     */
    private cleanup(): void {
        if (this.controller) {
            try { this.controller.dispose(); } catch {}
            this.controller = undefined;
        }
        if (this.communicationBridge) {
            this.communicationBridge.dispose();
            this.communicationBridge = undefined;
        }
        if (this.settingsSynchronizer) {
            this.settingsSynchronizer.dispose();
            this.settingsSynchronizer = undefined;
        }
        this.panel = undefined;
        this.connection = undefined;
        this.settingsManager = undefined;
    }

    /**
     * Dispose of the webview panel
     */
    dispose(): void {
        if (this.panel) {
            logger.appendLine('Disposing webview panel');
            this.panel.dispose();
        }
        this.cleanup();
    }
}