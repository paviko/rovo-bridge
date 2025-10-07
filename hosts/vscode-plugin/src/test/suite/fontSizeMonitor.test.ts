import * as assert from 'assert';
import {FontSizeMonitor} from '../../utils/FontSizeMonitor';
import {SettingsManager} from '../../settings/SettingsManager';

suite('FontSizeMonitor Test Suite', () => {
    let fontSizeMonitor: FontSizeMonitor;
    let settingsManager: SettingsManager;

    setup(() => {
        settingsManager = new SettingsManager();
        fontSizeMonitor = new FontSizeMonitor(settingsManager);
    });

    teardown(() => {
        fontSizeMonitor.dispose();
    });

    test('FontSizeMonitor should initialize correctly', () => {
        assert.strictEqual(fontSizeMonitor.isActive(), false);
        assert.strictEqual(fontSizeMonitor.getBackendPort(), undefined);
    });

    test('FontSizeMonitor should start and stop monitoring', () => {
        const testPort = 8080;
        const testToken = 'test-token-123';

        // Start monitoring
        fontSizeMonitor.startMonitoring(testPort, testToken);
        
        assert.strictEqual(fontSizeMonitor.isActive(), true);
        assert.strictEqual(fontSizeMonitor.getBackendPort(), testPort);

        // Stop monitoring
        fontSizeMonitor.stopMonitoring();
        
        assert.strictEqual(fontSizeMonitor.isActive(), false);
        assert.strictEqual(fontSizeMonitor.getBackendPort(), undefined);
    });

    test('FontSizeMonitor should handle multiple start calls', () => {
        const testPort1 = 8080;
        const testToken1 = 'test-token-123';
        const testPort2 = 8081;
        const testToken2 = 'test-token-456';

        // Start monitoring first time
        fontSizeMonitor.startMonitoring(testPort1, testToken1);
        assert.strictEqual(fontSizeMonitor.getBackendPort(), testPort1);

        // Start monitoring second time (should replace first)
        fontSizeMonitor.startMonitoring(testPort2, testToken2);
        assert.strictEqual(fontSizeMonitor.getBackendPort(), testPort2);
        assert.strictEqual(fontSizeMonitor.isActive(), true);
    });

    test('FontSizeMonitor should handle triggerPoll when not monitoring', async () => {
        // Should not throw when not monitoring
        await fontSizeMonitor.triggerPoll();
        assert.strictEqual(fontSizeMonitor.isActive(), false);
    });

    test('FontSizeMonitor should dispose properly', () => {
        const testPort = 8080;
        const testToken = 'test-token-123';

        fontSizeMonitor.startMonitoring(testPort, testToken);
        assert.strictEqual(fontSizeMonitor.isActive(), true);

        fontSizeMonitor.dispose();
        assert.strictEqual(fontSizeMonitor.isActive(), false);
    });
});