package paviko.rovobridge.ui

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import paviko.rovobridge.settings.RovoBridgeSettings

object WebViewLoadHandler {
    private val mapper = jacksonObjectMapper()
    fun install(
        browser: JBCefBrowser,
        chipsCollapsedQuery: JBCefJSQuery?,
        composerCollapsedQuery: JBCefJSQuery?,
        openFileQuery: JBCefJSQuery?,
        settings: RovoBridgeSettings,
        getConnectionInfo: () -> ConnInfo?,
        logger: Logger,
    ) {
        val client = browser.jbCefClient
        client.addLoadHandler(object : CefLoadHandlerAdapter() {
            override fun onLoadEnd(b: CefBrowser?, frame: CefFrame?, httpStatusCode: Int) {
                try {
                    if (frame != null && frame.isMain) {
                        // Tooltip polyfill - keep direct call as this is UI configuration, not message protocol
                        try {
                            val polyfillScript = """
                                (function(){
                                    try { 
                                        document.documentElement.classList.add('tip-polyfill'); 
                                    } catch(e){}
                                    try { 
                                        if (window.__setTooltipPolyfill) {
                                            window.__setTooltipPolyfill(true);
                                        }
                                    } catch(e){}
                                })();
                            """.trimIndent()
                            b?.executeJavaScript(polyfillScript, b.url, 0)
                        } catch (_: Throwable) {}

                        // Initial collapsed state BEFORE attaching observers
                        try {
                            val initScript = WebViewScripts.applyInitialCollapsedStateScript(
                                settings.state.chipsCollapsed,
                                settings.state.composerCollapsed
                            )
                            b?.executeJavaScript(initScript, b.url, 0)
                        } catch (_: Throwable) {}

                        // Define notify functions
                        try {
                            val notifyScript = WebViewScripts.defineNotifyFunctionsScript(chipsCollapsedQuery, composerCollapsedQuery)
                            b?.executeJavaScript(notifyScript, b.url, 0)
                        } catch (_: Throwable) {}

                        // Inject open-file bridge
                        try {
                            val openBridge = WebViewScripts.defineOpenFileBridgeScript(openFileQuery)
                            b?.executeJavaScript(openBridge, b.url, 0)
                        } catch (_: Throwable) {}

                        // Attach observers
                        try {
                            val observersScript = WebViewScripts.defineObserversScript()
                            b?.executeJavaScript(observersScript, b.url, 0)
                        } catch (_: Throwable) {}

                        // Inject access token via postMessage after page load (avoids URL exposure)
                        try {
                            val t = getConnectionInfo()?.token
                            if (!t.isNullOrEmpty()) {
                                // Create message object and serialize to JSON
                                val messageObj = mapOf(
                                    "type" to "setToken",
                                    "token" to t,
                                    "timestamp" to System.currentTimeMillis()
                                )
                                val messageJson = mapper.writeValueAsString(messageObj)
                                val tokenScript = "(function(){ try { window.postMessage($messageJson, '*'); } catch(e){ console.error('Token message error:', e); }; })();"
                                b?.executeJavaScript(tokenScript, b.url, 0)
                                logger.info("Token message sent to frontend, script: $tokenScript")
                            }
                        } catch (_: Throwable) {}

                        // Inject initial font size via postMessage after page load to ensure handler is ready
                        try {
                            val fs = settings.state.fontSize
                            if (fs in 8..72) {
                                val fsMessageObj = mapOf(
                                    "type" to "setFontSize",
                                    "size" to fs,
                                    "timestamp" to System.currentTimeMillis()
                                )
                                val fsMessageJson = mapper.writeValueAsString(fsMessageObj)
                                val fsScript = "(function(){ try { window.postMessage($fsMessageJson, '*'); } catch(e){ console.error('Font size message error:', e); }; })();"
                                b?.executeJavaScript(fsScript, b.url, 0)
                                logger.info("Initial font size message sent to frontend: $fs, script: $fsScript")
                            } else {
                                logger.warn("Skipped sending initial font size: invalid value $fs")
                            }
                        } catch (_: Throwable) {}

                        // Inject initial useClipboard via postMessage after page load to ensure handler is ready
                        try {
                            val useClipboard = settings.state.useClipboard
                            val ucMessageObj = mapOf(
                                "type" to "updateUseClipboard",
                                "useClipboard" to useClipboard,
                                "timestamp" to System.currentTimeMillis()
                            )
                            val ucMessageJson = mapper.writeValueAsString(ucMessageObj)
                            val ucScript = "(function(){ try { window.postMessage($ucMessageJson, '*'); } catch(e){ console.error('useClipboard message error:', e); }; })();"
                            b?.executeJavaScript(ucScript, b.url, 0)
                            logger.info("Initial useClipboard message sent to frontend: $useClipboard, script: $ucScript")
                        } catch (_: Throwable) {}
                    }
                } catch (_: Throwable) { }
            }
        }, browser.cefBrowser)
    }
}
