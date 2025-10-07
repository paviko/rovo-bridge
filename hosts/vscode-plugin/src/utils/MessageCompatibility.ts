/**
 * Message compatibility utilities to ensure VSCode and JetBrains plugins
 * send identical message formats to the web UI
 */

/**
 * Validates that a message conforms to the unified message protocol
 * @param message Message to validate
 * @returns Validation result with details
 */
export function validateUnifiedMessage(message: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic structure validation
    if (!message || typeof message !== 'object') {
        errors.push('Message must be an object');
        return { isValid: false, errors };
    }

    if (!message.type || typeof message.type !== 'string') {
        errors.push('Message must have a string type field');
    }

    // Timestamp validation (optional but should be number if present)
    if (message.timestamp !== undefined && 
        (typeof message.timestamp !== 'number' || message.timestamp < 0)) {
        errors.push('Message timestamp must be a positive number if provided');
    }

    // Type-specific validation
    switch (message.type) {
        case 'setToken':
            if (!message.token || typeof message.token !== 'string' || message.token.trim().length === 0) {
                errors.push('setToken message must have a non-empty string token field');
            }
            break;

        case 'setFontSize':
            if (typeof message.size !== 'number' || 
                !Number.isInteger(message.size) || 
                message.size < 8 || 
                message.size > 72) {
                errors.push('setFontSize message must have an integer size field between 8 and 72');
            }
            break;

        case 'insertPaths':
            if (!Array.isArray(message.paths)) {
                errors.push('insertPaths message must have an array in paths field');
            } else if (message.paths.length === 0) {
                errors.push('insertPaths message must have at least one path');
            } else if (!message.paths.every((p: any) => typeof p === 'string' && p.trim().length > 0)) {
                errors.push('insertPaths message must have an array of non-empty strings in paths field');
            }
            break;

        case 'pastePath':
            if (!message.path || typeof message.path !== 'string' || message.path.trim().length === 0) {
                errors.push('pastePath message must have a non-empty string path field');
            }
            break;

        case 'updateSessionCommand':
            if (typeof message.command !== 'string') {
                errors.push('updateSessionCommand message must have a string command field');
            }
            break;

        case 'updateOpenedFiles':
            if (message.openedFiles !== undefined && !Array.isArray(message.openedFiles)) {
                errors.push('updateOpenedFiles openedFiles must be an array if provided');
            }
            if (message.openedFiles && !message.openedFiles.every((f: any) => typeof f === 'string')) {
                errors.push('updateOpenedFiles openedFiles must be an array of strings');
            }
            if (message.currentFile !== undefined && message.currentFile !== null && typeof message.currentFile !== 'string') {
                errors.push('updateOpenedFiles currentFile must be a string or null if provided');
            }
            break;

        case 'updateUIState':
            if (message.chipsCollapsed !== undefined && typeof message.chipsCollapsed !== 'boolean') {
                errors.push('updateUIState chipsCollapsed must be a boolean if provided');
            }
            if (message.composerCollapsed !== undefined && typeof message.composerCollapsed !== 'boolean') {
                errors.push('updateUIState composerCollapsed must be a boolean if provided');
            }
            // At least one field must be provided
            if (message.chipsCollapsed === undefined && message.composerCollapsed === undefined) {
                errors.push('updateUIState message must provide at least one state field');
            }
            break;

        default:
            // Unknown message types are allowed but noted
            break;
    }

    return { isValid: errors.length === 0, errors };
}

/**
 * Creates sample messages that match the JetBrains plugin format
 * These can be used for testing compatibility
 */
export const sampleJetBrainsMessages = {
    setToken: {
        type: 'setToken',
        token: 'sample-token-123',
        timestamp: 1640995200000
    },
    setFontSize: {
        type: 'setFontSize',
        size: 14,
        timestamp: 1640995200000
    },
    insertPaths: {
        type: 'insertPaths',
        paths: ['/path/to/file1.js', '/path/to/file2.ts'],
        timestamp: 1640995200000
    },
    pastePath: {
        type: 'pastePath',
        path: '/path/to/directory',
        timestamp: 1640995200000
    },
    updateSessionCommand: {
        type: 'updateSessionCommand',
        command: 'npm test',
        timestamp: 1640995200000
    },
    updateOpenedFiles: {
        type: 'updateOpenedFiles',
        openedFiles: ['/path/to/file1.js', '/path/to/file2.ts'],
        currentFile: '/path/to/file1.js',
        timestamp: 1640995200000
    },
    updateUIState: {
        type: 'updateUIState',
        chipsCollapsed: true,
        composerCollapsed: false,
        timestamp: 1640995200000
    }
};

/**
 * Compares two messages for structural compatibility
 * @param message1 First message
 * @param message2 Second message
 * @returns Comparison result
 */
export function compareMessageStructure(message1: any, message2: any): { 
    isCompatible: boolean; 
    differences: string[] 
} {
    const differences: string[] = [];

    // Compare type
    if (message1.type !== message2.type) {
        differences.push(`Type mismatch: ${message1.type} vs ${message2.type}`);
        return { isCompatible: false, differences };
    }

    // Compare required fields based on type
    const requiredFields = getRequiredFieldsForType(message1.type);
    
    for (const field of requiredFields) {
        const hasField1 = message1.hasOwnProperty(field);
        const hasField2 = message2.hasOwnProperty(field);
        
        if (hasField1 !== hasField2) {
            differences.push(`Field presence mismatch for '${field}': ${hasField1} vs ${hasField2}`);
        } else if (hasField1 && hasField2) {
            const type1 = typeof message1[field];
            const type2 = typeof message2[field];
            
            if (type1 !== type2) {
                differences.push(`Field type mismatch for '${field}': ${type1} vs ${type2}`);
            }
        }
    }

    return { isCompatible: differences.length === 0, differences };
}

/**
 * Gets required fields for a specific message type
 */
function getRequiredFieldsForType(type: string): string[] {
    switch (type) {
        case 'setToken':
            return ['type', 'token'];
        case 'setFontSize':
            return ['type', 'size'];
        case 'insertPaths':
            return ['type', 'paths'];
        case 'pastePath':
            return ['type', 'path'];
        case 'updateSessionCommand':
            return ['type', 'command'];
        case 'updateOpenedFiles':
            return ['type']; // openedFiles and currentFile are optional
        case 'updateUIState':
            return ['type']; // chipsCollapsed and composerCollapsed are optional
        default:
            return ['type'];
    }
}

/**
 * Tests message compatibility between VSCode and JetBrains formats
 * @returns Test results
 */
export function runCompatibilityTests(): { passed: number; failed: number; results: any[] } {
    const results: any[] = [];
    let passed = 0;
    let failed = 0;

    // Test each sample message
    for (const [messageType, sampleMessage] of Object.entries(sampleJetBrainsMessages)) {
        const validation = validateUnifiedMessage(sampleMessage);
        
        const result = {
            messageType,
            message: sampleMessage,
            isValid: validation.isValid,
            errors: validation.errors
        };
        
        results.push(result);
        
        if (validation.isValid) {
            passed++;
        } else {
            failed++;
        }
    }

    return { passed, failed, results };
}