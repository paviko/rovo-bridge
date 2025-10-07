import * as assert from 'assert';
import {BackendLauncher} from '../../backend/BackendLauncher';

suite('BackendLauncher Test Suite', () => {
    let launcher: BackendLauncher;

    setup(() => {
        launcher = new BackendLauncher();
    });

    teardown(() => {
        launcher.terminate();
    });

    test('should create BackendLauncher instance', () => {
        assert.ok(launcher instanceof BackendLauncher);
    });

    test('should not be running initially', () => {
        assert.strictEqual(launcher.isRunning(), false);
    });

    test('should handle terminate when not running', () => {
        // Should not throw when terminating non-running process
        assert.doesNotThrow(() => {
            launcher.terminate();
        });
    });

    test('should remain not running after terminate', () => {
        launcher.terminate();
        assert.strictEqual(launcher.isRunning(), false);
    });
});