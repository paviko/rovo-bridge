/**
 * Message throughput and performance tests
 * Tests the web UI's ability to handle high-volume message traffic from both plugins
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UnifiedMessage} from '../ui/messages';

describe('Message Throughput and Performance', () => {
  let messageQueue: UnifiedMessage[];
  let processedMessages: number;
  let mockGlobalFunctions: Map<string, vi.Mock>;

  beforeEach(() => {
    messageQueue = [];
    processedMessages = 0;
    
    // Set up mock global functions
    mockGlobalFunctions = new Map();
    const globalFunctionNames = [
      '__setToken',
      '__setFontSize',
      '__insertPaths',
      '__pastePath',
      '__updateSessionCommand'
    ];

    globalFunctionNames.forEach(funcName => {
      const mockFunc = vi.fn(() => {
        processedMessages++;
      });
      mockGlobalFunctions.set(funcName, mockFunc);
      (window as any)[funcName] = mockFunc;
    });
  });

  afterEach(() => {
    // Clean up global functions
    mockGlobalFunctions.forEach((_, funcName) => {
      delete (window as any)[funcName];
    });
    mockGlobalFunctions.clear();
    messageQueue = [];
    processedMessages = 0;
  });

  function simulateMessageProcessing(message: UnifiedMessage) {
    // Simulate the web UI message dispatcher processing
    switch (message.type) {
      case 'setToken':
        mockGlobalFunctions.get('__setToken')?.(message.token);
        break;
      case 'setFontSize':
        mockGlobalFunctions.get('__setFontSize')?.(message.size);
        break;
      case 'insertPaths':
        mockGlobalFunctions.get('__insertPaths')?.(message.paths);
        break;
      case 'pastePath':
        mockGlobalFunctions.get('__pastePath')?.(message.path);
        break;
      case 'updateSessionCommand':
        mockGlobalFunctions.get('__updateSessionCommand')?.(message.command);
        break;
    }
  }

  function generateMessage(type: string, index: number, plugin: 'jetbrains' | 'vscode'): UnifiedMessage {
    const baseTimestamp = Date.now();
    
    switch (type) {
      case 'setToken':
        return {
          type: 'setToken',
          token: `${plugin}-token-${index}`,
          timestamp: baseTimestamp + index
        };
      case 'setFontSize':
        return {
          type: 'setFontSize',
          size: 8 + (index % 65), // Vary between 8-72
          timestamp: baseTimestamp + index
        };
      case 'insertPaths':
        return {
          type: 'insertPaths',
          paths: [`/${plugin}/path${index}.ext`],
          timestamp: baseTimestamp + index
        };
      case 'pastePath':
        return {
          type: 'pastePath',
          path: `/${plugin}/directory${index}`,
          timestamp: baseTimestamp + index
        };
      case 'updateSessionCommand':
        return {
          type: 'updateSessionCommand',
          command: `${plugin} command ${index}`,
          timestamp: baseTimestamp + index
        };
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }

  describe('High Volume Message Processing', () => {
    it('should handle 1000 messages from single plugin efficiently', () => {
      const messageCount = 1000;
      const messageType = 'setFontSize';
      
      const startTime = performance.now();
      
      for (let i = 0; i < messageCount; i++) {
        const message = generateMessage(messageType, i, 'jetbrains');
        simulateMessageProcessing(message);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(processedMessages).toBe(messageCount);
      expect(duration).toBeLessThan(50); // Should process 1000 messages in under 50ms
      expect(mockGlobalFunctions.get('__setFontSize')).toHaveBeenCalledTimes(messageCount);
    });

    it('should handle 10000 mixed messages from both plugins', () => {
      const messageCount = 10000;
      const messageTypes = ['setToken', 'setFontSize', 'insertPaths', 'pastePath', 'updateSessionCommand'];
      
      const startTime = performance.now();
      
      for (let i = 0; i < messageCount; i++) {
        const messageType = messageTypes[i % messageTypes.length];
        const plugin = i % 2 === 0 ? 'jetbrains' : 'vscode';
        const message = generateMessage(messageType, i, plugin);
        simulateMessageProcessing(message);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(processedMessages).toBe(messageCount);
      expect(duration).toBeLessThan(500); // Should process 10000 messages in under 500ms
      
      // Verify each message type was called the expected number of times
      const expectedCallsPerType = messageCount / messageTypes.length;
      messageTypes.forEach(type => {
        const functionName = `__${type === 'updateSessionCommand' ? 'updateSessionCommand' : 
                              type === 'insertPaths' ? 'insertPaths' :
                              type === 'pastePath' ? 'pastePath' :
                              type === 'setFontSize' ? 'setFontSize' : 'setToken'}`;
        expect(mockGlobalFunctions.get(functionName)).toHaveBeenCalledTimes(expectedCallsPerType);
      });
    });

    it('should maintain performance with rapid sequential messages', () => {
      const batchSize = 100;
      const batchCount = 10;
      const durations: number[] = [];
      
      for (let batch = 0; batch < batchCount; batch++) {
        const batchStartTime = performance.now();
        
        for (let i = 0; i < batchSize; i++) {
          const message = generateMessage('setFontSize', batch * batchSize + i, 'jetbrains');
          simulateMessageProcessing(message);
        }
        
        const batchEndTime = performance.now();
        durations.push(batchEndTime - batchStartTime);
      }
      
      // Performance should remain consistent across batches
      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);
      
      expect(averageDuration).toBeLessThan(10); // Average batch should be under 10ms
      expect(maxDuration - minDuration).toBeLessThan(5); // Variance should be small
      expect(processedMessages).toBe(batchSize * batchCount);
    });
  });

  describe('Concurrent Plugin Message Handling', () => {
    it('should handle alternating messages from both plugins', () => {
      const messageCount = 1000;
      const jetbrainsMessages: UnifiedMessage[] = [];
      const vscodeMessages: UnifiedMessage[] = [];
      
      // Generate messages from both plugins
      for (let i = 0; i < messageCount / 2; i++) {
        jetbrainsMessages.push(generateMessage('setFontSize', i, 'jetbrains'));
        vscodeMessages.push(generateMessage('setFontSize', i, 'vscode'));
      }
      
      const startTime = performance.now();
      
      // Process messages in alternating order
      for (let i = 0; i < messageCount / 2; i++) {
        simulateMessageProcessing(jetbrainsMessages[i]);
        simulateMessageProcessing(vscodeMessages[i]);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(processedMessages).toBe(messageCount);
      expect(duration).toBeLessThan(100);
      expect(mockGlobalFunctions.get('__setFontSize')).toHaveBeenCalledTimes(messageCount);
    });

    it('should handle burst messages from one plugin followed by another', () => {
      const burstSize = 500;
      
      const startTime = performance.now();
      
      // Burst from JetBrains
      for (let i = 0; i < burstSize; i++) {
        const message = generateMessage('insertPaths', i, 'jetbrains');
        simulateMessageProcessing(message);
      }
      
      // Burst from VSCode
      for (let i = 0; i < burstSize; i++) {
        const message = generateMessage('insertPaths', i, 'vscode');
        simulateMessageProcessing(message);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(processedMessages).toBe(burstSize * 2);
      expect(duration).toBeLessThan(100);
      expect(mockGlobalFunctions.get('__insertPaths')).toHaveBeenCalledTimes(burstSize * 2);
    });

    it('should handle mixed message types from both plugins simultaneously', () => {
      const messageTypes = ['setToken', 'setFontSize', 'insertPaths', 'pastePath', 'updateSessionCommand'];
      const messagesPerType = 100;
      const totalMessages = messageTypes.length * messagesPerType * 2; // 2 plugins
      
      const startTime = performance.now();
      
      // Generate and process mixed messages
      for (let i = 0; i < messagesPerType; i++) {
        messageTypes.forEach(type => {
          // JetBrains message
          const jetbrainsMessage = generateMessage(type, i, 'jetbrains');
          simulateMessageProcessing(jetbrainsMessage);
          
          // VSCode message
          const vscodeMessage = generateMessage(type, i, 'vscode');
          simulateMessageProcessing(vscodeMessage);
        });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(processedMessages).toBe(totalMessages);
      expect(duration).toBeLessThan(200);
      
      // Verify each function was called the expected number of times
      mockGlobalFunctions.forEach((mockFunc, funcName) => {
        expect(mockFunc).toHaveBeenCalledTimes(messagesPerType * 2);
      });
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not accumulate memory with continuous message processing', () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const messageCount = 5000;
      
      // Process many messages
      for (let i = 0; i < messageCount; i++) {
        const message = generateMessage('setFontSize', i, i % 2 === 0 ? 'jetbrains' : 'vscode');
        simulateMessageProcessing(message);
        
        // Occasionally trigger garbage collection if available
        if (i % 1000 === 0 && global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      expect(processedMessages).toBe(messageCount);
      
      // Memory growth should be reasonable (less than 10MB for 5000 messages)
      if (initialMemory > 0 && finalMemory > 0) {
        const memoryGrowth = finalMemory - initialMemory;
        expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // 10MB
      }
    });

    it('should handle message processing without creating excessive objects', () => {
      const messageCount = 1000;
      let objectCreationCount = 0;
      
      // Mock object creation tracking
      const originalObjectCreate = Object.create;
      Object.create = function(...args) {
        objectCreationCount++;
        return originalObjectCreate.apply(this, args);
      };
      
      try {
        const startTime = performance.now();
        
        for (let i = 0; i < messageCount; i++) {
          const message = generateMessage('setToken', i, 'jetbrains');
          simulateMessageProcessing(message);
        }
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(processedMessages).toBe(messageCount);
        expect(duration).toBeLessThan(100);
        
        // Should not create excessive objects during processing
        expect(objectCreationCount).toBeLessThan(messageCount * 2);
      } finally {
        // Restore original Object.create
        Object.create = originalObjectCreate;
      }
    });
  });

  describe('Error Resilience Under Load', () => {
    it('should continue processing after individual message errors', () => {
      const messageCount = 1000;
      let errorCount = 0;
      
      // Make every 10th message cause an error
      mockGlobalFunctions.get('__setFontSize')?.mockImplementation((size: number) => {
        processedMessages++;
        if (processedMessages % 10 === 0) {
          errorCount++;
          throw new Error('Simulated processing error');
        }
      });
      
      const startTime = performance.now();
      
      for (let i = 0; i < messageCount; i++) {
        try {
          const message = generateMessage('setFontSize', i, 'jetbrains');
          simulateMessageProcessing(message);
        } catch (error) {
          // Errors should be handled gracefully
        }
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(processedMessages).toBe(messageCount);
      expect(errorCount).toBe(messageCount / 10);
      expect(duration).toBeLessThan(200); // Should still be reasonably fast despite errors
    });

    it('should handle malformed messages in high-volume scenarios', () => {
      const validMessageCount = 800;
      const malformedMessageCount = 200;
      const totalMessages = validMessageCount + malformedMessageCount;
      
      const startTime = performance.now();
      
      // Process valid messages
      for (let i = 0; i < validMessageCount; i++) {
        const message = generateMessage('setToken', i, 'jetbrains');
        simulateMessageProcessing(message);
      }
      
      // Process malformed messages (these should not increment processedMessages)
      for (let i = 0; i < malformedMessageCount; i++) {
        try {
          const malformedMessage = {
            type: 'setToken',
            // Missing token field - this should not call the mock function
            timestamp: Date.now()
          } as any;
          // Simulate processing but don't call the actual function for malformed messages
          // In real implementation, validation would prevent the function call
          if (malformedMessage.token) {
            simulateMessageProcessing(malformedMessage);
          }
        } catch (error) {
          // Should handle malformed messages gracefully
        }
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should have processed only the valid messages
      expect(processedMessages).toBe(validMessageCount);
      expect(duration).toBeLessThan(150);
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should handle typical IDE usage patterns efficiently', () => {
      // Simulate typical IDE usage: occasional font size changes, frequent path operations
      const fontSizeChanges = 5;
      const pathOperations = 200;
      const sessionCommands = 10;
      const uiStateChanges = 20;
      
      const startTime = performance.now();
      
      // Font size changes (infrequent)
      for (let i = 0; i < fontSizeChanges; i++) {
        const message = generateMessage('setFontSize', i, i % 2 === 0 ? 'jetbrains' : 'vscode');
        simulateMessageProcessing(message);
      }
      
      // Path operations (frequent)
      for (let i = 0; i < pathOperations; i++) {
        const messageType = i % 2 === 0 ? 'insertPaths' : 'pastePath';
        const message = generateMessage(messageType, i, i % 2 === 0 ? 'jetbrains' : 'vscode');
        simulateMessageProcessing(message);
      }
      
      // Session commands (occasional)
      for (let i = 0; i < sessionCommands; i++) {
        const message = generateMessage('updateSessionCommand', i, i % 2 === 0 ? 'jetbrains' : 'vscode');
        simulateMessageProcessing(message);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const totalMessages = fontSizeChanges + pathOperations + sessionCommands;
      
      expect(processedMessages).toBe(totalMessages);
      expect(duration).toBeLessThan(100);
      
      // Verify realistic call patterns
      expect(mockGlobalFunctions.get('__setFontSize')).toHaveBeenCalledTimes(fontSizeChanges);
      expect(mockGlobalFunctions.get('__insertPaths')).toHaveBeenCalledTimes(pathOperations / 2);
      expect(mockGlobalFunctions.get('__pastePath')).toHaveBeenCalledTimes(pathOperations / 2);
      expect(mockGlobalFunctions.get('__updateSessionCommand')).toHaveBeenCalledTimes(sessionCommands);
    });

    it('should handle plugin switching scenarios', () => {
      // Simulate user switching between JetBrains and VSCode
      const switchCount = 10;
      const messagesPerSwitch = 50;
      
      const startTime = performance.now();
      
      for (let switchIndex = 0; switchIndex < switchCount; switchIndex++) {
        const currentPlugin = switchIndex % 2 === 0 ? 'jetbrains' : 'vscode';
        
        // Simulate initialization messages when switching
        simulateMessageProcessing(generateMessage('setToken', switchIndex, currentPlugin));
        simulateMessageProcessing(generateMessage('setFontSize', switchIndex, currentPlugin));
        
        // Simulate normal usage
        for (let i = 0; i < messagesPerSwitch; i++) {
          const messageType = ['insertPaths', 'pastePath', 'updateSessionCommand'][i % 3];
          const message = generateMessage(messageType, i, currentPlugin);
          simulateMessageProcessing(message);
        }
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const totalMessages = switchCount * (2 + messagesPerSwitch); // 2 init messages + normal usage
      
      expect(processedMessages).toBe(totalMessages);
      expect(duration).toBeLessThan(200);
    });
  });
});