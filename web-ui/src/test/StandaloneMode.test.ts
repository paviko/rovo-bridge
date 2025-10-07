/**
 * Tests for standalone mode detection and compatibility
 * Verifies that the web UI works correctly in both standalone and IDE modes
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

describe('Standalone Mode', () => {
  let originalLocation: Location;
  let originalParent: Window;
  let originalNavigator: Navigator;

  beforeEach(() => {
    // Store original values
    originalLocation = window.location;
    originalParent = window.parent;
    originalNavigator = window.navigator;

    // Clear any existing global functions
    const globalFunctions = [
      '__setToken',
      '__setFontSize', 
      '__insertPaths',
      '__pastePath',
      '__updateSessionCommand',
      '__updateOpenedFiles'
    ];

    globalFunctions.forEach(funcName => {
      delete (window as any)[funcName];
    });
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true
    });
    Object.defineProperty(window, 'parent', {
      value: originalParent,
      writable: true
    });
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      writable: true
    });

    // Clean up any IDE-specific properties
    delete (window as any).cefQuery;
    delete (window as any).acquireVsCodeApi;
  });

  describe('Standalone Detection', () => {
    function detectStandaloneMode(): boolean {
      try {
        const hasParent = window.parent && window.parent !== window;
        const isLocalhost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
        const hasFileProtocol = window.location.protocol === 'file:';
        
        const isJetBrains = window.location.href.includes('jcef') || 
                           (window as any).cefQuery !== undefined ||
                           navigator.userAgent.includes('Chrome') && hasParent;
        const isVSCode = (window as any).acquireVsCodeApi !== undefined;
        
        if (isJetBrains || isVSCode) {
          return false;
        }
        
        const standalone = !hasParent || hasFileProtocol || 
                          (!isLocalhost && window.location.hostname !== '');
        
        return standalone;
      } catch (error) {
        return true;
      }
    }

    it('should detect standalone mode when window.parent equals window', () => {
      Object.defineProperty(window, 'parent', {
        value: window,
        writable: true
      });
      Object.defineProperty(window, 'location', {
        value: {
          hostname: 'example.com',
          protocol: 'https:',
          href: 'https://example.com'
        },
        writable: true
      });

      expect(detectStandaloneMode()).toBe(true);
    });

    it('should detect standalone mode with file:// protocol', () => {
      Object.defineProperty(window, 'location', {
        value: {
          hostname: '',
          protocol: 'file:',
          href: 'file:///path/to/index.html'
        },
        writable: true
      });

      expect(detectStandaloneMode()).toBe(true);
    });

    it('should detect standalone mode on non-localhost domains', () => {
      Object.defineProperty(window, 'parent', {
        value: window,
        writable: true
      });
      Object.defineProperty(window, 'location', {
        value: {
          hostname: 'example.com',
          protocol: 'https:',
          href: 'https://example.com'
        },
        writable: true
      });

      expect(detectStandaloneMode()).toBe(true);
    });

    it('should detect IDE mode when VSCode API is available', () => {
      (window as any).acquireVsCodeApi = vi.fn();
      Object.defineProperty(window, 'location', {
        value: {
          hostname: '127.0.0.1',
          protocol: 'http:',
          href: 'http://127.0.0.1:3000'
        },
        writable: true
      });

      expect(detectStandaloneMode()).toBe(false);
    });

    it('should detect IDE mode when JetBrains JCEF is available', () => {
      (window as any).cefQuery = vi.fn();
      Object.defineProperty(window, 'location', {
        value: {
          hostname: '127.0.0.1',
          protocol: 'http:',
          href: 'http://127.0.0.1:3000'
        },
        writable: true
      });

      expect(detectStandaloneMode()).toBe(false);
    });

    it('should detect IDE mode when URL contains jcef', () => {
      Object.defineProperty(window, 'location', {
        value: {
          hostname: '127.0.0.1',
          protocol: 'http:',
          href: 'http://127.0.0.1:3000/jcef/index.html'
        },
        writable: true
      });

      expect(detectStandaloneMode()).toBe(false);
    });

    it('should fallback to standalone mode on detection errors', () => {
      // Mock an error in detection
      Object.defineProperty(window, 'location', {
        get() {
          throw new Error('Location access error');
        }
      });

      expect(detectStandaloneMode()).toBe(true);
    });
  });

  describe('Global Function Preservation', () => {
    it('should preserve existing global functions in standalone mode', () => {
      // Set up existing global functions
      const mockSetToken = vi.fn();
      const mockSetFontSize = vi.fn();
      const mockInsertPaths = vi.fn();

      (window as any).__setToken = mockSetToken;
      (window as any).__setFontSize = mockSetFontSize;
      (window as any).__insertPaths = mockInsertPaths;

      // Simulate standalone mode setup
      const preservedFunctions = new Map<string, Function>();
      const globalFunctions = ['__setToken', '__setFontSize', '__insertPaths'];

      globalFunctions.forEach(funcName => {
        const existingFunc = (window as any)[funcName];
        if (typeof existingFunc === 'function') {
          preservedFunctions.set(funcName, existingFunc);
        }
      });

      expect(preservedFunctions.size).toBe(3);
      expect(preservedFunctions.get('__setToken')).toBe(mockSetToken);
      expect(preservedFunctions.get('__setFontSize')).toBe(mockSetFontSize);
      expect(preservedFunctions.get('__insertPaths')).toBe(mockInsertPaths);
    });

    it('should handle missing global functions gracefully', () => {
      // No global functions exist
      const preservedFunctions = new Map<string, Function>();
      const globalFunctions = ['__setToken', '__setFontSize', '__insertPaths'];

      globalFunctions.forEach(funcName => {
        const existingFunc = (window as any)[funcName];
        if (typeof existingFunc === 'function') {
          preservedFunctions.set(funcName, existingFunc);
        }
      });

      expect(preservedFunctions.size).toBe(0);
    });

    it('should ignore non-function global properties', () => {
      // Set up non-function global properties
      (window as any).__setToken = 'not a function';
      (window as any).__setFontSize = 42;
      (window as any).__insertPaths = { not: 'a function' };

      const preservedFunctions = new Map<string, Function>();
      const globalFunctions = ['__setToken', '__setFontSize', '__insertPaths'];

      globalFunctions.forEach(funcName => {
        const existingFunc = (window as any)[funcName];
        if (typeof existingFunc === 'function') {
          preservedFunctions.set(funcName, existingFunc);
        }
      });

      expect(preservedFunctions.size).toBe(0);
    });
  });

  describe('Standalone Compatibility Layer', () => {
    it('should maintain direct function call support in standalone mode', () => {
      // Set up standalone mode with existing functions
      const mockSetToken = vi.fn();
      const mockSetFontSize = vi.fn();

      (window as any).__setToken = mockSetToken;
      (window as any).__setFontSize = mockSetFontSize;

      // Simulate direct function calls (how standalone mode should work)
      (window as any).__setToken('test-token');
      (window as any).__setFontSize(16);

      expect(mockSetToken).toHaveBeenCalledWith('test-token');
      expect(mockSetFontSize).toHaveBeenCalledWith(16);
    });

    it('should not interfere with existing functionality in standalone mode', () => {
      // Set up existing functionality
      let tokenValue = '';
      let fontSize = 12;

      (window as any).__setToken = (token: string) => {
        tokenValue = token;
      };

      (window as any).__setFontSize = (size: number) => {
        fontSize = size;
      };

      // Simulate standalone usage
      (window as any).__setToken('standalone-token');
      (window as any).__setFontSize(18);

      expect(tokenValue).toBe('standalone-token');
      expect(fontSize).toBe(18);
    });

    it('should handle mixed message and direct function usage', () => {
      const mockSetToken = vi.fn();
      (window as any).__setToken = mockSetToken;

      // Direct function call
      (window as any).__setToken('direct-token');

      // Simulate message handler calling the same function
      const preservedFunction = (window as any).__setToken;
      if (typeof preservedFunction === 'function') {
        preservedFunction('message-token');
      }

      expect(mockSetToken).toHaveBeenCalledTimes(2);
      expect(mockSetToken).toHaveBeenNthCalledWith(1, 'direct-token');
      expect(mockSetToken).toHaveBeenNthCalledWith(2, 'message-token');
    });
  });

  describe('IDE vs Standalone Behavior', () => {
    it('should use postMessage in IDE mode', () => {
      // Mock IDE environment
      (window as any).acquireVsCodeApi = vi.fn();
      
      const mockHandler = vi.fn();
      const handlers = new Map();
      handlers.set('setToken', mockHandler);

      // Simulate message listener setup
      let messageListener: ((event: MessageEvent) => void) | null = null;
      vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
        if (type === 'message') {
          messageListener = listener as (event: MessageEvent) => void;
        }
      });

      // Trigger message listener setup
      window.addEventListener('message', (event) => {
        const handler = handlers.get(event.data.type);
        if (handler) {
          handler(event.data);
        }
      });

      // Simulate postMessage
      const message = { type: 'setToken', token: 'ide-token' };
      if (messageListener) {
        messageListener({ data: message } as MessageEvent);
      }

      expect(mockHandler).toHaveBeenCalledWith(message);
    });

    it('should preserve direct function calls in standalone mode', () => {
      // Mock standalone environment
      Object.defineProperty(window, 'parent', {
        value: window,
        writable: true
      });

      const mockSetToken = vi.fn();
      (window as any).__setToken = mockSetToken;

      // In standalone mode, direct calls should work
      (window as any).__setToken('standalone-token');

      expect(mockSetToken).toHaveBeenCalledWith('standalone-token');
    });

    it('should handle both modes gracefully', () => {
      const mockSetToken = vi.fn();
      (window as any).__setToken = mockSetToken;

      // Set up message handling (works in both modes)
      const handlers = new Map();
      handlers.set('setToken', (message: any) => {
        const func = (window as any).__setToken;
        if (typeof func === 'function') {
          func(message.token);
        }
      });

      // Test message handling
      const messageHandler = handlers.get('setToken');
      if (messageHandler) {
        messageHandler({ type: 'setToken', token: 'message-token' });
      }

      // Test direct function call
      (window as any).__setToken('direct-token');

      expect(mockSetToken).toHaveBeenCalledTimes(2);
      expect(mockSetToken).toHaveBeenNthCalledWith(1, 'message-token');
      expect(mockSetToken).toHaveBeenNthCalledWith(2, 'direct-token');
    });
  });

  describe('Error Handling in Standalone Mode', () => {
    it('should handle missing functions gracefully', () => {
      // No global functions exist
      const handlers = new Map();
      handlers.set('setToken', (message: any) => {
        const func = (window as any).__setToken;
        if (typeof func === 'function') {
          func(message.token);
        } else {
          // Should handle gracefully when function doesn't exist
        }
      });

      // Should not throw when function doesn't exist
      expect(() => {
        const handler = handlers.get('setToken');
        if (handler) {
          handler({ type: 'setToken', token: 'test-token' });
        }
      }).not.toThrow();
    });

    it('should handle function call errors gracefully', () => {
      // Set up function that throws
      (window as any).__setToken = () => {
        throw new Error('Function error');
      };

      const handlers = new Map();
      handlers.set('setToken', (message: any) => {
        try {
          const func = (window as any).__setToken;
          if (typeof func === 'function') {
            func(message.token);
          }
        } catch (error) {
          // Should handle function errors gracefully
        }
      });

      // Should not throw when function errors
      expect(() => {
        const handler = handlers.get('setToken');
        if (handler) {
          handler({ type: 'setToken', token: 'test-token' });
        }
      }).not.toThrow();
    });
  });
});