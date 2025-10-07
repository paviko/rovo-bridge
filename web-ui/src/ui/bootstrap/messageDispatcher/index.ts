import {MessageHandler, MessageRegistry} from '../../messages';
import {isDev} from '../env';
import {detectStandaloneMode} from './detection';
import {setupMessageListener} from './listener';
import {validateMessage} from './validation';
import {logHandlerError, logMissingHandler, logValidationError} from './logging';
import {setupFallbackHandling, setupStandaloneCompatibility} from './compatibility';
import {registerDefaultHandlers as registerDefaults} from './handlers';

export class MessageDispatcher implements MessageRegistry {
  public handlers: Map<string, MessageHandler> = new Map();
  private isStandalone: boolean;
  private originalGlobalFunctions: Map<string, Function> = new Map();
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private validationCache: Map<string, boolean> = new Map();

  constructor() {
    this.isStandalone = detectStandaloneMode();

    console.log(`[MessageDispatcher] Initializing in ${this.isStandalone ? 'standalone' : 'IDE'} mode`);
    if (isDev) {
      console.log(`[MessageDispatcher] Detection details:`, {
        hasParent: window.parent && window.parent !== window,
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        href: window.location.href,
        userAgent: navigator.userAgent,
        cefQuery: (window as any).cefQuery !== undefined,
        acquireVsCodeApi: (window as any).acquireVsCodeApi !== undefined
      });
    }

    this.messageListener = setupMessageListener((data) => this.handleMessage(data));
    setupStandaloneCompatibility({ originalGlobalFunctions: this.originalGlobalFunctions, isStandalone: this.isStandalone });
    setupFallbackHandling({ isStandalone: this.isStandalone });
    registerDefaults({ registerHandler: this.registerHandler.bind(this), originalGlobalFunctions: this.originalGlobalFunctions });
  }

  public registerHandler(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
    if (isDev) console.log(`[MessageDispatcher] Registered handler for message type: ${type}`);
  }

  public unregisterHandler(type: string): void {
    this.handlers.delete(type);
    if (isDev) console.log(`[MessageDispatcher] Unregistered handler for message type: ${type}`);
  }

  public getHandler(type: string): MessageHandler | undefined {
    return this.handlers.get(type);
  }

  private handleMessage(message: any): void {
    try {
      if (isDev) console.log(`[MessageDispatcher] Received message:`, message);

      const validation = validateMessage({ validationCache: this.validationCache, isStandalone: this.isStandalone }, message);
      if (!validation.isValid) {
        logValidationError({ isStandalone: this.isStandalone, handlers: this.handlers }, validation, message);
        return;
      }

      const handler = this.handlers.get(message.type);
      if (handler) {
        if (isDev) console.log(`[MessageDispatcher] Handling message type: ${message.type}`);
        try {
          handler(message);
        } catch (handlerError) {
          logHandlerError({ isStandalone: this.isStandalone, handlers: this.handlers }, message.type, handlerError, message);
        }
      } else {
        logMissingHandler({ isStandalone: this.isStandalone, handlers: this.handlers }, message.type, message);
      }
    } catch (error) {
      console.error(`[MessageDispatcher] Critical error processing message:`, error, message);
    }
  }

  public cleanup(): void {
    try {
      if (this.messageListener) {
        window.removeEventListener('message', this.messageListener);
        this.messageListener = null;
      }
      this.handlers.clear();
      this.originalGlobalFunctions.clear();
      this.validationCache.clear();
      if (isDev) console.log('[MessageDispatcher] Cleanup completed - resources released');
    } catch (error) {
      console.error('[MessageDispatcher] Error during cleanup:', error);
    }
  }
}
