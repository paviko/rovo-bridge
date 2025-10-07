package paviko.rovobridge.ui

import com.intellij.ui.jcef.JBCefJSQuery

object WebViewScripts {
    
    /**
     * Helper method to generate postMessage JavaScript with proper JSON escaping
     */
    private fun generatePostMessageScript(type: String, data: Map<String, Any>): String {
        val dataEntries = data.map { (key, value) ->
            val escapedValue = when (value) {
                is String -> "\"${escapeJsonString(value)}\""
                is Boolean -> value.toString()
                is Number -> value.toString()
                else -> "\"${escapeJsonString(value.toString())}\""
            }
            "\"$key\": $escapedValue"
        }.joinToString(", ")
        
        return """
            window.postMessage({
                type: '$type',
                $dataEntries,
                timestamp: ${System.currentTimeMillis()}
            }, '*');
        """.trimIndent()
    }
    
    /**
     * Helper method to escape strings for JSON
     */
    private fun escapeJsonString(str: String): String {
        return str.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
    }
    // Define notifier functions for collapsed state changes
    fun defineNotifyFunctionsScript(
        chipsCollapsedQuery: JBCefJSQuery?,
        composerCollapsedQuery: JBCefJSQuery?
    ): String {
        val chipsInvoke = try {
            chipsCollapsedQuery?.inject("String(s)") ?: "/*nochips*/"
        } catch (_: Throwable) {
            "/*nochips*/"
        }
        val composerInvoke = try {
            composerCollapsedQuery?.inject("String(s)") ?: "/*nocomposer*/"
        } catch (_: Throwable) {
            "/*nocomposer*/"
        }
        return (
            "(function(){" +
                "try {" +
                "  window.__notifyChipsCollapsed = function(v){ try { var s = (v===true||v==='true'||v===1||v==='1'); " + chipsInvoke + "; } catch(e){} };" +
                "  window.__notifyComposerCollapsed = function(v){ try { var s = (v===true||v==='true'||v===1||v==='1'); " + composerInvoke + "; } catch(e){} };" +
                "} catch(e){}" +
                "})();"
            )
    }

    // Define bridge for opening files in IDE from JS: window.__openInIDE(path)
    fun defineOpenFileBridgeScript(openFileQuery: JBCefJSQuery?): String {
        val openInvoke = try {
            openFileQuery?.inject("String(p)") ?: "/*noopen*/"
        } catch (_: Throwable) { "/*noopen*/" }
        return (
            "(function(){" +
                "try {" +
                "  window.__openInIDE = function(p){ try { " + openInvoke + "; } catch(e){} };" +
                "} catch(e){}" +
                "})();"
            )
    }

    // Define and attach observers (includes initial notify based on DOM state)
    fun defineObserversScript(): String {
        return (
            "(function(){" +
                "try {" +
                "  function observeCollapsed(id, notify){ try { var el = document.getElementById(id); if(!el) return; var last = el.classList.contains('collapsed'); try { notify(last) } catch(e){}; var mo = new MutationObserver(function(){ var cur = el.classList.contains('collapsed'); if (cur!==last) { last=cur; try { notify(cur) } catch(e){} } }); mo.observe(el, {attributes:true, attributeFilter:['class']}); } catch(e){} }" +
                "  try { observeCollapsed('chipbar', window.__notifyChipsCollapsed); } catch(e){}" +
                "  try { observeCollapsed('composer', window.__notifyComposerCollapsed); } catch(e){}" +
                "} catch(e){}" +
                "})();"
            )
    }

    // Apply initial collapsed state to DOM and button labels using postMessage
    fun applyInitialCollapsedStateScript(
        chipsCollapsed: Boolean,
        composerCollapsed: Boolean
    ): String {
        val postMessageScript = generatePostMessageScript("updateUIState", mapOf(
            "chipsCollapsed" to chipsCollapsed,
            "composerCollapsed" to composerCollapsed
        ))
        
        return "(function(){ try { $postMessageScript } catch(e){} })();"
    }
    
    /**
     * Generate postMessage script for updating UI state
     */
    fun generateUIStateUpdateScript(
        chipsCollapsed: Boolean? = null,
        composerCollapsed: Boolean? = null
    ): String {
        val data = mutableMapOf<String, Any>()
        chipsCollapsed?.let { data["chipsCollapsed"] = it }
        composerCollapsed?.let { data["composerCollapsed"] = it }
        
        val postMessageScript = generatePostMessageScript("updateUIState", data)
        return "(function(){ try { $postMessageScript } catch(e){} })();"
    }
}
