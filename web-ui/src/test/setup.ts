/**
 * Test setup file for Vitest
 * Configures the testing environment for web UI message system tests
 */

import {afterEach, beforeEach} from 'vitest';

// Mock console methods to avoid noise in tests
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug
};

// Global test setup
beforeEach(() => {
  // Reset DOM
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  
  // Clear any existing global functions
  const globalFunctions = [
    '__setToken',
    '__setParentOrigin',
    '__setFontSize', 
    '__insertPaths',
    '__pastePath',
    '__updateSessionCommand',
    '__updateOpenedFiles',
    '__setTooltipPolyfill',
    '__setCurrentFile',
    '__setOpenedFiles',
    '__insertPaths_direct',
    '__setSessionConfig',
    '__restartSession'
  ];

  globalFunctions.forEach(funcName => {
    delete (window as any)[funcName];
  });

  // Reset window location for standalone mode tests
  Object.defineProperty(window, 'location', {
    value: {
      hostname: 'localhost',
      protocol: 'http:',
      href: 'http://localhost:3000'
    },
    writable: true
  });

  // Reset window.parent for standalone mode tests
  Object.defineProperty(window, 'parent', {
    value: window,
    writable: true
  });

  // Clear any existing message event listeners
  window.removeEventListener('message', () => {});
});

afterEach(() => {
  // Clean up any remaining DOM elements
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

// Mock process.env for tests
(globalThis as any).process = {
  env: {
    NODE_ENV: 'test'
  }
};