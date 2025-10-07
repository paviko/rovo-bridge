package paviko.rovobridge.ui

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.jcef.JBCefBrowser
import java.awt.datatransfer.DataFlavor
import java.awt.dnd.DnDConstants
import java.awt.dnd.DropTarget
import java.awt.dnd.DropTargetAdapter
import java.awt.dnd.DropTargetDropEvent

object DragAndDropInstaller {
    private val mapper = jacksonObjectMapper()
    fun install(browser: JBCefBrowser, logger: Logger) {
        val comp = browser.component
        val dt = DropTarget(comp, object : DropTargetAdapter() {
            override fun drop(dtde: DropTargetDropEvent) {
                try {
                    dtde.acceptDrop(DnDConstants.ACTION_COPY)
                    val t = dtde.transferable
                    val flavor = DataFlavor.javaFileListFlavor
                    if (t.isDataFlavorSupported(flavor)) {
                        @Suppress("UNCHECKED_CAST")
                        val files = t.getTransferData(flavor) as List<java.io.File>
                        // Only send regular files to insertPaths to avoid chips/segments for directories
                        val filePaths = files.filter { it.isFile }.map { it.absolutePath }
                        if (filePaths.isNotEmpty()) {
                            // Create message object and serialize to JSON
                            val messageObj = mapOf(
                                "type" to "insertPaths",
                                "paths" to filePaths,
                                "timestamp" to System.currentTimeMillis()
                            )
                            val messageJson = mapper.writeValueAsString(messageObj)
                            val script = "(function(){ try { window.postMessage($messageJson, '*'); } catch(e){} })();"
                            browser.cefBrowser.executeJavaScript(script, browser.cefBrowser.url, 0)
                        }
                        // Additionally, send directories via pastePath (no chips/segments)
                        val dirPaths = files.filter { it.isDirectory }.map { it.absolutePath }
                        if (dirPaths.isNotEmpty()) {
                            for (dp in dirPaths) {
                                // Create message object and serialize to JSON
                                val messageObj = mapOf(
                                    "type" to "pastePath",
                                    "path" to dp,
                                    "timestamp" to System.currentTimeMillis()
                                )
                                val messageJson = mapper.writeValueAsString(messageObj)
                                val dirScript = "(function(){ try { window.postMessage($messageJson, '*'); } catch(e){} })();"
                                browser.cefBrowser.executeJavaScript(dirScript, browser.cefBrowser.url, 0)
                            }
                        }
                        // Proactively restore focus to the embedded browser after injecting paths
                        try {
                            javax.swing.SwingUtilities.invokeLater {
                                try { browser.cefBrowser.setFocus(true) } catch (_: Throwable) {}
                                try { browser.component.requestFocusInWindow() } catch (_: Throwable) {}
                                try { browser.component.requestFocus() } catch (_: Throwable) {}
                            }
                        } catch (_: Throwable) { }
                    }
                } catch (e: Exception) {
                    logger.warn("Error handling file drop", e)
                } finally {
                    dtde.dropComplete(true)
                    // Ensure focus is restored even if JavaScript focus didn't take effect yet
                    try {
                        javax.swing.SwingUtilities.invokeLater {
                            try { browser.cefBrowser.setFocus(true) } catch (_: Throwable) {}
                            try { browser.component.requestFocusInWindow() } catch (_: Throwable) {}
                            try { browser.component.requestFocus() } catch (_: Throwable) {}
                        }
                    } catch (_: Throwable) { }
                }
            }
        })
        comp.dropTarget = dt
    }
}
