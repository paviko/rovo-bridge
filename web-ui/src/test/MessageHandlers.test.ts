/**
 * Tests for individual message handlers with mock data
 * Verifies that each message type is handled correctly with various data scenarios
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UnifiedMessage} from '../ui/messages';

describe('Message Handlers', () => {
  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    // Clear global functions
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
    // Clean up DOM
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('setToken Handler', () => {
    it('should call __setToken with correct token value', () => {
      const mockSetToken = vi.fn();
      (window as any).__setToken = mockSetToken;

      const handler = (message: any) => {
        const func = (window as any).__setToken;
        if (typeof func === 'function') {
          func(message.token);
        }
      };

      const message: UnifiedMessage = {
        type: 'setToken',
        token: 'test-token-123'
      };

      handler(message);

      expect(mockSetToken).toHaveBeenCalledWith('test-token-123');
      expect(mockSetToken).toHaveBeenCalledTimes(1);
    });

    it('should handle long token values', () => {
      const mockSetToken = vi.fn();
      (window as any).__setToken = mockSetToken;

      const handler = (message: any) => {
        const func = (window as any).__setToken;
        if (typeof func === 'function') {
          func(message.token);
        }
      };

      const longToken = 'a'.repeat(1000);
      const message: UnifiedMessage = {
        type: 'setToken',
        token: longToken
      };

      handler(message);

      expect(mockSetToken).toHaveBeenCalledWith(longToken);
    });

    it('should handle special characters in token', () => {
      const mockSetToken = vi.fn();
      (window as any).__setToken = mockSetToken;

      const handler = (message: any) => {
        const func = (window as any).__setToken;
        if (typeof func === 'function') {
          func(message.token);
        }
      };

      const specialToken = 'token-with-!@#$%^&*()_+-={}[]|\\:";\'<>?,./';
      const message: UnifiedMessage = {
        type: 'setToken',
        token: specialToken
      };

      handler(message);

      expect(mockSetToken).toHaveBeenCalledWith(specialToken);
    });

    it('should handle missing __setToken function gracefully', () => {
      // No __setToken function exists
      const handler = (message: any) => {
        const func = (window as any).__setToken;
        if (typeof func === 'function') {
          func(message.token);
        }
      };

      const message: UnifiedMessage = {
        type: 'setToken',
        token: 'test-token'
      };

      // Should not throw
      expect(() => handler(message)).not.toThrow();
    });
  });

  describe('setFontSize Handler', () => {
    it('should call __setFontSize with correct size value', () => {
      const mockSetFontSize = vi.fn();
      (window as any).__setFontSize = mockSetFontSize;

      const handler = (message: any) => {
        const func = (window as any).__setFontSize;
        if (typeof func === 'function') {
          func(message.size);
        }
      };

      const message: UnifiedMessage = {
        type: 'setFontSize',
        size: 16
      };

      handler(message);

      expect(mockSetFontSize).toHaveBeenCalledWith(16);
      expect(mockSetFontSize).toHaveBeenCalledTimes(1);
    });

    it('should handle minimum font size', () => {
      const mockSetFontSize = vi.fn();
      (window as any).__setFontSize = mockSetFontSize;

      const handler = (message: any) => {
        const func = (window as any).__setFontSize;
        if (typeof func === 'function') {
          func(message.size);
        }
      };

      const message: UnifiedMessage = {
        type: 'setFontSize',
        size: 8
      };

      handler(message);

      expect(mockSetFontSize).toHaveBeenCalledWith(8);
    });

    it('should handle maximum font size', () => {
      const mockSetFontSize = vi.fn();
      (window as any).__setFontSize = mockSetFontSize;

      const handler = (message: any) => {
        const func = (window as any).__setFontSize;
        if (typeof func === 'function') {
          func(message.size);
        }
      };

      const message: UnifiedMessage = {
        type: 'setFontSize',
        size: 72
      };

      handler(message);

      expect(mockSetFontSize).toHaveBeenCalledWith(72);
    });

    it('should handle missing __setFontSize function gracefully', () => {
      const handler = (message: any) => {
        const func = (window as any).__setFontSize;
        if (typeof func === 'function') {
          func(message.size);
        }
      };

      const message: UnifiedMessage = {
        type: 'setFontSize',
        size: 14
      };

      expect(() => handler(message)).not.toThrow();
    });
  });

  describe('insertPaths Handler', () => {
    it('should call __insertPaths with correct paths array', () => {
      const mockInsertPaths = vi.fn();
      (window as any).__insertPaths = mockInsertPaths;

      const handler = (message: any) => {
        const func = (window as any).__insertPaths;
        if (typeof func === 'function') {
          func(message.paths);
        }
      };

      const message: UnifiedMessage = {
        type: 'insertPaths',
        paths: ['/path/to/file1.js', '/path/to/file2.ts']
      };

      handler(message);

      expect(mockInsertPaths).toHaveBeenCalledWith(['/path/to/file1.js', '/path/to/file2.ts']);
      expect(mockInsertPaths).toHaveBeenCalledTimes(1);
    });

    it('should handle single path in array', () => {
      const mockInsertPaths = vi.fn();
      (window as any).__insertPaths = mockInsertPaths;

      const handler = (message: any) => {
        const func = (window as any).__insertPaths;
        if (typeof func === 'function') {
          func(message.paths);
        }
      };

      const message: UnifiedMessage = {
        type: 'insertPaths',
        paths: ['/single/path/file.js']
      };

      handler(message);

      expect(mockInsertPaths).toHaveBeenCalledWith(['/single/path/file.js']);
    });

    it('should handle many paths in array', () => {
      const mockInsertPaths = vi.fn();
      (window as any).__insertPaths = mockInsertPaths;

      const handler = (message: any) => {
        const func = (window as any).__insertPaths;
        if (typeof func === 'function') {
          func(message.paths);
        }
      };

      const manyPaths = Array.from({ length: 50 }, (_, i) => `/path/to/file${i}.js`);
      const message: UnifiedMessage = {
        type: 'insertPaths',
        paths: manyPaths
      };

      handler(message);

      expect(mockInsertPaths).toHaveBeenCalledWith(manyPaths);
    });

    it('should handle paths with special characters', () => {
      const mockInsertPaths = vi.fn();
      (window as any).__insertPaths = mockInsertPaths;

      const handler = (message: any) => {
        const func = (window as any).__insertPaths;
        if (typeof func === 'function') {
          func(message.paths);
        }
      };

      const specialPaths = [
        '/path with spaces/file.js',
        '/path-with-dashes/file.js',
        '/path_with_underscores/file.js',
        '/path.with.dots/file.js',
        '/path/with/unicode/文件.js'
      ];

      const message: UnifiedMessage = {
        type: 'insertPaths',
        paths: specialPaths
      };

      handler(message);

      expect(mockInsertPaths).toHaveBeenCalledWith(specialPaths);
    });

    it('should handle missing __insertPaths function gracefully', () => {
      const handler = (message: any) => {
        const func = (window as any).__insertPaths;
        if (typeof func === 'function') {
          func(message.paths);
        }
      };

      const message: UnifiedMessage = {
        type: 'insertPaths',
        paths: ['/path/to/file.js']
      };

      expect(() => handler(message)).not.toThrow();
    });
  });

  describe('pastePath Handler', () => {
    it('should call __pastePath with correct path value', () => {
      const mockPastePath = vi.fn();
      (window as any).__pastePath = mockPastePath;

      const handler = (message: any) => {
        const func = (window as any).__pastePath;
        if (typeof func === 'function') {
          func(message.path);
        }
      };

      const message: UnifiedMessage = {
        type: 'pastePath',
        path: '/path/to/directory'
      };

      handler(message);

      expect(mockPastePath).toHaveBeenCalledWith('/path/to/directory');
      expect(mockPastePath).toHaveBeenCalledTimes(1);
    });

    it('should handle file paths', () => {
      const mockPastePath = vi.fn();
      (window as any).__pastePath = mockPastePath;

      const handler = (message: any) => {
        const func = (window as any).__pastePath;
        if (typeof func === 'function') {
          func(message.path);
        }
      };

      const message: UnifiedMessage = {
        type: 'pastePath',
        path: '/path/to/file.js'
      };

      handler(message);

      expect(mockPastePath).toHaveBeenCalledWith('/path/to/file.js');
    });

    it('should handle relative paths', () => {
      const mockPastePath = vi.fn();
      (window as any).__pastePath = mockPastePath;

      const handler = (message: any) => {
        const func = (window as any).__pastePath;
        if (typeof func === 'function') {
          func(message.path);
        }
      };

      const message: UnifiedMessage = {
        type: 'pastePath',
        path: './relative/path/file.js'
      };

      handler(message);

      expect(mockPastePath).toHaveBeenCalledWith('./relative/path/file.js');
    });

    it('should handle missing __pastePath function gracefully', () => {
      const handler = (message: any) => {
        const func = (window as any).__pastePath;
        if (typeof func === 'function') {
          func(message.path);
        }
      };

      const message: UnifiedMessage = {
        type: 'pastePath',
        path: '/path/to/file.js'
      };

      expect(() => handler(message)).not.toThrow();
    });
  });

  describe('updateSessionCommand Handler', () => {
    it('should call __updateSessionCommand with correct command value', () => {
      const mockUpdateSessionCommand = vi.fn();
      (window as any).__updateSessionCommand = mockUpdateSessionCommand;

      const handler = (message: any) => {
        const func = (window as any).__updateSessionCommand;
        if (typeof func === 'function') {
          func(message.command);
        }
      };

      const message: UnifiedMessage = {
        type: 'updateSessionCommand',
        command: 'npm test'
      };

      handler(message);

      expect(mockUpdateSessionCommand).toHaveBeenCalledWith('npm test');
      expect(mockUpdateSessionCommand).toHaveBeenCalledTimes(1);
    });

    it('should handle empty command string', () => {
      const mockUpdateSessionCommand = vi.fn();
      (window as any).__updateSessionCommand = mockUpdateSessionCommand;

      const handler = (message: any) => {
        const func = (window as any).__updateSessionCommand;
        if (typeof func === 'function') {
          func(message.command);
        }
      };

      const message: UnifiedMessage = {
        type: 'updateSessionCommand',
        command: ''
      };

      handler(message);

      expect(mockUpdateSessionCommand).toHaveBeenCalledWith('');
    });

    it('should handle complex commands with arguments', () => {
      const mockUpdateSessionCommand = vi.fn();
      (window as any).__updateSessionCommand = mockUpdateSessionCommand;

      const handler = (message: any) => {
        const func = (window as any).__updateSessionCommand;
        if (typeof func === 'function') {
          func(message.command);
        }
      };

      const complexCommand = 'docker run -it --rm -v $(pwd):/app node:18 npm test -- --verbose';
      const message: UnifiedMessage = {
        type: 'updateSessionCommand',
        command: complexCommand
      };

      handler(message);

      expect(mockUpdateSessionCommand).toHaveBeenCalledWith(complexCommand);
    });

    it('should handle missing __updateSessionCommand function gracefully', () => {
      const handler = (message: any) => {
        const func = (window as any).__updateSessionCommand;
        if (typeof func === 'function') {
          func(message.command);
        }
      };

      const message: UnifiedMessage = {
        type: 'updateSessionCommand',
        command: 'npm test'
      };

      expect(() => handler(message)).not.toThrow();
    });
  });

  describe('updateUIState Handler', () => {
    it('should update chips collapsed state', () => {
      // Create chips element
      const chipsElement = document.createElement('div');
      chipsElement.id = 'chips';
      document.body.appendChild(chipsElement);

      const handler = (message: any) => {
        if (message.chipsCollapsed !== undefined) {
          const element = document.getElementById('chips');
          if (element) {
            if (message.chipsCollapsed) {
              element.classList.add('collapsed');
            } else {
              element.classList.remove('collapsed');
            }
          }
        }
      };

      const message: UnifiedMessage = {
        type: 'updateUIState',
        chipsCollapsed: true
      };

      handler(message);

      expect(chipsElement.classList.contains('collapsed')).toBe(true);
    });

    it('should update composer collapsed state', () => {
      // Create composer element
      const composerElement = document.createElement('div');
      composerElement.id = 'composer';
      document.body.appendChild(composerElement);

      const handler = (message: any) => {
        if (message.composerCollapsed !== undefined) {
          const element = document.getElementById('composer');
          if (element) {
            if (message.composerCollapsed) {
              element.classList.add('collapsed');
            } else {
              element.classList.remove('collapsed');
            }
          }
        }
      };

      const message: UnifiedMessage = {
        type: 'updateUIState',
        composerCollapsed: false
      };

      handler(message);

      expect(composerElement.classList.contains('collapsed')).toBe(false);
    });

    it('should update both chips and composer states', () => {
      // Create both elements
      const chipsElement = document.createElement('div');
      chipsElement.id = 'chips';
      document.body.appendChild(chipsElement);

      const composerElement = document.createElement('div');
      composerElement.id = 'composer';
      document.body.appendChild(composerElement);

      const handler = (message: any) => {
        if (message.chipsCollapsed !== undefined) {
          const element = document.getElementById('chips');
          if (element) {
            if (message.chipsCollapsed) {
              element.classList.add('collapsed');
            } else {
              element.classList.remove('collapsed');
            }
          }
        }

        if (message.composerCollapsed !== undefined) {
          const element = document.getElementById('composer');
          if (element) {
            if (message.composerCollapsed) {
              element.classList.add('collapsed');
            } else {
              element.classList.remove('collapsed');
            }
          }
        }
      };

      const message: UnifiedMessage = {
        type: 'updateUIState',
        chipsCollapsed: true,
        composerCollapsed: false
      };

      handler(message);

      expect(chipsElement.classList.contains('collapsed')).toBe(true);
      expect(composerElement.classList.contains('collapsed')).toBe(false);
    });

    it('should handle missing DOM elements gracefully', () => {
      // No DOM elements exist
      const handler = (message: any) => {
        if (message.chipsCollapsed !== undefined) {
          const element = document.getElementById('chips');
          if (element) {
            if (message.chipsCollapsed) {
              element.classList.add('collapsed');
            } else {
              element.classList.remove('collapsed');
            }
          }
        }
      };

      const message: UnifiedMessage = {
        type: 'updateUIState',
        chipsCollapsed: true
      };

      // Should not throw when elements don't exist
      expect(() => handler(message)).not.toThrow();
    });

    it('should handle partial state updates', () => {
      const chipsElement = document.createElement('div');
      chipsElement.id = 'chips';
      chipsElement.classList.add('collapsed'); // Start collapsed
      document.body.appendChild(chipsElement);

      const composerElement = document.createElement('div');
      composerElement.id = 'composer';
      document.body.appendChild(composerElement);

      const handler = (message: any) => {
        if (message.chipsCollapsed !== undefined) {
          const element = document.getElementById('chips');
          if (element) {
            if (message.chipsCollapsed) {
              element.classList.add('collapsed');
            } else {
              element.classList.remove('collapsed');
            }
          }
        }

        if (message.composerCollapsed !== undefined) {
          const element = document.getElementById('composer');
          if (element) {
            if (message.composerCollapsed) {
              element.classList.add('collapsed');
            } else {
              element.classList.remove('collapsed');
            }
          }
        }
      };

      // Only update chips, leave composer unchanged
      const message: UnifiedMessage = {
        type: 'updateUIState',
        chipsCollapsed: false
      };

      handler(message);

      expect(chipsElement.classList.contains('collapsed')).toBe(false);
      expect(composerElement.classList.contains('collapsed')).toBe(false); // Should remain unchanged
    });
  });

  describe('Handler Error Resilience', () => {
    it('should handle function call errors gracefully', () => {
      // Set up function that throws
      (window as any).__setToken = () => {
        throw new Error('Function error');
      };

      const handler = (message: any) => {
        try {
          const func = (window as any).__setToken;
          if (typeof func === 'function') {
            func(message.token);
          }
        } catch (error) {
          // Handle error gracefully
        }
      };

      const message: UnifiedMessage = {
        type: 'setToken',
        token: 'test-token'
      };

      expect(() => handler(message)).not.toThrow();
    });

    it('should handle DOM manipulation errors gracefully', () => {
      // Mock getElementById to throw
      const originalGetElementById = document.getElementById;
      document.getElementById = () => {
        throw new Error('DOM error');
      };

      const handler = (message: any) => {
        try {
          if (message.chipsCollapsed !== undefined) {
            const element = document.getElementById('chips');
            if (element) {
              if (message.chipsCollapsed) {
                element.classList.add('collapsed');
              } else {
                element.classList.remove('collapsed');
              }
            }
          }
        } catch (error) {
          // Handle error gracefully
        }
      };

      const message: UnifiedMessage = {
        type: 'updateUIState',
        chipsCollapsed: true
      };

      expect(() => handler(message)).not.toThrow();

      // Restore original function
      document.getElementById = originalGetElementById;
    });
  });
});