import * as assert from 'assert';
import {ErrorCategory, ErrorHandler, ErrorSeverity} from '../../utils/ErrorHandler';

suite('ErrorHandler Test Suite', () => {
    let testErrorHandler: ErrorHandler;

    setup(() => {
        testErrorHandler = ErrorHandler.getInstance();
        // Explicitly enable test mode to ensure dialogs are suppressed
        testErrorHandler.setTestMode(true);
    });

    teardown(() => {
        // Clear error history after each test
        testErrorHandler.clearErrorHistory();
    });

    test('Should create error context correctly', () => {
        const context = testErrorHandler.createErrorContext(
            ErrorCategory.BACKEND_LAUNCH,
            ErrorSeverity.ERROR,
            'TestComponent',
            'testOperation',
            new Error('Test error'),
            { testKey: 'testValue' }
        );

        assert.strictEqual(context.category, ErrorCategory.BACKEND_LAUNCH);
        assert.strictEqual(context.severity, ErrorSeverity.ERROR);
        assert.strictEqual(context.component, 'TestComponent');
        assert.strictEqual(context.operation, 'testOperation');
        assert.strictEqual(context.originalError?.message, 'Test error');
        assert.strictEqual(context.metadata?.testKey, 'testValue');
        assert.ok(context.timestamp);
        assert.ok(context.userAction);
        assert.ok(Array.isArray(context.recoveryOptions));
    });

    test('Should handle backend launch errors', async () => {
        const testError = new Error('Backend launch failed');
        const metadata = { workspaceRoot: '/test/workspace' };

        // This should not throw
        await testErrorHandler.handleBackendLaunchError(testError, metadata);

        const stats = testErrorHandler.getErrorStats();
        assert.strictEqual(stats.count, 1);
        assert.ok(stats.lastError);
    });

    test('Should handle webview load errors', async () => {
        const testError = new Error('Webview load failed');
        const metadata = { connection: 'test-connection' };

        // This should not throw
        await testErrorHandler.handleWebviewLoadError(testError, metadata);

        const stats = testErrorHandler.getErrorStats();
        assert.strictEqual(stats.count, 1);
    });

    test('Should handle communication errors', async () => {
        const testError = new Error('Communication failed');
        const metadata = { operation: 'test-operation' };

        // This should not throw
        await testErrorHandler.handleCommunicationError(testError, metadata);

        const stats = testErrorHandler.getErrorStats();
        assert.strictEqual(stats.count, 1);
    });

    test('Should handle file operation errors', async () => {
        const testError = new Error('File operation failed');
        const metadata = { filePath: '/test/file.txt' };

        // This should not throw
        await testErrorHandler.handleFileOperationError(testError, metadata);

        const stats = testErrorHandler.getErrorStats();
        assert.strictEqual(stats.count, 1);
    });

    test('Should handle settings errors', async () => {
        const testError = new Error('Settings error');
        const metadata = { key: 'testKey', value: 'testValue' };

        // This should not throw
        await testErrorHandler.handleSettingsError(testError, metadata);

        const stats = testErrorHandler.getErrorStats();
        assert.strictEqual(stats.count, 1);
    });

    test('Should generate diagnostic information', async () => {
        // Add some test errors first
        await testErrorHandler.handleError(testErrorHandler.createErrorContext(
            ErrorCategory.BACKEND_LAUNCH,
            ErrorSeverity.ERROR,
            'TestComponent',
            'testOperation',
            new Error('Test error 1')
        ));

        await testErrorHandler.handleError(testErrorHandler.createErrorContext(
            ErrorCategory.WEBVIEW_LOAD,
            ErrorSeverity.WARNING,
            'TestComponent2',
            'testOperation2',
            new Error('Test error 2')
        ));

        const diagnostics = await testErrorHandler.generateDiagnosticInfo();

        assert.ok(diagnostics.extensionVersion);
        assert.ok(diagnostics.vscodeVersion);
        assert.ok(diagnostics.platform);
        assert.ok(diagnostics.architecture);
        assert.ok(diagnostics.workspaceInfo);
        assert.ok(diagnostics.settings);
        assert.ok(diagnostics.systemInfo);
        assert.ok(Array.isArray(diagnostics.recentErrors));
        assert.strictEqual(diagnostics.recentErrors.length, 2);
    });

    test('Should track error statistics correctly', async () => {
        const initialStats = testErrorHandler.getErrorStats();
        const initialCount = initialStats.count;

        // Add multiple errors
        await testErrorHandler.handleError(testErrorHandler.createErrorContext(
            ErrorCategory.BACKEND_LAUNCH,
            ErrorSeverity.ERROR,
            'TestComponent',
            'testOperation1',
            new Error('Test error 1')
        ));

        await testErrorHandler.handleError(testErrorHandler.createErrorContext(
            ErrorCategory.WEBVIEW_LOAD,
            ErrorSeverity.WARNING,
            'TestComponent',
            'testOperation2',
            new Error('Test error 2')
        ));

        const finalStats = testErrorHandler.getErrorStats();
        assert.strictEqual(finalStats.count, initialCount + 2);
        assert.ok(finalStats.lastError);
        assert.strictEqual(finalStats.recentCount, 2);
    });

    test('Should clear error history', async () => {
        // Add some errors
        await testErrorHandler.handleError(testErrorHandler.createErrorContext(
            ErrorCategory.BACKEND_LAUNCH,
            ErrorSeverity.ERROR,
            'TestComponent',
            'testOperation',
            new Error('Test error')
        ));

        let stats = testErrorHandler.getErrorStats();
        assert.ok(stats.count > 0);

        // Clear history
        testErrorHandler.clearErrorHistory();

        stats = testErrorHandler.getErrorStats();
        assert.strictEqual(stats.count, 0);
        assert.strictEqual(stats.recentCount, 0);
        assert.ok(!stats.lastError);
    });

    test('Should generate recovery options based on error category', () => {
        const backendContext = testErrorHandler.createErrorContext(
            ErrorCategory.BACKEND_LAUNCH,
            ErrorSeverity.ERROR,
            'BackendLauncher',
            'launchBackend',
            new Error('Backend failed')
        );

        assert.ok(backendContext.recoveryOptions);
        assert.ok(backendContext.recoveryOptions.length > 0);
        
        // Should have retry option for backend launch
        const retryOption = backendContext.recoveryOptions.find(opt => 
            opt.label.toLowerCase().includes('retry')
        );
        assert.ok(retryOption);

        const webviewContext = testErrorHandler.createErrorContext(
            ErrorCategory.WEBVIEW_LOAD,
            ErrorSeverity.ERROR,
            'WebviewManager',
            'loadWebUI',
            new Error('Webview failed')
        );

        assert.ok(webviewContext.recoveryOptions);
        assert.ok(webviewContext.recoveryOptions.length > 0);
        
        // Should have reload option for webview load
        const reloadOption = webviewContext.recoveryOptions.find(opt => 
            opt.label.toLowerCase().includes('reload')
        );
        assert.ok(reloadOption);
    });

    test('Should handle errors without throwing exceptions', async () => {
        // Test that error handling itself doesn't throw
        const testCases = [
            () => testErrorHandler.handleBackendLaunchError(new Error('Test')),
            () => testErrorHandler.handleWebviewLoadError(new Error('Test')),
            () => testErrorHandler.handleCommunicationError(new Error('Test')),
            () => testErrorHandler.handleFileOperationError(new Error('Test')),
            () => testErrorHandler.handleSettingsError(new Error('Test'))
        ];

        for (const testCase of testCases) {
            try {
                await testCase();
                // Should not throw
                assert.ok(true);
            } catch (error) {
                assert.fail(`Error handler threw exception: ${error}`);
            }
        }
    });

    test('Should validate error severity levels', () => {
        const severities = [
            ErrorSeverity.INFO,
            ErrorSeverity.WARNING,
            ErrorSeverity.ERROR,
            ErrorSeverity.CRITICAL
        ];

        for (const severity of severities) {
            const context = testErrorHandler.createErrorContext(
                ErrorCategory.VALIDATION,
                severity,
                'TestComponent',
                'testOperation',
                new Error('Test error')
            );

            assert.strictEqual(context.severity, severity);
        }
    });

    test('Should validate error categories', () => {
        const categories = [
            ErrorCategory.BACKEND_LAUNCH,
            ErrorCategory.WEBVIEW_LOAD,
            ErrorCategory.COMMUNICATION,
            ErrorCategory.FILE_OPERATION,
            ErrorCategory.SETTINGS,
            ErrorCategory.COMMAND_EXECUTION,
            ErrorCategory.RESOURCE_EXTRACTION,
            ErrorCategory.NETWORK,
            ErrorCategory.PERMISSION,
            ErrorCategory.VALIDATION
        ];

        for (const category of categories) {
            const context = testErrorHandler.createErrorContext(
                category,
                ErrorSeverity.ERROR,
                'TestComponent',
                'testOperation',
                new Error('Test error')
            );

            assert.strictEqual(context.category, category);
        }
    });

    test('Should handle test mode correctly', async () => {
        // Test mode should be enabled by default in tests
        testErrorHandler.setTestMode(true);
        
        // This should not show any dialogs and should not throw
        await testErrorHandler.handleError(testErrorHandler.createErrorContext(
            ErrorCategory.BACKEND_LAUNCH,
            ErrorSeverity.CRITICAL,
            'TestComponent',
            'testOperation',
            new Error('Test error in test mode')
        ));
        
        // Should complete without hanging
        assert.ok(true, 'Test mode error handling completed successfully');
        
        // Test disabling test mode (but don't actually show dialogs)
        testErrorHandler.setTestMode(false);
        testErrorHandler.setTestMode(true); // Re-enable for other tests
    });
});