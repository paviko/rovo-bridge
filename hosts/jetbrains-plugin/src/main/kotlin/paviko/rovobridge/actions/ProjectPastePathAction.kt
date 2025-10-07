package paviko.rovobridge.actions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import paviko.rovobridge.ui.PathInserter

class ProjectPastePathAction : AnAction("RovoBridge: paste path") {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val files = e.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY)
        val hasDir = files?.any { it.isDirectory } == true
        e.presentation.isEnabledAndVisible = hasDir
    }

    override fun actionPerformed(e: AnActionEvent) {
        val files = e.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY) ?: return
        val dirs = files.filter { it.isDirectory }
        if (dirs.isEmpty()) return
        for (vf in dirs) {
            val p = asAbsolutePath(vf)
            if (!p.isNullOrEmpty()) PathInserter.pastePath(p)
        }
    }

    private fun asAbsolutePath(vf: VirtualFile): String? {
        return try {
            if (vf.isInLocalFileSystem) VfsUtilCore.virtualToIoFile(vf).absolutePath else vf.path
        } catch (_: Throwable) {
            null
        }
    }
}
