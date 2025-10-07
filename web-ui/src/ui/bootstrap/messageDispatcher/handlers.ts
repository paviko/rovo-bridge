import {isDev} from '../env';
import {state} from '../../state';

interface HandlerCtx {
  registerHandler: (type: string, handler: (message: any) => void) => void;
  originalGlobalFunctions: Map<string, Function>;
}

export function registerDefaultHandlers(ctx: HandlerCtx): void {
  // setParentOrigin handler - receives parent origin for secure communication
  ctx.registerHandler('setParentOrigin', (message) => {
    try {
      const originalFunc = ctx.originalGlobalFunctions.get('__setParentOrigin') || (window as any).__setParentOrigin;
      if (typeof originalFunc === 'function') {
        originalFunc(message.origin);
        if (isDev) console.log('[MessageDispatcher] setParentOrigin executed successfully');
      } else {
        console.warn('[MessageDispatcher] setParentOrigin: No __setParentOrigin function available');
      }
    } catch (error) {
      console.error('[MessageDispatcher] setParentOrigin handler error:', error);
    }
  });

  // setToken handler
  ctx.registerHandler('setToken', (message) => {
    try {
      const originalFunc = ctx.originalGlobalFunctions.get('__setToken') || (window as any).__setToken;
      if (typeof originalFunc === 'function') {
        originalFunc(message.token);
        if (isDev) console.log('[MessageDispatcher] setToken executed successfully');
      } else {
        console.warn('[MessageDispatcher] setToken: No __setToken function available');
      }
    } catch (error) {
      console.error('[MessageDispatcher] setToken handler error:', error);
    }
  });

  // setFontSize handler
  ctx.registerHandler('setFontSize', (message) => {
    try {
      const originalFunc = ctx.originalGlobalFunctions.get('__setFontSize') || (window as any).__setFontSize;
      if (typeof originalFunc === 'function') {
        originalFunc(message.size);
        if (isDev) console.log(`[MessageDispatcher] setFontSize executed successfully: ${message.size}`);
      } else {
        console.warn('[MessageDispatcher] setFontSize: No __setFontSize function available');
      }
    } catch (error) {
      console.error('[MessageDispatcher] setFontSize handler error:', error);
    }
  });

  // insertPaths handler
  ctx.registerHandler('insertPaths', (message) => {
    try {
      const originalFunc = ctx.originalGlobalFunctions.get('__insertPaths') || (window as any).__insertPaths;
      if (typeof originalFunc === 'function') {
        originalFunc(message.paths);
        if (isDev) console.log(`[MessageDispatcher] insertPaths executed successfully: ${message.paths.length} paths`);
      } else {
        console.warn('[MessageDispatcher] insertPaths: No __insertPaths function available');
      }
    } catch (error) {
      console.error('[MessageDispatcher] insertPaths handler error:', error);
    }
  });

  // pastePath handler
  ctx.registerHandler('pastePath', (message) => {
    try {
      const originalFunc = ctx.originalGlobalFunctions.get('__pastePath') || (window as any).__pastePath;
      if (typeof originalFunc === 'function') {
        originalFunc(message.path);
        if (isDev) console.log(`[MessageDispatcher] pastePath executed successfully: ${message.path}`);
      } else {
        console.warn('[MessageDispatcher] pastePath: No __pastePath function available');
      }
    } catch (error) {
      console.error('[MessageDispatcher] pastePath handler error:', error);
    }
  });

  // updateSessionCommand handler
  ctx.registerHandler('updateSessionCommand', (message) => {
    try {
      const originalFunc = ctx.originalGlobalFunctions.get('__updateSessionCommand') || (window as any).__updateSessionCommand;
      if (typeof originalFunc === 'function') {
        originalFunc(message.command);
        if (isDev) console.log(`[MessageDispatcher] updateSessionCommand executed successfully: ${message.command}`);
      } else {
        console.warn('[MessageDispatcher] updateSessionCommand: No __updateSessionCommand function available');
      }
    } catch (error) {
      console.error('[MessageDispatcher] updateSessionCommand handler error:', error);
    }
  });

  // updateOpenedFiles handler
  ctx.registerHandler('updateOpenedFiles', (message) => {
    try {
      const originalFunc = ctx.originalGlobalFunctions.get('__updateOpenedFiles') || (window as any).__updateOpenedFiles;
      if (typeof originalFunc === 'function') {
        originalFunc(message.openedFiles, message.currentFile);
        if (isDev) console.log(`[MessageDispatcher] updateOpenedFiles executed successfully: ${message.openedFiles?.length || 0} files`);
      } else {
        console.warn('[MessageDispatcher] updateOpenedFiles: No __updateOpenedFiles function available');
      }
    } catch (error) {
      console.error('[MessageDispatcher] updateOpenedFiles handler error:', error);
    }
  });

  // updateUIState handler
  ctx.registerHandler('updateUIState', (message) => {
    try {
      let updated = false;

      // Handle chips collapsed state
      if (message.chipsCollapsed !== undefined) {
        const chipsElement = document.getElementById('chips');
        if (chipsElement) {
          if (message.chipsCollapsed) chipsElement.classList.add('collapsed');
          else chipsElement.classList.remove('collapsed');
          updated = true;
          if (isDev) console.log(`[MessageDispatcher] Updated chips collapsed state: ${message.chipsCollapsed}`);
        }
      }

      // Handle composer collapsed state
      if (message.composerCollapsed !== undefined) {
        const composerElement = document.getElementById('composer');
        if (composerElement) {
          if (message.composerCollapsed) composerElement.classList.add('collapsed');
          else composerElement.classList.remove('collapsed');
          updated = true;
          if (isDev) console.log(`[MessageDispatcher] Updated composer collapsed state: ${message.composerCollapsed}`);

          const visibilityHandler = (window as any).__composerVisibilityChanged;
          if (typeof visibilityHandler === 'function') visibilityHandler();
        }
      }

      if (updated) {
        if (isDev) console.log('[MessageDispatcher] updateUIState executed successfully');
      } else {
        console.warn('[MessageDispatcher] updateUIState: No UI elements found to update');
      }
    } catch (error) {
      console.error('[MessageDispatcher] updateUIState handler error:', error);
    }
  });

  // readUrisResult handler for drag and drop
  ctx.registerHandler('readUrisResult', (message) => {
    try {
      if (isDev) console.log(`[MessageDispatcher] readUrisResult received with ${message.results?.length || 0} results`);
      // This message is handled by the drag and drop script in the webview
      // No action needed here, just acknowledge receipt
    } catch (error) {
      console.error('[MessageDispatcher] readUrisResult handler error:', error);
    }
  });

  // drag-event handler for macOS drag and drop fix
  ctx.registerHandler('drag-event', (message) => {
    try {
      if (isDev) console.log(`[MessageDispatcher] drag-event received: ${message.eventType}`);
      
      const { eventType, payload } = message;
      const { clientX, clientY, dataTransfer, shiftKey } = payload;
      
      // For drop events, directly process the drag and drop
      if (eventType === 'drop' && dataTransfer) {
        // Extract file paths from VSCode data
        let paths = [];
        
        if (dataTransfer.data && dataTransfer.data['application/vnd.code.uri-list']) {
          const uriList = dataTransfer.data['application/vnd.code.uri-list'];
          if (uriList) {
            const uris = uriList.split('\n').filter((uri: string) => uri.trim() && !uri.startsWith('#'));
            paths = uris.map((uri: string) => uri.replace('file://', ''));
          }
        }
        
        if (isDev) console.log('[MessageDispatcher] Extracted paths:', paths);
        
        // Find the target element
        const targetElement = document.elementFromPoint(clientX || 0, clientY || 0) || document.body;
        
        // Check if we're dropping on the composer or terminal
        const comp = document.getElementById('composer');
        const isComposerVisible = comp && !comp.classList.contains('collapsed');
        
        // Access state directly since we're in the same module context
        const isTerminalEnabled = state.terminalInputEnabled !== false;
        
        if (isDev) console.log('[MessageDispatcher] Terminal state check:', {
          isComposerVisible,
          isTerminalEnabled,
          terminalInputState: state.terminalInputState
        });
        
        if (isComposerVisible && (targetElement.closest('#composer') || targetElement.id === 'composer')) {
          // Drop on composer - use composer routing
          if (isDev) console.log('[MessageDispatcher] Dropping on composer');
          try {
            const routeInsertPaths = (window as any).__insertPaths;
            if (typeof routeInsertPaths === 'function') {
              routeInsertPaths(paths);
            }
          } catch (e) {
            console.error('[MessageDispatcher] Failed to route paths to composer:', e);
          }
        } else if (!isTerminalEnabled) {
          // Terminal input disabled - route to composer instead
          if (isDev) console.log('[MessageDispatcher] Terminal disabled, routing to composer');
          try {
            const routeInsertPaths = (window as any).__insertPaths;
            if (typeof routeInsertPaths === 'function') {
              routeInsertPaths(paths);
            }
          } catch (e) {
            console.error('[MessageDispatcher] Failed to route paths to composer (terminal disabled):', e);
          }
        } else {
          // Drop on terminal - use direct terminal processing
          if (isDev) console.log('[MessageDispatcher] Dropping on terminal');
          try {
            // Use the direct path insert function that bypasses composer
            const directInsertPaths = (window as any).__insertPaths_direct;
            if (typeof directInsertPaths === 'function') {
              directInsertPaths(paths);
            } else {
              // Fallback: try processPathsInsert directly
              const processPathsInsert = (window as any).processPathsInsert;
              if (typeof processPathsInsert === 'function') {
                processPathsInsert(paths);
              }
            }
          } catch (e) {
            console.error('[MessageDispatcher] Failed to process paths for terminal:', e);
          }
        }
      } else {
        // For other events (dragover, dragenter, dragleave), create synthetic events
        const syntheticEvent = new DragEvent(eventType, {
          bubbles: true,
          cancelable: true,
          clientX: clientX || 0,
          clientY: clientY || 0,
          shiftKey: shiftKey || false
        });
        
        // Find the target element and dispatch
        const targetElement = document.elementFromPoint(clientX || 0, clientY || 0) || document.body;
        targetElement.dispatchEvent(syntheticEvent);
      }
    } catch (error) {
      console.error('[MessageDispatcher] drag-event handler error:', error);
    }
  });

  console.log('[MessageDispatcher] Default message handlers registered');
}
