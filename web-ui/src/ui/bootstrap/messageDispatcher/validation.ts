import {MessageError, ValidationResult} from '../../messages';

interface ValidationCtx {
  validationCache: Map<string, boolean>;
  isStandalone: boolean;
}

export function validateMessage(ctx: ValidationCtx, message: any): ValidationResult {
  try {
    // Basic structure validation
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

    // Performance optimization: cache validation results for known message types
    const cacheKey = `${message.type}_basic`;
    if (ctx.validationCache.has(cacheKey)) {
      // Skip basic validation for known types, proceed to type-specific validation
      return validateMessageType(ctx, message);
    }

    // Validate timestamp if present
    if (message.timestamp !== undefined &&
      (typeof message.timestamp !== 'number' || message.timestamp < 0)) {
      return {
        isValid: false,
        error: MessageError.INVALID_DATA_TYPE,
        details: 'Message timestamp must be a positive number if provided'
      };
    }

    // Type-specific field validation
    const typeValidation = validateMessageType(ctx, message);
    if (!typeValidation.isValid) {
      return typeValidation;
    }

    // Cache successful basic validation for this message type
    ctx.validationCache.set(cacheKey, true);

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: MessageError.VALIDATION_FAILED,
      details: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

function validateMessageType(ctx: ValidationCtx, message: any): ValidationResult {
  switch (message.type) {
    case 'setParentOrigin':
      if (!message.origin || typeof message.origin !== 'string') {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'setParentOrigin message must have a string origin field'
        };
      }
      break;

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

    case 'updateOpenedFiles':
      if (message.openedFiles !== undefined && !Array.isArray(message.openedFiles)) {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'updateOpenedFiles openedFiles must be an array if provided'
        };
      }
      if (message.openedFiles && !message.openedFiles.every((f: any) => typeof f === 'string')) {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'updateOpenedFiles openedFiles must be an array of strings'
        };
      }
      if (message.currentFile !== undefined && message.currentFile !== null && typeof message.currentFile !== 'string') {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'updateOpenedFiles currentFile must be a string or null if provided'
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
      // At least one field must be provided
      if (message.chipsCollapsed === undefined && message.composerCollapsed === undefined) {
        return {
          isValid: false,
          error: MessageError.MISSING_REQUIRED_FIELD,
          details: 'updateUIState message must provide at least one state field'
        };
      }
      break;

    case 'drag-event':
      if (!message.eventType || typeof message.eventType !== 'string') {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'drag-event message must have a string eventType field'
        };
      }
      if (!['dragenter', 'dragover', 'dragleave', 'drop'].includes(message.eventType)) {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'drag-event eventType must be one of: dragenter, dragover, dragleave, drop'
        };
      }
      if (!message.payload || typeof message.payload !== 'object') {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'drag-event message must have a payload object'
        };
      }
      break;

    case 'updateUseClipboard':
      if (typeof message.useClipboard !== 'boolean') {
        return {
          isValid: false,
          error: MessageError.INVALID_DATA_TYPE,
          details: 'updateUseClipboard message must have a boolean useClipboard field'
        };
      }
      break;

    default:
      // Unknown message types are allowed but logged in IDE mode
      if (!ctx.isStandalone) {
        console.debug(`[MessageDispatcher] Unknown message type: ${message.type}`);
      }
      break;
  }

  return { isValid: true };
}
