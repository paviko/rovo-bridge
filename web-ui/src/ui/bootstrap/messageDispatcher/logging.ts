import {ValidationResult} from '../../messages';

interface LogCtx {
  isStandalone: boolean;
  handlers: Map<string, any>;
}

export function logValidationError(ctx: LogCtx, validation: ValidationResult, message: any): void {
  console.warn(`[MessageDispatcher] Message validation failed:`, {
    error: validation.error,
    details: validation.details,
    message: message,
    isStandalone: ctx.isStandalone
  });
}

export function logHandlerError(_ctx: LogCtx, messageType: string, error: any, message: any): void {
  console.error(`[MessageDispatcher] Handler error for ${messageType}:`, {
    error: error,
    message: message,
    stack: (error as any)?.stack
  });
}

export function logMissingHandler(ctx: LogCtx, messageType: string, message: any): void {
  console.warn(`[MessageDispatcher] No handler registered for message type: ${messageType}`, {
    message: message,
    isStandalone: ctx.isStandalone,
    availableHandlers: Array.from(ctx.handlers.keys())
  });
}
