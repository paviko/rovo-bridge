package paviko.rovobridge.settings

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import java.awt.Color
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JSpinner
import javax.swing.SpinnerNumberModel

/**
 * Settings UI component for RovoBridge plugin configuration.
 * Provides a settings panel under Tools > RovoBridge Plug with configurable options.
 */
class RovoBridgeConfigurable : Configurable {
    
    private var mainPanel: JPanel? = null
    private var customCommandField: JBTextField? = null
    private var uiModeComboBox: ComboBox<String>? = null
    private var fontSizeSpinner: JSpinner? = null
    private var commandErrorLabel: JBLabel? = null
    private var fontSizeErrorLabel: JBLabel? = null
    
    private val settings = RovoBridgeSettings.getInstance()
    private val logger = Logger.getInstance(RovoBridgeConfigurable::class.java)
    
    override fun getDisplayName(): String = "RovoBridge Plug"
    
    override fun createComponent(): JComponent? {
        try {
            // Create UI components
            customCommandField = JBTextField(settings.state.customCommand)
            
            uiModeComboBox = ComboBox(arrayOf("Terminal", "Canvas")).apply {
                selectedItem = settings.state.uiMode
            }
            
            fontSizeSpinner = JSpinner(SpinnerNumberModel(settings.state.fontSize, 8, 72, 1))
            
            // Create error labels for validation messages
            commandErrorLabel = JBLabel().apply {
                foreground = Color.RED
                isVisible = false
            }
            
            fontSizeErrorLabel = JBLabel().apply {
                foreground = Color.RED
                isVisible = false
            }
            
            // Create info label for mode change
            val modeInfoLabel = JBLabel("<html><i>Changing mode requires clicking \"Restart\"</i></html>")
            
            // Add validation listeners
            setupValidationListeners()
            
            // Build the form
            mainPanel = FormBuilder.createFormBuilder()
                .addLabeledComponent(JBLabel("Command:"), customCommandField!!, 1, false)
                .addComponent(commandErrorLabel!!)
                .addLabeledComponent(JBLabel("Mode:"), uiModeComboBox!!, 1, false)
                .addComponent(modeInfoLabel)
                .addLabeledComponent(JBLabel("Font Size:"), fontSizeSpinner!!, 1, false)
                .addComponent(fontSizeErrorLabel!!)
                .addComponentFillVertically(JPanel(), 0)
                .panel
            
            return mainPanel
        } catch (e: Exception) {
            logger.error("Failed to create settings UI component", e)
            return JPanel().apply {
                add(JBLabel("Error creating settings panel. Check logs for details."))
            }
        }
    }
    
    private fun setupValidationListeners() {
        // Font size validation
        fontSizeSpinner?.addChangeListener {
            validateFontSize()
        }
        
        // Command validation (basic check for empty/whitespace)
        customCommandField?.document?.addDocumentListener(object : javax.swing.event.DocumentListener {
            override fun insertUpdate(e: javax.swing.event.DocumentEvent?) {
                validateCommand()
            }
            override fun removeUpdate(e: javax.swing.event.DocumentEvent?) {
                validateCommand()
            }
            override fun changedUpdate(e: javax.swing.event.DocumentEvent?) {
                validateCommand()
            }
        })
    }
    
    private fun validateFontSize(): Boolean {
        val fontSize = fontSizeSpinner?.value as? Int ?: return false
        return if (fontSize in 8..72) {
            fontSizeErrorLabel?.isVisible = false
            true
        } else {
            fontSizeErrorLabel?.text = "Font size must be between 8 and 72"
            fontSizeErrorLabel?.isVisible = true
            false
        }
    }
    
    private fun validateCommand(): Boolean {
        val command = customCommandField?.text?.trim() ?: ""
        // Command can be empty (uses default), but warn about suspicious patterns
        if (command.isNotEmpty() && (command.contains("&&") || command.contains("||") || command.contains(";"))) {
            commandErrorLabel?.text = "Warning: Command contains shell operators that may not work as expected"
            commandErrorLabel?.isVisible = true
            return true // Still valid, just a warning
        } else {
            commandErrorLabel?.isVisible = false
            return true
        }
    }
    
    override fun isModified(): Boolean {
        val currentState = settings.state
        
        return customCommandField?.text != currentState.customCommand ||
               uiModeComboBox?.selectedItem != currentState.uiMode ||
               (fontSizeSpinner?.value as? Int) != currentState.fontSize
    }
    
    override fun apply() {
        try {
            // Validate all fields before applying
            if (!validateFontSize()) {
                throw ConfigurationException("Font size must be between 8 and 72.")
            }
            
            if (!validateCommand()) {
                throw ConfigurationException("Invalid command configuration.")
            }
            
            val state = settings.state
            
            // Apply custom command
            customCommandField?.text?.let { command ->
                val oldCommand = state.customCommand
                val newCommand = command.trim()
                state.customCommand = newCommand
                logger.info("Applied custom command: '$newCommand'")
                
                // Synchronize session command with frontend if it changed
                if (newCommand != oldCommand) {
                    try {
                        paviko.rovobridge.ui.SessionCommandSynchronizer.updateFrontendSessionCommand(newCommand)
                    } catch (e: Exception) {
                        logger.warn("Failed to synchronize session command with frontend", e)
                        // Don't fail the entire apply operation for sync issues
                    }
                }
            }
            
            // Apply UI mode
            uiModeComboBox?.selectedItem?.let { mode ->
                val modeStr = mode as String
                if (modeStr == "Terminal" || modeStr == "Canvas") {
                    state.uiMode = modeStr
                    logger.info("Applied UI mode: $modeStr")
                } else {
                    throw ConfigurationException("Invalid UI mode. Must be 'Terminal' or 'Canvas'.")
                }
            }
            
            // Apply font size
            fontSizeSpinner?.value?.let { size ->
                val fontSize = size as Int
                if (fontSize in 8..72) {
                    val oldFontSize = state.fontSize
                    state.fontSize = fontSize
                    logger.info("Applied font size: $fontSize")
                    
                    // Synchronize font size with frontend if it changed
                    if (fontSize != oldFontSize) {
                        try {
                            paviko.rovobridge.ui.FontSizeSynchronizer.updateFrontendFontSize(fontSize)
                        } catch (e: Exception) {
                            logger.warn("Failed to synchronize font size with frontend", e)
                            // Don't fail the entire apply operation for sync issues
                        }
                    }
                } else {
                    throw ConfigurationException("Font size must be between 8 and 72.")
                }
            }
            
            logger.info("Settings applied successfully")
        } catch (e: ConfigurationException) {
            logger.error("Configuration validation failed", e)
            throw e
        } catch (e: Exception) {
            logger.error("Unexpected error applying settings", e)
            throw ConfigurationException("Failed to apply settings: ${e.message}")
        }
    }
    
    override fun reset() {
        try {
            val currentState = settings.state
            
            customCommandField?.text = currentState.customCommand
            uiModeComboBox?.selectedItem = currentState.uiMode
            fontSizeSpinner?.value = currentState.fontSize
            
            // Clear any error messages
            commandErrorLabel?.isVisible = false
            fontSizeErrorLabel?.isVisible = false
            
            logger.debug("Settings UI reset to current state")
        } catch (e: Exception) {
            logger.error("Failed to reset settings UI", e)
        }
    }
    
    override fun disposeUIResources() {
        try {
            mainPanel = null
            customCommandField = null
            uiModeComboBox = null
            fontSizeSpinner = null
            commandErrorLabel = null
            fontSizeErrorLabel = null
            logger.debug("Settings UI resources disposed")
        } catch (e: Exception) {
            logger.error("Error disposing settings UI resources", e)
        }
    }
}