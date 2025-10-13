package paviko.rovobridge.ui

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.jcef.JBCefBrowser
import javax.swing.SwingUtilities

/**
 * Handles useClipboard setting synchronization between plugin settings and the web UI
 */
object UseClipboardSynchronizer {
    private var browser: JBCefBrowser? = null
    private val logger = Logger.getInstance(UseClipboardSynchronizer::class.java)
    private val mapper = jacksonObjectMapper()
    
    fun setBrowser(browser: JBCefBrowser) {
        try {
            this.browser = browser
            logger.debug("Browser reference set for useClipboard synchronization")
        } catch (e: Exception) {
            logger.error("Failed to set browser reference", e)
        }
    }
    
    fun updateFrontendUseClipboard(useClipboard: Boolean) {
        try {
            val currentBrowser = browser
            if (currentBrowser == null) {
                logger.warn("Cannot update frontend useClipboard: no browser reference available")
                return
            }
            
            SwingUtilities.invokeLater {
                try {
                    // Create message object and serialize to JSON
                    val messageObj = mapOf(
                        "type" to "updateUseClipboard",
                        "useClipboard" to useClipboard,
                        "timestamp" to System.currentTimeMillis()
                    )
                    val messageJson = mapper.writeValueAsString(messageObj)
                    val script = "window.postMessage($messageJson, '*');"
                    
                    currentBrowser.cefBrowser.executeJavaScript(script, currentBrowser.cefBrowser.url, 0)
                    logger.info("UseClipboard message sent to frontend: $useClipboard, script: $script")
                } catch (e: Exception) {
                    logger.warn("Failed to send useClipboard message to frontend", e)
                }
            }
        } catch (e: Exception) {
            logger.error("Unexpected error updating frontend useClipboard", e)
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
