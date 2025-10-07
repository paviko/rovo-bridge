package paviko.rovobridge.backendprocess

import java.io.InputStream

/**
 * Interface to abstract backend process handling.
 *
 * The public surface returned by `BackendLauncher.launchBackend()`.
 */
interface BackendProcess {
    val inputStream: InputStream
    fun waitFor(): Int
    fun destroy()
    fun isAlive(): Boolean
    fun stopCapture()
}
