import {isDev} from '../env';

interface CompatCtx {
  originalGlobalFunctions: Map<string, Function>;
  isStandalone: boolean;
}

export function preserveGlobalFunctions(ctx: CompatCtx): void {
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
    const existingFunc = (window as any)[funcName];
    if (typeof existingFunc === 'function') {
      ctx.originalGlobalFunctions.set(funcName, existingFunc);
      if (isDev) {
        console.log(`[MessageDispatcher] Preserved global function: ${funcName}`);
      }
    }
  });

  console.log(`[MessageDispatcher] Preserved ${ctx.originalGlobalFunctions.size} global functions for standalone compatibility`);
}

export function setupStandaloneCompatibility(ctx: CompatCtx): void {
  if (ctx.isStandalone) {
    preserveGlobalFunctions(ctx);
    console.log('[MessageDispatcher] Standalone compatibility layer enabled');
  }
}

export function setupFallbackHandling(ctx: { isStandalone: boolean }): void {
  if (ctx.isStandalone) {
    if (isDev) {
      console.log('[MessageDispatcher] Standalone fallback handling enabled - direct function calls preserved');
    }
  } else {
    if (isDev) {
      console.log('[MessageDispatcher] IDE mode fallback handling enabled - postMessage preferred');
    }
  }
}
