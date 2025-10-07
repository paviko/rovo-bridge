package paviko.rovobridge.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.diagnostic.Logger

/**
 * Persistent settings component for RovoBridge plugin configuration.
 * Manages user preferences for custom command, UI mode, and font size.
 */
@State(
    name = "RovoBridgeSettings",
    storages = [Storage("rovobridge.xml")]
)
@Service
class RovoBridgeSettings : PersistentStateComponent<RovoBridgeSettings.State> {
    
    /**
     * Data class representing the persistent state of RovoBridge settings.
     */
    data class State(
        /**
         * Custom command to override the default "acli rovodev run".
         * Empty string means use the default command.
         */
        var customCommand: String = "",
        
        /**
         * UI mode selection: "Terminal" or "Canvas".
         * Default is "Terminal" mode.
         */
        var uiMode: String = "Terminal",
        
        /**
         * Font size for the plugin UI.
         * Valid range is 8-72, default is 12.
         */
        var fontSize: Int = 12,

        /**
         * Whether the chip bar ("chips") section is collapsed.
         * Default false => visible/expanded.
         */
        var chipsCollapsed: Boolean = false,

        /**
         * Whether the composer (editor) section is collapsed.
         * Default false => visible/expanded.
         */
        var composerCollapsed: Boolean = false
    )
    
    private var state = State()
    private val logger = Logger.getInstance(RovoBridgeSettings::class.java)
    
    override fun getState(): State {
        try {
            return state
        } catch (e: Exception) {
            logger.error("Failed to get settings state, returning default", e)
            return State() // Return default state on error
        }
    }
    
    override fun loadState(state: State) {
        try {
            // Validate loaded state and apply defaults for invalid values
            val validatedState = State(
                customCommand = state.customCommand,
                uiMode = if (state.uiMode == "Terminal" || state.uiMode == "Canvas") state.uiMode else "Terminal",
                fontSize = if (state.fontSize in 8..72) state.fontSize else 12,
                chipsCollapsed = state.chipsCollapsed,
                composerCollapsed = state.composerCollapsed
            )
            
            this.state = validatedState
            logger.info("Settings loaded successfully: customCommand='${validatedState.customCommand}', uiMode='${validatedState.uiMode}', fontSize=${validatedState.fontSize}, chipsCollapsed=${validatedState.chipsCollapsed}, composerCollapsed=${validatedState.composerCollapsed}")
        } catch (e: Exception) {
            logger.error("Failed to load settings state, using defaults", e)
            this.state = State() // Use default state on error
        }
    }
    
    companion object {
        /**
         * Gets the application-level instance of RovoBridgeSettings.
         */
        fun getInstance(): RovoBridgeSettings {
            return try {
                ApplicationManager.getApplication().getService(RovoBridgeSettings::class.java)
            } catch (e: Exception) {
                Logger.getInstance(RovoBridgeSettings::class.java).error("Failed to get settings service instance", e)
                throw e
            }
        }
    }
}