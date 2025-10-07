import * as vscode from 'vscode';
import {RovoBridgeSettings, SettingsManager} from './SettingsManager';
import {SettingsSynchronizer} from './SettingsSynchronizer';
import {FontSizeMonitor} from '../utils/FontSizeMonitor';
import {CommunicationBridge} from '../ui/CommunicationBridge';

/**
 * Example usage of SettingsManager with real-time synchronization
 * This file demonstrates how to use the SettingsManager, SettingsSynchronizer, and FontSizeMonitor in the extension
 */

export class SettingsExample {
    private settingsManager: SettingsManager;
    private settingsSynchronizer?: SettingsSynchronizer;
    private fontSizeMonitor?: FontSizeMonitor;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.settingsManager = new SettingsManager();
        this.fontSizeMonitor = new FontSizeMonitor(this.settingsManager);
    }

    /**
     * Initialize settings management with real-time synchronization
     */
    initialize(): void {
        // Initialize settings monitoring
        const configDisposable = this.settingsManager.initialize();
        this.disposables.push(configDisposable);

        // Listen for settings changes
        const changeDisposable = this.settingsManager.onSettingsChange((settings) => {
            console.log('Settings changed:', settings);
            this.handleSettingsChange(settings);
        });
        this.disposables.push(changeDisposable);

        // Add font size monitor to disposables
        if (this.fontSizeMonitor) {
            this.disposables.push(new vscode.Disposable(() => {
                this.fontSizeMonitor?.dispose();
            }));
        }

        // Get initial settings
        const currentSettings = this.settingsManager.getSettings();
        console.log('Initial settings:', currentSettings);
    }

    /**
     * Initialize synchronization with communication bridge
     * Call this when creating a webview panel for real-time sync
     */
    initializeWebviewSync(communicationBridge: CommunicationBridge): void {
        // Create and initialize settings synchronizer
        this.settingsSynchronizer = new SettingsSynchronizer(this.settingsManager);
        const syncDisposable = this.settingsSynchronizer.initialize(communicationBridge);
        
        this.disposables.push(syncDisposable);
        
        // Sync all settings initially
        this.settingsSynchronizer.syncAllSettings();
        
        console.log('Settings synchronization initialized with webview');
    }

    /**
     * Start font size monitoring from backend
     * Call this when backend connection is established
     */
    startFontSizeMonitoring(backendPort: number, backendToken: string): void {
        if (this.fontSizeMonitor) {
            this.fontSizeMonitor.startMonitoring(backendPort, backendToken);
            console.log(`Font size monitoring started on port ${backendPort}`);
        }
    }

    /**
     * Stop font size monitoring
     * Call this when backend connection is closed
     */
    stopFontSizeMonitoring(): void {
        if (this.fontSizeMonitor) {
            this.fontSizeMonitor.stopMonitoring();
            console.log('Font size monitoring stopped');
        }
    }

    /**
     * Example: Update font size setting
     */
    async updateFontSize(fontSize: number): Promise<void> {
        try {
            await this.settingsManager.updateSetting('fontSize', fontSize);
            console.log(`Font size updated to ${fontSize}`);
        } catch (error) {
            console.error('Failed to update font size:', error);
            vscode.window.showErrorMessage(`Failed to update font size: ${error}`);
        }
    }

    /**
     * Example: Update UI mode setting
     */
    async updateUIMode(uiMode: 'Terminal' | 'Canvas'): Promise<void> {
        try {
            await this.settingsManager.updateSetting('uiMode', uiMode);
            console.log(`UI mode updated to ${uiMode}`);
        } catch (error) {
            console.error('Failed to update UI mode:', error);
            vscode.window.showErrorMessage(`Failed to update UI mode: ${error}`);
        }
    }

    /**
     * Example: Update multiple settings at once
     */
    async updateMultipleSettings(updates: Partial<RovoBridgeSettings>): Promise<void> {
        try {
            await this.settingsManager.updateSettings(updates);
            console.log('Multiple settings updated:', updates);
        } catch (error) {
            console.error('Failed to update settings:', error);
            vscode.window.showErrorMessage(`Failed to update settings: ${error}`);
        }
    }

    /**
     * Example: Get current settings
     */
    getCurrentSettings(): RovoBridgeSettings {
        return this.settingsManager.getSettings();
    }

    /**
     * Handle settings changes with real-time synchronization
     */
    private handleSettingsChange(settings: RovoBridgeSettings): void {
        // With SettingsSynchronizer, changes are automatically propagated to webview
        console.log('Settings changed - auto-sync to webview:', {
            fontSize: settings.fontSize,
            uiMode: settings.uiMode,
            chipsCollapsed: settings.chipsCollapsed,
            composerCollapsed: settings.composerCollapsed,
            customCommand: settings.customCommand
        });

        // The synchronizer handles:
        // - Font size changes -> window.__setFontSize(fontSize)
        // - Custom command changes -> window.__updateSessionCommand(command)
        // - Chips collapsed -> window.__setChipsCollapsed(collapsed)
        // - Composer collapsed -> window.__setComposerCollapsed(collapsed)
    }

    /**
     * Example: Handle settings change from webview (bi-directional sync)
     */
    async handleWebviewSettingsChange(key: keyof RovoBridgeSettings, value: any): Promise<void> {
        if (this.settingsSynchronizer) {
            try {
                await this.settingsSynchronizer.handleWebviewSettingsChange(key, value);
                console.log(`Setting ${key} updated from webview: ${value}`);
            } catch (error) {
                console.error(`Failed to handle webview settings change: ${error}`);
            }
        }
    }

    /**
     * Check if synchronization is active
     */
    isSyncActive(): boolean {
        return this.settingsSynchronizer?.isActive() ?? false;
    }

    /**
     * Check if font size monitoring is active
     */
    isFontMonitoringActive(): boolean {
        return this.fontSizeMonitor?.isActive() ?? false;
    }

    /**
     * Cleanup resources
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        
        if (this.settingsSynchronizer) {
            this.settingsSynchronizer.dispose();
        }
        
        if (this.fontSizeMonitor) {
            this.fontSizeMonitor.dispose();
        }
        
        this.settingsManager.dispose();
    }
}

/**
 * Example command handlers that could be registered in extension.ts
 * These demonstrate real-time synchronization capabilities
 */
export class SettingsCommands {
    constructor(
        private settingsManager: SettingsManager,
        private settingsSynchronizer?: SettingsSynchronizer,
        private fontSizeMonitor?: FontSizeMonitor
    ) {}

    /**
     * Command to toggle chips collapsed state
     */
    async toggleChipsCollapsed(): Promise<void> {
        const currentSettings = this.settingsManager.getSettings();
        await this.settingsManager.updateSetting('chipsCollapsed', !currentSettings.chipsCollapsed);
    }

    /**
     * Command to toggle composer collapsed state
     */
    async toggleComposerCollapsed(): Promise<void> {
        const currentSettings = this.settingsManager.getSettings();
        await this.settingsManager.updateSetting('composerCollapsed', !currentSettings.composerCollapsed);
    }

    /**
     * Command to reset settings to defaults
     */
    async resetToDefaults(): Promise<void> {
        const defaults = SettingsManager.getDefaults();
        await this.settingsManager.updateSettings(defaults);
        vscode.window.showInformationMessage('Settings reset to defaults (auto-synced to webview)');
    }

    /**
     * Command to increase font size (with real-time sync)
     */
    async increaseFontSize(): Promise<void> {
        const currentSettings = this.settingsManager.getSettings();
        const newSize = Math.min(72, currentSettings.fontSize + 2);
        await this.settingsManager.updateSetting('fontSize', newSize);
        vscode.window.showInformationMessage(`Font size increased to ${newSize} (auto-synced to webview)`);
    }

    /**
     * Command to decrease font size (with real-time sync)
     */
    async decreaseFontSize(): Promise<void> {
        const currentSettings = this.settingsManager.getSettings();
        const newSize = Math.max(8, currentSettings.fontSize - 2);
        await this.settingsManager.updateSetting('fontSize', newSize);
        vscode.window.showInformationMessage(`Font size decreased to ${newSize} (auto-synced to webview)`);
    }

    /**
     * Command to toggle UI mode (with real-time sync)
     */
    async toggleUIMode(): Promise<void> {
        const currentSettings = this.settingsManager.getSettings();
        const newMode = currentSettings.uiMode === 'Terminal' ? 'Canvas' : 'Terminal';
        await this.settingsManager.updateSetting('uiMode', newMode);
        vscode.window.showInformationMessage(`UI mode changed to ${newMode} (auto-synced to webview)`);
    }

    /**
     * Command to manually sync all settings to webview
     */
    syncAllSettings(): void {
        if (this.settingsSynchronizer) {
            this.settingsSynchronizer.syncAllSettings();
            vscode.window.showInformationMessage('All settings synchronized to webview');
        } else {
            vscode.window.showWarningMessage('Settings synchronizer not initialized');
        }
    }

    /**
     * Command to show synchronization status
     */
    showSyncStatus(): void {
        const syncActive = this.settingsSynchronizer?.isActive() ?? false;
        const fontMonitorActive = this.fontSizeMonitor?.isActive() ?? false;
        
        const status = [
            `Settings Sync: ${syncActive ? 'Active' : 'Inactive'}`,
            `Font Monitor: ${fontMonitorActive ? 'Active' : 'Inactive'}`
        ].join('\n');
        
        vscode.window.showInformationMessage(`RovoBridge Sync Status:\n${status}`);
    }
}