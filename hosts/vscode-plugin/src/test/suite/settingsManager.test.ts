import * as assert from 'assert';
import {SettingsManager} from '../../settings/SettingsManager';

suite('SettingsManager Test Suite', () => {
    let settingsManager: SettingsManager;

    setup(() => {
        settingsManager = new SettingsManager();
    });

    teardown(() => {
        settingsManager.dispose();
    });

    test('should create SettingsManager instance', () => {
        assert.ok(settingsManager instanceof SettingsManager);
    });

    test('should return default settings', () => {
        const defaults = SettingsManager.getDefaults();
        
        assert.strictEqual(typeof defaults.customCommand, 'string');
        assert.strictEqual(defaults.customCommand, '');
        assert.strictEqual(defaults.uiMode, 'Terminal');
        assert.strictEqual(defaults.fontSize, 14);
        assert.strictEqual(defaults.chipsCollapsed, false);
        assert.strictEqual(defaults.composerCollapsed, false);
    });

    test('should get settings without throwing', () => {
        assert.doesNotThrow(() => {
            const settings = settingsManager.getSettings();
            assert.ok(settings);
            assert.ok(typeof settings.customCommand === 'string');
            assert.ok(typeof settings.fontSize === 'number');
            assert.ok(typeof settings.chipsCollapsed === 'boolean');
        });
    });

    test('should handle dispose without throwing', () => {
        assert.doesNotThrow(() => {
            settingsManager.dispose();
        });
    });

    test('should handle multiple dispose calls', () => {
        assert.doesNotThrow(() => {
            settingsManager.dispose();
            settingsManager.dispose();
        });
    });
});