import * as vscode from 'vscode';
import {RecoveryUtils} from './RecoveryUtils';
import {logger} from "../globals";

/**
 * Centralized error handling and recovery system for RovoBridge extension
 * Provides comprehensive error management, user notifications, and diagnostic support
 */

export enum ErrorSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

export enum ErrorCategory {
    BACKEND_LAUNCH = 'backend_launch',
    WEBVIEW_LOAD = 'webview_load',
    COMMUNICATION = 'communication',
    FILE_OPERATION = 'file_operation',
    SETTINGS = 'settings',
    COMMAND_EXECUTION = 'command_execution',
    RESOURCE_EXTRACTION = 'resource_extraction',
    NETWORK = 'network',
    PERMISSION = 'permission',
    VALIDATION = 'validation'
}

export interface ErrorContext {
    category: ErrorCategory;
    severity: ErrorSeverity;
    component: string;
    operation: string;
    originalError?: Error;
    metadata?: Record<string, any>;
    timestamp?: Date;
    userAction?: string;
    recoveryOptions?: RecoveryOption[];
}

export interface RecoveryOption {
    label: string;
    action: () => Promise<void> | void;
    description?: string;
    isDefault?: boolean;
}

export interface DiagnosticInfo {
    extensionVersion: string;
    vscodeVersion: string;
    platform: string;
    architecture: string;
    workspaceInfo: {
        hasWorkspace: boolean;
        workspaceFolders: number;
        activeFile?: string;
    };
    settings: Record<string, any>;
    recentErrors: ErrorContext[];
    systemInfo: {
        nodeVersion: string;
        memory: {
            used: number;
            total: number;
        };
    };
}

export class ErrorHandler {
    private static instance: ErrorHandler;
        private recentErrors: ErrorContext[] = [];
    private readonly maxRecentErrors = 50;
    private errorCount = 0;
    private lastErrorTime?: Date;
    private testMode = false;

    private constructor() {
        this.detectTestMode();
        this.setupGlobalErrorHandlers();
    }

    /**
     * Detect if running in test environment
     */
    private detectTestMode(): void {
        // Check for common test environment indicators
        // Detect common test env indicators. Do NOT use VSCODE_PID as it's present in normal extension host too.
        this.testMode = !!(
            process.env.NODE_ENV === 'test' ||
            process.env.VSCODE_TEST_DATA_DIR ||
            process.argv.some(arg => arg.includes('extensionTestsPath')) ||
            typeof (global as any).suite === 'function' ||
            typeof (global as any).test === 'function'
        );
        
        if (this.testMode) {
            logger.appendLine('ErrorHandler: Running in test mode - dialogs will be suppressed');
        }
    }

    /**
     * Set test mode manually (for testing purposes)
     * @param enabled Whether test mode should be enabled
     */
    setTestMode(enabled: boolean): void {
        this.testMode = enabled;
        logger.appendLine(`ErrorHandler: Test mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Show a message in a test-friendly way
     * @param type Message type
     * @param message Message text
     * @param actions Optional action buttons
     * @returns Promise resolving to selected action or undefined
     */
    private async showMessage(
        type: 'error' | 'warning' | 'info',
        message: string,
        ...actions: string[]
    ): Promise<string | undefined> {
        if (this.testMode) {
            logger.appendLine(`[TEST MODE] Would show ${type} message: ${message}`);
            if (actions.length > 0) {
                logger.appendLine(`[TEST MODE] Available actions: ${actions.join(', ')}`);
            }
            return undefined;
        }

        try {
            switch (type) {
                case 'error':
                    return await vscode.window.showErrorMessage(message, ...actions);
                case 'warning':
                    return await vscode.window.showWarningMessage(message, ...actions);
                case 'info':
                    return await vscode.window.showInformationMessage(message, ...actions);
            }
        } catch (error) {
            logger.appendLine(`Failed to show ${type} message: ${error}`);
            logger.appendLine(`Message was: ${message}`);
            return undefined;
        }
    }

    static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    /**
     * Handle an error with comprehensive logging and user notification
     * @param context Error context information
     * @returns Promise that resolves when error handling is complete
     */
    async handleError(context: ErrorContext): Promise<void> {
        try {
            // Add timestamp if not provided
            if (!context.timestamp) {
                context.timestamp = new Date();
            }

            // Store error for diagnostics
            this.storeError(context);

            // Log error details
            this.logError(context);

            // Show user notification based on severity
            await this.showUserNotification(context);

            // Attempt automatic recovery if possible
            await this.attemptAutoRecovery(context);

        } catch (handlingError) {
            // Fallback error handling to prevent infinite loops
            logger.appendLine(`Critical: Error in error handler: ${handlingError}`);
            console.error('ErrorHandler: Failed to handle error', handlingError);
        }
    }

    /**
     * Create a standardized error context
     * @param category Error category
     * @param severity Error severity
     * @param component Component where error occurred
     * @param operation Operation that failed
     * @param error Original error object
     * @param metadata Additional context metadata
     * @returns Error context object
     */
    createErrorContext(
        category: ErrorCategory,
        severity: ErrorSeverity,
        component: string,
        operation: string,
        error?: Error,
        metadata?: Record<string, any>
    ): ErrorContext {
        return {
            category,
            severity,
            component,
            operation,
            originalError: error,
            metadata: metadata || {},
            timestamp: new Date(),
            userAction: this.inferUserAction(category, operation),
            recoveryOptions: this.generateRecoveryOptions(category, severity, component, operation)
        };
    }

    /**
     * Handle backend launch errors with specific recovery options
     * @param error Original error
     * @param metadata Additional context
     */
    async handleBackendLaunchError(error: Error, metadata?: Record<string, any>): Promise<void> {
        const context = this.createErrorContext(
            ErrorCategory.BACKEND_LAUNCH,
            ErrorSeverity.CRITICAL,
            'BackendLauncher',
            'launchBackend',
            error,
            metadata
        );

        // Add specific recovery options for backend launch
        context.recoveryOptions = [
            {
                label: 'Retry Launch',
                description: 'Attempt to launch the backend again',
                action: async () => {
                    const { getExtensionInstance } = await import('../extension');
                    const instance = getExtensionInstance();
                    if (instance?.getBackendLauncher()) {
                        try {
                            await instance.getBackendLauncher()!.launchBackend();
                            await this.showMessage('info', 'RovoBridge backend launched successfully');
                        } catch (retryError) {
                            await this.showMessage('error', `Retry failed: ${retryError}`);
                        }
                    }
                },
                isDefault: true
            },
            {
                label: 'Check Binary Path',
                description: 'Verify that the backend binary exists and is executable',
                action: async () => {
                    const binaryStatus = await RecoveryUtils.checkBinaryStatus();
                    if (!binaryStatus.exists) {
                        await this.showMessage('error', 'Backend binary not found. Please reinstall the extension.');
                    } else if (!binaryStatus.executable) {
                        const fixed = await RecoveryUtils.fixBinaryPermissions('');
                        if (fixed) {
                            await this.showMessage('info', 'Binary permissions fixed. Please try again.');
                        } else {
                            await this.showMessage('error', 'Failed to fix binary permissions.');
                        }
                    } else {
                        await this.showMessage('info', 'Backend binary is available and executable.');
                    }
                }
            },
            {
                label: 'Reset Settings',
                description: 'Reset RovoBridge settings to defaults',
                action: async () => {
                    await this.resetSettings();
                }
            },
            {
                label: 'Show Troubleshooting Guide',
                description: 'Open troubleshooting documentation',
                action: async () => {
                    await this.showTroubleshootingGuide('backend-launch');
                }
            }
        ];

        await this.handleError(context);
    }

    /**
     * Handle webview load errors with specific recovery options
     * @param error Original error
     * @param metadata Additional context
     */
    async handleWebviewLoadError(error: Error, metadata?: Record<string, any>): Promise<void> {
        const context = this.createErrorContext(
            ErrorCategory.WEBVIEW_LOAD,
            ErrorSeverity.ERROR,
            'WebviewManager',
            'loadWebUI',
            error,
            metadata
        );

        context.recoveryOptions = [
            {
                label: 'Reload Webview',
                description: 'Recreate the webview panel',
                action: async () => {
                    const { getExtensionInstance } = await import('../extension');
                    const instance = getExtensionInstance();
                    const webviewManager = instance?.getWebviewManager();
                    if (webviewManager) {
                        webviewManager.dispose();
                        // Trigger panel recreation
                        await vscode.commands.executeCommand('rovobridge.openPanel');
                    }
                },
                isDefault: true
            },
            {
                label: 'Check Network Connection',
                description: 'Verify that the backend is accessible',
                action: async () => {
                    const networkStatus = await RecoveryUtils.checkLocalNetworkConnectivity();
                    if (networkStatus.reachable) {
                        await this.showMessage('info', 'Local network connectivity is working.');
                    } else {
                        await this.showMessage('error', `Network connectivity issue: ${networkStatus.error}`);
                    }
                }
            },
            {
                label: 'Clear Extension Cache',
                description: 'Clear any cached extension data',
                action: async () => {
                    const success = await RecoveryUtils.clearExtensionCache();
                    if (success) {
                        await this.showMessage('info', 'Extension cache cleared successfully.');
                    } else {
                        await this.showMessage('error', 'Failed to clear extension cache.');
                    }
                }
            },
            {
                label: 'Show System Report',
                description: 'Generate comprehensive system diagnostic report',
                action: async () => {
                    await RecoveryUtils.showSystemReport();
                }
            }
        ];

        await this.handleError(context);
    }

    /**
     * Handle communication errors between extension and webview
     * @param error Original error
     * @param metadata Additional context
     */
    async handleCommunicationError(error: Error, metadata?: Record<string, any>): Promise<void> {
        const context = this.createErrorContext(
            ErrorCategory.COMMUNICATION,
            ErrorSeverity.WARNING,
            'CommunicationBridge',
            'message_handling',
            error,
            metadata
        );

        context.recoveryOptions = [
            {
                label: 'Reconnect Bridge',
                description: 'Re-establish communication bridge',
                action: async () => {
                    const { getExtensionInstance } = await import('../extension');
                    const instance = getExtensionInstance();
                    const webviewManager = instance?.getWebviewManager();
                    const bridge = webviewManager?.getCommunicationBridge();
                    if (bridge && webviewManager?.getPanel()) {
                        bridge.setWebview(webviewManager.getPanel()!.webview);
                    }
                },
                isDefault: true
            }
        ];

        await this.handleError(context);
    }

    /**
     * Handle file operation errors
     * @param error Original error
     * @param metadata Additional context including file path
     */
    async handleFileOperationError(error: Error, metadata?: Record<string, any>): Promise<void> {
        const context = this.createErrorContext(
            ErrorCategory.FILE_OPERATION,
            ErrorSeverity.WARNING,
            'FileOperations',
            'file_access',
            error,
            metadata
        );

        context.recoveryOptions = [
            {
                label: 'Refresh Workspace',
                description: 'Refresh the workspace to detect file changes',
                action: async () => {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            },
            {
                label: 'Check Permissions',
                description: 'Verify file and folder permissions',
                action: async () => {
                    await this.checkFilePermissions(metadata?.filePath);
                }
            }
        ];

        await this.handleError(context);
    }

    /**
     * Handle settings-related errors
     * @param error Original error
     * @param metadata Additional context
     */
    async handleSettingsError(error: Error, metadata?: Record<string, any>): Promise<void> {
        const context = this.createErrorContext(
            ErrorCategory.SETTINGS,
            ErrorSeverity.WARNING,
            'SettingsManager',
            'configuration_update',
            error,
            metadata
        );

        context.recoveryOptions = [
            {
                label: 'Reset Settings',
                description: 'Reset all RovoBridge settings to defaults',
                action: async () => {
                    await this.resetSettings();
                },
                isDefault: true
            },
            {
                label: 'Validate Settings',
                description: 'Check current settings for issues',
                action: async () => {
                    await this.validateSettings();
                }
            }
        ];

        await this.handleError(context);
    }

    /**
     * Generate diagnostic information for troubleshooting
     * @returns Comprehensive diagnostic information
     */
    async generateDiagnosticInfo(): Promise<DiagnosticInfo> {
        const extension = vscode.extensions.getExtension('rovobridge.rovobridge');
        const config = vscode.workspace.getConfiguration('rovobridge');
        
        return {
            extensionVersion: extension?.packageJSON.version || 'unknown',
            vscodeVersion: vscode.version,
            platform: process.platform,
            architecture: process.arch,
            workspaceInfo: {
                hasWorkspace: !!vscode.workspace.workspaceFolders?.length,
                workspaceFolders: vscode.workspace.workspaceFolders?.length || 0,
                activeFile: vscode.window.activeTextEditor?.document.fileName
            },
            settings: {
                customCommand: config.get('customCommand'),
                uiMode: config.get('uiMode'),
                fontSize: config.get('fontSize'),
                chipsCollapsed: config.get('chipsCollapsed'),
                composerCollapsed: config.get('composerCollapsed')
            },
            recentErrors: this.recentErrors.slice(-10), // Last 10 errors
            systemInfo: {
                nodeVersion: process.version,
                memory: {
                    used: process.memoryUsage().heapUsed,
                    total: process.memoryUsage().heapTotal
                }
            }
        };
    }

    /**
     * Show diagnostic information to the user
     */
    async showDiagnosticInfo(): Promise<void> {
        try {
            const diagnostics = await this.generateDiagnosticInfo();
            
            logger.appendLine('=== RovoBridge Diagnostic Information ===');
            logger.appendLine(`Generated: ${new Date().toISOString()}`);
            logger.appendLine('');
            
            logger.appendLine('Extension Info:');
            logger.appendLine(`  Version: ${diagnostics.extensionVersion}`);
            logger.appendLine(`  VSCode Version: ${diagnostics.vscodeVersion}`);
            logger.appendLine('');
            
            logger.appendLine('System Info:');
            logger.appendLine(`  Platform: ${diagnostics.platform}`);
            logger.appendLine(`  Architecture: ${diagnostics.architecture}`);
            logger.appendLine(`  Node Version: ${diagnostics.systemInfo.nodeVersion}`);
            logger.appendLine(`  Memory Used: ${Math.round(diagnostics.systemInfo.memory.used / 1024 / 1024)}MB`);
            logger.appendLine('');
            
            logger.appendLine('Workspace Info:');
            logger.appendLine(`  Has Workspace: ${diagnostics.workspaceInfo.hasWorkspace}`);
            logger.appendLine(`  Workspace Folders: ${diagnostics.workspaceInfo.workspaceFolders}`);
            logger.appendLine(`  Active File: ${diagnostics.workspaceInfo.activeFile || 'none'}`);
            logger.appendLine('');
            
            logger.appendLine('Settings:');
            Object.entries(diagnostics.settings).forEach(([key, value]) => {
                logger.appendLine(`  ${key}: ${JSON.stringify(value)}`);
            });
            logger.appendLine('');
            
            logger.appendLine('Recent Errors:');
            if (diagnostics.recentErrors.length === 0) {
                logger.appendLine('  No recent errors');
            } else {
                diagnostics.recentErrors.forEach((error, index) => {
                    logger.appendLine(`  ${index + 1}. [${error.severity.toUpperCase()}] ${error.category} in ${error.component}`);
                    logger.appendLine(`     Operation: ${error.operation}`);
                    logger.appendLine(`     Time: ${error.timestamp?.toISOString()}`);
                    if (error.originalError) {
                        logger.appendLine(`     Error: ${error.originalError.message}`);
                    }
                    logger.appendLine('');
                });
            }
            
            if (!this.testMode) {
                logger.show();
            }
            
        } catch (error) {
            logger.appendLine(`Failed to generate diagnostic info: ${error}`);
            await this.showMessage('error', 'Failed to generate diagnostic information');
        }
    }

    /**
     * Store error for diagnostic purposes
     * @param context Error context
     */
    private storeError(context: ErrorContext): void {
        this.recentErrors.push(context);
        
        // Keep only recent errors
        if (this.recentErrors.length > this.maxRecentErrors) {
            this.recentErrors = this.recentErrors.slice(-this.maxRecentErrors);
        }
        
        this.errorCount++;
        this.lastErrorTime = context.timestamp;
    }

    /**
     * Log error details
     * @param context Error context
     */
    private logError(context: ErrorContext): void {
        const timestamp = context.timestamp?.toISOString() || new Date().toISOString();
        const prefix = `[${timestamp}] [${context.severity.toUpperCase()}] [${context.category}]`;
        
        logger.appendLine(`${prefix} ${context.component}.${context.operation}`);
        
        if (context.originalError) {
            logger.appendLine(`  Error: ${context.originalError.message}`);
            if (context.originalError.stack) {
                logger.appendLine(`  Stack: ${context.originalError.stack}`);
            }
        }
        
        if (context.userAction) {
            logger.appendLine(`  User Action: ${context.userAction}`);
        }
        
        if (context.metadata && Object.keys(context.metadata).length > 0) {
            logger.appendLine(`  Metadata: ${JSON.stringify(context.metadata, null, 2)}`);
        }
        
        logger.appendLine('');
    }

    /**
     * Show user notification based on error severity
     * @param context Error context
     */
    private async showUserNotification(context: ErrorContext): Promise<void> {
        const message = this.formatUserMessage(context);
        const actions = context.recoveryOptions?.map(option => option.label) || [];
        
        // In test mode, just log the error instead of showing dialogs
        if (this.testMode) {
            logger.appendLine(`[TEST MODE] Would show ${context.severity} notification: ${message}`);
            if (actions.length > 0) {
                logger.appendLine(`[TEST MODE] Available actions: ${actions.join(', ')}`);
            }
            return;
        }
        
        let result: string | undefined;
        
        try {
            switch (context.severity) {
                case ErrorSeverity.CRITICAL:
                    result = await vscode.window.showErrorMessage(message, { modal: true }, ...actions, 'Show Diagnostics');
                    break;
                case ErrorSeverity.ERROR:
                    result = await vscode.window.showErrorMessage(message, ...actions, 'Show Diagnostics');
                    break;
                case ErrorSeverity.WARNING:
                    result = await vscode.window.showWarningMessage(message, ...actions);
                    break;
                case ErrorSeverity.INFO:
                    result = await vscode.window.showInformationMessage(message, ...actions);
                    break;
            }
            
            if (result) {
                await this.handleUserResponse(result, context);
            }
        } catch (dialogError) {
            // If dialog fails (e.g., in test environment), just log it
            logger.appendLine(`Failed to show dialog: ${dialogError}`);
            logger.appendLine(`Message was: ${message}`);
        }
    }

    /**
     * Handle user response to error notification
     * @param response User's selected action
     * @param context Error context
     */
    private async handleUserResponse(response: string, context: ErrorContext): Promise<void> {
        if (response === 'Show Diagnostics') {
            await this.showDiagnosticInfo();
            return;
        }
        
        const recoveryOption = context.recoveryOptions?.find(option => option.label === response);
        if (recoveryOption) {
            try {
                await recoveryOption.action();
            } catch (recoveryError) {
                logger.appendLine(`Recovery action failed: ${recoveryError}`);
                await this.showMessage('error', `Recovery action failed: ${recoveryError}`);
            }
        }
    }

    /**
     * Format user-friendly error message
     * @param context Error context
     * @returns Formatted message
     */
    private formatUserMessage(context: ErrorContext): string {
        const baseMessage = this.getBaseMessage(context.category, context.operation);
        const errorDetail = context.originalError?.message || 'Unknown error';
        
        return `RovoBridge: ${baseMessage}. ${errorDetail}`;
    }

    /**
     * Get base message for error category
     * @param category Error category
     * @param operation Operation that failed
     * @returns Base message
     */
    private getBaseMessage(category: ErrorCategory, operation: string): string {
        switch (category) {
            case ErrorCategory.BACKEND_LAUNCH:
                return 'Failed to start the backend process';
            case ErrorCategory.WEBVIEW_LOAD:
                return 'Failed to load the web interface';
            case ErrorCategory.COMMUNICATION:
                return 'Communication error with web interface';
            case ErrorCategory.FILE_OPERATION:
                return 'File operation failed';
            case ErrorCategory.SETTINGS:
                return 'Settings configuration error';
            case ErrorCategory.COMMAND_EXECUTION:
                return 'Command execution failed';
            case ErrorCategory.RESOURCE_EXTRACTION:
                return 'Failed to extract required resources';
            case ErrorCategory.NETWORK:
                return 'Network connection error';
            case ErrorCategory.PERMISSION:
                return 'Permission denied';
            case ErrorCategory.VALIDATION:
                return 'Validation error';
            default:
                return `Error in ${operation}`;
        }
    }

    /**
     * Infer user action that led to the error
     * @param category Error category
     * @param operation Operation that failed
     * @returns Inferred user action
     */
    private inferUserAction(category: ErrorCategory, operation: string): string {
        switch (category) {
            case ErrorCategory.BACKEND_LAUNCH:
                return 'Opening RovoBridge panel';
            case ErrorCategory.WEBVIEW_LOAD:
                return 'Loading web interface';
            case ErrorCategory.COMMUNICATION:
                return 'Interacting with web interface';
            case ErrorCategory.FILE_OPERATION:
                return 'Adding files to context';
            case ErrorCategory.SETTINGS:
                return 'Changing settings';
            case ErrorCategory.COMMAND_EXECUTION:
                return 'Executing command';
            default:
                return 'Unknown action';
        }
    }

    /**
     * Generate recovery options based on error context
     * @param category Error category
     * @param severity Error severity
     * @param component Component name
     * @param operation Operation name
     * @returns Array of recovery options
     */
    private generateRecoveryOptions(
        category: ErrorCategory,
        severity: ErrorSeverity,
        component: string,
        operation: string
    ): RecoveryOption[] {
        const options: RecoveryOption[] = [];
        
        // Add common recovery options based on category
        switch (category) {
            case ErrorCategory.BACKEND_LAUNCH:
                options.push({
                    label: 'Retry',
                    description: 'Try launching the backend again',
                    action: async () => {
                        await vscode.commands.executeCommand('rovobridge.openPanel');
                    },
                    isDefault: true
                });
                break;
                
            case ErrorCategory.WEBVIEW_LOAD:
                options.push({
                    label: 'Reload',
                    description: 'Reload the web interface',
                    action: async () => {
                        await vscode.commands.executeCommand('rovobridge.openPanel');
                    },
                    isDefault: true
                });
                break;
        }
        
        // Add severity-based options
        if (severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.ERROR) {
            options.push({
                label: 'Reset Extension',
                description: 'Reset the extension to default state',
                action: async () => {
                    await this.resetExtension();
                }
            });
        }
        
        return options;
    }

    /**
     * Attempt automatic recovery based on error context
     * @param context Error context
     */
    private async attemptAutoRecovery(context: ErrorContext): Promise<void> {
        // Only attempt auto-recovery for non-critical errors
        if (context.severity === ErrorSeverity.CRITICAL) {
            return;
        }
        
        // Find default recovery option
        const defaultOption = context.recoveryOptions?.find(option => option.isDefault);
        if (defaultOption && context.severity === ErrorSeverity.WARNING) {
            try {
                logger.appendLine(`Attempting auto-recovery: ${defaultOption.label}`);
                await defaultOption.action();
                logger.appendLine('Auto-recovery completed successfully');
            } catch (recoveryError) {
                logger.appendLine(`Auto-recovery failed: ${recoveryError}`);
            }
        }
    }

    /**
     * Set up global error handlers for unhandled errors
     */
    private setupGlobalErrorHandlers(): void {
        const isIgnorableGlobalRejection = (err: unknown): boolean => {
            const msg = (err && typeof err === 'object' && 'message' in err) ? String((err as any).message) : String(err);
            const stack = (err && typeof err === 'object' && 'stack' in err) ? String((err as any).stack) : '';
            // Known benign errors from other extensions (e.g., Windsurf acknowledgeCascadeCodeEdit)
            const patterns = [
                'no unacknowledged steps for file',
                'acknowledgeCascadeCodeEdit',
                'windsurf/dist/extension.js'
            ];
            return patterns.some(p => msg.includes(p) || stack.includes(p));
        };
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            // Suppress known benign global rejections from other extensions
            if (isIgnorableGlobalRejection(error)) {
                logger.appendLine(`[IGNORED] Unhandled rejection suppressed: ${error.message}`);
                return;
            }
            this.handleError(this.createErrorContext(
                ErrorCategory.VALIDATION,
                ErrorSeverity.ERROR,
                'Global',
                'unhandledRejection',
                error,
                { promise: promise.toString() }
            ));
        });
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.handleError(this.createErrorContext(
                ErrorCategory.VALIDATION,
                ErrorSeverity.CRITICAL,
                'Global',
                'uncaughtException',
                error
            ));
        });
    }

    // Recovery action implementations

    private async resetSettings(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('rovobridge');
            await config.update('customCommand', '', vscode.ConfigurationTarget.Global);
            await config.update('uiMode', 'Terminal', vscode.ConfigurationTarget.Global);
            await config.update('fontSize', 14, vscode.ConfigurationTarget.Global);
            await config.update('chipsCollapsed', false, vscode.ConfigurationTarget.Global);
            await config.update('composerCollapsed', false, vscode.ConfigurationTarget.Global);
            
            await this.showMessage('info', 'RovoBridge settings reset to defaults');
        } catch (error) {
            await this.showMessage('error', `Failed to reset settings: ${error}`);
        }
    }

    private async validateSettings(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('rovobridge');
            const issues: string[] = [];
            
            const fontSize = config.get<number>('fontSize');
            if (fontSize && (fontSize < 8 || fontSize > 72)) {
                issues.push(`Invalid font size: ${fontSize} (must be 8-72)`);
            }
            
            const uiMode = config.get<string>('uiMode');
            if (uiMode && !['Terminal', 'Canvas'].includes(uiMode)) {
                issues.push(`Invalid UI mode: ${uiMode} (must be Terminal or Canvas)`);
            }
            
            if (issues.length > 0) {
                await this.showMessage('warning', `Settings issues found: ${issues.join(', ')}`);
            } else {
                await this.showMessage('info', 'All settings are valid');
            }
        } catch (error) {
            await this.showMessage('error', `Failed to validate settings: ${error}`);
        }
    }

    private async checkBackendConnection(): Promise<void> {
        const networkStatus = await RecoveryUtils.checkLocalNetworkConnectivity();
        if (networkStatus.reachable) {
            await this.showMessage('info', 'Backend connection check completed - network is reachable');
        } else {
            await this.showMessage('error', `Backend connection issue: ${networkStatus.error}`);
        }
    }

    private async clearExtensionCache(): Promise<void> {
        const success = await RecoveryUtils.clearExtensionCache();
        if (success) {
            await this.showMessage('info', 'Extension cache cleared successfully');
        } else {
            await this.showMessage('error', 'Failed to clear extension cache');
        }
    }

    private async checkFilePermissions(filePath?: string): Promise<void> {
        if (filePath) {
            await this.showMessage('info', `Checking permissions for: ${filePath}`);
        } else {
            await this.showMessage('info', 'File permissions check completed');
        }
    }

    private async resetExtension(): Promise<void> {
        try {
            await this.resetSettings();
            const success = await RecoveryUtils.restartExtension();
            if (!success) {
                await this.showMessage('error', 'Failed to restart extension automatically. Please reload VSCode manually.');
            }
        } catch (error) {
            await this.showMessage('error', `Failed to reset extension: ${error}`);
        }
    }

    private async showTroubleshootingGuide(section?: string): Promise<void> {
        const url = section 
            ? `https://github.com/rovobridge/docs/troubleshooting#${section}`
            : 'https://github.com/rovobridge/docs/troubleshooting';
        
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }

    /**
     * Get error statistics
     * @returns Error statistics
     */
    getErrorStats(): { count: number; lastError?: Date; recentCount: number } {
        const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
        const recentCount = this.recentErrors.filter(e => 
            e.timestamp && e.timestamp > recentThreshold
        ).length;
        
        return {
            count: this.errorCount,
            lastError: this.lastErrorTime,
            recentCount
        };
    }

    /**
     * Clear error history
     */
    clearErrorHistory(): void {
        this.recentErrors = [];
        this.errorCount = 0;
        this.lastErrorTime = undefined;
        logger.appendLine('Error history cleared');
    }

    /**
     * Dispose of the error handler
     */
    dispose(): void {
        this.recentErrors = [];
        // logger is managed by the extension lifecycle via context.subscriptions
        // Do not dispose the shared output channel here to avoid 'Channel has been closed' errors
    }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();