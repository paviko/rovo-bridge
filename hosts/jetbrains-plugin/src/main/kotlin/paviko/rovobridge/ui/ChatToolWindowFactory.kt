package paviko.rovobridge.ui

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.ui.JBUI
import paviko.rovobridge.backendprocess.BackendLauncher
import paviko.rovobridge.settings.RovoBridgeSettings
import java.awt.BorderLayout
import java.awt.Font
import java.io.BufferedReader
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import javax.swing.*

class ChatToolWindowFactory : ToolWindowFactory, DumbAware {
    private var connectionInfo: ConnInfo? = null
    private val logger = Logger.getInstance(ChatToolWindowFactory::class.java)

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        // vertical=true => top/bottom split; top takes 100% initially (logs collapsed)
        val mainPanel = JPanel(BorderLayout())
        val content = toolWindow.contentManager.factory.createContent(mainPanel, "", false)
        toolWindow.contentManager.addContent(content)

        if (!JBCefApp.isSupported()) {
            val notSupported = JPanel(BorderLayout()).apply {
                add(JLabel("JCEF not supported on this platform"), BorderLayout.CENTER)
            }
            mainPanel.add(notSupported, BorderLayout.CENTER)
            return
        }

        val logArea = JTextArea().apply {
            font = Font(Font.MONOSPACED, Font.PLAIN, 12)
            isEditable = false
            lineWrap = true
            wrapStyleWord = true
        }
        val logScroll = JScrollPane(logArea)

        // Create collapsible logs panel (collapsed by default)
        val logsPanel = JPanel(BorderLayout()).apply {
            border = JBUI.Borders.empty(4)
            add(logScroll, BorderLayout.CENTER)
        }
        val hideableLogs = com.intellij.ui.HideableTitledPanel("Backend logs (merged stdout/stderr)", false)
        hideableLogs.setContentComponent(logsPanel)

        // Placeholder center until browser loads
        mainPanel.add(JPanel(BorderLayout()).apply {
            add(JLabel("Starting backend..."), BorderLayout.CENTER)
        }, BorderLayout.CENTER)
        // Add collapsible logs at the bottom
        mainPanel.add(hideableLogs, BorderLayout.SOUTH)

        val proc = try {
            BackendLauncher.launchBackend(project)
        } catch (e: Exception) {
            logger.error("Failed to launch backend", e)
            mainPanel.removeAll()
            mainPanel.add(JPanel(BorderLayout()).apply {
                add(
                    JLabel("<html><center>Failed to start backend:<br/>${e.message}<br/><br/>Check logs for details.</center></html>"),
                    BorderLayout.CENTER
                )
            }, BorderLayout.CENTER)
            mainPanel.add(hideableLogs, BorderLayout.SOUTH)
            mainPanel.revalidate()
            mainPanel.repaint()
            return
        }
        val reader = BufferedReader(InputStreamReader(proc.inputStream, StandardCharsets.UTF_8))
        val mapper = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper()
        val logThread = Thread {
            try {
                var line: String?
                var browserSet = false
                var connectionTimeout = System.currentTimeMillis() + 300000 // 300 second timeout

                while (reader.readLine().also { line = it } != null) {
                    val l = line!!.trim()
                    SwingUtilities.invokeLater { logArea.append(l + "\n") }

                    if (!browserSet && l.startsWith("{")) {
                        try {
                            val json = mapper.readTree(l)
                            val uiBase = json.get("uiBase")?.asText()
                            val port = json.get("port")?.asInt()
                            val token = json.get("token")?.asText()
                            if (!uiBase.isNullOrEmpty() && port != null && !token.isNullOrEmpty()) {
                                proc.stopCapture()
                                // Store connection info for later use
                                connectionInfo = ConnInfo(port, token, uiBase)
                                browserSet = true
                                logger.info("Backend connection established: port=$port")

                                SwingUtilities.invokeLater {
                                    try {
                                        // Read UI mode from settings and append to URL
                                        val settings = RovoBridgeSettings.getInstance()
                                        val uiMode = settings.state.uiMode
                                        val urlWithMode = if (uiBase.contains("?")) {
                                            "$uiBase&mode=$uiMode"
                                        } else {
                                            "$uiBase?mode=$uiMode"
                                        }
                                        val browser = JBCefBrowser(urlWithMode)

                                        // Store browser reference for font size updates
                                        FontSizeSynchronizer.setBrowser(browser)

                                        // Store browser reference for session command updates
                                        SessionCommandSynchronizer.setBrowser(browser)

                                        // Store browser reference for useClipboard updates
                                        UseClipboardSynchronizer.setBrowser(browser)

                                        // Store browser reference for path insertion (context actions)
                                        PathInserter.setBrowser(browser)

                                        // Set up JS bridge for persisting chips/composer collapsed states
                                        val chipsCollapsedQuery = try {
                                            JBCefJSQuery.create(browser)
                                        } catch (e: Exception) {
                                            null
                                        }
                                        val composerCollapsedQuery = try {
                                            JBCefJSQuery.create(browser)
                                        } catch (e: Exception) {
                                            null
                                        }
                                        // JS bridge for opening files in IDE
                                        val openFileQuery = try {
                                            JBCefJSQuery.create(browser)
                                        } catch (e: Exception) {
                                            null
                                        }

                                        // Ensure queries are disposed with the browser to avoid leaks
                                        try {
                                            if (chipsCollapsedQuery != null) Disposer.register(
                                                browser,
                                                chipsCollapsedQuery
                                            )
                                        } catch (_: Throwable) {
                                        }
                                        try {
                                            if (composerCollapsedQuery != null) Disposer.register(
                                                browser,
                                                composerCollapsedQuery
                                            )
                                        } catch (_: Throwable) {
                                        }
                                        try {
                                            if (openFileQuery != null) Disposer.register(browser, openFileQuery)
                                        } catch (_: Throwable) {
                                        }

                                        try {
                                            chipsCollapsedQuery?.addHandler { param ->
                                                try {
                                                    val v = param.equals("true", ignoreCase = true) || param == "1"
                                                    val st = settings.state
                                                    if (st.chipsCollapsed != v) st.chipsCollapsed = v
                                                } catch (_: Throwable) {
                                                }
                                                null
                                            }
                                        } catch (_: Throwable) {
                                        }
                                        try {
                                            composerCollapsedQuery?.addHandler { param ->
                                                try {
                                                    val v = param.equals("true", ignoreCase = true) || param == "1"
                                                    val st = settings.state
                                                    if (st.composerCollapsed != v) st.composerCollapsed = v
                                                } catch (_: Throwable) {
                                                }
                                                null
                                            }
                                        } catch (_: Throwable) {
                                        }
                                        // Open file handler via helper
                                        try {
                                            OpenInIdeHandler.install(openFileQuery, project, logger)
                                        } catch (_: Throwable) {
                                        }


                                        // Push opened files and current file from IDE into the webview (@ overlay)
                                        try {
                                            val filesUpdater = IdeOpenFilesUpdater(project, browser)
                                            filesUpdater.install()
                                            Disposer.register(browser, filesUpdater)
                                        } catch (e: Exception) {
                                            logger.warn("Failed to install IdeOpenFilesUpdater", e)
                                        }

                                        // Set initial font size from settings
                                        val initialFontSize = settings.state.fontSize
                                        SwingUtilities.invokeLater {
                                            try {
                                                val fontSizeScript = """
                                                    window.postMessage({
                                                        type: 'setFontSize',
                                                        size: $initialFontSize,
                                                        timestamp: ${System.currentTimeMillis()}
                                                    }, '*');
                                                """.trimIndent()
                                                browser.cefBrowser.executeJavaScript(
                                                    fontSizeScript,
                                                    browser.cefBrowser.url,
                                                    0
                                                )
                                            } catch (e: Exception) {
                                                logger.warn("Failed to set initial font size", e)
                                            }
                                        }
                                        // Immediate attempt to enable tooltip polyfill (redundant with load handler)
                                        SwingUtilities.invokeLater {
                                            try {
                                                val polyfillScriptEarly = """
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
                                                browser.cefBrowser.executeJavaScript(
                                                    polyfillScriptEarly,
                                                    browser.cefBrowser.url,
                                                    0
                                                )
                                            } catch (e: Exception) {
                                                logger.debug(
                                                    "Early tooltip polyfill injection failed (will retry on load)",
                                                    e
                                                )
                                            }
                                        }
                                        // Ensure tooltip polyfill is enabled in JCEF after page load
                                        try {
                                            WebViewLoadHandler.install(
                                                browser,
                                                chipsCollapsedQuery,
                                                composerCollapsedQuery,
                                                openFileQuery,
                                                settings,
                                                { connectionInfo },
                                                logger
                                            )
                                        } catch (e: Exception) {
                                            logger.warn("Failed to install load handler", e)
                                        }

                                        // Early attempt: define notify functions only (no observers) before load end
                                        try {
                                            val earlyNotify = WebViewScripts.defineNotifyFunctionsScript(
                                                chipsCollapsedQuery,
                                                composerCollapsedQuery
                                            )
                                            browser.cefBrowser.executeJavaScript(earlyNotify, browser.cefBrowser.url, 0)
                                        } catch (_: Throwable) {
                                        }
                                        // Early attempt: define open-file bridge before load end
                                        try {
                                            val earlyOpen = WebViewScripts.defineOpenFileBridgeScript(openFileQuery)
                                            browser.cefBrowser.executeJavaScript(earlyOpen, browser.cefBrowser.url, 0)
                                        } catch (_: Throwable) {
                                        }

                                        // Set initial session command from settings
                                        val customCommand = settings.state.customCommand
                                        SessionCommandSynchronizer.updateFrontendSessionCommand(customCommand)

                                        // Set up message listener for font size changes from frontend
                                        FontSizeMonitor.setupFontSizeMessageListener(
                                            browser,
                                            settings
                                        ) { connectionInfo }

                                        // Enable dropping files from the IDE onto the web UI via helper
                                        try {
                                            DragAndDropInstaller.install(browser, logger)
                                        } catch (e: Exception) {
                                            logger.warn("Failed to set up drag and drop", e)
                                        }
                                        mainPanel.removeAll()
                                        mainPanel.add(browser.component, BorderLayout.CENTER)
                                        // keep logs section at the bottom
                                        mainPanel.add(hideableLogs, BorderLayout.SOUTH)
                                        mainPanel.revalidate()
                                        mainPanel.repaint()
                                    } catch (e: Exception) {
                                        logger.error("Failed to create browser component", e)
                                        mainPanel.removeAll()
                                        mainPanel.add(JPanel(BorderLayout()).apply {
                                            add(
                                                JLabel("<html><center>Failed to create browser:<br/>${e.message}</center></html>"),
                                                BorderLayout.CENTER
                                            )
                                        }, BorderLayout.CENTER)
                                        mainPanel.revalidate()
                                        mainPanel.repaint()
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            logger.warn("Failed to parse backend connection JSON: $l", e)
                        }
                    }

                    // Check for connection timeout
                    if (!browserSet && System.currentTimeMillis() > connectionTimeout) {
                        logger.error("Backend connection timeout after 30 seconds")
                        SwingUtilities.invokeLater {
                            mainPanel.removeAll()
                            mainPanel.add(JPanel(BorderLayout()).apply {
                                add(
                                    JLabel("<html><center>Backend connection timeout.<br/>Check logs for details.</center></html>"),
                                    BorderLayout.CENTER
                                )
                            }, BorderLayout.CENTER)
                            mainPanel.add(hideableLogs, BorderLayout.SOUTH)
                            mainPanel.revalidate()
                            mainPanel.repaint()
                        }
                        break
                    }
                }
            } catch (e: Exception) {
                logger.error("Error reading backend output", e)
                SwingUtilities.invokeLater {
                    mainPanel.removeAll()
                    mainPanel.add(JPanel(BorderLayout()).apply {
                        add(
                            JLabel("<html><center>Backend communication error:<br/>${e.message}</center></html>"),
                            BorderLayout.CENTER
                        )
                    }, BorderLayout.CENTER)
                    mainPanel.add(hideableLogs, BorderLayout.SOUTH)
                    mainPanel.revalidate()
                    mainPanel.repaint()
                }
            }
        }
        logThread.isDaemon = true
        logThread.start()

        Disposer.register(toolWindow.disposable) {
            try {
                proc.destroy()
            } catch (_: Throwable) {
            }
            // Clear browser references
            FontSizeSynchronizer.clearBrowser()
            SessionCommandSynchronizer.clearBrowser()
            UseClipboardSynchronizer.clearBrowser()
            PathInserter.clearBrowser()
        }
    }


}
