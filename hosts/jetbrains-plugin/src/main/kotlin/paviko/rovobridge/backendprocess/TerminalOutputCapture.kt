package paviko.rovobridge.backendprocess

import com.intellij.openapi.diagnostic.Logger
import com.jediterm.core.util.CellPosition
import com.jediterm.core.util.TermSize
import org.jetbrains.plugins.terminal.ShellTerminalWidget
import java.io.PipedOutputStream
import java.nio.charset.StandardCharsets

/**
 * Captures output from a terminal widget and provides it as an InputStream
 */
internal class TerminalOutputCapture(private val outputBuffer: PipedOutputStream) {
    private val logger = Logger.getInstance(TerminalOutputCapture::class.java)
    private var captureThread: Thread? = null
    private var isCapturing = false
    private val processedLines = mutableSetOf<String>()

    fun startCapturing(terminalWidget: ShellTerminalWidget) {
        isCapturing = true
        logger.info("Starting terminal output capture...")

        captureThread = Thread {
            try {
                // Get terminal text buffer with error handling for different IntelliJ versions
                val terminalTextBuffer = try {
                    terminalWidget.terminalTextBuffer
                } catch (e: Exception) {
                    logger.warn("Failed to access terminal text buffer: ${e.message}")
                    return@Thread
                }

                var lastNonEmptyLineIndex = -1
                
                while (isCapturing && !Thread.currentThread().isInterrupted) {
                    try {
                        // Lock the buffer for thread-safe access
                        terminalTextBuffer.lock()
                        if (terminalTextBuffer.width < 300) {
                            terminalTextBuffer.resize(TermSize(300, terminalTextBuffer.height), CellPosition(1, 1), null)
                        }
                        try {
                            val currentHeight = terminalTextBuffer.height
                            
                            // Start checking from the last known non-empty line
                            val startIndex = maxOf(0, lastNonEmptyLineIndex)
                            
                            // Check all lines from startIndex to currentHeight for new content
                            var lineIndex = startIndex
                            while (lineIndex < currentHeight) {
                                try {
                                    val line = terminalTextBuffer.getLine(lineIndex)
                                    var rawText = line.getText().trim()
                                    
                                    // Handle wrapped lines - concatenate with following lines
                                    var currentIndex = lineIndex
                                    while (currentIndex < currentHeight - 1 && terminalTextBuffer.getLine(currentIndex).isWrapped) {
                                        currentIndex++
                                        val nextLine = terminalTextBuffer.getLine(currentIndex)
                                        rawText += nextLine.getText().trim()
                                    }
                                    
                                    // Clean up the text - remove ANSI escape sequences and control characters
                                    val cleanText = rawText
                                        .replace(Regex("\\x1B\\[[0-9;]*[mGKHF]"), "") // ANSI escape sequences
                                        .replace(Regex("\\x1B\\]0;[^\\x07]*\\x07"), "") // Terminal title sequences
                                        .replace(Regex("[\\x00-\\x1F\\x7F]"), "") // Control characters except newline
                                        .trim()

                                    if (cleanText.isNotEmpty()) {
                                        // Update last non-empty line index
                                        if (currentIndex > lastNonEmptyLineIndex) {
                                            lastNonEmptyLineIndex = currentIndex
                                            
                                            // Process new non-empty line
                                            if (!processedLines.contains(cleanText)) {
                                                // Skip common shell prompts and command echoes
                                                if (!isShellPromptOrCommand(cleanText)) {
                                                    processedLines.add(cleanText)
                                                    logger.info("Terminal output: $cleanText")

                                                    // Write to output stream
                                                    try {
                                                        outputBuffer.write("$cleanText\n".toByteArray(StandardCharsets.UTF_8))
                                                        outputBuffer.flush()
                                                    } catch (e: Exception) {
                                                        logger.debug("Error writing to buffer: ${e.message}")
                                                    }

                                                    // Check for JSON connection info
                                                    if (cleanText.startsWith("{") &&
                                                        (cleanText.contains("\"port\"") || cleanText.contains("\"url\"") || cleanText.contains("\"uiBase\""))) {
                                                        logger.info("*** Found backend connection JSON: $cleanText")
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Move to the next unprocessed line (skip wrapped lines we already concatenated)
                                    lineIndex = currentIndex + 1
                                } catch (e: Exception) {
                                    logger.debug("Error reading line $lineIndex: ${e.message}")
                                    lineIndex++
                                }
                            }
                        } finally {
                            // Always unlock the buffer
                            terminalTextBuffer.unlock()
                        }

                        Thread.sleep(1000) // Check every 1000ms

                    } catch (e: InterruptedException) {
                        break
                    } catch (e: Exception) {
                        logger.debug("Error in capture loop: ${e.message}")
                        Thread.sleep(1000)
                    }
                }

                logger.info("Terminal output capture stopped")
            } catch (e: InterruptedException) {
                logger.info("Terminal output capture interrupted")
            } catch (e: Exception) {
                logger.warn("Terminal output capture failed", e)
            }
        }
        captureThread?.isDaemon = true
        captureThread?.start()
    }

    private fun isShellPromptOrCommand(text: String): Boolean {
        // Skip common shell prompts and command echoes
        return text.matches(Regex(".*[$#%>]\\s*$")) || // Shell prompts
               text.startsWith("cd ") ||
               text.contains("rovo-bridge") ||
               text.matches(Regex("^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+.*")) // user@host patterns
    }

    fun stop() {
        isCapturing = false
        captureThread?.interrupt()
        try {
            outputBuffer.close()
        } catch (e: Exception) {
            logger.debug("Error closing output buffer", e)
        }
    }
}