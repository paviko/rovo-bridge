package paviko.rovobridge.backendprocess

import com.intellij.openapi.diagnostic.Logger
import org.jetbrains.plugins.terminal.ShellTerminalWidget
import java.io.InputStream
import java.io.PipedOutputStream

/**
 * BackendProcess implementation that wraps a terminal widget during actual execution.
 * Not intended to be used directly by consumers; created internally by `BackendLauncher`.
 */
internal class RunningTerminalBackendProcess(
    private val terminalWidget: ShellTerminalWidget,
    private val commandLine: String,
    outputBuffer: PipedOutputStream
) : BackendProcess {

    private val logger = Logger.getInstance(RunningTerminalBackendProcess::class.java)
    private val outputCapture = TerminalOutputCapture(outputBuffer)

    init {
        // Start capturing output from the terminal
        outputCapture.startCapturing(terminalWidget)
        logger.info("Backend process started in terminal: $commandLine")
    }

    override val inputStream: InputStream
        get() = throw UnsupportedOperationException("RunningTerminalBackendProcess does not provide an input stream")

    override fun waitFor(): Int {
        // For terminal-based processes, we can't easily wait for completion
        // Return 0 to indicate success for now
        return 0
    }

    override fun destroy() {
        try {
            // Send Ctrl+C to terminate the process
            terminalWidget.executeCommand("\u0003") // Ctrl+C
            logger.info("Sent termination signal to backend process")
        } catch (e: Exception) {
            logger.warn("Failed to send termination signal", e)
        }

        // Stop output capture
        outputCapture.stop()
    }

    override fun isAlive(): Boolean {
        // For terminal-based processes, assume alive if terminal widget is still active
        return terminalWidget.hasRunningCommands()
    }

    override fun stopCapture() {
        outputCapture.stop()
    }
}
