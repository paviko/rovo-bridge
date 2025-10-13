import * as vscode from 'vscode';
import {errorHandler} from '../utils/ErrorHandler';
/**
 * Settings management - mirrors RovoBridgeSettings.kt and RovoBridgeConfigurable.kt
 * Handles VSCode configuration integration and real-time synchronization
 */

export interface RovoBridgeSettings {
    customCommand: string;
    uiMode: 'Terminal' | 'Canvas';
    fontSize: number;
    chipsCollapsed: boolean;
    composerCollapsed: boolean;
    useClipboard: boolean;
}

/**
 * Default settings values matching JetBrains plugin defaults
 */
const DEFAULT_SETTINGS: RovoBridgeSettings = {
    customCommand: '',
    uiMode: 'Terminal',
    fontSize: 14, // VSCode default is 14, JetBrains was 12
    chipsCollapsed: false,
    composerCollapsed: false,
    useClipboard: true
};

export class SettingsManager {
    private static readonly SECTION = 'rovobridge';
    private changeListeners: ((settings: RovoBridgeSettings) => void)[] = [];
    private configurationListener?: vscode.Disposable;

    /**
     * Get current settings from VSCode configuration
     * @returns Current RovoBridge settings with validation and defaults
     */
    getSettings(): RovoBridgeSettings {
        try {
            const config = vscode.workspace.getConfiguration(SettingsManager.SECTION);
            
            // Get values with validation and defaults
            const customCommand = config.get<string>('customCommand', DEFAULT_SETTINGS.customCommand);
            const uiMode = config.get<'Terminal' | 'Canvas'>('uiMode', DEFAULT_SETTINGS.uiMode);
            const fontSize = config.get<number>('fontSize', DEFAULT_SETTINGS.fontSize);
            const chipsCollapsed = config.get<boolean>('chipsCollapsed', DEFAULT_SETTINGS.chipsCollapsed);
            const composerCollapsed = config.get<boolean>('composerCollapsed', DEFAULT_SETTINGS.composerCollapsed);
            const useClipboard = config.get<boolean>('useClipboard', DEFAULT_SETTINGS.useClipboard);
            
            // Validate and sanitize values
            const validatedSettings: RovoBridgeSettings = {
                customCommand: typeof customCommand === 'string' ? customCommand : DEFAULT_SETTINGS.customCommand,
                uiMode: (uiMode === 'Terminal' || uiMode === 'Canvas') ? uiMode : DEFAULT_SETTINGS.uiMode,
                fontSize: (typeof fontSize === 'number' && fontSize >= 8 && fontSize <= 72) ? fontSize : DEFAULT_SETTINGS.fontSize,
                chipsCollapsed: typeof chipsCollapsed === 'boolean' ? chipsCollapsed : DEFAULT_SETTINGS.chipsCollapsed,
                composerCollapsed: typeof composerCollapsed === 'boolean' ? composerCollapsed : DEFAULT_SETTINGS.composerCollapsed,
                useClipboard: typeof useClipboard === 'boolean' ? useClipboard : DEFAULT_SETTINGS.useClipboard
            };
            
            return validatedSettings;
        } catch (error) {
            console.error('Failed to get settings, using defaults:', error);
            return { ...DEFAULT_SETTINGS };
        }
    }

    /**
     * Update a specific setting in VSCode configuration
     * @param key Setting key
     * @param value Setting value
     * @param target Configuration target (Global, Workspace, or WorkspaceFolder)
     */
    async updateSetting(
        key: keyof RovoBridgeSettings, 
        value: any, 
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration(SettingsManager.SECTION);
            
            // Validate the value based on the key
            const validatedValue = this.validateSettingValue(key, value);
            
            await config.update(key, validatedValue, target);
            
            // Notify listeners of the change
            const updatedSettings = this.getSettings();
            this.notifyListeners(updatedSettings);
            
        } catch (error) {
            console.error(`Failed to update setting ${key}:`, error);
            
            await errorHandler.handleSettingsError(
                error instanceof Error ? error : new Error(String(error)),
                { key, value, target }
            );
            
            throw error;
        }
    }

    /**
     * Update multiple settings at once
     * @param settings Partial settings object with values to update
     * @param target Configuration target
     */
    async updateSettings(
        settings: Partial<RovoBridgeSettings>, 
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration(SettingsManager.SECTION);
            
            // Update each setting
            for (const [key, value] of Object.entries(settings)) {
                const validatedValue = this.validateSettingValue(key as keyof RovoBridgeSettings, value);
                await config.update(key, validatedValue, target);
            }
            
            // Notify listeners once after all updates
            const updatedSettings = this.getSettings();
            this.notifyListeners(updatedSettings);
            
        } catch (error) {
            console.error('Failed to update settings:', error);
            
            await errorHandler.handleSettingsError(
                error instanceof Error ? error : new Error(String(error)),
                { settings, target }
            );
            
            throw error;
        }
    }

    /**
     * Add a listener for settings changes
     * @param listener Callback function for settings changes
     * @returns Disposable to remove the listener
     */
    onSettingsChange(listener: (settings: RovoBridgeSettings) => void): vscode.Disposable {
        this.changeListeners.push(listener);
        
        return new vscode.Disposable(() => {
            const index = this.changeListeners.indexOf(listener);
            if (index >= 0) {
                this.changeListeners.splice(index, 1);
            }
        });
    }

    /**
     * Initialize settings monitoring for configuration changes
     * @returns Disposable to stop monitoring
     */
    initialize(): vscode.Disposable {
        // Clean up existing listener if any
        if (this.configurationListener) {
            this.configurationListener.dispose();
        }

        // Listen for configuration changes
        this.configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(SettingsManager.SECTION)) {
                const updatedSettings = this.getSettings();
                this.notifyListeners(updatedSettings);
            }
        });
        
        return this.configurationListener;
    }

    /**
     * Validate a setting value based on its key
     * @param key Setting key
     * @param value Value to validate
     * @returns Validated value or default if invalid
     */
    private validateSettingValue(key: keyof RovoBridgeSettings, value: any): any {
        switch (key) {
            case 'customCommand':
                return typeof value === 'string' ? value : DEFAULT_SETTINGS.customCommand;
            
            case 'uiMode':
                return (value === 'Terminal' || value === 'Canvas') ? value : DEFAULT_SETTINGS.uiMode;
            
            case 'fontSize':
                return (typeof value === 'number' && value >= 8 && value <= 72) ? value : DEFAULT_SETTINGS.fontSize;
            
            case 'chipsCollapsed':
            case 'composerCollapsed':
            case 'useClipboard':
                return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[key];
            
            default:
                throw new Error(`Unknown setting key: ${key}`);
        }
    }

    /**
     * Notify all listeners of settings changes
     * @param settings Updated settings
     */
    private notifyListeners(settings: RovoBridgeSettings): void {
        for (const listener of this.changeListeners) {
            try {
                listener(settings);
            } catch (error) {
                console.error('Error in settings change listener:', error);
            }
        }
    }

    /**
     * Get default settings
     * @returns Default settings object
     */
    static getDefaults(): RovoBridgeSettings {
        return { ...DEFAULT_SETTINGS };
    }

    /**
     * Dispose of the settings manager and clean up resources
     */
    dispose(): void {
        if (this.configurationListener) {
            this.configurationListener.dispose();
            this.configurationListener = undefined;
        }
        this.changeListeners = [];
    }
}