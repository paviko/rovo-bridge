import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Binary extraction utility - mirrors ResourceExtractor.kt
 * Handles OS/architecture detection and binary extraction from extension resources
 */
export class ResourceExtractor {
    /**
     * Extract the appropriate rovo-bridge binary for the current platform
     * @param extensionPath Path to the extension directory
     * @returns Promise resolving to the path of the extracted binary
     */
    static async extractBinary(extensionPath: string): Promise<string> {
        const osType = this.detectOS();
        const arch = this.detectArchitecture();
        
        // Determine binary name based on OS
        const binaryName = osType === 'windows' ? 'rovo-bridge.exe' : 'rovo-bridge';
        
        // Construct path to binary in extension resources
        const binaryPath = path.join(extensionPath, 'resources', 'bin', osType, arch, binaryName);
        
        // Check if binary exists
        if (!fs.existsSync(binaryPath)) {
            throw new Error(`Binary not found for platform ${osType}/${arch} at ${binaryPath}`);
        }
        
        // Create temporary file
        const tempDir = os.tmpdir();
        const tempFileName = `rovo-bridge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${osType === 'windows' ? '.exe' : ''}`;
        const tempPath = path.join(tempDir, tempFileName);
        
        // Copy binary to temporary location
        await fs.promises.copyFile(binaryPath, tempPath);
        
        // Make executable on Unix-like systems
        if (osType !== 'windows') {
            await this.makeExecutable(tempPath);
        }
        
        return tempPath;
    }

    /**
     * Detect the current operating system
     * @returns OS identifier (windows, macos, linux)
     */
    private static detectOS(): string {
        const platform = os.platform();
        
        switch (platform) {
            case 'win32':
                return 'windows';
            case 'darwin':
                return 'macos';
            case 'linux':
                return 'linux';
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    /**
     * Detect the current architecture
     * @returns Architecture identifier (amd64, arm64)
     */
    private static detectArchitecture(): string {
        const arch = os.arch();
        
        switch (arch) {
            case 'x64':
                return 'amd64';
            case 'arm64':
                return 'arm64';
            default:
                throw new Error(`Unsupported architecture: ${arch}`);
        }
    }

    /**
     * Make a file executable (Unix-like systems)
     * @param filePath Path to the file to make executable
     */
    private static async makeExecutable(filePath: string): Promise<void> {
        try {
            await fs.promises.chmod(filePath, 0o755);
        } catch (error) {
            throw new Error(`Failed to make file executable: ${error}`);
        }
    }
}