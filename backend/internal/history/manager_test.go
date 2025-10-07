package history

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNewHistoryManager(t *testing.T) {
	manager := NewHistoryManager()
	if manager == nil {
		t.Fatal("NewHistoryManager returned nil")
	}
	if manager.filePath == "" {
		t.Fatal("HistoryManager filePath is empty")
	}
}

func TestLoadHistory_EmptyFile(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Load history when file doesn't exist
	entries, err := manager.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory failed: %v", err)
	}

	if len(entries) != 0 {
		t.Fatalf("Expected empty history, got %d entries", len(entries))
	}
}

func TestSavePrompt(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Save a prompt
	serializedContent := "<[#/path/test.js][test.js]> Fix this bug"
	projectCwd := "/home/user/project"

	err := manager.SavePrompt(serializedContent, projectCwd)
	if err != nil {
		t.Fatalf("SavePrompt failed: %v", err)
	}

	// Verify file was created
	if _, err := os.Stat(manager.filePath); os.IsNotExist(err) {
		t.Fatal("History file was not created")
	}

	// Load and verify the saved prompt
	entries, err := manager.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory failed: %v", err)
	}

	if len(entries) != 1 {
		t.Fatalf("Expected 1 entry, got %d", len(entries))
	}

	entry := entries[0]
	if entry.SerializedContent != serializedContent {
		t.Errorf("Expected SerializedContent %q, got %q", serializedContent, entry.SerializedContent)
	}
	if entry.ProjectCwd != projectCwd {
		t.Errorf("Expected ProjectCwd %q, got %q", projectCwd, entry.ProjectCwd)
	}
	if entry.ID == "" {
		t.Error("Entry ID should not be empty")
	}
	if entry.Timestamp == 0 {
		t.Error("Entry Timestamp should not be zero")
	}
}

func TestSaveMultiplePrompts(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Save multiple prompts
	prompts := []struct {
		serialized string
		cwd        string
	}{
		{"First prompt", "/project1"},
		{"Second prompt", "/project2"},
		{"Third prompt", "/project1"},
	}
	_ = prompts // avoid unused field warnings in older compilers

	for _, prompt := range prompts {
		err := manager.SavePrompt(prompt.serialized, prompt.cwd)
		if err != nil {
			t.Fatalf("SavePrompt failed: %v", err)
		}
		// Small delay to ensure different timestamps
		time.Sleep(1 * time.Millisecond)
	}

	// Load and verify all prompts
	entries, err := manager.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory failed: %v", err)
	}

	if len(entries) != len(prompts) {
		t.Fatalf("Expected %d entries, got %d", len(prompts), len(entries))
	}

	// Verify entries are in chronological order (oldest first in file)
	for i, entry := range entries {
		expected := prompts[i]
		if entry.SerializedContent != expected.serialized {
			t.Errorf("Entry %d: Expected SerializedContent %q, got %q", i, expected.serialized, entry.SerializedContent)
		}
		if entry.ProjectCwd != expected.cwd {
			t.Errorf("Entry %d: Expected ProjectCwd %q, got %q", i, expected.cwd, entry.ProjectCwd)
		}
	}
}

func TestLoadHistory_CorruptedFile(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Write corrupted JSON to file
	corruptedData := `{"version": "1.0", "entries": [invalid json`
	err := os.WriteFile(manager.filePath, []byte(corruptedData), 0644)
	if err != nil {
		t.Fatalf("Failed to write corrupted file: %v", err)
	}

	// Load history should handle corruption gracefully
	entries, err := manager.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory should not fail on corrupted file: %v", err)
	}

	if len(entries) != 0 {
		t.Fatalf("Expected empty history after corruption, got %d entries", len(entries))
	}

	// Verify backup file was created
	backupFiles, err := filepath.Glob(manager.filePath + ".corrupted.*")
	if err != nil {
		t.Fatalf("Failed to check for backup files: %v", err)
	}
	if len(backupFiles) != 1 {
		t.Fatalf("Expected 1 backup file, found %d", len(backupFiles))
	}
}

func TestWriteHistoryFile_AtomicOperation(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Create test history file
historyFile := HistoryFile{
Version: "1.0",
Entries: []PromptHistoryEntry{
{
ID:                "test-id",
Timestamp:         time.Now().UnixMilli(),
SerializedContent: "Test content",
ProjectCwd:        "/test/project",
},
},
}

	// Write the file
	err := manager.writeHistoryFile(historyFile)
	if err != nil {
		t.Fatalf("writeHistoryFile failed: %v", err)
	}

	// Verify file exists and contains correct data
	data, err := os.ReadFile(manager.filePath)
	if err != nil {
		t.Fatalf("Failed to read written file: %v", err)
	}

	var readHistoryFile HistoryFile
	err = json.Unmarshal(data, &readHistoryFile)
	if err != nil {
		t.Fatalf("Failed to parse written file: %v", err)
	}

	if readHistoryFile.Version != historyFile.Version {
		t.Errorf("Expected version %q, got %q", historyFile.Version, readHistoryFile.Version)
	}

	if len(readHistoryFile.Entries) != 1 {
		t.Fatalf("Expected 1 entry, got %d", len(readHistoryFile.Entries))
	}

	entry := readHistoryFile.Entries[0]
	if entry.ID != "test-id" {
		t.Errorf("Expected ID %q, got %q", "test-id", entry.ID)
	}
	if entry.SerializedContent != "Test content" {
		t.Errorf("Expected SerializedContent %q, got %q", "Test content", entry.SerializedContent)
	}
	if entry.ProjectCwd != "/test/project" {
		t.Errorf("Expected ProjectCwd %q, got %q", "/test/project", entry.ProjectCwd)
	}
}

func TestGetHistoryFilePath(t *testing.T) {
	path := getHistoryFilePath()
	if path == "" {
		t.Fatal("getHistoryFilePath returned empty string")
	}

	// Should either be in home directory or current directory as fallback
	if !filepath.IsAbs(path) && path != ".rovobridge" {
		t.Errorf("Expected absolute path or '.rovobridge', got %q", path)
	}
}

func TestConcurrentAccess(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Test concurrent saves
	done := make(chan bool, 10)

	for i := 0; i < 10; i++ {
		go func(id int) {
			defer func() { done <- true }()

			err := manager.SavePrompt(
				"Concurrent prompt",
				"/project",
			)
			if err != nil {
				t.Errorf("Concurrent SavePrompt failed: %v", err)
			}
		}(i)
	}

	// Wait for all goroutines to complete
	for i := 0; i < 10; i++ {
		<-done
	}

	// Verify all prompts were saved
	entries, err := manager.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory failed: %v", err)
	}

	if len(entries) != 10 {
		t.Fatalf("Expected 10 entries, got %d", len(entries))
	}
}

func TestCreatePromptEntry(t *testing.T) {
	manager := NewHistoryManager()

	serializedContent := "Test serialized content"
	projectCwd := "/test/project"

	entry := manager.CreatePromptEntry(serializedContent, projectCwd)

	if entry.ID == "" {
		t.Error("Entry ID should not be empty")
	}
	if entry.Timestamp == 0 {
		t.Error("Entry Timestamp should not be zero")
	}
	if entry.SerializedContent != serializedContent {
		t.Errorf("Expected SerializedContent %q, got %q", serializedContent, entry.SerializedContent)
	}
	if entry.ProjectCwd != projectCwd {
		t.Errorf("Expected ProjectCwd %q, got %q", projectCwd, entry.ProjectCwd)
	}
}

func TestManagerGetHistoryFilePath(t *testing.T) {
	manager := NewHistoryManager()
	path := manager.GetHistoryFilePath()

	if path == "" {
		t.Fatal("GetHistoryFilePath returned empty string")
	}
}

func TestValidateHistoryFile_ValidFile(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Create a valid history file
	validHistory := HistoryFile{
		Version: "1.0",
		Entries: []PromptHistoryEntry{
			{
				ID:                "test-id-1",
				Timestamp:         time.Now().UnixMilli(),
				SerializedContent: "Test content",
				ProjectCwd:        "/test/project",
			},
		},
	}

	err := manager.writeHistoryFile(validHistory)
	if err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	// Validate should pass
	err = manager.ValidateHistoryFile()
	if err != nil {
		t.Fatalf("ValidateHistoryFile failed on valid file: %v", err)
	}
}

func TestValidateHistoryFile_InvalidFile(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Write invalid JSON
	invalidData := `{"version": "1.0", "entries": [invalid json`
	err := os.WriteFile(manager.filePath, []byte(invalidData), 0644)
	if err != nil {
		t.Fatalf("Failed to write invalid file: %v", err)
	}

	// Validate should fail
	err = manager.ValidateHistoryFile()
	if err == nil {
		t.Fatal("ValidateHistoryFile should have failed on invalid file")
	}
}

func TestValidateHistoryFile_NonExistentFile(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path (file doesn't exist)
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "nonexistent_history"),
	}

	// Validate should pass for non-existent file
	err := manager.ValidateHistoryFile()
	if err != nil {
		t.Fatalf("ValidateHistoryFile should pass for non-existent file: %v", err)
	}
}

func TestRecoverFromCorruption(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Write corrupted data
	corruptedData := `{"version": "1.0", "entries": [invalid json`
	err := os.WriteFile(manager.filePath, []byte(corruptedData), 0644)
	if err != nil {
		t.Fatalf("Failed to write corrupted file: %v", err)
	}

	// Recover from corruption
	err = manager.RecoverFromCorruption()
	if err != nil {
		t.Fatalf("RecoverFromCorruption failed: %v", err)
	}

	// Verify file is now valid and empty
	entries, err := manager.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory failed after recovery: %v", err)
	}

	if len(entries) != 0 {
		t.Fatalf("Expected empty history after recovery, got %d entries", len(entries))
	}

	// Verify backup file was created
	backupFiles, err := filepath.Glob(manager.filePath + ".corrupted.*")
	if err != nil {
		t.Fatalf("Failed to check for backup files: %v", err)
	}
	if len(backupFiles) != 1 {
		t.Fatalf("Expected 1 backup file, found %d", len(backupFiles))
	}
}

func TestRemovePrompt(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Save multiple prompts
	err := manager.SavePrompt("First prompt", "/test/project")
	if err != nil {
		t.Fatalf("SavePrompt failed: %v", err)
	}

	err = manager.SavePrompt("Second prompt", "/test/project")
	if err != nil {
		t.Fatalf("SavePrompt failed: %v", err)
	}

	err = manager.SavePrompt("Third prompt", "/test/project")
	if err != nil {
		t.Fatalf("SavePrompt failed: %v", err)
	}

	// Load history to get IDs
	entries, err := manager.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory failed: %v", err)
	}

	if len(entries) != 3 {
		t.Fatalf("Expected 3 entries, got %d", len(entries))
	}

	// Remove the middle entry
	middleEntryId := entries[1].ID
	err = manager.RemovePrompt(middleEntryId)
	if err != nil {
		t.Fatalf("RemovePrompt failed: %v", err)
	}

	// Verify entry was removed
	updatedEntries, err := manager.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory failed after removal: %v", err)
	}

	if len(updatedEntries) != 2 {
		t.Fatalf("Expected 2 entries after removal, got %d", len(updatedEntries))
	}

	// Verify the correct entry was removed
	for _, entry := range updatedEntries {
		if entry.ID == middleEntryId {
			t.Fatalf("Removed entry still exists in history")
		}
	}

	// Verify remaining entries are correct
	foundFirst := false
	foundThird := false
	for _, entry := range updatedEntries {
		if entry.SerializedContent == "First prompt" {
			foundFirst = true
		}
		if entry.SerializedContent == "Third prompt" {
			foundThird = true
		}
	}

	if !foundFirst || !foundThird {
		t.Fatalf("Expected first and third entries to remain, foundFirst=%v, foundThird=%v", foundFirst, foundThird)
	}
}

func TestRemovePrompt_NonExistentId(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Save one prompt
	err := manager.SavePrompt("Test prompt", "/test/project")
	if err != nil {
		t.Fatalf("SavePrompt failed: %v", err)
	}

	// Try to remove non-existent ID
	err = manager.RemovePrompt("non-existent-id")
	if err == nil {
		t.Fatalf("RemovePrompt should have failed for non-existent ID")
	}

	// Verify original entry still exists
	entries, err := manager.LoadHistory()
	if err != nil {
		t.Fatalf("LoadHistory failed: %v", err)
	}

	if len(entries) != 1 {
		t.Fatalf("Expected 1 entry to remain, got %d", len(entries))
	}
}

func TestRemovePrompt_EmptyId(t *testing.T) {
	// Create temporary directory for test
	tempDir := t.TempDir()

	// Create manager with custom file path
	manager := &HistoryManager{
		filePath: filepath.Join(tempDir, "test_history"),
	}

	// Try to remove with empty ID
	err := manager.RemovePrompt("")
	if err == nil {
		t.Fatalf("RemovePrompt should have failed for empty ID")
	}
}
