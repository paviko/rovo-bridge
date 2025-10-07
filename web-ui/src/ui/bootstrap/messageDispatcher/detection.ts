// Environment detection for MessageDispatcher
// Determines whether the app is running in standalone browser mode or IDE webview

export function detectStandaloneMode(): boolean {
  try {
    // Check multiple indicators for standalone mode
    const hasParent = window.parent && window.parent !== window;
    const isLocalhost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    const hasFileProtocol = window.location.protocol === 'file:';

    // Check for IDE-specific indicators
    // JetBrains JCEF provides cefQuery API and specific URL patterns
    const isJetBrains = window.location.href.includes('jcef') ||
      (window as any).cefQuery !== undefined ||
      (navigator.userAgent.includes('Chrome') && !!hasParent);
    // VSCode webviews provide acquireVsCodeApi function
    const isVSCode = (window as any).acquireVsCodeApi !== undefined;

    // If we detect IDE environment, we're definitely not standalone
    if (isJetBrains || isVSCode) {
      return false;
    }

    // Standalone mode indicators
    const standalone = !hasParent || hasFileProtocol ||
      (!isLocalhost && window.location.hostname !== '');

    return standalone;
  } catch (error) {
    // On detection errors, default to standalone mode for safety
    console.warn('[MessageDispatcher] Error detecting standalone mode, defaulting to standalone:', error);
    return true;
  }
}
