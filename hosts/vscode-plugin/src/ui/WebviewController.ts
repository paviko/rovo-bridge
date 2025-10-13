import * as vscode from 'vscode';
import {BackendConnection} from '../backend/BackendLauncher';
import {SettingsManager} from '../settings/SettingsManager';
import {SettingsSynchronizer} from '../settings/SettingsSynchronizer';
import {CommunicationBridge} from './CommunicationBridge';
import {FileMonitor} from '../utils/FileMonitor';
import {errorHandler} from '../utils/ErrorHandler';
import {PathInserter} from '../utils/PathInserter';
import {logger} from "../globals";

/**
 * Shared webview controller to manage common UI lifecycle and messaging
 * Used by both WebviewManager (editor tab) and ActivityBarProvider (view tab)
 */
export interface WebviewControllerOptions {
  webview: vscode.Webview;
  context: vscode.ExtensionContext;
  settingsManager?: SettingsManager;
}

export class WebviewController {
  private webview: vscode.Webview;
  private context: vscode.ExtensionContext;
  private settingsManager?: SettingsManager;
  private settingsSynchronizer?: SettingsSynchronizer;
  private communicationBridge?: CommunicationBridge;
  private fileMonitor?: FileMonitor;
  private connection?: BackendConnection;
  private disposables: vscode.Disposable[] = [];

  constructor(opts: WebviewControllerOptions) {
    this.webview = opts.webview;
    this.context = opts.context;
    this.settingsManager = opts.settingsManager;
  }

  getCommunicationBridge(): CommunicationBridge | undefined {
    return this.communicationBridge;
  }

  async load(connection: BackendConnection): Promise<void> {
    this.connection = connection;

    try {
      // Initialize communication bridge
      this.communicationBridge = new CommunicationBridge({
        webview: this.webview,
        context: this.context,
        onStateChange: async (key: string, value: any) => {
          try {
            if (this.settingsSynchronizer) {
              await this.settingsSynchronizer.handleWebviewSettingsChange(key as any, value);
            } else {
              const config = vscode.workspace.getConfiguration('rovobridge');
              await config.update(key, value, vscode.ConfigurationTarget.Global);
            }
          } catch (settingsError) {
            await errorHandler.handleSettingsError(
              settingsError instanceof Error ? settingsError : new Error(String(settingsError)),
              { key, value }
            );
          }
        }
      });

      // Configure callbacks for extended message handling
      this.communicationBridge.setUILoadedCallback(async (success: boolean, error?: string) => {
        if (success) {
          // Initialize web UI after it loads
          setTimeout(() => this.initializeWebUI(), 300);
        } else {
          vscode.window.showErrorMessage(`RovoBridge UI failed to load: ${error}`);
        }
      });


      this.communicationBridge.setReadUrisCallback(async (uris: string[]) => {
        await this.handleReadUris(uris);
      });

      // Make PathInserter aware of the active communication bridge
      try { PathInserter.setCommunicationBridge(this.communicationBridge); } catch {}


      // Initialize file monitor (best effort)
      try {
        this.fileMonitor = new FileMonitor();
        this.fileMonitor.startMonitoring((files: string[], current?: string) => {
          try {
            this.communicationBridge?.updateOpenedFiles(files, current);
          } catch (e) {
            logger.appendLine(`updateOpenedFiles failed: ${e}`);
          }
        });
      } catch (e) {
        logger.appendLine(`FileMonitor init failed: ${e}`);
      }

      // Initialize settings synchronizer if settings manager provided
      if (this.settingsManager && this.communicationBridge) {
        try {
          this.settingsSynchronizer = new SettingsSynchronizer(this.settingsManager);
          const syncDisposable = this.settingsSynchronizer.initialize(this.communicationBridge);
          this.disposables.push(syncDisposable);
        } catch (e) {
          logger.appendLine(`SettingsSynchronizer init failed: ${e}`);
        }
      }

      const urlWithMode = this.buildUiUrlWithMode(connection.uiBase);
      const html = await this.generateHtmlContent(urlWithMode, connection.token);
      this.webview.html = html;

      // Message handling is now done entirely by CommunicationBridge

    } catch (error) {
      await errorHandler.handleWebviewLoadError(
        error instanceof Error ? error : new Error(String(error)),
        { connection }
      );
      throw error;
    }
  }


  private async handleReadUris(uris: string[]): Promise<void> {
    try {
      logger.appendLine(`Reading ${uris.length} URIs from webview request`);
      
      // Separate files and directories for proper handling
      const filePaths: string[] = [];
      const directoryPaths: string[] = [];
      
      const results = await Promise.all(
        uris.map(async (u) => {
          try {
            const uri = vscode.Uri.parse(u);
            const filePath = uri.fsPath;
            
            // Check if it's a file or directory
            try {
              const stat = await vscode.workspace.fs.stat(uri);
              if (stat.type === vscode.FileType.File) {
                filePaths.push(filePath);
              } else if (stat.type === vscode.FileType.Directory) {
                directoryPaths.push(filePath);
              }
            } catch (statError) {
              // If stat fails, assume it's a file
              filePaths.push(filePath);
            }
            
            // Create webview-safe URI for direct display
            const webviewUri = this.webview.asWebviewUri(uri);
            
            // Optionally read file contents as base64 for fallback
            let data: string | undefined;
            try {
              const buf = await vscode.workspace.fs.readFile(uri);
              data = Buffer.from(buf).toString('base64');
            } catch (readError) {
              // File reading failed, but webviewUri might still work
            }
            
            return { 
              uri: u, 
              ok: true, 
              webviewUri: String(webviewUri), 
              data 
            };
          } catch (err) {
            return { 
              uri: u, 
              ok: false, 
              error: String(err) 
            };
          }
        })
      );
      
      // Send results back to webview for display
      this.webview.postMessage({ 
        type: 'readUrisResult', 
        results 
      });
      
      // IMPORTANT: Call insertPaths for files and pastePath for directories
      if (this.communicationBridge) {
        if (filePaths.length > 0) {
          this.communicationBridge.insertPaths(filePaths);
          logger.appendLine(`Called insertPaths with ${filePaths.length} files`);
        }
        
        for (const dirPath of directoryPaths) {
          this.communicationBridge.pastePath(dirPath);
          logger.appendLine(`Called pastePath for directory: ${dirPath}`);
        }
      } else {
        logger.appendLine('Warning: No communication bridge available to call insertPaths/pastePath');
      }
      
      logger.appendLine(`Processed ${results.length} URIs: ${filePaths.length} files, ${directoryPaths.length} directories`);
      
    } catch (error) {
      logger.appendLine(`Error handling readUris: ${error}`);
      
      // Send error response
      this.webview.postMessage({
        type: 'readUrisResult',
        results: uris.map(uri => ({
          uri,
          ok: false,
          error: 'Failed to process URI request'
        }))
      });
    }
  }

  private initializeWebUI(): void {
    if (!this.connection || !this.communicationBridge) {
      logger.appendLine('Cannot initialize WebUI: connection or bridge missing');
      return;
    }

    try {
      const config = vscode.workspace.getConfiguration('rovobridge');
      const fontSize = config.get<number>('fontSize', 14);
      const chipsCollapsed = config.get<boolean>('chipsCollapsed', false);
      const composerCollapsed = config.get<boolean>('composerCollapsed', false);
      const customCommand = config.get<string>('customCommand', '');
      const useClipboard = config.get<boolean>('useClipboard', true);

      this.communicationBridge.initializeWebUI(
        this.connection.token,
        fontSize,
        chipsCollapsed,
        composerCollapsed,
        customCommand || undefined,
        useClipboard
      );
    } catch (e) {
      logger.appendLine(`initializeWebUI failed: ${e}`);
    }
  }

  private buildUiUrlWithMode(base: string): string {
    let uiMode = 'Terminal';
    try {
      const config = vscode.workspace.getConfiguration('rovobridge');
      uiMode = config.get<string>('uiMode', 'Terminal');
    } catch {}
    return base.includes('?') ? `${base}&mode=${uiMode}` : `${base}?mode=${uiMode}`;
  }

  private async generateHtmlContent(uiUrl: string, token: string): Promise<string> {
      const htmlUri = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'webview', 'index.html');
      const bytes = await vscode.workspace.fs.readFile(htmlUri);
      let html = Buffer.from(bytes).toString('utf8');
      html = html
        .replace(/\$\{uiUrl\}/g, uiUrl)
        .replace(/\$\{cspSource\}/g, this.webview.cspSource);
      return html;
  }

  dispose(): void {
    try { this.fileMonitor?.stopMonitoring(); } catch {}
    try { this.communicationBridge?.dispose(); } catch {}
    try { PathInserter.clearCommunicationBridge(); } catch {}
    try { this.settingsSynchronizer?.dispose(); } catch {}
    for (const d of this.disposables) { try { d.dispose(); } catch {} }
    this.disposables = [];
    this.communicationBridge = undefined;
    this.fileMonitor = undefined;
    this.settingsSynchronizer = undefined;
    this.connection = undefined;
  }
}
