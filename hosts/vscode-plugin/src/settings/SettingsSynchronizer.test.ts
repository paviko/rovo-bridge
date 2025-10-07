import * as vscode from 'vscode';
import {SettingsManager} from './SettingsManager';
import {SettingsSynchronizer} from './SettingsSynchronizer';

/**
 * Basic tests for SettingsSynchronizer
 * These tests verify the real-time synchronization functionality
 */

// Mock webview panel for testing
class MockWebviewPanel implements Partial<vscode.WebviewPanel> {
    public disposed = false;
    public visible = true;
    private messageHandlers: ((message: any) => void)[] = [];
    private disposeHandlers: (() => void)[] = [];

    webview = {
        postMessage: (message: any) => {
            this.messageHandlers.forEach(handler => handler(message));
        }
    } as any;

    onDidDispose(handler: () => void): vscode.Disposable {
        this.disposeHandlers.push(handler);
        return new vscode.Disposable(() => {
            const index = this.disposeHandlers.indexOf(handler);
            if (index >= 0) {
                this.disposeHandlers.splice(index, 1);
            }
        });
    }

    onDidChangeViewState(): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    dispose(): void {
        this.disposed = true;
        this.disposeHandlers.forEach(handler => handler());
    }

    // Helper method to simulate receiving messages
    onMessage(handler: (message: any) => void): void {
        this.messageHandlers.push(handler);
    }
}

/**
 * Test suite for SettingsSynchronizer
 */
export class SettingsSynchronizerTests {
    private settingsManager: SettingsManager;
    private synchronizer: SettingsSynchronizer;
    private mockPanel: MockWebviewPanel;

    constructor() {
        this.settingsManager = new SettingsManager();
        this.synchronizer = new SettingsSynchronizer(this.settingsManager);
        this.mockPanel = new MockWebviewPanel();
    }

    /**
     * Test initialization of synchronizer
     */
    testInitialization(): boolean {
        try {
            const disposable = this.synchronizer.initialize(this.mockPanel as any);
            
            // Check that synchronizer is active
            if (!this.synchronizer.isActive()) {
                console.error('Synchronizer should be active after initialization');
                return false;
            }

            // Check that communication bridge is set
            const bridge = this.synchronizer.getCommunicationBridge();
            if (!bridge) {
                console.error('Communication bridge should be set correctly');
                return false;
            }

            disposable.dispose();
            console.log('✓ Initialization test passed');
            return true;

        } catch (error) {
            console.error('Initialization test failed:', error);
            return false;
        }
    }

    /**
     * Test font size synchronization
     */
    async testFontSizeSync(): Promise<boolean> {
        try {
            let receivedMessage: any = null;
            
            // Set up message listener
            this.mockPanel.onMessage((message) => {
                if (message.type === 'setFontSize') {
                    receivedMessage = message;
                }
            });

            // Initialize synchronizer
            const disposable = this.synchronizer.initialize(this.mockPanel as any);

            // Update font size setting
            await this.settingsManager.updateSetting('fontSize', 18);

            // Give some time for async operations
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check if message was sent
            if (!receivedMessage) {
                console.error('Font size sync message not received');
                return false;
            }

            if (receivedMessage.size !== 18) {
                console.error('Font size value not correct in sync message');
                return false;
            }

            disposable.dispose();
            console.log('✓ Font size sync test passed');
            return true;

        } catch (error) {
            console.error('Font size sync test failed:', error);
            return false;
        }
    }

    /**
     * Test custom command synchronization
     */
    async testCustomCommandSync(): Promise<boolean> {
        try {
            let receivedMessage: any = null;
            
            // Set up message listener
            this.mockPanel.onMessage((message) => {
                if (message.type === 'updateSessionCommand') {
                    receivedMessage = message;
                }
            });

            // Initialize synchronizer
            const disposable = this.synchronizer.initialize(this.mockPanel as any);

            // Update custom command setting
            await this.settingsManager.updateSetting('customCommand', 'npm test');

            // Give some time for async operations
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check if message was sent
            if (!receivedMessage) {
                console.error('Custom command sync message not received');
                return false;
            }

            if (receivedMessage.command !== 'npm test') {
                console.error('Custom command value not correct in sync message');
                return false;
            }

            disposable.dispose();
            console.log('✓ Custom command sync test passed');
            return true;

        } catch (error) {
            console.error('Custom command sync test failed:', error);
            return false;
        }
    }

    /**
     * Test cleanup and disposal
     */
    testCleanup(): boolean {
        try {
            // Initialize synchronizer
            const disposable = this.synchronizer.initialize(this.mockPanel as any);

            // Verify it's active
            if (!this.synchronizer.isActive()) {
                console.error('Synchronizer should be active');
                return false;
            }

            // Dispose
            disposable.dispose();

            // Verify it's no longer active
            if (this.synchronizer.isActive()) {
                console.error('Synchronizer should not be active after disposal');
                return false;
            }

            console.log('✓ Cleanup test passed');
            return true;

        } catch (error) {
            console.error('Cleanup test failed:', error);
            return false;
        }
    }

    /**
     * Run all tests
     */
    async runAllTests(): Promise<boolean> {
        console.log('Running SettingsSynchronizer tests...');
        
        const results = [
            this.testInitialization(),
            await this.testFontSizeSync(),
            await this.testCustomCommandSync(),
            this.testCleanup()
        ];

        const passed = results.filter(r => r).length;
        const total = results.length;

        console.log(`\nTest Results: ${passed}/${total} passed`);
        
        if (passed === total) {
            console.log('✓ All SettingsSynchronizer tests passed!');
            return true;
        } else {
            console.log('✗ Some SettingsSynchronizer tests failed');
            return false;
        }
    }

    /**
     * Cleanup test resources
     */
    dispose(): void {
        this.synchronizer.dispose();
        this.settingsManager.dispose();
        this.mockPanel.dispose();
    }
}

/**
 * Export function to run tests
 */
export async function runSettingsSynchronizerTests(): Promise<boolean> {
    const tests = new SettingsSynchronizerTests();
    try {
        return await tests.runAllTests();
    } finally {
        tests.dispose();
    }
}