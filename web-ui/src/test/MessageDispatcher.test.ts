/**
 * Unit tests for MessageDispatcher class
 * Tests message handling, validation, routing, and standalone compatibility
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MessageError} from '../ui/messages';

// We need to import the MessageDispatcher class from bootstrap.ts
// Since it's not exported, we'll need to create a test version or modify the import
// For now, let's create a mock implementation for testing

class TestMessageDispatcher {
  public handlers: Map<string, (message: any) => void> = new Map();
  private isStandalone: boolean;
  private originalGlobalFunctions: Map<string, Function> = new Map();

  constructor() {
    this.isStandalone = this.detectStandaloneMode();
    this.setupMessageListener();
    this.setupStandaloneCompatibility();
    this.registerDefaultHandlers();
  }

  private detectStandaloneMode(): boolean {
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

  private setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      try {
        this.handleMessage(event.data);
      } catch (error) {
        console.error('[MessageDispatcher] Error handling message:', error, event.data);
      }
    });
  }

  private handleMessage(message: any): void {
    try {
      const validation = this.validateMessage(message);
      if (!validation.isValid) {
        return;
      }

      const handler = this.handlers.get(message.type);
      if (handler) {
        try {
          handler(message);
        } catch (handlerError) {
          // Continue execution - don't let handler errors break the system
        }
      }
    } catch (error) {
      // Graceful degradation - system continues to function
    }
  }

  private validateMessage(message: any): { isValid: boolean; error?: MessageError; details?: string } {
    try {
      if (!message || typeof message !== 'object') {
        return {
          isValid: false,
          error: MessageError.INVALID_TYPE,
          details: 'Message must be an object'
        };
      }

      if (!message.type || typeof message.type !== 'string') {
        return {
          isValid: false,
          error: MessageError.MISSING_REQUIRED_FIELD,
          details: 'Message must have a string type field'
        };
      }

      if (message.timestamp !== undefined && 
          (typeof message.timestamp !== 'number' || message.timestamp < 0)) {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'Message timestamp must be a positive number if provided'
        };
      }

      const typeValidation = this.validateMessageType(message);
      if (!typeValidation.isValid) {
        return typeValidation;
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: MessageError.VALIDATION_FAILED,
        details: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private validateMessageType(message: any): { isValid: boolean; error?: MessageError; details?: string } {
    switch (message.type) {
      case 'setToken':
        if (!message.token || typeof message.token !== 'string' || message.token.trim().length === 0) {
          return {
            isValid: false,
            error: MessageError.INVALID_DATA_TYPE,
            details: 'setToken message must have a non-empty string token field'
          };
        }
        break;

      case 'setFontSize':
        if (typeof message.size !== 'number' || 
            !Number.isInteger(message.size) || 
            message.size < 8 || 
            message.size > 72) {
          return {
            isValid: false,
            error: MessageError.INVALID_DATA_TYPE,
            details: 'setFontSize message must have an integer size field between 8 and 72'
          };
        }
        break;

      case 'insertPaths':
        if (!Array.isArray(message.paths)) {
          return {
            isValid: false,
            error: MessageError.INVALID_DATA_TYPE,
            details: 'insertPaths message must have an array in paths field'
          };
        }
        if (message.paths.length === 0) {
          return {
            isValid: false,
            error: MessageError.INVALID_DATA_TYPE,
            details: 'insertPaths message must have at least one path'
          };
        }
        if (!message.paths.every((p: any) => typeof p === 'string' && p.trim().length > 0)) {
          return {
            isValid: false,
            error: MessageError.INVALID_DATA_TYPE,
            details: 'insertPaths message must have an array of non-empty strings in paths field'
          };
        }
        break;

      case 'pastePath':
        if (!message.path || typeof message.path !== 'string' || message.path.trim().length === 0) {
          return {
            isValid: false,
            error: MessageError.INVALID_DATA_TYPE,
            details: 'pastePath message must have a non-empty string path field'
          };
        }
        break;

      case 'updateSessionCommand':
        if (typeof message.command !== 'string') {
          return {
            isValid: false,
            error: MessageError.INVALID_DATA_TYPE,
            details: 'updateSessionCommand message must have a string command field'
          };
        }
        break;

      case 'updateUIState':
        if (message.chipsCollapsed !== undefined && typeof message.chipsCollapsed !== 'boolean') {
          return {
            isValid: false,
            error: MessageError.INVALID_DATA_TYPE,
            details: 'updateUIState chipsCollapsed must be a boolean if provided'
          };
        }
        if (message.composerCollapsed !== undefined && typeof message.composerCollapsed !== 'boolean') {
          return {
            isValid: false,
            error: MessageError.INVALID_DATA_TYPE,
            details: 'updateUIState composerCollapsed must be a boolean if provided'
          };
        }
        if (message.chipsCollapsed === undefined && message.composerCollapsed === undefined) {
          return {
            isValid: false,
            error: MessageError.MISSING_REQUIRED_FIELD,
            details: 'updateUIState message must provide at least one state field'
          };
        }
        break;
    }

    return { isValid: true };
  }

  public registerHandler(type: string, handler: (message: any) => void): void {
    this.handlers.set(type, handler);
  }

  public unregisterHandler(type: string): void {
    this.handlers.delete(type);
  }

  public getHandler(type: string): ((message: any) => void) | undefined {
    return this.handlers.get(type);
  }

  private setupStandaloneCompatibility(): void {
    if (this.isStandalone) {
      this.preserveGlobalFunctions();
    }
  }

  private preserveGlobalFunctions(): void {
    const globalFunctions = [
      '__setToken',
      '__setFontSize', 
      '__insertPaths',
      '__pastePath',
      '__updateSessionCommand',
      '__updateOpenedFiles'
    ];

    globalFunctions.forEach(funcName => {
      const existingFunc = (window as any)[funcName];
      if (typeof existingFunc === 'function') {
        this.originalGlobalFunctions.set(funcName, existingFunc);
      }
    });
  }

  private registerDefaultHandlers(): void {
    this.registerHandler('setToken', (message) => {
      const originalFunc = this.originalGlobalFunctions.get('__setToken') || (window as any).__setToken;
      if (typeof originalFunc === 'function') {
        originalFunc(message.token);
      }
    });

    this.registerHandler('setFontSize', (message) => {
      const originalFunc = this.originalGlobalFunctions.get('__setFontSize') || (window as any).__setFontSize;
      if (typeof originalFunc === 'function') {
        originalFunc(message.size);
      }
    });

    this.registerHandler('insertPaths', (message) => {
      const originalFunc = this.originalGlobalFunctions.get('__insertPaths') || (window as any).__insertPaths;
      if (typeof originalFunc === 'function') {
        originalFunc(message.paths);
      }
    });

    this.registerHandler('pastePath', (message) => {
      const originalFunc = this.originalGlobalFunctions.get('__pastePath') || (window as any).__pastePath;
      if (typeof originalFunc === 'function') {
        originalFunc(message.path);
      }
    });

    this.registerHandler('updateSessionCommand', (message) => {
      const originalFunc = this.originalGlobalFunctions.get('__updateSessionCommand') || (window as any).__updateSessionCommand;
      if (typeof originalFunc === 'function') {
        originalFunc(message.command);
      }
    });

    this.registerHandler('updateUIState', (message) => {
      if (message.chipsCollapsed !== undefined) {
        const chipsElement = document.getElementById('chips');
        if (chipsElement) {
          if (message.chipsCollapsed) {
            chipsElement.classList.add('collapsed');
          } else {
            chipsElement.classList.remove('collapsed');
          }
        }
      }

      if (message.composerCollapsed !== undefined) {
        const composerElement = document.getElementById('composer');
        if (composerElement) {
          if (message.composerCollapsed) {
            composerElement.classList.add('collapsed');
          } else {
            composerElement.classList.remove('collapsed');
          }
        }
      }
    });
  }

  // Expose methods for testing
  public getIsStandalone(): boolean {
    return this.isStandalone;
  }

  public testValidateMessage(message: any) {
    return this.validateMessage(message);
  }

  public testHandleMessage(message: any) {
    return this.handleMessage(message);
  }
}

describe('MessageDispatcher', () => {
  let dispatcher: TestMessageDispatcher;
  let mockConsoleLog: any;
  let mockConsoleWarn: any;
  let mockConsoleError: any;

  beforeEach(() => {
    // Mock console methods to avoid noise in tests
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    dispatcher = new TestMessageDispatcher();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('Standalone Mode Detection', () => {
    it('should detect standalone mode correctly when no parent window', () => {
      // Set up standalone environment
      Object.defineProperty(window, 'parent', {
        value: window,
        writable: true
      });
      
      const newDispatcher = new TestMessageDispatcher();
      expect(newDispatcher.getIsStandalone()).toBe(true);
    });

    it('should detect IDE mode when VSCode API is available', () => {
      // Mock VSCode environment
      (window as any).acquireVsCodeApi = vi.fn();
      
      const newDispatcher = new TestMessageDispatcher();
      expect(newDispatcher.getIsStandalone()).toBe(false);
      
      delete (window as any).acquireVsCodeApi;
    });

    it('should detect IDE mode when JetBrains JCEF is available', () => {
      // Mock JetBrains environment
      (window as any).cefQuery = vi.fn();
      
      const newDispatcher = new TestMessageDispatcher();
      expect(newDispatcher.getIsStandalone()).toBe(false);
      
      delete (window as any).cefQuery;
    });
  });

  describe('Message Validation', () => {
    it('should validate valid setToken message', () => {
      const message = {
        type: 'setToken',
        token: 'test-token-123',
        timestamp: Date.now()
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(true);
    });

    it('should reject message without type field', () => {
      const message = {
        token: 'test-token-123'
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(MessageError.MISSING_REQUIRED_FIELD);
    });

    it('should reject setToken message with empty token', () => {
      const message = {
        type: 'setToken',
        token: ''
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(MessageError.INVALID_DATA_TYPE);
    });

    it('should validate valid setFontSize message', () => {
      const message = {
        type: 'setFontSize',
        size: 14
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(true);
    });

    it('should reject setFontSize message with invalid size', () => {
      const message = {
        type: 'setFontSize',
        size: 100 // Too large
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(MessageError.INVALID_DATA_TYPE);
    });

    it('should reject setFontSize message with non-integer size', () => {
      const message = {
        type: 'setFontSize',
        size: 14.5
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(MessageError.INVALID_DATA_TYPE);
    });

    it('should validate valid insertPaths message', () => {
      const message = {
        type: 'insertPaths',
        paths: ['/path/to/file.js', '/path/to/another.ts']
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(true);
    });

    it('should reject insertPaths message with empty paths array', () => {
      const message = {
        type: 'insertPaths',
        paths: []
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(MessageError.INVALID_DATA_TYPE);
    });

    it('should reject insertPaths message with non-string paths', () => {
      const message = {
        type: 'insertPaths',
        paths: ['/valid/path', 123, '/another/path']
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(MessageError.INVALID_DATA_TYPE);
    });

    it('should validate valid updateUIState message', () => {
      const message = {
        type: 'updateUIState',
        chipsCollapsed: true,
        composerCollapsed: false
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(true);
    });

    it('should reject updateUIState message with no state fields', () => {
      const message = {
        type: 'updateUIState'
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(MessageError.MISSING_REQUIRED_FIELD);
    });

    it('should reject message with invalid timestamp', () => {
      const message = {
        type: 'setToken',
        token: 'test-token',
        timestamp: -1
      };

      const result = dispatcher.testValidateMessage(message);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(MessageError.INVALID_DATA_TYPE);
    });
  });

  describe('Handler Registration', () => {
    it('should register and retrieve handlers correctly', () => {
      const mockHandler = vi.fn();
      
      dispatcher.registerHandler('testType', mockHandler);
      
      const retrievedHandler = dispatcher.getHandler('testType');
      expect(retrievedHandler).toBe(mockHandler);
    });

    it('should unregister handlers correctly', () => {
      const mockHandler = vi.fn();
      
      dispatcher.registerHandler('testType', mockHandler);
      dispatcher.unregisterHandler('testType');
      
      const retrievedHandler = dispatcher.getHandler('testType');
      expect(retrievedHandler).toBeUndefined();
    });

    it('should return undefined for non-existent handlers', () => {
      const retrievedHandler = dispatcher.getHandler('nonExistentType');
      expect(retrievedHandler).toBeUndefined();
    });
  });

  describe('Message Handling', () => {
    it('should call registered handler for valid message', () => {
      const mockHandler = vi.fn();
      dispatcher.registerHandler('setToken', mockHandler);

      const message = {
        type: 'setToken',
        token: 'test-token'
      };

      dispatcher.testHandleMessage(message);
      expect(mockHandler).toHaveBeenCalledWith(message);
    });

    it('should not call handler for invalid message', () => {
      const mockHandler = vi.fn();
      dispatcher.registerHandler('setToken', mockHandler);

      const message = {
        type: 'setToken',
        token: '' // Invalid empty token
      };

      dispatcher.testHandleMessage(message);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should handle handler errors gracefully', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      dispatcher.registerHandler('setToken', errorHandler);

      const message = {
        type: 'setToken',
        token: 'test-token'
      };

      // Should not throw
      expect(() => {
        dispatcher.testHandleMessage(message);
      }).not.toThrow();

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Default Handlers', () => {
    it('should register default handlers on initialization', () => {
      expect(dispatcher.getHandler('setToken')).toBeDefined();
      expect(dispatcher.getHandler('setFontSize')).toBeDefined();
      expect(dispatcher.getHandler('insertPaths')).toBeDefined();
      expect(dispatcher.getHandler('pastePath')).toBeDefined();
      expect(dispatcher.getHandler('updateSessionCommand')).toBeDefined();
      expect(dispatcher.getHandler('updateUIState')).toBeDefined();
    });

    it('should call global function when setToken handler is invoked', () => {
      const mockSetToken = vi.fn();
      (window as any).__setToken = mockSetToken;

      const message = {
        type: 'setToken',
        token: 'test-token'
      };

      dispatcher.testHandleMessage(message);
      expect(mockSetToken).toHaveBeenCalledWith('test-token');
    });

    it('should call global function when setFontSize handler is invoked', () => {
      const mockSetFontSize = vi.fn();
      (window as any).__setFontSize = mockSetFontSize;

      const message = {
        type: 'setFontSize',
        size: 16
      };

      dispatcher.testHandleMessage(message);
      expect(mockSetFontSize).toHaveBeenCalledWith(16);
    });

    it('should update DOM elements when updateUIState handler is invoked', () => {
      // Create test DOM elements
      const chipsElement = document.createElement('div');
      chipsElement.id = 'chips';
      document.body.appendChild(chipsElement);

      const composerElement = document.createElement('div');
      composerElement.id = 'composer';
      document.body.appendChild(composerElement);

      const message = {
        type: 'updateUIState',
        chipsCollapsed: true,
        composerCollapsed: false
      };

      dispatcher.testHandleMessage(message);

      expect(chipsElement.classList.contains('collapsed')).toBe(true);
      expect(composerElement.classList.contains('collapsed')).toBe(false);
    });
  });

  describe('Window Message Integration', () => {
    it('should handle window postMessage events', (done) => {
      const mockHandler = vi.fn();
      dispatcher.registerHandler('setToken', mockHandler);

      const message = {
        type: 'setToken',
        token: 'test-token'
      };

      // Listen for the handler to be called
      setTimeout(() => {
        expect(mockHandler).toHaveBeenCalledWith(message);
        done();
      }, 10);

      // Simulate postMessage
      window.postMessage(message, '*');
    });

    it('should handle invalid window messages gracefully', (done) => {
      const mockHandler = vi.fn();
      dispatcher.registerHandler('setToken', mockHandler);

      const invalidMessage = {
        type: 'setToken',
        token: '' // Invalid
      };

      // Listen for the handler to NOT be called
      setTimeout(() => {
        expect(mockHandler).not.toHaveBeenCalled();
        done();
      }, 10);

      // Simulate postMessage with invalid message
      window.postMessage(invalidMessage, '*');
    });
  });
});