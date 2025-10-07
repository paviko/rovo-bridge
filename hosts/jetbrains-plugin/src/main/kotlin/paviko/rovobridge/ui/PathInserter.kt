package paviko.rovobridge.ui

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.jcef.JBCefBrowser
import javax.swing.SwingUtilities

/**
 * Utility to send file paths (and optional :start-end ranges) to the embedded web UI.
 */
object PathInserter {
    private val logger = Logger.getInstance(PathInserter::class.java)
    private val mapper = jacksonObjectMapper()
    @Volatile private var browser: JBCefBrowser? = null

    fun setBrowser(browser: JBCefBrowser) {
        this.browser = browser
    }

    fun clearBrowser() {
        this.browser = null
    }

    fun insertPaths(paths: List<String>) {
        try {
            val b = browser ?: run {
                logger.warn("No browser available to insert paths")
                return
            }
            if (paths.isEmpty()) return
            
            // Create message object and serialize to JSON
            val messageObj = mapOf(
                "type" to "insertPaths",
                "paths" to paths,
                "timestamp" to System.currentTimeMillis()
            )
            val messageJson = mapper.writeValueAsString(messageObj)
            
            val script = "window.postMessage($messageJson, '*');"
            
            SwingUtilities.invokeLater {
                try {
                    b.cefBrowser.executeJavaScript(script, b.cefBrowser.url, 0)
                    logger.info("Insert paths message sent to frontend: ${paths.size} paths, script: $script")
                } catch (e: Exception) {
                    logger.warn("Failed to send insert paths message to frontend", e)
                }
            }
        } catch (e: Exception) {
            logger.error("Unexpected error inserting paths", e)
        }
    }

    fun pastePath(path: String) {
        try {
            val b = browser ?: run {
                logger.warn("No browser available to paste path")
                return
            }
            if (path.isEmpty()) return
            
            // Create message object and serialize to JSON
            val messageObj = mapOf(
                "type" to "pastePath",
                "path" to path,
                "timestamp" to System.currentTimeMillis()
            )
            val messageJson = mapper.writeValueAsString(messageObj)
            
            val script = "window.postMessage($messageJson, '*');"
            
            SwingUtilities.invokeLater {
                try {
                    b.cefBrowser.executeJavaScript(script, b.cefBrowser.url, 0)
                    logger.info("Paste path message sent to frontend: $path, script: $script")
                } catch (e: Exception) {
                    logger.warn("Failed to send paste path message to frontend", e)
                }
            }
        } catch (e: Exception) {
            logger.error("Unexpected error pasting path", e)
        }
    }
}
