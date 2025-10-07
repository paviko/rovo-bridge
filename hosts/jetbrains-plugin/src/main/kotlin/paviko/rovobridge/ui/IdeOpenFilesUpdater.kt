package paviko.rovobridge.ui

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.util.concurrency.AppExecutorUtil
import org.cef.browser.CefBrowser
import org.cef.handler.CefLifeSpanHandlerAdapter
import java.nio.file.Paths

class IdeOpenFilesUpdater(private val project: Project, private val browser: JBCefBrowser) : Disposable {
    private val mapper = jacksonObjectMapper()

    fun install() {
        // Observe tab/file changes and push to webview
        val bus = project.messageBus.connect(this)
        val fem = com.intellij.openapi.fileEditor.FileEditorManager.getInstance(project)

        fun push() {
            try {
                val opened = fem.openFiles.mapNotNull { vf -> vfPath(vf) }
                val current = fem.selectedEditor?.file?.let { vf -> vfPath(vf) }
                // Create message object and serialize to JSON
                val messageObj = mapOf(
                    "type" to "updateOpenedFiles",
                    "openedFiles" to opened,
                    "currentFile" to current,
                    "timestamp" to System.currentTimeMillis()
                )
                val messageJson = mapper.writeValueAsString(messageObj)
                val js = "(function(){ try { window.postMessage($messageJson, '*'); } catch(e){} })()"
                browser.cefBrowser.executeJavaScript(js, browser.cefBrowser.url, 0)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // Initial push when page loads
        browser.jbCefClient.addLifeSpanHandler(object : CefLifeSpanHandlerAdapter() {
            override fun onAfterCreated(browser: CefBrowser?) {
                push()
            }
        }, browser.cefBrowser)

        // Listen to tab changes
        bus.subscribe(
            com.intellij.openapi.fileEditor.FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : com.intellij.openapi.fileEditor.FileEditorManagerListener {
                override fun selectionChanged(event: com.intellij.openapi.fileEditor.FileEditorManagerEvent) {
                    push()
                }

                override fun fileOpened(source: com.intellij.openapi.fileEditor.FileEditorManager, file: VirtualFile) {
                    push()
                }

                override fun fileClosed(source: com.intellij.openapi.fileEditor.FileEditorManager, file: VirtualFile) {
                    push()
                }
            })

        // Also push periodically as a fallback
        AppExecutorUtil.getAppScheduledExecutorService()
            .scheduleWithFixedDelay({ push() }, 2, 5, java.util.concurrent.TimeUnit.SECONDS)
    }

    private fun vfPath(vf: VirtualFile?): String? {
        if (vf == null) return null
        val projBase = project.basePath ?: return try {
            vf.toNioPath().toAbsolutePath().normalize().toString()
        } catch (_: Throwable) {
            vf.path
        }
        return try {
            val filePath = vf.toNioPath().toAbsolutePath().normalize()
            val base = Paths.get(projBase).toAbsolutePath().normalize()
            val rel = if (filePath.startsWith(base)) base.relativize(filePath) else filePath
            val s = rel.toString()
            if (s.isEmpty()) vf.name else s
        } catch (_: Throwable) {
            val abs = try {
                vf.toNioPath().toAbsolutePath().normalize().toString()
            } catch (_: Throwable) {
                vf.path
            }
            try {
                val base = java.io.File(projBase).absoluteFile.normalize().path
                val rel = if (abs.startsWith(base + java.io.File.separator)) abs.substring(base.length + 1) else abs
                if (rel.isEmpty()) vf.name else rel
            } catch (_: Throwable) {
                abs
            }
        }
    }

    override fun dispose() {}
}
