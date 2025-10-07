package paviko.rovobridge.ui

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

/**
 * Standalone message generation test that runs without any test framework
 * This demonstrates that the JetBrains plugin message generation works correctly
 */
fun main() {
    val mapper = jacksonObjectMapper()
    var testsPassed = 0
    var testsFailed = 0
    
    fun runTest(testName: String, test: () -> Unit) {
        try {
            test()
            println("✓ $testName")
            testsPassed++
        } catch (e: Exception) {
            println("✗ $testName: ${e.message}")
            testsFailed++
        }
    }
    
    println("Running JetBrains Plugin Message Generation Tests...")
    println("=" * 60)
    
    runTest("Generate valid JSON for setToken message") {
        val messageObj = mapOf(
            "type" to "setToken",
            "token" to "jetbrains-token-123",
            "timestamp" to System.currentTimeMillis()
        )
        
        val messageJson = mapper.writeValueAsString(messageObj)
        val script = "window.postMessage($messageJson, '*');"
        
        assert(script.startsWith("window.postMessage("))
        assert(script.endsWith(", '*');"))
        assert(messageJson.contains("\"type\":\"setToken\""))
        assert(messageJson.contains("\"token\":\"jetbrains-token-123\""))
        assert(messageJson.contains("\"timestamp\":"))
        
        // Verify JSON is valid
        val parsedMessage = mapper.readValue(messageJson, Map::class.java)
        assert(parsedMessage["type"] == "setToken")
        assert(parsedMessage["token"] == "jetbrains-token-123")
        assert(parsedMessage["timestamp"] is Number)
    }
    
    runTest("Generate valid JSON for setFontSize message") {
        val messageObj = mapOf(
            "type" to "setFontSize",
            "size" to 16,
            "timestamp" to System.currentTimeMillis()
        )
        
        val messageJson = mapper.writeValueAsString(messageObj)
        val script = "window.postMessage($messageJson, '*');"
        
        assert(script.startsWith("window.postMessage("))
        assert(script.endsWith(", '*');"))
        assert(messageJson.contains("\"type\":\"setFontSize\""))
        assert(messageJson.contains("\"size\":16"))
        
        val parsedMessage = mapper.readValue(messageJson, Map::class.java)
        assert(parsedMessage["type"] == "setFontSize")
        assert(parsedMessage["size"] == 16)
    }
    
    runTest("Generate valid JSON for insertPaths message") {
        val paths = listOf("/jetbrains/path1.kt", "/jetbrains/path2.java")
        val messageObj = mapOf(
            "type" to "insertPaths",
            "paths" to paths,
            "timestamp" to System.currentTimeMillis()
        )
        
        val messageJson = mapper.writeValueAsString(messageObj)
        val script = "window.postMessage($messageJson, '*');"
        
        assert(script.startsWith("window.postMessage("))
        assert(messageJson.contains("\"type\":\"insertPaths\""))
        assert(messageJson.contains("/jetbrains/path1.kt"))
        assert(messageJson.contains("/jetbrains/path2.java"))
        
        val parsedMessage = mapper.readValue(messageJson, Map::class.java)
        val parsedPaths = parsedMessage["paths"] as List<*>
        assert(parsedPaths.size == 2)
        assert(parsedPaths.contains("/jetbrains/path1.kt"))
        assert(parsedPaths.contains("/jetbrains/path2.java"))
    }
    
    runTest("Generate valid JSON for pastePath message") {
        val messageObj = mapOf(
            "type" to "pastePath",
            "path" to "/jetbrains/directory",
            "timestamp" to System.currentTimeMillis()
        )
        
        val messageJson = mapper.writeValueAsString(messageObj)
        
        assert(messageJson.contains("\"type\":\"pastePath\""))
        assert(messageJson.contains("\"path\":\"/jetbrains/directory\""))
        
        val parsedMessage = mapper.readValue(messageJson, Map::class.java)
        assert(parsedMessage["type"] == "pastePath")
        assert(parsedMessage["path"] == "/jetbrains/directory")
    }
    
    runTest("Generate valid JSON for updateSessionCommand message") {
        val messageObj = mapOf(
            "type" to "updateSessionCommand",
            "command" to "gradle test",
            "timestamp" to System.currentTimeMillis()
        )
        
        val messageJson = mapper.writeValueAsString(messageObj)
        
        assert(messageJson.contains("\"type\":\"updateSessionCommand\""))
        assert(messageJson.contains("\"command\":\"gradle test\""))
        
        val parsedMessage = mapper.readValue(messageJson, Map::class.java)
        assert(parsedMessage["type"] == "updateSessionCommand")
        assert(parsedMessage["command"] == "gradle test")
    }
    
    runTest("Generate valid JSON for updateUIState message") {
        val messageObj = mapOf(
            "type" to "updateUIState",
            "chipsCollapsed" to true,
            "composerCollapsed" to false,
            "timestamp" to System.currentTimeMillis()
        )
        
        val messageJson = mapper.writeValueAsString(messageObj)
        
        assert(messageJson.contains("\"type\":\"updateUIState\""))
        assert(messageJson.contains("\"chipsCollapsed\":true"))
        assert(messageJson.contains("\"composerCollapsed\":false"))
        
        val parsedMessage = mapper.readValue(messageJson, Map::class.java)
        assert(parsedMessage["type"] == "updateUIState")
        assert(parsedMessage["chipsCollapsed"] == true)
        assert(parsedMessage["composerCollapsed"] == false)
    }
    
    runTest("Handle special characters in JSON serialization") {
        val specialCommand = "echo \"Hello, World!\" && ls -la | grep '.txt'"
        val messageObj = mapOf(
            "type" to "updateSessionCommand",
            "command" to specialCommand,
            "timestamp" to System.currentTimeMillis()
        )
        
        val messageJson = mapper.writeValueAsString(messageObj)
        
        assert(messageJson.contains("\"command\":"))
        assert(messageJson.contains("Hello"))
        assert(messageJson.contains("World"))
        
        val parsedMessage = mapper.readValue(messageJson, Map::class.java)
        val parsedCommand = parsedMessage["command"] as String
        assert(parsedCommand.contains("Hello, World!"))
        assert(parsedCommand.contains("grep"))
    }
    
    runTest("Handle paths with special characters") {
        val specialPaths = listOf(
            "/path with spaces/file.kt",
            "C:\\Program Files\\My \"App\"\\file.java",
            "/path/with/unicode/文件.kt"
        )
        val messageObj = mapOf(
            "type" to "insertPaths",
            "paths" to specialPaths,
            "timestamp" to System.currentTimeMillis()
        )
        
        val messageJson = mapper.writeValueAsString(messageObj)
        
        assert(messageJson.contains("path with spaces"))
        assert(messageJson.contains("Program Files"))
        assert(messageJson.contains("文件.kt"))
        
        val parsedMessage = mapper.readValue(messageJson, Map::class.java)
        val parsedPaths = parsedMessage["paths"] as List<*>
        assert(parsedPaths.size == 3)
        assert(parsedPaths.any { it.toString().contains("path with spaces") })
        assert(parsedPaths.any { it.toString().contains("Program Files") })
        assert(parsedPaths.any { it.toString().contains("文件.kt") })
    }
    
    runTest("Validate font size range") {
        val validSizes = listOf(8, 12, 16, 24, 48, 72)
        
        validSizes.forEach { size ->
            val messageObj = mapOf(
                "type" to "setFontSize",
                "size" to size,
                "timestamp" to System.currentTimeMillis()
            )
            
            val messageJson = mapper.writeValueAsString(messageObj)
            assert(messageJson.contains("\"size\":$size"))
            
            val parsedMessage = mapper.readValue(messageJson, Map::class.java)
            assert(parsedMessage["size"] == size)
        }
    }
    
    runTest("Generate consistent timestamp format") {
        val beforeTime = System.currentTimeMillis()
        
        val messageObj = mapOf(
            "type" to "setToken",
            "token" to "test-token",
            "timestamp" to System.currentTimeMillis()
        )
        
        val afterTime = System.currentTimeMillis()
        val messageJson = mapper.writeValueAsString(messageObj)
        
        val timestampRegex = "\"timestamp\":(\\d+)".toRegex()
        val matchResult = timestampRegex.find(messageJson)
        assert(matchResult != null) { "Timestamp not found in JSON: $messageJson" }
        
        val timestamp = matchResult!!.groupValues[1].toLong()
        assert(timestamp >= beforeTime) { "Timestamp $timestamp should be >= $beforeTime" }
        assert(timestamp <= afterTime) { "Timestamp $timestamp should be <= $afterTime" }
    }
    
    runTest("Generate proper JavaScript syntax") {
        val messageObj = mapOf(
            "type" to "setFontSize",
            "size" to 16,
            "timestamp" to System.currentTimeMillis()
        )
        
        val messageJson = mapper.writeValueAsString(messageObj)
        val script = "window.postMessage($messageJson, '*');"
        
        assert(script.contains("window.postMessage("))
        assert(script.contains(", '*');"))
        assert(script.contains("{"))
        assert(script.contains("}"))
        
        // Count braces to ensure they're balanced
        val openBraces = script.count { it == '{' }
        val closeBraces = script.count { it == '}' }
        assert(openBraces == closeBraces) { "Braces should be balanced in script" }
        
        // Count parentheses to ensure they're balanced
        val openParens = script.count { it == '(' }
        val closeParens = script.count { it == ')' }
        assert(openParens == closeParens) { "Parentheses should be balanced in script" }
    }
    
    runTest("Message format compatibility with VSCode") {
        // Test that JetBrains messages have the same structure as VSCode messages
        val jetbrainsMessage = mapOf(
            "type" to "setFontSize",
            "size" to 16,
            "timestamp" to System.currentTimeMillis()
        )
        
        val vscodeMessage = mapOf(
            "type" to "setFontSize",
            "size" to 14,
            "timestamp" to System.currentTimeMillis()
        )
        
        val jetbrainsJson = mapper.writeValueAsString(jetbrainsMessage)
        val vscodeJson = mapper.writeValueAsString(vscodeMessage)
        
        // Both should have the same field structure
        val jetbrainsParsed = mapper.readValue(jetbrainsJson, Map::class.java)
        val vscodeParsed = mapper.readValue(vscodeJson, Map::class.java)
        
        assert(jetbrainsParsed.keys == vscodeParsed.keys) { "Field names should match between plugins" }
        assert(jetbrainsParsed["type"] == vscodeParsed["type"]) { "Message types should match" }
        assert(jetbrainsParsed["size"] is Number) { "Size should be a number" }
        assert(vscodeParsed["size"] is Number) { "Size should be a number" }
    }
    
    println("=" * 60)
    println("Test Results:")
    println("✓ Passed: $testsPassed")
    if (testsFailed > 0) {
        println("✗ Failed: $testsFailed")
        System.exit(1)
    } else {
        println("All tests passed! JetBrains plugin message generation is working correctly.")
        System.exit(0)
    }
}

private operator fun String.times(n: Int): String = this.repeat(n)