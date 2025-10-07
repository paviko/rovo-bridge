import {SettingsManager} from '../settings/SettingsManager';
import {logger} from "../globals";

/**
 * Font size monitoring - mirrors ui/FontSizeMonitor.kt
 * Implements font size polling from backend HTTP endpoint and VSCode settings synchronization
 */
export class FontSizeMonitor {
    private settingsManager: SettingsManager;
    private backendPort?: number;
    private backendToken?: string;
    private monitoringInterval?: NodeJS.Timeout;
    private isMonitoring = false;
    private lastKnownFontSize?: number;
    private readonly pollIntervalMs = 2000; // Poll every 2 seconds
        private isDisposed = false;

    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;
    }

    /**
     * Start monitoring font size changes from the backend
     * @param backendPort Port number of the backend HTTP server
     * @param backendToken Authentication token for backend requests
     */
    startMonitoring(backendPort: number, backendToken: string): void {
        if (this.isMonitoring) {
            this.stopMonitoring();
        }

        this.backendPort = backendPort;
        this.backendToken = backendToken;
        this.isMonitoring = true;
        this.lastKnownFontSize = this.settingsManager.getSettings().fontSize;

        if (!this.isDisposed) {
            logger.appendLine(`Starting font size monitoring on port ${backendPort}`);
        }

        // Start periodic polling
        this.monitoringInterval = setInterval(() => {
            this.pollFontSize();
        }, this.pollIntervalMs);

        // Do an initial poll
        this.pollFontSize();
    }

    /**
     * Stop monitoring font size changes
     */
    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }

        this.isMonitoring = false;
        this.backendPort = undefined;
        this.backendToken = undefined;
        
        if (!this.isDisposed) {
            try {
                logger.appendLine('Font size monitoring stopped');
            } catch (error) {
                // Logger may be disposed, ignore
            }
        }
    }

    /**
     * Poll the backend for current font size
     * This mirrors the HTTP polling approach from FontSizeMonitor.kt
     */
    private async pollFontSize(): Promise<void> {
        if (!this.isMonitoring || !this.backendPort || !this.backendToken) {
            return;
        }

        try {
            // Construct the font size endpoint URL
            const fontSizeUrl = `http://127.0.0.1:${this.backendPort}/font-size`;
            
            // Make HTTP request to get current font size with authentication
            const response = await this.fetchWithTimeout(fontSizeUrl, 1000);
            
            if (response.ok) {
                const responseData = await response.json() as { fontSize: number };
                const fontSize = responseData.fontSize;
                
                if (fontSize !== undefined && fontSize > 0 && fontSize >= 8 && fontSize <= 72) {
                    await this.handleFontSizeChange(fontSize);
                } else if (fontSize !== undefined && fontSize !== 0) {
                    // Only warn for invalid non-zero values (0 means no change received yet)
                    if (!this.isDisposed) {
                        logger.appendLine(`Invalid font size received from backend: ${fontSize}`);
                    }
                }
            } else {
                // Log debug info for non-404 errors
                if (response.status !== 404 && !this.isDisposed) {
                    logger.appendLine(`Font size endpoint returned status: ${response.status}`);
                }
            }
        } catch (error) {
            // Handle different types of errors appropriately
            if (error instanceof Error && !this.isDisposed) {
                if (error.name === 'AbortError' || error.message.includes('timeout')) {
                    // Timeout is expected occasionally, don't log as error
                    logger.appendLine('Font size check timeout (normal)');
                } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
                    logger.appendLine('Font size check connection failed (backend may be shutting down)');
                } else {
                    logger.appendLine(`Error during font size check: ${error.message}`);
                }
            }
        }
    }

    /**
     * Handle font size changes detected from backend
     * @param newFontSize New font size value from backend
     */
    private async handleFontSizeChange(newFontSize: number): Promise<void> {
        if (this.lastKnownFontSize === newFontSize) {
            return; // No change
        }

        try {
            // Update VSCode settings to match backend
            await this.settingsManager.updateSetting('fontSize', newFontSize);
            
            this.lastKnownFontSize = newFontSize;
            if (!this.isDisposed) {
                logger.appendLine(`Font size synchronized from backend: ${newFontSize}`);
            }
            
        } catch (error) {
            if (!this.isDisposed) {
                logger.appendLine(`Failed to update font size setting: ${error}`);
            }
        }
    }

    /**
     * Fetch with timeout support and authentication
     * @param url URL to fetch
     * @param timeoutMs Timeout in milliseconds
     * @returns Promise that resolves to Response
     */
    private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.backendToken}`
                }
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Check if monitoring is currently active
     * @returns True if monitoring is active
     */
    isActive(): boolean {
        return this.isMonitoring;
    }

    /**
     * Get the current backend port being monitored
     * @returns Backend port number or undefined
     */
    getBackendPort(): number | undefined {
        return this.backendPort;
    }

    /**
     * Manually trigger a font size poll
     * Useful for testing or forced synchronization
     */
    async triggerPoll(): Promise<void> {
        if (this.isMonitoring) {
            await this.pollFontSize();
        }
    }

    /**
     * Dispose of the monitor and clean up resources
     */
    dispose(): void {
        this.isDisposed = true;
        this.stopMonitoring();
        // Do not dispose the shared logger here; it's managed by the extension lifecycle
    }
}