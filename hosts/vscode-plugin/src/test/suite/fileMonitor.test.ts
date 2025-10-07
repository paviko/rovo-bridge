import * as assert from 'assert';
import {FileMonitor} from '../../utils/FileMonitor';

suite('FileMonitor Test Suite', () => {
    let fileMonitor: FileMonitor;

    setup(() => {
        fileMonitor = new FileMonitor();
    });

    teardown(() => {
        if (fileMonitor) {
            fileMonitor.stopMonitoring();
        }
    });

    test('FileMonitor can be instantiated', () => {
        assert.ok(fileMonitor);
        assert.strictEqual(typeof fileMonitor.startMonitoring, 'function');
        assert.strictEqual(typeof fileMonitor.stopMonitoring, 'function');
    });

    test('FileMonitor can start and stop monitoring', () => {
        let callbackCalled = false;
        let receivedFiles: string[] = [];
        let receivedCurrent: string | undefined;

        // Start monitoring
        fileMonitor.startMonitoring((files: string[], current?: string) => {
            callbackCalled = true;
            receivedFiles = files;
            receivedCurrent = current;
        });

        // Stop monitoring
        fileMonitor.stopMonitoring();

        // The callback should have been called at least once during initialization
        assert.ok(callbackCalled, 'Callback should have been called during monitoring');
        assert.ok(Array.isArray(receivedFiles), 'Files should be an array');
    });

    test('FileMonitor handles multiple start/stop cycles', () => {
        let callCount = 0;

        // First cycle
        fileMonitor.startMonitoring(() => {
            callCount++;
        });
        fileMonitor.stopMonitoring();

        const firstCallCount = callCount;

        // Second cycle
        fileMonitor.startMonitoring(() => {
            callCount++;
        });
        fileMonitor.stopMonitoring();

        // Should have received calls in both cycles
        assert.ok(callCount > firstCallCount, 'Should receive calls in second monitoring cycle');
    });

    test('FileMonitor stops calling callback after stopMonitoring', (done) => {
        let callCount = 0;

        fileMonitor.startMonitoring(() => {
            callCount++;
        });

        // Wait a bit for initial calls
        setTimeout(() => {
            const initialCallCount = callCount;
            fileMonitor.stopMonitoring();

            // Wait more time to ensure no more calls
            setTimeout(() => {
                // Call count should not have increased significantly after stopping
                // (allowing for some race conditions in the test)
                assert.ok(callCount <= initialCallCount + 1, 'Should not receive many calls after stopping');
                done();
            }, 100);
        }, 50);
    });
});