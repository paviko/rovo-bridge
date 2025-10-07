/**
 * Message type definitions for unified communication protocol
 * between IDE plugins (JetBrains and VSCode) and the web UI.
 * 
 * This module defines the standardized message format used for all
 * communication between IDE plugins and the web UI, replacing the
 * previous mixed approach of direct JavaScript execution and webview messaging.
 */

/**
 * Base message interface that all messages must extend.
 * Provides common fields required for all message types.
 * 
 * @example
 * ```typescript
 * const message: BaseMessage = {
 *   type: 'customMessage',
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface BaseMessage {
  /** The message type identifier - must be a non-empty string */
  type: string;
  /** Optional timestamp when the message was created (milliseconds since epoch) */
  timestamp?: number;
}

/**
 * Message for setting the authentication token.
 * Used by IDE plugins to authenticate with the web UI.
 * 
 * @example
 * ```typescript
 * const tokenMessage: SetTokenMessage = {
 *   type: 'setToken',
 *   token: 'abc123-def456-ghi789',
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface SetTokenMessage extends BaseMessage {
  type: 'setToken';
  /** Authentication token - must be a non-empty string */
  token: string;
}

/**
 * Message for updating the terminal font size.
 * Used by IDE plugins to synchronize font size changes with the web UI.
 * 
 * @example
 * ```typescript
 * const fontMessage: SetFontSizeMessage = {
 *   type: 'setFontSize',
 *   size: 14,
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface SetFontSizeMessage extends BaseMessage {
  type: 'setFontSize';
  /** Font size in pixels - must be an integer between 8 and 72 */
  size: number;
}

/**
 * Message for inserting multiple file paths into the terminal or composer.
 * Used by IDE plugins when users drag and drop files or use context menu actions.
 * 
 * @example
 * ```typescript
 * const pathsMessage: InsertPathsMessage = {
 *   type: 'insertPaths',
 *   paths: ['/path/to/file1.js', '/path/to/file2.ts'],
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface InsertPathsMessage extends BaseMessage {
  type: 'insertPaths';
  /** Array of file paths - must contain at least one non-empty string */
  paths: string[];
}

/**
 * Message for pasting a single file path into the terminal.
 * Used by IDE plugins for single file operations.
 * 
 * @example
 * ```typescript
 * const pasteMessage: PastePathMessage = {
 *   type: 'pastePath',
 *   path: '/path/to/directory',
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface PastePathMessage extends BaseMessage {
  type: 'pastePath';
  /** File or directory path - must be a non-empty string */
  path: string;
}

/**
 * Message for updating the session command configuration.
 * Used by IDE plugins to change the command that runs in the terminal session.
 * 
 * @example
 * ```typescript
 * const commandMessage: UpdateSessionCommandMessage = {
 *   type: 'updateSessionCommand',
 *   command: 'npm test',
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface UpdateSessionCommandMessage extends BaseMessage {
  type: 'updateSessionCommand';
  /** Command string to execute - can be empty to use default */
  command: string;
}

/**
 * Message for updating UI state such as collapsed panels.
 * Used by IDE plugins to synchronize UI state changes.
 * 
 * @example
 * ```typescript
 * const uiMessage: UpdateUIStateMessage = {
 *   type: 'updateUIState',
 *   chipsCollapsed: true,
 *   composerCollapsed: false,
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface UpdateUIStateMessage extends BaseMessage {
  type: 'updateUIState';
  /** Whether the chips panel should be collapsed */
  chipsCollapsed?: boolean;
  /** Whether the composer panel should be collapsed */
  composerCollapsed?: boolean;
}

/**
 * Union type for all possible messages in the unified protocol.
 * Provides compile-time type safety and ensures only valid message types are used.
 * 
 * @example
 * ```typescript
 * function handleMessage(message: UnifiedMessage) {
 *   switch (message.type) {
 *     case 'setToken':
 *       // TypeScript knows this is SetTokenMessage
 *       console.log('Token:', message.token);
 *       break;
 *     case 'setFontSize':
 *       // TypeScript knows this is SetFontSizeMessage
 *       console.log('Font size:', message.size);
 *       break;
 *   }
 * }
 * ```
 */
export type UnifiedMessage = 
  | SetTokenMessage 
  | SetFontSizeMessage 
  | InsertPathsMessage 
  | PastePathMessage 
  | UpdateSessionCommandMessage 
  | UpdateUIStateMessage;

/**
 * Function type for message handlers.
 * Handlers receive the message object and perform the appropriate action.
 * 
 * @param message - The message object to handle
 * 
 * @example
 * ```typescript
 * const tokenHandler: MessageHandler = (message) => {
 *   if (message.type === 'setToken') {
 *     authenticateWithToken(message.token);
 *   }
 * };
 * ```
 */
export type MessageHandler = (message: any) => void;

/**
 * Interface for managing message handlers.
 * Provides methods to register, unregister, and retrieve handlers for specific message types.
 * 
 * @example
 * ```typescript
 * class MyRegistry implements MessageRegistry {
 *   handlers = new Map<string, MessageHandler>();
 *   
 *   registerHandler(type: string, handler: MessageHandler) {
 *     this.handlers.set(type, handler);
 *   }
 *   
 *   // ... other methods
 * }
 * ```
 */
export interface MessageRegistry {
  /** Map of message types to their handlers */
  handlers: Map<string, MessageHandler>;
  
  /**
   * Registers a handler for a specific message type
   * @param type - The message type to handle
   * @param handler - The handler function
   */
  registerHandler(type: string, handler: MessageHandler): void;
  
  /**
   * Unregisters a handler for a specific message type
   * @param type - The message type to stop handling
   */
  unregisterHandler(type: string): void;
  
  /**
   * Retrieves the handler for a specific message type
   * @param type - The message type to get the handler for
   * @returns The handler function or undefined if not found
   */
  getHandler(type: string): MessageHandler | undefined;
}

/**
 * Enumeration of possible message handling errors.
 * Used for consistent error reporting and debugging.
 * 
 * @example
 * ```typescript
 * if (validation.error === MessageError.INVALID_TYPE) {
 *   console.error('Message has invalid type');
 * }
 * ```
 */
export enum MessageError {
  /** Message type is missing or invalid */
  INVALID_TYPE = 'INVALID_TYPE',
  /** Required field is missing from the message */
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  /** Field has incorrect data type or invalid value */
  INVALID_DATA_TYPE = 'INVALID_DATA_TYPE',
  /** No handler registered for the message type */
  HANDLER_NOT_FOUND = 'HANDLER_NOT_FOUND',
  /** Handler execution failed */
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  /** Message validation process failed */
  VALIDATION_FAILED = 'VALIDATION_FAILED'
}

/**
 * Result of message validation.
 * Contains validation status and error details if validation failed.
 * 
 * @example
 * ```typescript
 * const result: ValidationResult = {
 *   isValid: false,
 *   error: MessageError.INVALID_DATA_TYPE,
 *   details: 'Font size must be between 8 and 72'
 * };
 * ```
 */
export interface ValidationResult {
  /** Whether the message passed validation */
  isValid: boolean;
  /** The type of error if validation failed */
  error?: MessageError;
  /** Human-readable description of the validation error */
  details?: string;
}