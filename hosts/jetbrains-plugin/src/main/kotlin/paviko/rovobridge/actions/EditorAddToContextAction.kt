package paviko.rovobridge.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.vfs.VfsUtilCore
import paviko.rovobridge.ui.PathInserter

class EditorAddToContextAction : AnAction("RovoBridge: Add to context") {
    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE)
        e.presentation.isEnabledAndVisible = file != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
        val path = try {
            if (file.isInLocalFileSystem) VfsUtilCore.virtualToIoFile(file).absolutePath else file.path
        } catch (_: Throwable) { null }
        if (!path.isNullOrEmpty()) {
            PathInserter.insertPaths(listOf(path))
        }
    }
}
