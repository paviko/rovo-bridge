package paviko.rovobridge.ui

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefBrowser
import paviko.rovobridge.settings.RovoBridgeSettings
import javax.swing.SwingUtilities

object FontSizeMonitor {
    private val logger = Logger.getInstance(FontSizeMonitor::class.java)

    fun setupFontSizeMessageListener(
        browser: JBCefBrowser,
        settings: RovoBridgeSettings,
        connectionProvider: () -> ConnInfo?
    ) {
        try {
            // Wait a bit for connection info to be available, then start monitoring
            val setupTimer = javax.swing.Timer(3000) { // Wait 3 seconds for connection info
                try {
                    val connInfo = connectionProvider()
                    if (connInfo == null) {
                        logger.warn("Cannot set up font size monitoring: no connection info available")
                        return@Timer
                    }

                    logger.debug("Setting up font size monitoring for port ${connInfo.port}")

                    // Periodically check the backend for font size changes
                    val monitorTimer = javax.swing.Timer(2000) { // Check every 2 seconds
                        Thread {
                            try {
                                val url = "http://127.0.0.1:${connInfo.port}/font-size"
                                val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                                connection.setRequestProperty("Authorization", "Bearer ${connInfo.token}")
                                connection.requestMethod = "GET"
                                connection.connectTimeout = 1000
                                connection.readTimeout = 1000

                                if (connection.responseCode == 200) {
                                    val response = connection.inputStream.bufferedReader().use { it.readText() }
                                    val mapper = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper()
                                    val json = mapper.readTree(response)
                                    val fontSize = json.get("fontSize")?.asInt()

                                    if (fontSize != null && fontSize > 0 && fontSize in 8..72) {
                                        // Update settings with new font size
                                        SwingUtilities.invokeLater {
                                            try {
                                                val currentState = settings.state
                                                if (currentState.fontSize != fontSize) {
                                                    currentState.fontSize = fontSize
                                                    logger.debug("Font size synchronized from frontend: $fontSize")
                                                    // Settings are automatically persisted due to PersistentStateComponent
                                                }
                                            } catch (e: Exception) {
                                                logger.warn("Failed to update settings with new font size", e)
                                            }
                                        }
                                    } else if (fontSize != null && fontSize != 0) {
                                        // Only warn for invalid non-zero values (0 means no change received yet)
                                        logger.warn("Invalid font size received from frontend: $fontSize")
                                    }
                                } else {
                                    logger.debug("Font size endpoint returned status: ${connection.responseCode}")
                                }
                            } catch (e: java.net.SocketTimeoutException) {
                                // Timeout is expected occasionally, don't log as error
                                logger.debug("Font size check timeout (normal)")
                            } catch (e: java.net.ConnectException) {
                                logger.debug("Font size check connection failed (backend may be shutting down)")
                            } catch (e: Exception) {
                                logger.debug("Error during font size check: ${e.message}")
                            }
                        }.start()
                    }

                    monitorTimer.start()
                    logger.debug("Font size monitoring started")

                    // Stop monitor timer when browser is disposed
                    Disposer.register(browser) {
                        try {
                            monitorTimer.stop()
                            logger.debug("Font size monitoring stopped")
                        } catch (e: Exception) {
                            logger.warn("Error stopping font size monitor", e)
                        }
                    }
                } catch (e: Exception) {
                    logger.error("Failed to set up font size monitoring", e)
                }
            }

            setupTimer.isRepeats = false // Only run once
            setupTimer.start()

            // Stop setup timer when browser is disposed
            Disposer.register(browser) {
                try {
                    setupTimer.stop()
                } catch (e: Exception) {
                    logger.warn("Error stopping setup timer", e)
                }
            }
        } catch (e: Exception) {
            logger.error("Failed to initialize font size message listener", e)
        }
    }
}
