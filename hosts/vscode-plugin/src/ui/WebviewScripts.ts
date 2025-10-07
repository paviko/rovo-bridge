/**
 * WebviewScripts utility for JavaScript injection
 * Provides safe JavaScript code generation for various bridge functions
 * Equivalent to ui/WebViewScripts.kt from JetBrains plugin
 */

export class WebviewScripts {
    /**
     * Generate script to set authentication token
     * @param token Authentication token for WebSocket connection
     * @returns JavaScript code string
     */
    static setTokenScript(token: string): string {
        const safeToken = this.escapeJavaScript(token);
        return this.wrapInTryCatch(`
            if (window.__setToken) {
                window.__setToken('${safeToken}');
            }
        `);
    }

    /**
     * Generate script to insert file paths into the UI
     * @param paths Array of file paths to insert
     * @returns JavaScript code string
     */
    static insertPathsScript(paths: string[]): string {
        const safePaths = paths.map(path => this.escapeJavaScript(path));
        const pathsJson = JSON.stringify(safePaths);
        return this.wrapInTryCatch(`
            if (window.__insertPaths) {
                window.__insertPaths(${pathsJson});
            }
        `);
    }

    /**
     * Generate script to paste a directory path
     * @param path Directory path to paste
     * @returns JavaScript code string
     */
    static pastePathScript(path: string): string {
        const safePath = this.escapeJavaScript(path);
        return this.wrapInTryCatch(`
            if (window.__pastePath) {
                window.__pastePath('${safePath}');
            }
        `);
    }

    /**
     * Generate script to set font size
     * @param fontSize Font size value
     * @returns JavaScript code string
     */
    static setFontSizeScript(fontSize: number): string {
        const safeSize = Math.max(8, Math.min(72, Math.floor(fontSize))); // Clamp between 8-72
        return this.wrapInTryCatch(`
            if (window.__setFontSize) {
                window.__setFontSize(${safeSize});
            }
        `);
    }

    /**
     * Generate script to update session command
     * @param command Session command string
     * @returns JavaScript code string
     */
    static updateSessionCommandScript(command: string): string {
        const safeCommand = this.escapeJavaScript(command);
        return this.wrapInTryCatch(`
            if (window.__updateSessionCommand) {
                window.__updateSessionCommand('${safeCommand}');
            }
        `);
    }

    /**
     * Generate script to update opened files list
     * @param openedFiles Array of opened file paths
     * @param currentFile Currently active file path (optional)
     * @returns JavaScript code string
     */
    static updateOpenedFilesScript(openedFiles: string[], currentFile?: string): string {
        const safeFiles = openedFiles.map(file => this.escapeJavaScript(file));
        const filesJson = JSON.stringify(safeFiles);
        const currentJson = currentFile ? `'${this.escapeJavaScript(currentFile)}'` : 'undefined';
        
        return this.wrapInTryCatch(`
            if (window.__updateOpenedFiles) {
                window.__updateOpenedFiles(${filesJson}, ${currentJson});
            }
        `);
    }

    /**
     * Generate script to set opened files list (alternative method)
     * @param openedFiles Array of opened file paths
     * @returns JavaScript code string
     */
    static setOpenedFilesScript(openedFiles: string[]): string {
        const safeFiles = openedFiles.map(file => this.escapeJavaScript(file));
        const filesJson = JSON.stringify(safeFiles);
        
        return this.wrapInTryCatch(`
            if (window.__setOpenedFiles) {
                window.__setOpenedFiles(${filesJson});
            }
        `);
    }

    /**
     * Generate script to set current file
     * @param currentFile Currently active file path (optional)
     * @returns JavaScript code string
     */
    static setCurrentFileScript(currentFile?: string): string {
        const currentJson = currentFile ? `'${this.escapeJavaScript(currentFile)}'` : 'undefined';
        
        return this.wrapInTryCatch(`
            if (window.__setCurrentFile) {
                window.__setCurrentFile(${currentJson});
            }
        `);
    }

    /**
     * Generate script to set chips collapsed state
     * @param collapsed Whether chips should be collapsed
     * @returns JavaScript code string
     */
    static setChipsCollapsedScript(collapsed: boolean): string {
        return this.wrapInTryCatch(`
            if (window.__setChipsCollapsed) {
                window.__setChipsCollapsed(${collapsed});
            }
        `);
    }

    /**
     * Generate script to set composer collapsed state
     * @param collapsed Whether composer should be collapsed
     * @returns JavaScript code string
     */
    static setComposerCollapsedScript(collapsed: boolean): string {
        return this.wrapInTryCatch(`
            if (window.__setComposerCollapsed) {
                window.__setComposerCollapsed(${collapsed});
            }
        `);
    }

    /**
     * Generate script to add text to composer
     * @param text Text to add to composer
     * @returns JavaScript code string
     */
    static composerAddTextScript(text: string): string {
        const safeText = this.escapeJavaScript(text);
        return this.wrapInTryCatch(`
            if (window.__composerAddText) {
                window.__composerAddText('${safeText}');
            }
        `);
    }

    /**
     * Generate script to notify composer visibility change
     * @returns JavaScript code string
     */
    static composerVisibilityChangedScript(): string {
        return this.wrapInTryCatch(`
            if (window.__composerVisibilityChanged) {
                window.__composerVisibilityChanged();
            }
        `);
    }

    /**
     * Generate script to enable tooltip polyfill for VSCode environment
     * @param enabled Whether to enable tooltip polyfill
     * @returns JavaScript code string
     */
    static setTooltipPolyfillScript(enabled: boolean): string {
        return this.wrapInTryCatch(`
            try {
                if (${enabled}) {
                    document.documentElement.classList.add('tip-polyfill');
                } else {
                    document.documentElement.classList.remove('tip-polyfill');
                }
                if (window.__setTooltipPolyfill) {
                    window.__setTooltipPolyfill(${enabled});
                }
            } catch(e) {
                console.warn('Failed to set tooltip polyfill:', e);
            }
        `);
    }

    /**
     * Generate script to apply initial collapsed state to DOM elements
     * Similar to JetBrains applyInitialCollapsedStateScript
     * @param chipsCollapsed Whether chips should be collapsed
     * @param composerCollapsed Whether composer should be collapsed
     * @returns JavaScript code string
     */
    static applyInitialCollapsedStateScript(chipsCollapsed: boolean, composerCollapsed: boolean): string {
        return this.wrapInTryCatch(`
            // Apply collapsed state to chipbar
            var chipbar = document.getElementById('chipbar');
            if (chipbar) {
                if (${chipsCollapsed}) {
                    chipbar.classList.add('collapsed');
                } else {
                    chipbar.classList.remove('collapsed');
                }
            }
            
            // Apply collapsed state to composer
            var composer = document.getElementById('composer');
            if (composer) {
                if (${composerCollapsed}) {
                    composer.classList.add('collapsed');
                } else {
                    composer.classList.remove('collapsed');
                }
            }
            
            // Update button labels and ARIA attributes
            var btnChips = document.getElementById('btnToggleChips');
            if (btnChips && chipbar) {
                var chipsIsCollapsed = chipbar.classList.contains('collapsed');
                var chipsLabel = chipsIsCollapsed ? 'Show Chips' : 'Hide Chips';
                try {
                    btnChips.title = chipsLabel;
                    btnChips.setAttribute('data-tip', chipsLabel);
                    btnChips.setAttribute('aria-label', chipsLabel);
                    btnChips.setAttribute('aria-expanded', chipsIsCollapsed ? 'false' : 'true');
                } catch(e) {
                    console.warn('Failed to update chips button attributes:', e);
                }
            }
            
            var btnComposer = document.getElementById('btnToggleComposer');
            if (btnComposer && composer) {
                var composerIsCollapsed = composer.classList.contains('collapsed');
                var composerLabel = composerIsCollapsed ? 'Show Editor' : 'Hide Editor';
                try {
                    btnComposer.title = composerLabel;
                    btnComposer.setAttribute('data-tip', composerLabel);
                    btnComposer.setAttribute('aria-label', composerLabel);
                    btnComposer.setAttribute('aria-expanded', composerIsCollapsed ? 'false' : 'true');
                } catch(e) {
                    console.warn('Failed to update composer button attributes:', e);
                }
            }
        `);
    }

    /**
     * Generate script to define notification functions for collapsed state changes
     * Similar to JetBrains defineNotifyFunctionsScript but adapted for VSCode messaging
     * @returns JavaScript code string
     */
    static defineNotifyFunctionsScript(): string {
        return this.wrapInTryCatch(`
            // Define notification functions for VSCode extension communication
            window.__notifyChipsCollapsed = function(collapsed) {
                try {
                    var isCollapsed = (collapsed === true || collapsed === 'true' || collapsed === 1 || collapsed === '1');
                    if (window.vscode && window.vscode.postMessage) {
                        window.vscode.postMessage({
                            type: 'settingsChanged',
                            key: 'chipsCollapsed',
                            value: isCollapsed
                        });
                    }
                } catch(e) {
                    console.warn('Failed to notify chips collapsed state:', e);
                }
            };
            
            window.__notifyComposerCollapsed = function(collapsed) {
                try {
                    var isCollapsed = (collapsed === true || collapsed === 'true' || collapsed === 1 || collapsed === '1');
                    if (window.vscode && window.vscode.postMessage) {
                        window.vscode.postMessage({
                            type: 'settingsChanged',
                            key: 'composerCollapsed',
                            value: isCollapsed
                        });
                    }
                } catch(e) {
                    console.warn('Failed to notify composer collapsed state:', e);
                }
            };
        `);
    }

    /**
     * Generate script to define file opening bridge function
     * @returns JavaScript code string
     */
    static defineOpenFileBridgeScript(): string {
        return this.wrapInTryCatch(`
            window.__openInIDE = function(path) {
                try {
                    if (window.vscode && window.vscode.postMessage) {
                        window.vscode.postMessage({
                            type: 'openFile',
                            path: path
                        });
                    }
                } catch(e) {
                    console.warn('Failed to open file in IDE:', e);
                }
            };
        `);
    }

    /**
     * Generate script to define observers for collapsed state changes
     * Similar to JetBrains defineObserversScript
     * @returns JavaScript code string
     */
    static defineObserversScript(): string {
        return this.wrapInTryCatch(`
            function observeCollapsed(elementId, notifyFunction) {
                try {
                    var element = document.getElementById(elementId);
                    if (!element) return;
                    
                    // Get initial state and notify
                    var lastState = element.classList.contains('collapsed');
                    try {
                        notifyFunction(lastState);
                    } catch(e) {
                        console.warn('Failed to notify initial state for ' + elementId + ':', e);
                    }
                    
                    // Set up mutation observer for class changes
                    var observer = new MutationObserver(function(mutations) {
                        var currentState = element.classList.contains('collapsed');
                        if (currentState !== lastState) {
                            lastState = currentState;
                            try {
                                notifyFunction(currentState);
                            } catch(e) {
                                console.warn('Failed to notify state change for ' + elementId + ':', e);
                            }
                        }
                    });
                    
                    observer.observe(element, {
                        attributes: true,
                        attributeFilter: ['class']
                    });
                } catch(e) {
                    console.warn('Failed to set up observer for ' + elementId + ':', e);
                }
            }
            
            // Set up observers for chipbar and composer
            try {
                observeCollapsed('chipbar', window.__notifyChipsCollapsed);
            } catch(e) {
                console.warn('Failed to observe chipbar:', e);
            }
            
            try {
                observeCollapsed('composer', window.__notifyComposerCollapsed);
            } catch(e) {
                console.warn('Failed to observe composer:', e);
            }
        `);
    }

    /**
     * Generate a comprehensive initialization script that sets up all bridge functions
     * @param token Authentication token
     * @param fontSize Initial font size
     * @param chipsCollapsed Initial chips collapsed state
     * @param composerCollapsed Initial composer collapsed state
     * @param customCommand Initial session command
     * @returns JavaScript code string
     */
    static generateInitializationScript(
        token: string,
        fontSize: number,
        chipsCollapsed: boolean,
        composerCollapsed: boolean,
        customCommand?: string
    ): string {
        const scripts = [
            // Define notification functions first
            this.defineNotifyFunctionsScript(),
            
            // Define file opening bridge
            this.defineOpenFileBridgeScript(),
            
            // Set authentication token
            this.setTokenScript(token),
            
            // Set initial font size
            this.setFontSizeScript(fontSize),
            
            // Apply initial collapsed states
            this.applyInitialCollapsedStateScript(chipsCollapsed, composerCollapsed),
            
            // Set up observers for state changes
            this.defineObserversScript(),
            
            // Enable tooltip polyfill for VSCode
            this.setTooltipPolyfillScript(true)
        ];

        // Add session command if provided
        if (customCommand && customCommand.trim()) {
            scripts.push(this.updateSessionCommandScript(customCommand));
        }

        return scripts.join('\n\n');
    }

    /**
     * Escape JavaScript string literals to prevent injection attacks
     * @param str String to escape
     * @returns Escaped string safe for JavaScript
     */
    private static escapeJavaScript(str: string): string {
        return str
            .replace(/\\/g, '\\\\')  // Escape backslashes
            .replace(/'/g, "\\'")    // Escape single quotes
            .replace(/"/g, '\\"')    // Escape double quotes
            .replace(/\n/g, '\\n')   // Escape newlines
            .replace(/\r/g, '\\r')   // Escape carriage returns
            .replace(/\t/g, '\\t')   // Escape tabs
            .replace(/\u2028/g, '\\u2028')  // Escape line separator
            .replace(/\u2029/g, '\\u2029'); // Escape paragraph separator
    }

    /**
     * Wrap JavaScript code in try-catch for safe execution
     * @param code JavaScript code to wrap
     * @returns Wrapped code with error handling
     */
    private static wrapInTryCatch(code: string): string {
        return `(function() {
    try {
        ${code.trim()}
    } catch(e) {
        console.warn('WebviewScripts execution error:', e);
    }
})();`;
    }

    /**
     * Generate script to execute multiple JavaScript functions safely
     * @param scripts Array of JavaScript code strings
     * @returns Combined script with error isolation
     */
    static combineScripts(scripts: string[]): string {
        return scripts
            .filter(script => script && script.trim())
            .map(script => this.wrapInTryCatch(script))
            .join('\n\n');
    }

    /**
     * Generate script to validate that required bridge functions exist
     * @returns JavaScript code string for validation
     */
    static generateValidationScript(): string {
        return this.wrapInTryCatch(`
            var requiredFunctions = [
                '__setToken',
                '__insertPaths', 
                '__pastePath',
                '__setFontSize',
                '__updateSessionCommand',
                '__updateOpenedFiles'
            ];
            
            var missingFunctions = [];
            requiredFunctions.forEach(function(funcName) {
                if (typeof window[funcName] !== 'function') {
                    missingFunctions.push(funcName);
                }
            });
            
            if (missingFunctions.length > 0) {
                console.warn('Missing bridge functions:', missingFunctions);
                if (window.vscode && window.vscode.postMessage) {
                    window.vscode.postMessage({
                        type: 'bridgeValidation',
                        success: false,
                        missingFunctions: missingFunctions
                    });
                }
            } else {
                console.log('All bridge functions are available');
                if (window.vscode && window.vscode.postMessage) {
                    window.vscode.postMessage({
                        type: 'bridgeValidation',
                        success: true
                    });
                }
            }
        `);
    }
}