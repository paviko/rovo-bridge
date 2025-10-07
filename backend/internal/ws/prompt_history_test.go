package ws

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/example/rovobridge/internal/history"
)

func TestPromptHistoryInSessionOpened(t *testing.T) {
	// Create a router with history manager
	router := NewRouter("")

	// Verify that the router has a history manager
	if router.historyManager == nil {
		t.Fatal("Router should have a history manager")
	}

	// Test that history manager can be used
	err := router.historyManager.SavePrompt(
		"test",
		"/test/project",
	)
	if err != nil {
		t.Fatalf("Failed to save test prompt: %v", err)
	}

	// Load history to verify it was saved
	entries, err := router.historyManager.LoadHistory()
	if err != nil {
		t.Fatalf("Failed to load history: %v", err)
	}

	if len(entries) == 0 {
		t.Fatal("Expected at least one history entry")
	}

	// Verify the entry structure matches what we expect to send in WebSocket messages
	entry := entries[len(entries)-1] // Get the last entry
	if entry.SerializedContent != "test" {
		t.Errorf("Expected serialized content 'test', got '%s'", entry.SerializedContent)
	}
	if entry.ProjectCwd != "/test/project" {
		t.Errorf("Expected project cwd '/test/project', got '%s'", entry.ProjectCwd)
	}
}

func TestPromptHistoryEntryJSONSerialization(t *testing.T) {
	// Test that PromptHistoryEntry can be properly serialized to JSON for WebSocket messages
	entry := history.PromptHistoryEntry{
		ID:                "test-id",
		Timestamp:         time.Now().UnixMilli(),
		SerializedContent: "<[#/test/file.js][file.js]> Fix the bug",
		ProjectCwd:        "/test/project",
	}

	// Serialize to JSON (as would happen in WebSocket message)
	jsonData, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("Failed to marshal history entry to JSON: %v", err)
	}

	// Deserialize back
	var decoded history.PromptHistoryEntry
	err = json.Unmarshal(jsonData, &decoded)
	if err != nil {
		t.Fatalf("Failed to unmarshal history entry from JSON: %v", err)
	}

	// Verify all fields are preserved
	if decoded.ID != entry.ID {
		t.Errorf("ID mismatch: expected %s, got %s", entry.ID, decoded.ID)
	}
	if decoded.SerializedContent != entry.SerializedContent {
		t.Errorf("SerializedContent mismatch: expected %s, got %s", entry.SerializedContent, decoded.SerializedContent)
	}
	if decoded.ProjectCwd != entry.ProjectCwd {
		t.Errorf("ProjectCwd mismatch: expected %s, got %s", entry.ProjectCwd, decoded.ProjectCwd)
	}
}
