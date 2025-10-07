package paviko.rovobridge.backendprocess

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import java.io.InputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Internal async BackendProcess implementation that waits for terminal availability.
 * Returned by `BackendLauncher.launchBackend()` as a `BackendProcess`.
 * It exposes an `inputStream` that provides merged backend logs from the IDE terminal.
 */
internal class TerminalBackendProcess(
    private val project: Project,
    private val args: List<String>,
    private val baseDir: String,
    private val customCommand: String
) : BackendProcess {

    private val logger = Logger.getInstance(TerminalBackendProcess::class.java)
    private val actualProcess = AtomicReference<BackendProcess?>(null)
    private val isReady = AtomicBoolean(false)
    private val isFailed = AtomicBoolean(false)
    private val failureException = AtomicReference<Exception?>(null)
    private val outputBuffer = PipedOutputStream()
    private val inputStreamBuffer = PipedInputStream(outputBuffer)

    init {
        // Start the async terminal waiting and backend launch
        BackendLauncher.launchBackendWithTerminalCheck(
            project,
            args,
            baseDir,
            customCommand,
            outputBuffer
        ) { process, exception ->
            if (process != null) {
                actualProcess.set(process)
                isReady.set(true)
                logger.info("TerminalBackendProcess is now ready")
            } else {
                isFailed.set(true)
                failureException.set(exception)
                logger.error("TerminalBackendProcess failed to initialize", exception)
            }
        }
        logger.info("TerminalBackendProcess created, waiting for terminal availability...")
    }

    override val inputStream: InputStream
        get() = inputStreamBuffer

    override fun waitFor(): Int {
        // Wait for the actual process to be ready
        while (!isReady.get() && !isFailed.get()) {
            try {
                Thread.sleep(100)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                return -1
            }
        }

        if (isFailed.get()) {
            val exception = failureException.get()
            logger.error("TerminalBackendProcess failed", exception)
            return -1
        }

        return actualProcess.get()?.waitFor() ?: 0
    }

    override fun destroy() {
        val process = actualProcess.get()
        if (process != null) {
            process.destroy()
        } else {
            logger.info("TerminalBackendProcess destroy called before process was ready")
        }
    }

    override fun isAlive(): Boolean {
        val process = actualProcess.get()
        return if (process != null) {
            process.isAlive()
        } else {
            // While waiting for terminal, consider it "alive"
            !isFailed.get()
        }
    }

    override fun stopCapture() {
        val process = actualProcess.get()
        process?.stopCapture()
    }
}
