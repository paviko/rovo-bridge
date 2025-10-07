package paviko.rovobridge.backendprocess

/**
 * BackendLauncher - Migrated from deprecated TerminalView to TerminalToolWindowManager
 * 
 * This implementation provides compatibility with earlier versions of IntelliJ IDEA than 2025.2
 * by using TerminalToolWindowManager instead of the deprecated TerminalView API.
 * 
 * Key changes:
 * - Replaced TerminalView.getInstance() with TerminalToolWindowManager.getInstance()
 * - Uses createShellWidget() with fallback to createLocalShellWidget() for older versions
 * - Added robust error handling for terminal text buffer access across different versions
 * - Maintains compatibility with ShellTerminalWidget for terminal output capture
 */

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.terminal.ui.TerminalWidget
import com.intellij.util.Alarm
import org.jetbrains.plugins.terminal.ShellTerminalWidget
import org.jetbrains.plugins.terminal.TerminalToolWindowManager
import paviko.rovobridge.settings.RovoBridgeSettings
import java.io.PipedOutputStream

object BackendLauncher {
    private val logger = Logger.getInstance(BackendLauncher::class.java)

    fun launchBackend(project: Project): BackendProcess {
        val isWin = System.getProperty("os.name").lowercase().contains("win")
        val binName = if (isWin) "rovo-bridge.exe" else "rovo-bridge"
        val bin = findBundledBinary(binName) ?: binName // fallback to PATH

        val settings = RovoBridgeSettings.getInstance()

        val customCommand = settings.state.customCommand.trim()

        // Build command arguments
        val args = mutableListOf(bin, "--http", "127.0.0.1:0", "--serve-ui", "--print-conn-json")

        // Add --cmd parameter if custom command is configured
        if (customCommand.isNotEmpty()) {
            args.add("--cmd")
            args.add(customCommand)
            logger.info("Launching backend with custom command: '$customCommand'")
        } else {
            logger.info("Launching backend with default command")
        }

        val baseDir = project.basePath ?: System.getProperty("user.dir")
        
        // Return a TerminalBackendProcess (async wrapper) that handles terminal waiting internally
        return TerminalBackendProcess(project, args, baseDir, customCommand)
    }
    
    internal fun launchBackendWithTerminalCheck(
        project: Project,
        args: List<String>,
        baseDir: String,
        customCommand: String,
        outputBuffer: PipedOutputStream,
        callback: (BackendProcess?, Exception?) -> Unit
    ) {
        // Start waiting for terminal availability asynchronously
        waitForTerminalAvailabilityAsync(project) { success, isVisible ->
            if (success) {
                try {
                    val result = doLaunchBackend(project, args, baseDir, customCommand, outputBuffer, isVisible)
                    callback(result, null)
                } catch (e: Exception) {
                    callback(null, e)
                }
            } else {
                callback(null, RuntimeException("Terminal tool window is not available. Please ensure the Terminal plugin is installed and enabled."))
            }
        }
    }
    
    /**
     * Waits for the terminal tool window to become available without blocking the UI thread.
     * Uses IntelliJ's Alarm mechanism to periodically check availability.
     */
    private fun waitForTerminalAvailabilityAsync(project: Project, callback: (Boolean, Boolean) -> Unit) {
        val alarm = Alarm()
        val maxAttempts = 100 // 10 seconds with 100ms intervals
        var attempts = 0

        val isVisible = ToolWindowManager.getInstance(project).getToolWindow("Terminal")?.isVisible ?: false

        fun checkAvailability() {
            ApplicationManager.getApplication().invokeLater {
                try {
                    val terminalManager = TerminalToolWindowManager.getInstance(project)
                    val terminalWindow: ToolWindow? = terminalManager.toolWindow
                    if (terminalWindow != null && terminalWindow.isAvailable) {
                        // ToolWindowManager.getInstance(project).getToolWindow("Terminal")
                        logger.info("Terminal tool window is available after ${attempts * 100}ms")
                        callback(true, isVisible)
                    } else {
                        ToolWindowManager.getInstance(project).getToolWindow("Terminal")?.show();
                        attempts++
                        if (attempts >= maxAttempts) {
                            logger.error("Terminal tool window did not become available within ${maxAttempts * 100}ms")
                            callback(true, isVisible)
                        } else {
                            // Schedule next check
                            alarm.addRequest({ checkAvailability() }, 100)
                        }
                    }
                } catch (e: Exception) {
                    logger.error("Error checking terminal availability: ${e.message}", e)
                    callback(false, false)
                }
            }
        }
        
        logger.info("Waiting for terminal tool window to become available...")
        checkAvailability()
    }
    
    private fun doLaunchBackend(
        project: Project,
        args: List<String>,
        baseDir: String,
        customCommand: String,
        outputBuffer: PipedOutputStream,
        isVisible: Boolean
    ): BackendProcess {
        // At this point, terminal should be available
        return try {
            logger.info("Starting backend in minimized terminal: ${args.joinToString(" ")}")
            launchInTerminal(project, args, baseDir, outputBuffer, isVisible, minimized = true)
        } catch (e: Exception) {
            // If launching with custom command fails, try with default command
            if (customCommand.isNotEmpty()) {
                logger.warn("Failed to launch backend with custom command '$customCommand': ${e.message}")
                logger.info("Attempting fallback to default command")

                try {
                    val bin = args.first()
                    val fallbackArgs = listOf(bin, "--http", "127.0.0.1:0", "--serve-ui", "--print-conn-json")
                    logger.info("Starting fallback backend in minimized terminal: ${fallbackArgs.joinToString(" ")}")
                    launchInTerminal(project, fallbackArgs, baseDir, outputBuffer, isVisible, minimized = true)
                } catch (fallbackException: Exception) {
                    logger.error("Fallback backend launch also failed", fallbackException)
                    throw RuntimeException("Failed to launch backend with custom command '$customCommand' and fallback also failed: ${fallbackException.message}")
                }
            } else {
                logger.error("Failed to launch backend with default command", e)
                throw RuntimeException("Failed to launch backend: ${e.message}")
            }
        }
    }

    /**
     * Creates a terminal widget with optional minimization.
     * If minimized, immediately hides the terminal tool window after creation.
     */
    private data class TerminalSelection(val previous: com.intellij.ui.content.Content?, val current: com.intellij.ui.content.Content?)

    private fun createShellWidget(project: Project, workingDir: String, terminalName: String, isVisible: Boolean, minimized: Boolean): Pair<ShellTerminalWidget, TerminalSelection> {
        val terminalManager = TerminalToolWindowManager.getInstance(project)
        
        val terminalToolWindow = ToolWindowManager.getInstance(project).getToolWindow("Terminal")
        val contentManager = terminalToolWindow?.contentManager
        val previousSelected = contentManager?.selectedContent
        var currentContent: com.intellij.ui.content.Content? = null
        
        // Try to find an existing terminal tab with the same display name to avoid duplicates
        val existing = try {
            terminalManager.getTerminalWidgets().firstOrNull { w ->
                try {
                    val displayName = terminalManager.getContainer(w)?.content?.displayName
                    displayName == terminalName
                } catch (e: Exception) {
                    false
                }
            }
        } catch (e: Exception) {
            null
        }

        val widget: Any = if (existing != null) {
            logger.info("Reusing existing terminal '$terminalName'")

            // Workaround for JetBrains behavior: existing terminal tab may not run commands unless focused
            focusTerminal(isVisible, terminalToolWindow, terminalManager, existing, minimized, terminalName)

            existing
        } else {
            terminalManager.createShellWidget(workingDir, terminalName, false, !minimized)
        }

        val terminalWidget =
            if (widget is ShellTerminalWidget) {
                widget
            } else {
                // Try to extract ShellTerminalWidget from the returned widget
                extractShellTerminalWidget(widget)
            }

        // Determine current content (tab) associated with this terminal widget
        try {
            val cont = terminalManager.getContainer(terminalWidget)
            currentContent = cont.content
        } catch (_: Exception) {}
        
        // Hide the tool window immediately only for newly created terminals when minimized and initially not visible.
        // For existing terminals, we already handled show/focus/hide above to guarantee command execution.
        if (existing == null && !isVisible && minimized) {
            ApplicationManager.getApplication().invokeLater {
                val tw = ToolWindowManager.getInstance(project).getToolWindow("Terminal")
                if (tw != null && tw.isVisible) {
                    tw.hide(null)
                    logger.info("Terminal '$terminalName' tool window hidden - running in background")
                }
            }
        }
        
        return Pair(terminalWidget, TerminalSelection(previousSelected, currentContent))
    }

    private fun focusTerminal(
        isVisible: Boolean,
        terminalToolWindow: ToolWindow?,
        terminalManager: TerminalToolWindowManager,
        existing: TerminalWidget?,
        minimized: Boolean,
        terminalName: String
    ) {
        try {
            // Show the terminal tool window if it is not visible
            if (!isVisible) {
                val app = ApplicationManager.getApplication()
                if (app.isDispatchThread) {
                    terminalToolWindow?.show(null)
                } else {
                    app.invokeAndWait { terminalToolWindow?.show(null) }
                }
            }

            // Focus/select the existing tab to ensure it receives input/execution
            try {
                if (existing != null) {
                    val container = terminalManager.getContainer(existing)
                    val content = container?.content
                    if (content != null) {
                        ApplicationManager.getApplication().invokeAndWait {
                            terminalToolWindow?.contentManager?.setSelectedContent(content, true)
                            terminalToolWindow?.activate(null, true)
                        }
                    }
                }
            } catch (e: Exception) {
                logger.warn("Failed to focus existing terminal tab: ${e.message}", e)
            }

            // If the tool window was not visible originally and we are minimized, hide it back
            if (!isVisible && minimized) {
                ApplicationManager.getApplication().invokeLater {
                    if (terminalToolWindow != null && terminalToolWindow.isVisible) {
                        terminalToolWindow.hide(null)
                        logger.info("Terminal '$terminalName' tool window hidden after focusing existing tab - running in background")
                    }
                }
            }
        } catch (e: Exception) {
            logger.warn("Error while ensuring focus on existing terminal: ${e.message}", e)
        }
    }

    private fun launchInTerminal(
        project: Project,
        args: List<String>,
        workingDir: String,
        outputBuffer: PipedOutputStream,
        isVisible: Boolean,
        minimized: Boolean = false
    ): BackendProcess {
        // Create terminal widget using unified method - this will handle terminal initialization
        val (shellWidget, selection) = createShellWidget(project, workingDir, "RovoBridge Backend", isVisible, minimized)
        
        // Build the command to execute in terminal. The terminal widget is already initialized
        // with the desired working directory, so we can execute the backend command directly
        // without shell-specific 'cd' or chaining operators that vary by shell (cmd vs PowerShell).
        val adjustedArgs = run {
            val list = args.toMutableList()
            val cmdIndex = list.indexOf("--cmd")
            if (cmdIndex != -1 && cmdIndex + 1 < list.size) {
                // Ensure the custom command after --cmd is passed as a single argument across all OSes
                list[cmdIndex + 1] = ensureQuoted(list[cmdIndex + 1])
            }
            list.toList()
        }
        val command = (listOf(quoteIfNeeded(adjustedArgs.first())) + adjustedArgs.drop(1)).joinToString(" ")
        
        // Create a terminal-only backend process
        val backendProcess = RunningTerminalBackendProcess(shellWidget, adjustedArgs.joinToString(" "), outputBuffer)
        
        // Execute the command in the terminal - this inherits full environment
        shellWidget.executeCommand(command)

        // Restore previously active terminal tab if it was different from our tab
        try {
            val prev = selection.previous
            val curr = selection.current
            if (prev != null && curr != null && prev != curr) {
                ApplicationManager.getApplication().invokeLater {
                    try {
                        val tw = ToolWindowManager.getInstance(project).getToolWindow("Terminal")
                        val cm = tw?.contentManager
                        cm?.setSelectedContent(prev, true)
                        logger.info("Restored previously active terminal tab after launching backend")
                    } catch (e: Exception) {
                        logger.warn("Failed to restore previously active terminal tab: ${e.message}", e)
                    }
                }
            }
        } catch (e: Exception) {
            logger.warn("Error while attempting to restore previous terminal selection: ${e.message}", e)
        }
        
        if (!isVisible && minimized) {
            logger.info("Backend launched in minimized terminal without focus")
        } else {
            logger.info("Backend launched in regular terminal")
        }
        
        return backendProcess
    }
    
    /**
     * Helper method to extract ShellTerminalWidget from various terminal widget types
     * for compatibility across different IntelliJ IDEA versions
     */
    private fun extractShellTerminalWidget(widget: Any): ShellTerminalWidget {
        return when {
            // If it's already a ShellTerminalWidget, return it directly
            widget is ShellTerminalWidget -> widget
            
            // Handle TerminalWidgetBridge specifically
            widget::class.java.simpleName == "TerminalWidgetBridge" -> {
                logger.info("Attempting to extract ShellTerminalWidget from TerminalWidgetBridge")
                logger.debug("Available methods in ShellTerminalWidget: ${ShellTerminalWidget::class.java.methods.filter { it.name.contains("toShell") || it.name.contains("extract") || it.name.contains("Widget") }.map { "${it.name}(${it.parameterTypes.map { p -> p.simpleName }.joinToString(", ")})" }}")
                
                try {
                    // Try different parameter types for toShellJediTermWidgetOrThrow
                    val possibleParameterTypes = listOf(
                        widget::class.java,
                        Object::class.java,
                        Any::class.java,
                        Class.forName("org.jetbrains.plugins.terminal.TerminalWidget")
                    )

                    for (paramType in possibleParameterTypes) {
                        try {
                            val method = ShellTerminalWidget::class.java.getDeclaredMethod("toShellJediTermWidgetOrThrow", paramType)
                            logger.info("Found toShellJediTermWidgetOrThrow method with parameter type: ${paramType.simpleName}")
                            val result = method.invoke(null, widget) as ShellTerminalWidget
                            logger.info("Successfully extracted ShellTerminalWidget using toShellJediTermWidgetOrThrow")
                            return result
                        } catch (e: NoSuchMethodException) {
                            logger.debug("Method not found with parameter type: ${paramType.simpleName}")
                        } catch (e: ClassNotFoundException) {
                            logger.debug("Class not found: ${e.message}")
                        }
                    }

                    // If no method worked, try reflection
                    logger.info("toShellJediTermWidgetOrThrow method not found, trying reflection")
                    extractFromBridgeUsingReflection(widget)

                } catch (e: Exception) {
                    logger.debug("Could not extract ShellTerminalWidget using toShellJediTermWidgetOrThrow: ${e.message}")
                    extractFromBridgeUsingReflection(widget)
                }
            }
            
            // Try to use reflection to extract from other bridge types
            else -> {
                try {
                    // Try to call toShellJediTermWidgetOrThrow if available
                    val method = ShellTerminalWidget::class.java.getMethod("toShellJediTermWidgetOrThrow", widget::class.java)
                    method.invoke(null, widget) as ShellTerminalWidget
                } catch (e: Exception) {
                    logger.debug("Could not extract ShellTerminalWidget using toShellJediTermWidgetOrThrow: ${e.message}")

                    // Final fallback - try direct cast
                    try {
                        widget as ShellTerminalWidget
                    } catch (castException: ClassCastException) {
                        throw UnsupportedOperationException(
                            "Cannot extract ShellTerminalWidget from terminal type: ${widget::class.java.simpleName}. " +
                            "This terminal implementation is not supported for backend launching. " +
                            "Available methods: ${widget::class.java.methods.map { it.name }.distinct().sorted()}"
                        )
                    }
                }
            }
        }
    }
    
    /**
     * Attempts to extract ShellTerminalWidget from TerminalWidgetBridge using reflection
     */
    private fun extractFromBridgeUsingReflection(widget: Any): ShellTerminalWidget {
        try {
            logger.info("Attempting reflection-based extraction from ${widget::class.java.simpleName}")

            // Log all available fields for debugging
            val allFields = widget::class.java.declaredFields
            logger.debug("Available fields in ${widget::class.java.simpleName}: ${allFields.map { "${it.name}: ${it.type.simpleName}" }.sorted()}")

            // Try to access common field names that might contain the underlying widget
            val possibleFieldNames = listOf("myWidget", "widget", "terminalWidget", "shellWidget", "delegate", "myTerminalWidget", "myShellWidget")

            for (fieldName in possibleFieldNames) {
                try {
                    val field = widget::class.java.getDeclaredField(fieldName)
                    field.isAccessible = true
                    val fieldValue = field.get(widget)

                    logger.debug("Field $fieldName contains: ${fieldValue?.let { it::class.java.simpleName } ?: "null"}")

                    if (fieldValue is ShellTerminalWidget) {
                        logger.info("Successfully extracted ShellTerminalWidget from field: $fieldName")
                        return fieldValue
                    }
                } catch (e: NoSuchFieldException) {
                    // Continue to next field name
                } catch (e: Exception) {
                    logger.debug("Error accessing field $fieldName: ${e.message}")
                }
            }

            // If no direct field access worked, try to find any ShellTerminalWidget in the object hierarchy
            for (field in allFields) {
                try {
                    field.isAccessible = true
                    val fieldValue = field.get(widget)
                    if (fieldValue is ShellTerminalWidget) {
                        logger.info("Found ShellTerminalWidget in field: ${field.name}")
                        return fieldValue
                    }
                } catch (e: Exception) {
                    // Continue searching
                }
            }

            // Try to look for methods that might return a ShellTerminalWidget
            val methods = widget::class.java.methods
            logger.debug("Available methods in ${widget::class.java.simpleName}: ${methods.filter { it.parameterCount == 0 && it.returnType != Void.TYPE }.map { "${it.name}(): ${it.returnType.simpleName}" }.sorted()}")

            for (method in methods) {
                if (method.parameterCount == 0 && method.returnType != Void.TYPE) {
                    try {
                        val result = method.invoke(widget)
                        if (result is ShellTerminalWidget) {
                            logger.info("Found ShellTerminalWidget via method: ${method.name}()")
                            return result
                        }
                    } catch (e: Exception) {
                        // Continue searching
                    }
                }
            }

            throw UnsupportedOperationException(
                "Could not extract ShellTerminalWidget from TerminalWidgetBridge using reflection. " +
                "Available fields: ${allFields.map { "${it.name}: ${it.type.simpleName}" }.sorted()}. " +
                "Available methods: ${methods.filter { it.parameterCount == 0 }.map { it.name }.sorted()}"
            )

        } catch (e: Exception) {
            throw UnsupportedOperationException(
                "Failed to extract ShellTerminalWidget from TerminalWidgetBridge: ${e.message}"
            )
        }
    }


    private fun ensureQuoted(value: String): String {
        val t = value.trim()
        return if (t.startsWith("\"") && t.endsWith("\"")) t else "\"$t\""
    }

    private fun quoteIfNeeded(path: String): String {
        val isWin = System.getProperty("os.name").lowercase().contains("win")
        if (!isWin) return path
        val trimmed = path.trim()
        val needsQuotes = trimmed.any { it.isWhitespace() } || trimmed.contains("(") || trimmed.contains(")") || trimmed.contains("&")
        return if (needsQuotes && !(trimmed.startsWith("\"") && trimmed.endsWith("\""))) "\"$trimmed\"" else trimmed
    }

    private fun findBundledBinary(name: String): String? {
        val override = System.getenv("ROVOBRIDGE_BIN")
        if (!override.isNullOrBlank()) return override
        val os = System.getProperty("os.name").lowercase()
        val arch = System.getProperty("os.arch").lowercase()
        val osDir = when {
            os.contains("win") -> "windows"
            os.contains("mac") || os.contains("darwin") -> "macos"
            os.contains("nux") || os.contains("linux") -> "linux"
            else -> null
        } ?: return null
        val archDir = when {
            arch.contains("aarch64") || arch.contains("arm64") -> "arm64"
            arch.contains("64") -> "amd64"
            else -> null
        } ?: return null
        val resourcePath = "bin/$osDir/$archDir/$name"
        return paviko.rovobridge.util.ResourceExtractor.extractToTemp(resourcePath, name)
    }

}


