import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {logger} from "../globals";

/**
 * Recovery utilities for RovoBridge extension
 * Provides helper functions for error recovery and system diagnostics
 */

export class RecoveryUtils {
    
    /**
     * Check if the backend binary exists and is executable
     * @param binaryPath Path to the backend binary
     * @returns Promise resolving to diagnostic information
     */
    static async checkBinaryStatus(binaryPath?: string): Promise<{
        exists: boolean;
        executable: boolean;
        size?: number;
        error?: string;
    }> {
        try {
            if (!binaryPath) {
                // Try to determine binary path
                const extension = vscode.extensions.getExtension('rovobridge.rovobridge');
                if (!extension) {
                    return { exists: false, executable: false, error: 'Extension not found' };
                }

                const platform = process.platform;
                const arch = process.arch;
                const binaryName = platform === 'win32' ? 'rovo-bridge.exe' : 'rovo-bridge';
                binaryPath = path.join(extension.extensionPath, 'resources', 'bin', platform, arch, binaryName);
            }

            const stats = await fs.promises.stat(binaryPath);
            const isExecutable = await this.checkExecutablePermissions(binaryPath);

            return {
                exists: true,
                executable: isExecutable,
                size: stats.size
            };

        } catch (error) {
            return {
                exists: false,
                executable: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Check if a file has executable permissions
     * @param filePath Path to the file
     * @returns Promise resolving to true if executable
     */
    private static async checkExecutablePermissions(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK | fs.constants.X_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Attempt to fix binary permissions
     * @param binaryPath Path to the binary
     * @returns Promise resolving to success status
     */
    static async fixBinaryPermissions(binaryPath: string): Promise<boolean> {
        try {
            if (process.platform !== 'win32') {
                // On Unix-like systems, try to make the binary executable
                await fs.promises.chmod(binaryPath, 0o755);
                logger.appendLine(`Fixed permissions for: ${binaryPath}`);
                return true;
            }
            return true; // Windows doesn't need chmod
        } catch (error) {
            logger.appendLine(`Failed to fix permissions for ${binaryPath}: ${error}`);
            return false;
        }
    }

    /**
     * Check network connectivity to localhost
     * @param port Port to check (optional)
     * @returns Promise resolving to connectivity status
     */
    static async checkLocalNetworkConnectivity(port?: number): Promise<{
        reachable: boolean;
        port?: number;
        error?: string;
    }> {
        try {
            const net = await import('net');
            
            return new Promise((resolve) => {
                const testPort = port || 0; // Use 0 for any available port if not specified
                const server = net.createServer();
                
                server.listen(testPort, '127.0.0.1', () => {
                    const address = server.address();
                    const actualPort = typeof address === 'object' && address ? address.port : testPort;
                    
                    server.close(() => {
                        resolve({
                            reachable: true,
                            port: actualPort
                        });
                    });
                });
                
                server.on('error', (error) => {
                    resolve({
                        reachable: false,
                        error: error.message
                    });
                });
            });
        } catch (error) {
            return {
                reachable: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Check workspace health
     * @returns Workspace diagnostic information
     */
    static checkWorkspaceHealth(): {
        hasWorkspace: boolean;
        workspaceFolders: number;
        activeFile?: string;
        workspaceRoot?: string;
        issues: string[];
    } {
        const issues: string[] = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const activeEditor = vscode.window.activeTextEditor;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            issues.push('No workspace folders open');
        }

        return {
            hasWorkspace: !!(workspaceFolders && workspaceFolders.length > 0),
            workspaceFolders: workspaceFolders?.length || 0,
            activeFile: activeEditor?.document.fileName,
            workspaceRoot: workspaceFolders?.[0]?.uri.fsPath,
            issues
        };
    }

    /**
     * Check extension health
     * @returns Extension diagnostic information
     */
    static checkExtensionHealth(): {
        isActive: boolean;
        version?: string;
        hasRequiredFiles: boolean;
        issues: string[];
    } {
        const issues: string[] = [];
        const extension = vscode.extensions.getExtension('rovobridge.rovobridge');

        if (!extension) {
            issues.push('Extension not found in VSCode');
            return {
                isActive: false,
                hasRequiredFiles: false,
                issues
            };
        }

        if (!extension.isActive) {
            issues.push('Extension is not active');
        }

        // Check for required files
        const requiredPaths = [
            'out/extension.js',
            'resources/bin'
        ];

        let hasRequiredFiles = true;
        for (const requiredPath of requiredPaths) {
            const fullPath = path.join(extension.extensionPath, requiredPath);
            try {
                fs.accessSync(fullPath, fs.constants.F_OK);
            } catch {
                issues.push(`Missing required file: ${requiredPath}`);
                hasRequiredFiles = false;
            }
        }

        return {
            isActive: extension.isActive,
            version: extension.packageJSON.version,
            hasRequiredFiles,
            issues
        };
    }

    /**
     * Check system requirements
     * @returns System requirements diagnostic information
     */
    static checkSystemRequirements(): {
        platform: string;
        architecture: string;
        nodeVersion: string;
        vscodeVersion: string;
        supportedPlatform: boolean;
        issues: string[];
    } {
        const issues: string[] = [];
        const platform = process.platform;
        const arch = process.arch;

        // Check if platform/architecture is supported
        const supportedCombinations = [
            'win32-x64',
            'darwin-x64',
            'darwin-arm64',
            'linux-x64',
            'linux-arm64'
        ];

        const currentCombination = `${platform}-${arch}`;
        const supportedPlatform = supportedCombinations.includes(currentCombination);

        if (!supportedPlatform) {
            issues.push(`Unsupported platform/architecture: ${currentCombination}`);
        }

        // Check Node.js version (VSCode requirement)
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        if (majorVersion < 16) {
            issues.push(`Node.js version ${nodeVersion} may be too old (recommended: 16+)`);
        }

        return {
            platform,
            architecture: arch,
            nodeVersion,
            vscodeVersion: vscode.version,
            supportedPlatform,
            issues
        };
    }

    /**
     * Attempt to restart the extension
     * @returns Promise resolving to success status
     */
    static async restartExtension(): Promise<boolean> {
        try {
            // Reload the window to restart the extension
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
            return true;
        } catch (error) {
            logger.appendLine(`Failed to restart extension: ${error}`);
            return false;
        }
    }

    /**
     * Clear extension cache and temporary files
     * @returns Promise resolving to success status
     */
    static async clearExtensionCache(): Promise<boolean> {
        try {
            const extension = vscode.extensions.getExtension('rovobridge.rovobridge');
            if (!extension) {
                return false;
            }

            // Clear any temporary files in the extension directory
            const tempDir = path.join(extension.extensionPath, 'temp');
            try {
                await fs.promises.rmdir(tempDir, { recursive: true });
                logger.appendLine('Cleared extension temporary files');
            } catch {
                // Directory might not exist, which is fine
            }

            return true;
        } catch (error) {
            logger.appendLine(`Failed to clear extension cache: ${error}`);
            return false;
        }
    }

    /**
     * Generate a comprehensive system report
     * @returns Promise resolving to system report
     */
    static async generateSystemReport(): Promise<string> {
        const report: string[] = [];
        
        report.push('=== RovoBridge System Report ===');
        report.push(`Generated: ${new Date().toISOString()}`);
        report.push('');

        // System requirements
        const systemReqs = this.checkSystemRequirements();
        report.push('System Requirements:');
        report.push(`  Platform: ${systemReqs.platform}`);
        report.push(`  Architecture: ${systemReqs.architecture}`);
        report.push(`  Node Version: ${systemReqs.nodeVersion}`);
        report.push(`  VSCode Version: ${systemReqs.vscodeVersion}`);
        report.push(`  Supported Platform: ${systemReqs.supportedPlatform}`);
        if (systemReqs.issues.length > 0) {
            report.push('  Issues:');
            systemReqs.issues.forEach(issue => report.push(`    - ${issue}`));
        }
        report.push('');

        // Extension health
        const extensionHealth = this.checkExtensionHealth();
        report.push('Extension Health:');
        report.push(`  Active: ${extensionHealth.isActive}`);
        report.push(`  Version: ${extensionHealth.version || 'unknown'}`);
        report.push(`  Required Files: ${extensionHealth.hasRequiredFiles}`);
        if (extensionHealth.issues.length > 0) {
            report.push('  Issues:');
            extensionHealth.issues.forEach(issue => report.push(`    - ${issue}`));
        }
        report.push('');

        // Workspace health
        const workspaceHealth = this.checkWorkspaceHealth();
        report.push('Workspace Health:');
        report.push(`  Has Workspace: ${workspaceHealth.hasWorkspace}`);
        report.push(`  Workspace Folders: ${workspaceHealth.workspaceFolders}`);
        report.push(`  Active File: ${workspaceHealth.activeFile || 'none'}`);
        report.push(`  Workspace Root: ${workspaceHealth.workspaceRoot || 'none'}`);
        if (workspaceHealth.issues.length > 0) {
            report.push('  Issues:');
            workspaceHealth.issues.forEach(issue => report.push(`    - ${issue}`));
        }
        report.push('');

        // Binary status
        const binaryStatus = await this.checkBinaryStatus();
        report.push('Binary Status:');
        report.push(`  Exists: ${binaryStatus.exists}`);
        report.push(`  Executable: ${binaryStatus.executable}`);
        if (binaryStatus.size !== undefined) {
            report.push(`  Size: ${binaryStatus.size} bytes`);
        }
        if (binaryStatus.error) {
            report.push(`  Error: ${binaryStatus.error}`);
        }
        report.push('');

        // Network connectivity
        const networkStatus = await this.checkLocalNetworkConnectivity();
        report.push('Network Connectivity:');
        report.push(`  Localhost Reachable: ${networkStatus.reachable}`);
        if (networkStatus.port) {
            report.push(`  Test Port: ${networkStatus.port}`);
        }
        if (networkStatus.error) {
            report.push(`  Error: ${networkStatus.error}`);
        }
        report.push('');

        return report.join('\n');
    }

    /**
     * Show system report in a new document
     */
    static async showSystemReport(): Promise<void> {
        try {
            const report = await this.generateSystemReport();
            
            const document = await vscode.workspace.openTextDocument({
                content: report,
                language: 'plaintext'
            });
            
            await vscode.window.showTextDocument(document);
        } catch (error) {
            logger.appendLine(`Failed to show system report: ${error}`);
            vscode.window.showErrorMessage('Failed to generate system report');
        }
    }

    /**
     * Dispose of resources
     */
    static dispose(): void {
        // No-op: do not dispose the shared logger here; it's managed by the extension lifecycle
    }
}