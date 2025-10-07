import {isDev} from '../env';

// Sets up the window message event listener for postMessage communication.
// Returns the listener so the caller can keep a reference for cleanup.
export function setupMessageListener(
  handleMessage: (message: any) => void
): (event: MessageEvent) => void {
  const listener = (event: MessageEvent) => {
    try {
      if (isDev) {
        console.log('[MessageDispatcher] Received window message:', (event as any).data);
      }
      handleMessage((event as any).data);
    } catch (error) {
      console.error('[MessageDispatcher] Error handling message:', error, (event as any).data);
    }
  };

  window.addEventListener('message', listener);
  console.log('[MessageDispatcher] Message listener registered (always active)');
  return listener;
}
