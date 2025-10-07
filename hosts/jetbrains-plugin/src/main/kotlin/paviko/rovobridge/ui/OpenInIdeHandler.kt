package paviko.rovobridge.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.ScrollType
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.ui.jcef.JBCefJSQuery

object OpenInIdeHandler {
    fun install(openFileQuery: JBCefJSQuery?, project: Project, logger: Logger) {
        try {
            openFileQuery?.addHandler { param ->
                try {
                    val raw = param ?: ""
                    val rangeRx = Regex(":(\\d+)(?:-(\\d+))?$")
                    val m = rangeRx.find(raw)
                    val startLine0 = try { m?.groupValues?.getOrNull(1)?.toInt() } catch (_: Throwable) { null }
                    val cleaned = raw.replace(rangeRx, "")
                    val projBase = project.basePath
                    val nioPath = try {
                        val p = java.nio.file.Paths.get(cleaned)
                        if (p.isAbsolute) p else if (projBase != null) java.nio.file.Paths.get(projBase, cleaned) else p
                    } catch (_: Throwable) { null }
                    if (nioPath != null) {
                        val ioFile = nioPath.toFile()
                        val lfs = LocalFileSystem.getInstance()
                        val vf = lfs.findFileByIoFile(ioFile) ?: lfs.refreshAndFindFileByIoFile(ioFile)
                        if (vf != null) {
                            ApplicationManager.getApplication().invokeLater {
                                val fm = FileEditorManager.getInstance(project)
                                if (startLine0 != null && startLine0 >= 0) {
                                    try {
                                        val desc = OpenFileDescriptor(project, vf, startLine0, 0)
                                        try { desc.isUseCurrentWindow = true } catch (_: Throwable) {}
                                        val ed = try { fm.openTextEditor(desc, true) } catch (_: Throwable) { null }
                                        if (ed == null) {
                                            logger.info("openFile: openTextEditor returned null; falling back to openFile() for '$cleaned'")
                                            fm.openFile(vf, true)
                                        }
                                        try {
                                            val pos = LogicalPosition(startLine0.coerceAtLeast(0), 0)
                                            ed?.caretModel?.moveToLogicalPosition(pos)
                                            ed?.scrollingModel?.scrollToCaret(ScrollType.CENTER)
                                        } catch (_: Throwable) {}
                                    } catch (t: Throwable) {
                                        logger.warn("openFile: exception opening at line; falling back to openFile() for '$cleaned'", t)
                                        fm.openFile(vf, true)
                                    }
                                } else {
                                    fm.openFile(vf, true)
                                }
                            }
                        } else {
                            logger.warn("openFile: VirtualFile not found for '$nioPath' (cleaned='$cleaned')")
                        }
                    } else {
                        logger.warn("openFile: Could not resolve path from '$cleaned'")
                    }
                } catch (e: Exception) {
                    logger.warn("Failed to open file from webview: $param", e)
                }
                null
            }
        } catch (_: Throwable) { }
    }
}
