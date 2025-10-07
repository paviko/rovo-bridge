import * as vscode from 'vscode';
import {BackendConnection, BackendLauncher} from '../backend/BackendLauncher';
import {SettingsManager} from '../settings/SettingsManager';
import {errorHandler} from '../utils/ErrorHandler';
import {WebviewController} from './WebviewController';

/**
 * Webview view provider for the RovoBridge activity bar view.
 * Displays the Terminal Bridge directly inside the view.
 */
export class ActivityBarProvider implements vscode.WebviewViewProvider {
    dispose(): void {
        try { this.controller?.dispose(); } catch {}
    }
    private context: vscode.ExtensionContext;
    private backendLauncher: BackendLauncher;
    private settingsManager: SettingsManager;

    private connection?: BackendConnection;
    private controller?: WebviewController;

    constructor(context: vscode.ExtensionContext, backendLauncher: BackendLauncher, settingsManager: SettingsManager) {
        this.context = context;
        this.backendLauncher = backendLauncher;
        this.settingsManager = settingsManager;
    }

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        // If already initialized, do not reinitialize to preserve state
        if (this.controller) {
            return;
        }

        // Configure webview options
        // WebviewView does not support retainContextWhenHidden in code.
        // Use package.json contributes.views or registration options instead.
        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
                vscode.Uri.joinPath(this.context.extensionUri, 'out')
            ]
        };

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Starting RovoBridge...',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ increment: 0, message: 'Launching backend...' });
                const connection = await this.backendLauncher.launchBackend();
                this.connection = connection;

                progress.report({ increment: 50, message: 'Loading web UI...' });
                this.controller = new WebviewController({
                    webview: webviewView.webview,
                    context: this.context,
                    settingsManager: this.settingsManager,
                });
                await this.controller.load(connection);

                progress.report({ increment: 100, message: 'Ready!' });
            } catch (error) {
                await errorHandler.handleWebviewLoadError(
                    error instanceof Error ? error : new Error(String(error))
                );
                throw error;
            }
        });
    }
}
