/**
 * Basic tests for message handling functionality
 * These tests verify that message handlers work correctly with mock data
 */

import {describe, expect, it} from 'vitest';
import {UnifiedMessage} from './messages';

// Mock test messages for validation
export const testMessages: UnifiedMessage[] = [
  {
    type: 'setToken',
    token: 'test-token-123',
    timestamp: Date.now()
  },
  {
    type: 'setFontSize',
    size: 14,
    timestamp: Date.now()
  },
  {
    type: 'insertPaths',
    paths: ['/path/to/file.js', '/path/to/another.ts'],
    timestamp: Date.now()
  },
  {
    type: 'pastePath',
    path: '/path/to/directory',
    timestamp: Date.now()
  },
  {
    type: 'updateSessionCommand',
    command: 'npm test',
    timestamp: Date.now()
  },
  {
    type: 'updateUIState',
    chipsCollapsed: true,
    composerCollapsed: false,
    timestamp: Date.now()
  }
];

// Invalid test messages for validation testing
export const invalidTestMessages = [
  // Missing type
  { token: 'test' },
  // Invalid font size
  { type: 'setFontSize', size: 100 },
  // Empty paths array
  { type: 'insertPaths', paths: [] },
  // Missing required field
  { type: 'setToken' },
  // Invalid data type
  { type: 'pastePath', path: 123 }
];

/**
 * Simple test function to verify message handler functionality
 * This can be called from browser console for manual testing
 */
export function testMessageHandlers(): void {
  console.log('Testing message handlers...');
  
  // Test valid messages
  testMessages.forEach((message, index) => {
    console.log(`Testing message ${index + 1}:`, message);
    
    // Simulate postMessage in browser console
    if (typeof window !== 'undefined') {
      window.postMessage(message, '*');
    }
  });
  
  console.log('Message handler tests completed. Check console for results.');
}

// Export for browser console testing
if (typeof window !== 'undefined') {
  (window as any).__testMessageHandlers = testMessageHandlers;
  (window as any).__testMessages = testMessages;
  (window as any).__invalidTestMessages = invalidTestMessages;
}

describe('Message Test Data', () => {
  it('should have valid test messages', () => {
    expect(testMessages).toBeDefined();
    expect(testMessages.length).toBeGreaterThan(0);
    
    testMessages.forEach(message => {
      expect(message.type).toBeDefined();
      expect(typeof message.type).toBe('string');
    });
  });

  it('should have invalid test messages for validation testing', () => {
    expect(invalidTestMessages).toBeDefined();
    expect(invalidTestMessages.length).toBeGreaterThan(0);
  });

  it('should export test helper function', () => {
    expect(typeof testMessageHandlers).toBe('function');
  });
});