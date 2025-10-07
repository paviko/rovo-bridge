/**
 * Unified message type definitions for VSCode plugin communication
 * These match the message format expected by the web UI MessageDispatcher
 */

export interface BaseMessage {
    type: string;
    timestamp?: number;
}

export interface SetTokenMessage extends BaseMessage {
    type: 'setToken';
    token: string;
}

export interface SetFontSizeMessage extends BaseMessage {
    type: 'setFontSize';
    size: number;
}

export interface InsertPathsMessage extends BaseMessage {
    type: 'insertPaths';
    paths: string[];
}

export interface PastePathMessage extends BaseMessage {
    type: 'pastePath';
    path: string;
}

export interface UpdateSessionCommandMessage extends BaseMessage {
    type: 'updateSessionCommand';
    command: string;
}

export interface UpdateOpenedFilesMessage extends BaseMessage {
    type: 'updateOpenedFiles';
    openedFiles?: string[];
    currentFile?: string | null;
}

export interface UpdateUIStateMessage extends BaseMessage {
    type: 'updateUIState';
    chipsCollapsed?: boolean;
    composerCollapsed?: boolean;
}

export type UnifiedMessage = 
    | SetTokenMessage 
    | SetFontSizeMessage 
    | InsertPathsMessage 
    | PastePathMessage 
    | UpdateSessionCommandMessage 
    | UpdateOpenedFilesMessage
    | UpdateUIStateMessage;

/**
 * Interface for plugin communication using unified message protocol
 */
export interface PluginCommunicator {
    sendMessage(message: UnifiedMessage): void;
    setToken(token: string): void;
    setFontSize(size: number): void;
    insertPaths(paths: string[]): void;
    pastePath(path: string): void;
    updateSessionCommand(command: string): void;
    updateOpenedFiles(files: string[], current?: string): void;
    updateUIState(state: { chipsCollapsed?: boolean; composerCollapsed?: boolean }): void;
}