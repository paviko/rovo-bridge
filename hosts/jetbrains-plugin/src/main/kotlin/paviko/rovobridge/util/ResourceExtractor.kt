package paviko.rovobridge.util

import java.io.File
import java.io.InputStream

object ResourceExtractor {
    fun extractToTemp(resourcePath: String, targetName: String): String? {
        val stream: InputStream = javaClass.classLoader.getResourceAsStream(resourcePath) ?: return null
        // Create a unique temporary directory and place the file with its original name inside it.
        // This preserves the executable extension (e.g., .exe on Windows) at the end of the filename.
        val tempDir = java.nio.file.Files.createTempDirectory("rovo-bridge-").toFile()
        tempDir.deleteOnExit()
        val tmp = File(tempDir, targetName)
        stream.use { input -> tmp.outputStream().use { input.copyTo(it) } }
        tmp.setExecutable(true)
        tmp.deleteOnExit()
        return tmp.absolutePath
    }
}
