import * as assert from 'assert';
import {PathInserter} from '../../utils/PathInserter';

suite('PathInserter Test Suite', () => {
    
    teardown(() => {
        PathInserter.clearCommunicationBridge();
    });

    test('should not be ready initially', () => {
        PathInserter.clearCommunicationBridge();
        assert.strictEqual(PathInserter.isReady(), false);
    });

    test('should handle insertPaths when no bridge is set', () => {
        PathInserter.clearCommunicationBridge();
        
        // Should not throw when no bridge is available
        assert.doesNotThrow(() => {
            PathInserter.insertPaths(['/test/path']);
        });
    });

    test('should handle pastePath when no bridge is set', () => {
        PathInserter.clearCommunicationBridge();
        
        // Should not throw when no bridge is available
        assert.doesNotThrow(() => {
            PathInserter.pastePath('/test/path');
        });
    });

    test('should handle empty paths gracefully', () => {
        PathInserter.clearCommunicationBridge();
        
        // Should not throw with empty arrays or strings
        assert.doesNotThrow(() => {
            PathInserter.insertPaths([]);
            PathInserter.pastePath('');
        });
    });

    test('should handle null/undefined inputs gracefully', () => {
        PathInserter.clearCommunicationBridge();
        
        // Should not throw with null/undefined inputs
        assert.doesNotThrow(() => {
            PathInserter.insertPaths(null as any);
            PathInserter.insertPaths(undefined as any);
            PathInserter.pastePath(null as any);
            PathInserter.pastePath(undefined as any);
        });
    });

    test('should handle clearCommunicationBridge multiple times', () => {
        // Should not throw when called multiple times
        assert.doesNotThrow(() => {
            PathInserter.clearCommunicationBridge();
            PathInserter.clearCommunicationBridge();
        });
    });
});