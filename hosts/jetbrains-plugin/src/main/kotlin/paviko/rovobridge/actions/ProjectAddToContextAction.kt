package paviko.rovobridge.actions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import paviko.rovobridge.ui.PathInserter

class ProjectAddToContextAction : AnAction("RovoBridge: Add to context") {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
    override fun update(e: AnActionEvent) {
        val files = e.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY)
        e.presentation.isEnabledAndVisible = files != null && files.isNotEmpty()
    }

    override fun actionPerformed(e: AnActionEvent) {
        val files = e.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY) ?: return
        val paths = mutableListOf<String>()
        for (vf in files) {
            collectFilePaths(vf, paths)
        }
        if (paths.isNotEmpty()) {
            PathInserter.insertPaths(paths)
        }
    }

    private fun asAbsolutePath(vf: VirtualFile): String? {
        return try {
            if (vf.isInLocalFileSystem) VfsUtilCore.virtualToIoFile(vf).absolutePath else vf.path
        } catch (_: Throwable) {
            null
        }
    }

    private fun collectFilePaths(vf: VirtualFile, out: MutableList<String>) {
        try {
            if (vf.isDirectory) {
                val children = vf.children
                if (children != null) {
                    for (child in children) {
                        collectFilePaths(child, out)
                    }
                }
            } else {
                val p = asAbsolutePath(vf)
                if (!p.isNullOrEmpty()) out.add(p)
            }
        } catch (_: Throwable) {
            // ignore broken VFS entries
        }
    }
}
