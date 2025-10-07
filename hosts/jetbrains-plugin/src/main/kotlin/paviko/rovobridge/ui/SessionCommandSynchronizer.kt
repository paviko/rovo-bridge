package paviko.rovobridge.ui

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.jcef.JBCefBrowser
import javax.swing.SwingUtilities

/**
 * Handles session command synchronization between plugin settings and the web UI
 */
object SessionCommandSynchronizer {
    private var browser: JBCefBrowser? = null
    private val logger = Logger.getInstance(SessionCommandSynchronizer::class.java)
    private val mapper = jacksonObjectMapper()
    
    fun setBrowser(browser: JBCefBrowser) {
        try {
            this.browser = browser
            logger.debug("Browser reference set for session command synchronization")
        } catch (e: Exception) {
            logger.error("Failed to set browser reference", e)
        }
    }
    
    fun updateFrontendSessionCommand(customCommand: String) {
        try {
            val currentBrowser = browser
            if (currentBrowser == null) {
                logger.warn("Cannot update frontend session command: no browser reference available")
                return
            }
            
            SwingUtilities.invokeLater {
                try {
                    // Create message object and serialize to JSON
                    val messageObj = mapOf(
                        "type" to "updateSessionCommand",
                        "command" to customCommand,
                        "timestamp" to System.currentTimeMillis()
                    )
                    val messageJson = mapper.writeValueAsString(messageObj)
                    val script = "window.postMessage($messageJson, '*');"
                    
                    currentBrowser.cefBrowser.executeJavaScript(script, currentBrowser.cefBrowser.url, 0)
                    logger.info("Session command message sent to frontend: '$customCommand', script: $script")
                } catch (e: Exception) {
                    logger.warn("Failed to send session command message to frontend", e)
                }
            }
        } catch (e: Exception) {
            logger.error("Unexpected error updating frontend session command", e)
        }
    }
    
    fun clearBrowser() {
        try {
            browser = null
            logger.debug("Browser reference cleared")
        } catch (e: Exception) {
            logger.error("Error clearing browser reference", e)
        }
    }
}