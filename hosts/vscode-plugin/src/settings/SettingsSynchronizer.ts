import * as vscode from 'vscode';
import {RovoBridgeSettings, SettingsManager} from './SettingsManager';
import {CommunicationBridge} from '../ui/CommunicationBridge';
import {logger} from "../globals";

/**
 * Real-time settings synchronization - mirrors FontSizeSynchronizer.kt and RovoBridgeConfigurable.kt
 * Handles configuration change listeners and propagates updates to webview
 */
export class SettingsSynchronizer {
    private settingsManager: SettingsManager;
    private communicationBridge?: CommunicationBridge;
    private configurationListener?: vscode.Disposable;
    private isInitialized = false;
    
    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;
    }

    /**
     * Initialize settings synchronization with communication bridge
     * @param communicationBridge The communication bridge to synchronize with
     * @returns Disposable to stop synchronization
     */
    initialize(communicationBridge: CommunicationBridge): vscode.Disposable {
        this.communicationBridge = communicationBridge;
        this.isInitialized = true;

        // Set up configuration change listener
        this.configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('rovobridge')) {
                this.handleConfigurationChange(event);
            }
        });

        logger.appendLine('Settings synchronization initialized with CommunicationBridge');

        // Return disposable to stop synchronization
        return new vscode.Disposable(() => {
            this.cleanup();
        });
    }

    /**
     * Initialize settings synchronization with webview panel (legacy method)
     * @param webviewPanel The webview panel to synchronize with
     * @returns Disposable to stop synchronization
     * @deprecated Use initialize(communicationBridge) instead
     */
    initializeWithWebview(webviewPanel: vscode.WebviewPanel): vscode.Disposable {
        logger.appendLine('Warning: Using deprecated initializeWithWebview method');
        
        // Set up webview disposal listener
        const webviewDisposalListener = webviewPanel.onDidDispose(() => {
            this.cleanup();
        });

        // Set up configuration change listener
        this.configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('rovobridge')) {
                this.handleConfigurationChange(event);
            }
        });

        this.isInitialized = true;
        logger.appendLine('Settings synchronization initialized with webview panel (legacy mode)');

        // Return combined disposable
        return new vscode.Disposable(() => {
            this.cleanup();
            webviewDisposalListener.dispose();
        });
    }

    /**
     * Handle configuration changes and propagate to webview
     * @param event Configuration change event
     */
    private handleConfigurationChange(event: vscode.ConfigurationChangeEvent): void {
        if (!this.isInitialized || !this.communicationBridge) {
            return;
        }

        try {
            const settings = this.settingsManager.getSettings();
            
            // Check which specific settings changed and update accordingly
            if (event.affectsConfiguration('rovobridge.fontSize')) {
                this.syncFontSize(settings.fontSize);
            }

            if (event.affectsConfiguration('rovobridge.customCommand')) {
                this.syncCustomCommand(settings.customCommand);
            }

            if (event.affectsConfiguration('rovobridge.chipsCollapsed')) {
                this.syncChipsCollapsed(settings.chipsCollapsed);
            }

            if (event.affectsConfiguration('rovobridge.composerCollapsed')) {
                this.syncComposerCollapsed(settings.composerCollapsed);
            }

            if (event.affectsConfiguration('rovobridge.uiMode')) {
                this.syncUiMode(settings.uiMode);
            }

            if (event.affectsConfiguration('rovobridge.useClipboard')) {
                this.syncUseClipboard(settings.useClipboard);
            }

            logger.appendLine('Configuration changes synchronized to webview');

        } catch (error) {
            logger.appendLine(`Failed to handle configuration change: ${error}`);
            console.error('Settings synchronization error:', error);
        }
    }

    /**
     * Synchronize font size changes to webview using unified messaging
     * @param fontSize New font size value
     */
    private syncFontSize(fontSize: number): void {
        if (!this.communicationBridge) {
            logger.appendLine('No communication bridge available to sync font size');
            return;
        }

        try {
            this.communicationBridge.setFontSize(fontSize);
            logger.appendLine(`Font size synchronized: ${fontSize}`);
        } catch (error) {
            logger.appendLine(`Failed to sync font size: ${error}`);
        }
    }

    /**
     * Synchronize custom command changes to webview using unified messaging
     * @param customCommand New custom command value
     */
    private syncCustomCommand(customCommand: string): void {
        if (!this.communicationBridge) {
            logger.appendLine('No communication bridge available to sync custom command');
            return;
        }

        try {
            this.communicationBridge.updateSessionCommand(customCommand);
            logger.appendLine(`Custom command synchronized: ${customCommand}`);
        } catch (error) {
            logger.appendLine(`Failed to sync custom command: ${error}`);
        }
    }

    /**
     * Synchronize chips collapsed state to webview using unified messaging
     * @param chipsCollapsed New chips collapsed state
     */
    private syncChipsCollapsed(chipsCollapsed: boolean): void {
        if (!this.communicationBridge) {
            logger.appendLine('No communication bridge available to sync chips collapsed state');
            return;
        }

        try {
            this.communicationBridge.setChipsCollapsed(chipsCollapsed);
            logger.appendLine(`Chips collapsed state synchronized: ${chipsCollapsed}`);
        } catch (error) {
            logger.appendLine(`Failed to sync chips collapsed state: ${error}`);
        }
    }

    /**
     * Synchronize composer collapsed state to webview using unified messaging
     * @param composerCollapsed New composer collapsed state
     */
    private syncComposerCollapsed(composerCollapsed: boolean): void {
        if (!this.communicationBridge) {
            logger.appendLine('No communication bridge available to sync composer collapsed state');
            return;
        }

        try {
            this.communicationBridge.setComposerCollapsed(composerCollapsed);
            logger.appendLine(`Composer collapsed state synchronized: ${composerCollapsed}`);
        } catch (error) {
            logger.appendLine(`Failed to sync composer collapsed state: ${error}`);
        }
    }

    /**
     * Synchronize useClipboard changes to webview using unified messaging
     * @param useClipboard New useClipboard value
     */
    private syncUseClipboard(useClipboard: boolean): void {
        if (!this.communicationBridge) {
            logger.appendLine('No communication bridge available to sync useClipboard');
            return;
        }

        try {
            this.communicationBridge.updateUseClipboard(useClipboard);
            logger.appendLine(`UseClipboard synchronized: ${useClipboard}`);
        } catch (error) {
            logger.appendLine(`Failed to sync useClipboard: ${error}`);
        }
    }

    /**
     * Synchronize UI mode changes to webview
     * Note: UI mode changes may require webview reload for full effect
     * @param uiMode New UI mode value
     */
    private syncUiMode(uiMode: 'Terminal' | 'Canvas'): void {
        if (!this.communicationBridge) {
            logger.appendLine('No communication bridge available to sync UI mode');
            return;
        }

        try {
            // For UI mode changes, we may need to reload the webview with new parameters
            // This is similar to how the JetBrains plugin handles mode changes
            logger.appendLine(`UI mode changed to: ${uiMode} (may require webview reload)`);
            
            // Send unified message for UI mode change
            this.communicationBridge.sendMessage({
                type: 'updateUIState',
                // UI mode is not directly part of updateUIState, but we can extend it
                // For now, log the change - full implementation may require webview reload
            });

        } catch (error) {
            logger.appendLine(`Failed to sync UI mode: ${error}`);
        }
    }

    /**
     * Manually trigger synchronization of all settings
     * Useful for initial setup or forced refresh
     */
    syncAllSettings(): void {
        if (!this.isInitialized || !this.communicationBridge) {
            logger.appendLine('Cannot sync settings: not initialized or no communication bridge');
            return;
        }

        try {
            const settings = this.settingsManager.getSettings();
            
            // Sync all settings using unified messaging
            this.syncFontSize(settings.fontSize);
            this.syncCustomCommand(settings.customCommand);
            this.syncChipsCollapsed(settings.chipsCollapsed);
            this.syncComposerCollapsed(settings.composerCollapsed);
            this.syncUiMode(settings.uiMode);
            this.syncUseClipboard(settings.useClipboard);

            logger.appendLine('All settings synchronized using unified messaging');

        } catch (error) {
            logger.appendLine(`Failed to sync all settings: ${error}`);
            console.error('Failed to sync all settings:', error);
        }
    }

    /**
     * Handle settings changes from the webview (bi-directional sync)
     * @param key Settings key that changed
     * @param value New value
     */
    async handleWebviewSettingsChange(key: keyof RovoBridgeSettings, value: any): Promise<void> {
        try {
            // Update the setting in VSCode configuration
            // This will trigger the configuration change listener, but we need to avoid infinite loops
            await this.settingsManager.updateSetting(key, value);
            
            logger.appendLine(`Setting updated from webview: ${key} = ${value}`);

        } catch (error) {
            logger.appendLine(`Failed to handle webview settings change: ${error}`);
            console.error('Failed to handle webview settings change:', error);
        }
    }

    /**
     * Check if synchronization is active
     * @returns True if synchronization is initialized and active
     */
    isActive(): boolean {
        return this.isInitialized && !!this.communicationBridge;
    }

    /**
     * Get current communication bridge
     * @returns Current communication bridge or undefined
     */
    getCommunicationBridge(): CommunicationBridge | undefined {
        return this.communicationBridge;
    }

    /**
     * Clean up resources and stop synchronization
     */
    private cleanup(): void {
        if (this.configurationListener) {
            this.configurationListener.dispose();
            this.configurationListener = undefined;
        }

        this.communicationBridge = undefined;
        this.isInitialized = false;
        
        logger.appendLine('Settings synchronization cleaned up');
    }

    /**
     * Dispose of the synchronizer and clean up resources
     */
    dispose(): void {
        this.cleanup();
        // Do not dispose the shared logger here; it's managed by the extension lifecycle
    }
}