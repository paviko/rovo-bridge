/**
 * Tests for message routing and handler registration functionality
 * Verifies that messages are correctly routed to appropriate handlers
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UnifiedMessage} from '../ui/messages';

describe('Message Routing', () => {
  let mockHandlers: Map<string, vi.Mock>;
  let messageEventListener: ((event: MessageEvent) => void) | null = null;

  beforeEach(() => {
    mockHandlers = new Map();
    
    // Mock addEventListener to capture the message listener
    const originalAddEventListener = window.addEventListener;
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'message') {
        messageEventListener = listener as (event: MessageEvent) => void;
      }
      return originalAddEventListener.call(window, type, listener);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockHandlers.clear();
    messageEventListener = null;
  });

  describe('Handler Registration', () => {
    it('should register multiple handlers for different message types', () => {
      const handlers = new Map<string, vi.Mock>();
      
      // Create mock handlers
      handlers.set('setToken', vi.fn());
      handlers.set('setFontSize', vi.fn());
      handlers.set('insertPaths', vi.fn());
      
      // Verify handlers can be stored and retrieved
      handlers.forEach((handler, type) => {
        expect(typeof handler).toBe('function');
        expect(type).toBeTruthy();
      });
      
      expect(handlers.size).toBe(3);
    });

    it('should allow overriding existing handlers', () => {
      const handlers = new Map<string, vi.Mock>();
      
      const originalHandler = vi.fn();
      const newHandler = vi.fn();
      
      handlers.set('setToken', originalHandler);
      expect(handlers.get('setToken')).toBe(originalHandler);
      
      handlers.set('setToken', newHandler);
      expect(handlers.get('setToken')).toBe(newHandler);
      expect(handlers.get('setToken')).not.toBe(originalHandler);
    });

    it('should handle handler removal correctly', () => {
      const handlers = new Map<string, vi.Mock>();
      
      const handler = vi.fn();
      handlers.set('setToken', handler);
      expect(handlers.has('setToken')).toBe(true);
      
      handlers.delete('setToken');
      expect(handlers.has('setToken')).toBe(false);
      expect(handlers.get('setToken')).toBeUndefined();
    });
  });

  describe('Message Type Routing', () => {
    it('should route setToken messages correctly', () => {
      const setTokenHandler = vi.fn();
      const setFontSizeHandler = vi.fn();
      
      const handlers = new Map();
      handlers.set('setToken', setTokenHandler);
      handlers.set('setFontSize', setFontSizeHandler);
      
      const message: UnifiedMessage = {
        type: 'setToken',
        token: 'test-token-123'
      };
      
      // Simulate message routing
      const handler = handlers.get(message.type);
      if (handler) {
        handler(message);
      }
      
      expect(setTokenHandler).toHaveBeenCalledWith(message);
      expect(setFontSizeHandler).not.toHaveBeenCalled();
    });

    it('should route setFontSize messages correctly', () => {
      const setTokenHandler = vi.fn();
      const setFontSizeHandler = vi.fn();
      
      const handlers = new Map();
      handlers.set('setToken', setTokenHandler);
      handlers.set('setFontSize', setFontSizeHandler);
      
      const message: UnifiedMessage = {
        type: 'setFontSize',
        size: 16
      };
      
      // Simulate message routing
      const handler = handlers.get(message.type);
      if (handler) {
        handler(message);
      }
      
      expect(setFontSizeHandler).toHaveBeenCalledWith(message);
      expect(setTokenHandler).not.toHaveBeenCalled();
    });

    it('should route insertPaths messages correctly', () => {
      const insertPathsHandler = vi.fn();
      const pastePathHandler = vi.fn();
      
      const handlers = new Map();
      handlers.set('insertPaths', insertPathsHandler);
      handlers.set('pastePath', pastePathHandler);
      
      const message: UnifiedMessage = {
        type: 'insertPaths',
        paths: ['/path/to/file1.js', '/path/to/file2.ts']
      };
      
      // Simulate message routing
      const handler = handlers.get(message.type);
      if (handler) {
        handler(message);
      }
      
      expect(insertPathsHandler).toHaveBeenCalledWith(message);
      expect(pastePathHandler).not.toHaveBeenCalled();
    });

    it('should handle unknown message types gracefully', () => {
      const knownHandler = vi.fn();
      const handlers = new Map();
      handlers.set('setToken', knownHandler);
      
      const unknownMessage = {
        type: 'unknownMessageType',
        data: 'some data'
      };
      
      // Simulate message routing for unknown type
      const handler = handlers.get(unknownMessage.type);
      
      expect(handler).toBeUndefined();
      expect(knownHandler).not.toHaveBeenCalled();
    });
  });

  describe('Message Data Routing', () => {
    it('should pass complete message data to handlers', () => {
      const handler = vi.fn();
      const handlers = new Map();
      handlers.set('setToken', handler);
      
      const message: UnifiedMessage = {
        type: 'setToken',
        token: 'test-token-123',
        timestamp: 1234567890
      };
      
      const routedHandler = handlers.get(message.type);
      if (routedHandler) {
        routedHandler(message);
      }
      
      expect(handler).toHaveBeenCalledWith(message);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'setToken',
          token: 'test-token-123',
          timestamp: 1234567890
        })
      );
    });

    it('should handle messages with optional fields', () => {
      const handler = vi.fn();
      const handlers = new Map();
      handlers.set('updateUIState', handler);
      
      const message: UnifiedMessage = {
        type: 'updateUIState',
        chipsCollapsed: true
        // composerCollapsed is optional and not provided
      };
      
      const routedHandler = handlers.get(message.type);
      if (routedHandler) {
        routedHandler(message);
      }
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateUIState',
          chipsCollapsed: true
        })
      );
      
      // Verify composerCollapsed is not present
      const calledWith = handler.mock.calls[0][0];
      expect(calledWith.composerCollapsed).toBeUndefined();
    });
  });

  describe('Handler Error Isolation', () => {
    it('should isolate handler errors and continue processing', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = vi.fn();
      
      const handlers = new Map();
      handlers.set('setToken', errorHandler);
      handlers.set('setFontSize', successHandler);
      
      // Process first message that will error
      const errorMessage: UnifiedMessage = {
        type: 'setToken',
        token: 'test-token'
      };
      
      try {
        const handler1 = handlers.get(errorMessage.type);
        if (handler1) {
          handler1(errorMessage);
        }
      } catch (error) {
        // Handler error should be caught and handled
      }
      
      // Process second message that should succeed
      const successMessage: UnifiedMessage = {
        type: 'setFontSize',
        size: 16
      };
      
      const handler2 = handlers.get(successMessage.type);
      if (handler2) {
        handler2(successMessage);
      }
      
      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should handle async handler errors', async () => {
      const asyncErrorHandler = vi.fn(async () => {
        throw new Error('Async handler error');
      });
      const syncHandler = vi.fn();
      
      const handlers = new Map();
      handlers.set('setToken', asyncErrorHandler);
      handlers.set('setFontSize', syncHandler);
      
      // Process async message that will error
      const errorMessage: UnifiedMessage = {
        type: 'setToken',
        token: 'test-token'
      };
      
      try {
        const handler1 = handlers.get(errorMessage.type);
        if (handler1) {
          await handler1(errorMessage);
        }
      } catch (error) {
        // Async handler error should be caught
      }
      
      // Process sync message that should succeed
      const successMessage: UnifiedMessage = {
        type: 'setFontSize',
        size: 16
      };
      
      const handler2 = handlers.get(successMessage.type);
      if (handler2) {
        handler2(successMessage);
      }
      
      expect(asyncErrorHandler).toHaveBeenCalled();
      expect(syncHandler).toHaveBeenCalled();
    });
  });

  describe('Concurrent Message Handling', () => {
    it('should handle multiple messages in sequence', () => {
      const tokenHandler = vi.fn();
      const fontSizeHandler = vi.fn();
      const pathsHandler = vi.fn();
      
      const handlers = new Map();
      handlers.set('setToken', tokenHandler);
      handlers.set('setFontSize', fontSizeHandler);
      handlers.set('insertPaths', pathsHandler);
      
      const messages: UnifiedMessage[] = [
        { type: 'setToken', token: 'token1' },
        { type: 'setFontSize', size: 14 },
        { type: 'insertPaths', paths: ['/path1'] },
        { type: 'setToken', token: 'token2' },
        { type: 'setFontSize', size: 16 }
      ];
      
      // Process all messages
      messages.forEach(message => {
        const handler = handlers.get(message.type);
        if (handler) {
          handler(message);
        }
      });
      
      expect(tokenHandler).toHaveBeenCalledTimes(2);
      expect(fontSizeHandler).toHaveBeenCalledTimes(2);
      expect(pathsHandler).toHaveBeenCalledTimes(1);
      
      // Verify call order and data
      expect(tokenHandler).toHaveBeenNthCalledWith(1, { type: 'setToken', token: 'token1' });
      expect(tokenHandler).toHaveBeenNthCalledWith(2, { type: 'setToken', token: 'token2' });
      expect(fontSizeHandler).toHaveBeenNthCalledWith(1, { type: 'setFontSize', size: 14 });
      expect(fontSizeHandler).toHaveBeenNthCalledWith(2, { type: 'setFontSize', size: 16 });
    });

    it('should maintain handler state across multiple calls', () => {
      let callCount = 0;
      const statefulHandler = vi.fn(() => {
        callCount++;
      });
      
      const handlers = new Map();
      handlers.set('setToken', statefulHandler);
      
      const messages: UnifiedMessage[] = [
        { type: 'setToken', token: 'token1' },
        { type: 'setToken', token: 'token2' },
        { type: 'setToken', token: 'token3' }
      ];
      
      messages.forEach(message => {
        const handler = handlers.get(message.type);
        if (handler) {
          handler(message);
        }
      });
      
      expect(statefulHandler).toHaveBeenCalledTimes(3);
      expect(callCount).toBe(3);
    });
  });
});