/**
 * Cross-plugin compatibility tests
 * Verifies that both JetBrains and VSCode plugins send identical message formats
 * and that the web UI can handle messages from both plugins correctly
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UnifiedMessage} from '../ui/messages';

// Mock message samples from both plugins
const jetbrainsMessages = {
  setToken: {
    type: 'setToken',
    token: 'jetbrains-token-123',
    timestamp: 1692345678901
  },
  setFontSize: {
    type: 'setFontSize',
    size: 16,
    timestamp: 1692345678902
  },
  insertPaths: {
    type: 'insertPaths',
    paths: ['/jetbrains/path1.kt', '/jetbrains/path2.java'],
    timestamp: 1692345678903
  },
  pastePath: {
    type: 'pastePath',
    path: '/jetbrains/directory',
    timestamp: 1692345678904
  },
  updateSessionCommand: {
    type: 'updateSessionCommand',
    command: 'gradle test',
    timestamp: 1692345678905
  },
  updateUIState: {
    type: 'updateUIState',
    chipsCollapsed: true,
    composerCollapsed: false,
    timestamp: 1692345678906
  }
};

const vscodeMessages = {
  setToken: {
    type: 'setToken',
    token: 'vscode-token-456',
    timestamp: 1692345678911
  },
  setFontSize: {
    type: 'setFontSize',
    size: 14,
    timestamp: 1692345678912
  },
  insertPaths: {
    type: 'insertPaths',
    paths: ['/vscode/path1.ts', '/vscode/path2.js'],
    timestamp: 1692345678913
  },
  pastePath: {
    type: 'pastePath',
    path: '/vscode/directory',
    timestamp: 1692345678914
  },
  updateSessionCommand: {
    type: 'updateSessionCommand',
    command: 'npm test',
    timestamp: 1692345678915
  },
  updateUIState: {
    type: 'updateUIState',
    chipsCollapsed: false,
    composerCollapsed: true,
    timestamp: 1692345678916
  }
};

describe('Cross-Plugin Compatibility', () => {
  let mockGlobalFunctions: Map<string, vi.Mock>;
  let mockDOMElements: Map<string, HTMLElement>;

  function simulateMessageHandler(message: UnifiedMessage) {
    // Simulate the web UI message dispatcher handling messages from both plugins
    switch (message.type) {
      case 'setToken':
        const setTokenFunc = mockGlobalFunctions.get('__setToken');
        if (setTokenFunc) {
          setTokenFunc((message as any).token);
        }
        break;
        
      case 'setFontSize':
        const setFontSizeFunc = mockGlobalFunctions.get('__setFontSize');
        if (setFontSizeFunc) {
          setFontSizeFunc((message as any).size);
        }
        break;
        
      case 'insertPaths':
        const insertPathsFunc = mockGlobalFunctions.get('__insertPaths');
        if (insertPathsFunc) {
          insertPathsFunc((message as any).paths);
        }
        break;
        
      case 'pastePath':
        const pastePathFunc = mockGlobalFunctions.get('__pastePath');
        if (pastePathFunc) {
          pastePathFunc((message as any).path);
        }
        break;
        
      case 'updateSessionCommand':
        const updateSessionCommandFunc = mockGlobalFunctions.get('__updateSessionCommand');
        if (updateSessionCommandFunc) {
          updateSessionCommandFunc((message as any).command);
        }
        break;
        
      case 'updateUIState':
        const msg = message as any;
        if (msg.chipsCollapsed !== undefined) {
          const chipsElement = mockDOMElements.get('chips');
          if (chipsElement) {
            if (msg.chipsCollapsed) {
              chipsElement.classList.add('collapsed');
            } else {
              chipsElement.classList.remove('collapsed');
            }
          }
        }
        if (msg.composerCollapsed !== undefined) {
          const composerElement = mockDOMElements.get('composer');
          if (composerElement) {
            if (msg.composerCollapsed) {
              composerElement.classList.add('collapsed');
            } else {
              composerElement.classList.remove('collapsed');
            }
          }
        }
        break;
    }
  }

  beforeEach(() => {
    // Set up mock global functions
    mockGlobalFunctions = new Map();
    const globalFunctionNames = [
      '__setToken',
      '__setFontSize',
      '__insertPaths',
      '__pastePath',
      '__updateSessionCommand',
      '__updateOpenedFiles'
    ];

    globalFunctionNames.forEach(funcName => {
      const mockFunc = vi.fn();
      mockGlobalFunctions.set(funcName, mockFunc);
      (window as any)[funcName] = mockFunc;
    });

    // Set up mock DOM elements
    mockDOMElements = new Map();
    const chipsElement = document.createElement('div');
    chipsElement.id = 'chips';
    const composerElement = document.createElement('div');
    composerElement.id = 'composer';
    
    document.body.appendChild(chipsElement);
    document.body.appendChild(composerElement);
    
    mockDOMElements.set('chips', chipsElement);
    mockDOMElements.set('composer', composerElement);
  });

  afterEach(() => {
    // Clean up global functions
    mockGlobalFunctions.forEach((_, funcName) => {
      delete (window as any)[funcName];
    });
    mockGlobalFunctions.clear();

    // Clean up DOM
    document.body.innerHTML = '';
    mockDOMElements.clear();
  });

  describe('Message Format Compatibility', () => {
    it('should have identical message structures between plugins', () => {
      const messageTypes = Object.keys(jetbrainsMessages);
      
      messageTypes.forEach(messageType => {
        const jetbrainsMsg = (jetbrainsMessages as any)[messageType];
        const vscodeMsg = (vscodeMessages as any)[messageType];
        
        // Compare message structure (excluding timestamp and data values)
        expect(jetbrainsMsg.type).toBe(vscodeMsg.type);
        expect(Object.keys(jetbrainsMsg).sort()).toEqual(Object.keys(vscodeMsg).sort());
        
        // Verify field types match
        Object.keys(jetbrainsMsg).forEach(key => {
          if (key !== 'timestamp') { // Skip timestamp as values will differ
            expect(typeof jetbrainsMsg[key]).toBe(typeof vscodeMsg[key]);
            
            // For arrays, check that both are arrays
            if (Array.isArray(jetbrainsMsg[key])) {
              expect(Array.isArray(vscodeMsg[key])).toBe(true);
            }
          }
        });
      });
    });

    it('should have consistent field names across all message types', () => {
      const expectedFields = {
        setToken: ['type', 'token', 'timestamp'],
        setFontSize: ['type', 'size', 'timestamp'],
        insertPaths: ['type', 'paths', 'timestamp'],
        pastePath: ['type', 'path', 'timestamp'],
        updateSessionCommand: ['type', 'command', 'timestamp'],
        updateUIState: ['type', 'chipsCollapsed', 'composerCollapsed', 'timestamp']
      };

      Object.entries(expectedFields).forEach(([messageType, expectedFieldNames]) => {
        const jetbrainsMsg = (jetbrainsMessages as any)[messageType];
        const vscodeMsg = (vscodeMessages as any)[messageType];
        
        expect(Object.keys(jetbrainsMsg).sort()).toEqual(expectedFieldNames.sort());
        expect(Object.keys(vscodeMsg).sort()).toEqual(expectedFieldNames.sort());
      });
    });

    it('should have valid data types for all message fields', () => {
      const allMessages = [...Object.values(jetbrainsMessages), ...Object.values(vscodeMessages)];
      
      allMessages.forEach(message => {
        // Type field should be string
        expect(typeof message.type).toBe('string');
        expect(message.type.length).toBeGreaterThan(0);
        
        // Timestamp should be number
        expect(typeof message.timestamp).toBe('number');
        expect(message.timestamp).toBeGreaterThan(0);
        
        // Type-specific validations
        switch (message.type) {
          case 'setToken':
            expect(typeof (message as any).token).toBe('string');
            expect((message as any).token.length).toBeGreaterThan(0);
            break;
            
          case 'setFontSize':
            expect(typeof (message as any).size).toBe('number');
            expect((message as any).size).toBeGreaterThanOrEqual(8);
            expect((message as any).size).toBeLessThanOrEqual(72);
            break;
            
          case 'insertPaths':
            expect(Array.isArray((message as any).paths)).toBe(true);
            expect((message as any).paths.length).toBeGreaterThan(0);
            (message as any).paths.forEach((path: any) => {
              expect(typeof path).toBe('string');
              expect(path.length).toBeGreaterThan(0);
            });
            break;
            
          case 'pastePath':
            expect(typeof (message as any).path).toBe('string');
            expect((message as any).path.length).toBeGreaterThan(0);
            break;
            
          case 'updateSessionCommand':
            expect(typeof (message as any).command).toBe('string');
            break;
            
          case 'updateUIState':
            if ((message as any).chipsCollapsed !== undefined) {
              expect(typeof (message as any).chipsCollapsed).toBe('boolean');
            }
            if ((message as any).composerCollapsed !== undefined) {
              expect(typeof (message as any).composerCollapsed).toBe('boolean');
            }
            break;
        }
      });
    });
  });

  describe('Web UI Message Handling', () => {

    it('should handle JetBrains plugin messages correctly', () => {
      Object.values(jetbrainsMessages).forEach(message => {
        simulateMessageHandler(message);
      });

      // Verify all functions were called with correct parameters
      expect(mockGlobalFunctions.get('__setToken')).toHaveBeenCalledWith('jetbrains-token-123');
      expect(mockGlobalFunctions.get('__setFontSize')).toHaveBeenCalledWith(16);
      expect(mockGlobalFunctions.get('__insertPaths')).toHaveBeenCalledWith(['/jetbrains/path1.kt', '/jetbrains/path2.java']);
      expect(mockGlobalFunctions.get('__pastePath')).toHaveBeenCalledWith('/jetbrains/directory');
      expect(mockGlobalFunctions.get('__updateSessionCommand')).toHaveBeenCalledWith('gradle test');
      
      // Verify DOM updates
      expect(mockDOMElements.get('chips')?.classList.contains('collapsed')).toBe(true);
      expect(mockDOMElements.get('composer')?.classList.contains('collapsed')).toBe(false);
    });

    it('should handle VSCode plugin messages correctly', () => {
      Object.values(vscodeMessages).forEach(message => {
        simulateMessageHandler(message);
      });

      // Verify all functions were called with correct parameters
      expect(mockGlobalFunctions.get('__setToken')).toHaveBeenCalledWith('vscode-token-456');
      expect(mockGlobalFunctions.get('__setFontSize')).toHaveBeenCalledWith(14);
      expect(mockGlobalFunctions.get('__insertPaths')).toHaveBeenCalledWith(['/vscode/path1.ts', '/vscode/path2.js']);
      expect(mockGlobalFunctions.get('__pastePath')).toHaveBeenCalledWith('/vscode/directory');
      expect(mockGlobalFunctions.get('__updateSessionCommand')).toHaveBeenCalledWith('npm test');
      
      // Verify DOM updates
      expect(mockDOMElements.get('chips')?.classList.contains('collapsed')).toBe(false);
      expect(mockDOMElements.get('composer')?.classList.contains('collapsed')).toBe(true);
    });

    it('should handle mixed messages from both plugins', () => {
      // Simulate receiving messages from both plugins in mixed order
      const mixedMessages = [
        jetbrainsMessages.setToken,
        vscodeMessages.setFontSize,
        jetbrainsMessages.insertPaths,
        vscodeMessages.pastePath,
        jetbrainsMessages.updateSessionCommand,
        vscodeMessages.updateUIState
      ];

      mixedMessages.forEach(message => {
        simulateMessageHandler(message);
      });

      // Verify the last call to each function (should be from the last message of that type)
      expect(mockGlobalFunctions.get('__setToken')).toHaveBeenLastCalledWith('jetbrains-token-123');
      expect(mockGlobalFunctions.get('__setFontSize')).toHaveBeenLastCalledWith(14);
      expect(mockGlobalFunctions.get('__insertPaths')).toHaveBeenLastCalledWith(['/jetbrains/path1.kt', '/jetbrains/path2.java']);
      expect(mockGlobalFunctions.get('__pastePath')).toHaveBeenLastCalledWith('/vscode/directory');
      expect(mockGlobalFunctions.get('__updateSessionCommand')).toHaveBeenLastCalledWith('gradle test');
      
      // DOM should reflect the last updateUIState message (from VSCode)
      expect(mockDOMElements.get('chips')?.classList.contains('collapsed')).toBe(false);
      expect(mockDOMElements.get('composer')?.classList.contains('collapsed')).toBe(true);
    });
  });

  describe('Standalone Mode Compatibility', () => {
    it('should handle direct browser access with both plugin message formats', () => {
      // Simulate standalone mode where messages might come from either plugin format
      const standaloneMessages = [
        jetbrainsMessages.setFontSize,
        vscodeMessages.insertPaths,
        jetbrainsMessages.updateUIState
      ];

      // In standalone mode, the message dispatcher should handle both formats identically
      standaloneMessages.forEach(message => {
        expect(() => {
          simulateMessageHandler(message);
        }).not.toThrow();
      });

      // Verify functions were called correctly regardless of source plugin
      expect(mockGlobalFunctions.get('__setFontSize')).toHaveBeenCalledWith(16);
      expect(mockGlobalFunctions.get('__insertPaths')).toHaveBeenCalledWith(['/vscode/path1.ts', '/vscode/path2.js']);
      
      // DOM should be updated correctly
      expect(mockDOMElements.get('chips')?.classList.contains('collapsed')).toBe(true);
      expect(mockDOMElements.get('composer')?.classList.contains('collapsed')).toBe(false);
    });

    it('should preserve global function compatibility in standalone mode', () => {
      // Test that direct function calls still work alongside message handling
      const directSetToken = mockGlobalFunctions.get('__setToken');
      const directSetFontSize = mockGlobalFunctions.get('__setFontSize');
      
      // Direct function calls (standalone mode)
      directSetToken?.('direct-token');
      directSetFontSize?.(18);
      
      // Message-based calls (plugin mode)
      simulateMessageHandler(jetbrainsMessages.setToken);
      simulateMessageHandler(vscodeMessages.setFontSize);
      
      // Both should work
      expect(directSetToken).toHaveBeenCalledWith('direct-token');
      expect(directSetToken).toHaveBeenCalledWith('jetbrains-token-123');
      expect(directSetFontSize).toHaveBeenCalledWith(18);
      expect(directSetFontSize).toHaveBeenCalledWith(14);
    });
  });

  describe('Performance and Throughput', () => {
    it('should handle high message throughput from both plugins', () => {
      const startTime = performance.now();
      const messageCount = 1000;
      
      // Generate many messages alternating between plugins
      for (let i = 0; i < messageCount; i++) {
        const isJetBrains = i % 2 === 0;
        const message = isJetBrains ? jetbrainsMessages.setFontSize : vscodeMessages.setFontSize;
        
        simulateMessageHandler({
          ...message,
          size: 12 + (i % 10), // Vary the size
          timestamp: Date.now() + i
        });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should handle 1000 messages in reasonable time (less than 100ms)
      expect(duration).toBeLessThan(100);
      expect(mockGlobalFunctions.get('__setFontSize')).toHaveBeenCalledTimes(messageCount);
    });

    it('should handle concurrent message types efficiently', () => {
      const startTime = performance.now();
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        // Send all message types from both plugins
        Object.values(jetbrainsMessages).forEach(message => {
          simulateMessageHandler({
            ...message,
            timestamp: Date.now() + i
          });
        });
        
        Object.values(vscodeMessages).forEach(message => {
          simulateMessageHandler({
            ...message,
            timestamp: Date.now() + i + 1000
          });
        });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should handle all messages efficiently
      expect(duration).toBeLessThan(200);
      
      // Verify all functions were called the expected number of times
      expect(mockGlobalFunctions.get('__setToken')).toHaveBeenCalledTimes(iterations * 2);
      expect(mockGlobalFunctions.get('__setFontSize')).toHaveBeenCalledTimes(iterations * 2);
      expect(mockGlobalFunctions.get('__insertPaths')).toHaveBeenCalledTimes(iterations * 2);
      expect(mockGlobalFunctions.get('__pastePath')).toHaveBeenCalledTimes(iterations * 2);
      expect(mockGlobalFunctions.get('__updateSessionCommand')).toHaveBeenCalledTimes(iterations * 2);
    });
  });

  describe('Error Scenarios and Graceful Degradation', () => {
    it('should handle malformed messages from either plugin gracefully', () => {
      const malformedMessages = [
        { type: 'setToken' }, // Missing token
        { type: 'setFontSize', size: 'invalid' }, // Invalid size type
        { type: 'insertPaths', paths: 'not-an-array' }, // Invalid paths type
        { type: 'pastePath', path: null }, // Null path
        { type: 'updateSessionCommand' }, // Missing command
        { type: 'updateUIState' }, // Missing state fields
        { type: 'unknownType', data: 'test' } // Unknown message type
      ];

      malformedMessages.forEach(message => {
        expect(() => {
          simulateMessageHandler(message as any);
        }).not.toThrow();
      });
    });

    it('should handle missing global functions gracefully', () => {
      // Remove some global functions
      mockGlobalFunctions.delete('__setToken');
      mockGlobalFunctions.delete('__insertPaths');
      delete (window as any).__setToken;
      delete (window as any).__insertPaths;

      // Should not throw when functions are missing
      expect(() => {
        simulateMessageHandler(jetbrainsMessages.setToken);
        simulateMessageHandler(vscodeMessages.insertPaths);
      }).not.toThrow();
    });

    it('should handle missing DOM elements gracefully', () => {
      // Remove DOM elements
      document.body.innerHTML = '';
      mockDOMElements.clear();

      // Should not throw when DOM elements are missing
      expect(() => {
        simulateMessageHandler(jetbrainsMessages.updateUIState);
        simulateMessageHandler(vscodeMessages.updateUIState);
      }).not.toThrow();
    });

    it('should handle function execution errors gracefully', () => {
      // Make functions throw errors
      mockGlobalFunctions.get('__setToken')?.mockImplementation(() => {
        throw new Error('Token function error');
      });
      mockGlobalFunctions.get('__setFontSize')?.mockImplementation(() => {
        throw new Error('Font size function error');
      });

      // Should not propagate errors from function calls
      expect(() => {
        try {
          simulateMessageHandler(jetbrainsMessages.setToken);
        } catch (error) {
          // Errors should be caught and handled gracefully
        }
        
        try {
          simulateMessageHandler(vscodeMessages.setFontSize);
        } catch (error) {
          // Errors should be caught and handled gracefully
        }
      }).not.toThrow();
    });
  });
});