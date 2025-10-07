package paviko.rovobridge.ui

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.jcef.JBCefBrowser
import javax.swing.SwingUtilities

/**
 * Handles font size synchronization between plugin settings and the web UI
 */
object FontSizeSynchronizer {
    private var browser: JBCefBrowser? = null
    private val logger = Logger.getInstance(FontSizeSynchronizer::class.java)
    private val mapper = jacksonObjectMapper()
    
    fun setBrowser(browser: JBCefBrowser) {
        try {
            this.browser = browser
            logger.debug("Browser reference set for font size synchronization")
        } catch (e: Exception) {
            logger.error("Failed to set browser reference", e)
        }
    }
    
    fun updateFrontendFontSize(fontSize: Int) {
        try {
            val currentBrowser = browser
            if (currentBrowser == null) {
                logger.warn("Cannot update frontend font size: no browser reference available")
                return
            }
            
            if (fontSize !in 8..72) {
                logger.warn("Invalid font size for frontend update: $fontSize (must be 8-72)")
                return
            }
            
            SwingUtilities.invokeLater {
                try {
                    // Create message object and serialize to JSON
                    val messageObj = mapOf(
                        "type" to "setFontSize",
                        "size" to fontSize,
                        "timestamp" to System.currentTimeMillis()
                    )
                    val messageJson = mapper.writeValueAsString(messageObj)
                    val script = "window.postMessage($messageJson, '*');"
                    
                    currentBrowser.cefBrowser.executeJavaScript(script, currentBrowser.cefBrowser.url, 0)
                    logger.info("Font size message sent to frontend: $fontSize, script: $script")
                } catch (e: Exception) {
                    logger.warn("Failed to send font size message to frontend", e)
                }
            }
        } catch (e: Exception) {
            logger.error("Unexpected error updating frontend font size", e)
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