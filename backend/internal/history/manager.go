package history

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
)

// PromptHistoryEntry represents a single prompt entry in the history
type PromptHistoryEntry struct {
	ID                string `json:"id"`
	Timestamp         int64  `json:"timestamp"`
	SerializedContent string `json:"serializedContent"`
	ProjectCwd        string `json:"projectCwd"`
}

// HistoryFile represents the structure of the history file
type HistoryFile struct {
	Version string               `json:"version"`
	Entries []PromptHistoryEntry `json:"entries"`
}

// HistoryManager manages the persistent storage of prompt history
type HistoryManager struct {
	filePath string
	mu       sync.RWMutex
}

// NewHistoryManager creates a new HistoryManager instance
func NewHistoryManager() *HistoryManager {
	return &HistoryManager{
		filePath: getHistoryFilePath(),
	}
}

// LoadHistory loads the existing prompt history from the file
func (h *HistoryManager) LoadHistory() ([]PromptHistoryEntry, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	// Check if file exists
	if _, err := os.Stat(h.filePath); os.IsNotExist(err) {
		// File doesn't exist, return empty history
		log.Printf("History file does not exist at %s, starting with empty history", h.filePath)
		return []PromptHistoryEntry{}, nil
	}

	data, err := os.ReadFile(h.filePath)
	if err != nil {
		// Enhanced error logging with specific error types
		if os.IsPermission(err) {
			log.Printf("Permission denied reading history file %s: %v", h.filePath, err)
		} else {
			log.Printf("Failed to read history file %s: %v", h.filePath, err)
		}
		return []PromptHistoryEntry{}, nil // Return empty, don't fail
	}

	// Handle empty file gracefully
	if len(data) == 0 {
		log.Printf("History file %s is empty, starting with empty history", h.filePath)
		return []PromptHistoryEntry{}, nil
	}

	var historyFile HistoryFile
	if err := json.Unmarshal(data, &historyFile); err != nil {
		log.Printf("Failed to parse history file %s (corrupted JSON): %v", h.filePath, err)
		// Backup corrupted file and start fresh
		if backupErr := h.backupCorruptedFile(); backupErr != nil {
			log.Printf("Failed to backup corrupted file: %v", backupErr)
		} else {
			log.Printf("Corrupted history file backed up, starting with empty history")
		}
		return []PromptHistoryEntry{}, nil
	}

	// Validate file structure
	if historyFile.Version == "" {
		log.Printf("History file %s missing version, treating as legacy format", h.filePath)
		// Try to recover by setting default version
		historyFile.Version = "1.0"
	}

	// Validate entries and filter out invalid ones
	validEntries := make([]PromptHistoryEntry, 0, len(historyFile.Entries))
	invalidCount := 0

	for i, entry := range historyFile.Entries {
		if entry.ID == "" || entry.Timestamp <= 0 {
			log.Printf("Skipping invalid history entry at index %d: missing ID or invalid timestamp", i)
			invalidCount++
			continue
		}
		validEntries = append(validEntries, entry)
	}

	if invalidCount > 0 {
		log.Printf("Filtered out %d invalid entries from history file", invalidCount)
	}

	log.Printf("Successfully loaded %d prompt history entries from %s", len(validEntries), h.filePath)
	return validEntries, nil
}

// SavePrompt adds a new prompt entry to the history file
func (h *HistoryManager) SavePrompt(serializedContent string, projectCwd string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Validate input parameters
	if serializedContent == "" {
		log.Printf("Skipping save of empty prompt to history")
		return nil // Don't save empty prompts
	}

	// Create new entry with validation
	entry := PromptHistoryEntry{
		ID:                uuid.New().String(),
		Timestamp:         time.Now().UnixMilli(),
		SerializedContent: serializedContent,
		ProjectCwd:        projectCwd,
	}

	return h.savePromptEntry(entry)
}

// SavePromptWithID adds a new prompt entry to the history file with a specific ID
func (h *HistoryManager) SavePromptWithID(id, serializedContent string, projectCwd string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Validate input parameters
	if serializedContent == "" {
		log.Printf("Skipping save of empty prompt to history")
		return nil // Don't save empty prompts
	}

	if id == "" {
		log.Printf("Empty ID provided, generating new UUID")
		id = uuid.New().String()
	}

	// Create new entry with provided ID
	entry := PromptHistoryEntry{
		ID:                id,
		Timestamp:         time.Now().UnixMilli(),
		SerializedContent: serializedContent,
		ProjectCwd:        projectCwd,
	}

	return h.savePromptEntry(entry)
}

// savePromptEntry is the common implementation for saving prompt entries
func (h *HistoryManager) savePromptEntry(entry PromptHistoryEntry) error {

	// Load existing history with error recovery
	existingEntries, err := h.loadHistoryUnsafe()
	if err != nil {
		log.Printf("Failed to load existing history for save, attempting recovery: %v", err)

		// Try to recover from corruption
		if recoverErr := h.recoverFromCorruptionUnsafe(); recoverErr != nil {
			log.Printf("Failed to recover from corruption: %v", recoverErr)
			// Continue with empty history as last resort
			existingEntries = []PromptHistoryEntry{}
		} else {
			// Retry loading after recovery
			existingEntries, err = h.loadHistoryUnsafe()
			if err != nil {
				log.Printf("Still failed to load after recovery, using empty history: %v", err)
				existingEntries = []PromptHistoryEntry{}
			}
		}
	}

	// Append new entry
	existingEntries = append(existingEntries, entry)

	// Implement history size limit to prevent unbounded growth
	const maxHistoryEntries = 10000
	if len(existingEntries) > maxHistoryEntries {
		// Keep most recent entries
		startIndex := len(existingEntries) - maxHistoryEntries
		existingEntries = existingEntries[startIndex:]
		log.Printf("Trimmed history to %d entries (removed %d oldest entries)", maxHistoryEntries, startIndex)
	}

	// Save updated history with enhanced error handling
	historyFile := HistoryFile{
		Version: "1.0",
		Entries: existingEntries,
	}

	if err := h.writeHistoryFile(historyFile); err != nil {
		// Enhanced error reporting
		if os.IsPermission(err) {
			log.Printf("Permission denied saving prompt to history file %s: %v", h.filePath, err)
			return fmt.Errorf("permission denied writing to history file: %w", err)
		} else if pathErr, ok := err.(*os.PathError); ok {
			log.Printf("Path error saving prompt to history: %v", pathErr)
			return fmt.Errorf("file system error saving to history: %w", err)
		} else {
			log.Printf("Unknown error saving prompt to history: %v", err)
			return fmt.Errorf("failed to save prompt to history: %w", err)
		}
	}

	log.Printf("Successfully saved prompt to history: %s (total entries: %d)", entry.ID, len(existingEntries))
	return nil
}

// CreatePromptEntry creates a new PromptHistoryEntry with generated ID and timestamp
func (h *HistoryManager) CreatePromptEntry(serializedContent string, projectCwd string) PromptHistoryEntry {
	return PromptHistoryEntry{
		ID:                uuid.New().String(),
		Timestamp:         time.Now().UnixMilli(),
		SerializedContent: serializedContent,
		ProjectCwd:        projectCwd,
	}
}

// RemovePrompt removes a prompt entry from the history file by ID
func (h *HistoryManager) RemovePrompt(id string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Validate input
	if id == "" {
		log.Printf("Cannot remove prompt: empty ID provided")
		return fmt.Errorf("empty prompt ID")
	}

	// Load existing history with error recovery
	existingEntries, err := h.loadHistoryUnsafe()
	if err != nil {
		log.Printf("Failed to load existing history for removal: %v", err)
		return fmt.Errorf("failed to load history for removal: %w", err)
	}

	// Find and remove the entry with the specified ID
	var updatedEntries []PromptHistoryEntry
	found := false

	for _, entry := range existingEntries {
		if entry.ID == id {
			found = true
			log.Printf("Found prompt to remove: %s", id)
		} else {
			updatedEntries = append(updatedEntries, entry)
		}
	}

	if !found {
		log.Printf("Prompt ID not found for removal: %s", id)
		return fmt.Errorf("prompt ID not found: %s", id)
	}

	// Save updated history
	historyFile := HistoryFile{
		Version: "1.0",
		Entries: updatedEntries,
	}

	if err := h.writeHistoryFile(historyFile); err != nil {
		log.Printf("Failed to save history after removal: %v", err)
		return fmt.Errorf("failed to save history after removal: %w", err)
	}

	log.Printf("Successfully removed prompt %s from history (remaining entries: %d)", id, len(updatedEntries))
	return nil
}

// GetHistoryFilePath returns the path to the history file (for testing/debugging)
func (h *HistoryManager) GetHistoryFilePath() string {
	return h.filePath
}

// loadHistoryUnsafe loads history without acquiring the mutex (internal use)
func (h *HistoryManager) loadHistoryUnsafe() ([]PromptHistoryEntry, error) {
	// Check if file exists
	if _, err := os.Stat(h.filePath); os.IsNotExist(err) {
		return []PromptHistoryEntry{}, nil
	}

	data, err := os.ReadFile(h.filePath)
	if err != nil {
		return nil, err
	}

	var historyFile HistoryFile
	if err := json.Unmarshal(data, &historyFile); err != nil {
		return nil, err
	}

	return historyFile.Entries, nil
}

// writeHistoryFile writes the history file to disk with proper error handling
func (h *HistoryManager) writeHistoryFile(historyFile HistoryFile) error {
	// Ensure directory exists with enhanced error handling
	dir := filepath.Dir(h.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied creating history directory %s: %w", dir, err)
		}
		return fmt.Errorf("failed to create history directory %s: %w", dir, err)
	}

	// Validate history file structure before marshaling
	if historyFile.Version == "" {
		historyFile.Version = "1.0"
	}

	// Marshal to JSON with indentation for readability
	data, err := json.MarshalIndent(historyFile, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal history data: %w", err)
	}

	// Check available disk space (basic check)
	if len(data) > 100*1024*1024 { // 100MB limit
		return fmt.Errorf("history file too large (%d bytes), refusing to write", len(data))
	}

	// Write to temporary file first for atomic operation
	tempFile := h.filePath + ".tmp"

	// Clean up any existing temp file first
	if _, err := os.Stat(tempFile); err == nil {
		if removeErr := os.Remove(tempFile); removeErr != nil {
			log.Printf("Warning: failed to remove existing temp file %s: %v", tempFile, removeErr)
		}
	}

	if err := os.WriteFile(tempFile, data, 0644); err != nil {
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied writing temporary history file %s: %w", tempFile, err)
		}
		if pathErr, ok := err.(*os.PathError); ok && pathErr.Err == syscall.ENOSPC {
			return fmt.Errorf("no space left on device writing history file: %w", err)
		}
		return fmt.Errorf("failed to write temporary history file %s: %w", tempFile, err)
	}

	// Verify temp file was written correctly
	if stat, err := os.Stat(tempFile); err != nil {
		os.Remove(tempFile) // Clean up
		return fmt.Errorf("failed to verify temporary history file: %w", err)
	} else if stat.Size() != int64(len(data)) {
		os.Remove(tempFile) // Clean up
		return fmt.Errorf("temporary history file size mismatch: expected %d, got %d", len(data), stat.Size())
	}

	// Atomic rename with enhanced error handling
	if err := os.Rename(tempFile, h.filePath); err != nil {
		// Clean up temp file on failure
		if removeErr := os.Remove(tempFile); removeErr != nil {
			log.Printf("Warning: failed to clean up temp file after rename failure: %v", removeErr)
		}

		if os.IsPermission(err) {
			return fmt.Errorf("permission denied renaming history file from %s to %s: %w", tempFile, h.filePath, err)
		}
		return fmt.Errorf("failed to rename temporary history file from %s to %s: %w", tempFile, h.filePath, err)
	}

	// Verify final file
	if stat, err := os.Stat(h.filePath); err != nil {
		log.Printf("Warning: failed to verify final history file after write: %v", err)
	} else {
		log.Printf("History file successfully written: %s (%d bytes)", h.filePath, stat.Size())
	}

	return nil
}

// backupCorruptedFile creates a backup of a corrupted history file
func (h *HistoryManager) backupCorruptedFile() error {
	// Check if source file exists
	if _, err := os.Stat(h.filePath); os.IsNotExist(err) {
		log.Printf("No corrupted file to backup at %s", h.filePath)
		return nil
	}

	backupPath := h.filePath + ".corrupted." + fmt.Sprintf("%d", time.Now().Unix())

	// Ensure backup doesn't overwrite existing backup
	counter := 1
	originalBackupPath := backupPath
	for {
		if _, err := os.Stat(backupPath); os.IsNotExist(err) {
			break // Path is available
		}
		counter++
		backupPath = fmt.Sprintf("%s.%d", originalBackupPath, counter)
		if counter > 100 { // Prevent infinite loop
			return fmt.Errorf("too many backup files exist, cannot create backup")
		}
	}

	if err := os.Rename(h.filePath, backupPath); err != nil {
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied backing up corrupted file from %s to %s: %w", h.filePath, backupPath, err)
		}
		return fmt.Errorf("failed to backup corrupted file from %s to %s: %w", h.filePath, backupPath, err)
	}

	log.Printf("Successfully backed up corrupted history file from %s to %s", h.filePath, backupPath)
	return nil
}

// ValidateHistoryFile checks if the history file is valid and can be parsed
func (h *HistoryManager) ValidateHistoryFile() error {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if _, err := os.Stat(h.filePath); os.IsNotExist(err) {
		return nil // File doesn't exist, which is valid
	}

	data, err := os.ReadFile(h.filePath)
	if err != nil {
		return fmt.Errorf("cannot read history file: %w", err)
	}

	var historyFile HistoryFile
	if err := json.Unmarshal(data, &historyFile); err != nil {
		return fmt.Errorf("history file is corrupted: %w", err)
	}

	// Validate version
	if historyFile.Version != "1.0" {
		return fmt.Errorf("unsupported history file version: %s", historyFile.Version)
	}

	// Validate entries
	for i, entry := range historyFile.Entries {
		if entry.ID == "" {
			return fmt.Errorf("entry %d has empty ID", i)
		}
		if entry.Timestamp <= 0 {
			return fmt.Errorf("entry %d has invalid timestamp", i)
		}
	}

	return nil
}

// RecoverFromCorruption attempts to recover from a corrupted history file
func (h *HistoryManager) RecoverFromCorruption() error {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.recoverFromCorruptionUnsafe()
}

// recoverFromCorruptionUnsafe performs corruption recovery without acquiring mutex
func (h *HistoryManager) recoverFromCorruptionUnsafe() error {
	log.Printf("Attempting to recover from history file corruption at %s", h.filePath)

	// First, try to backup the corrupted file
	if err := h.backupCorruptedFile(); err != nil {
		log.Printf("Failed to backup corrupted file: %v", err)
		// Continue with recovery attempt even if backup fails
	}

	// Try to salvage any readable entries from corrupted file
	salvageCount := 0
	var salvageEntries []PromptHistoryEntry

	if data, err := os.ReadFile(h.filePath + ".corrupted." + fmt.Sprintf("%d", time.Now().Unix())); err == nil {
		// Try to extract individual entries even if overall JSON is corrupted
		if entries := h.attemptEntrySalvage(data); len(entries) > 0 {
			salvageEntries = entries
			salvageCount = len(entries)
			log.Printf("Salvaged %d entries from corrupted file", salvageCount)
		}
	}

	// Create a new history file with salvaged entries
	recoveredHistory := HistoryFile{
		Version: "1.0",
		Entries: salvageEntries,
	}

	if err := h.writeHistoryFile(recoveredHistory); err != nil {
		return fmt.Errorf("failed to create recovered history file: %w", err)
	}

	if salvageCount > 0 {
		log.Printf("Successfully recovered from corruption with %d salvaged entries", salvageCount)
	} else {
		log.Printf("Successfully recovered from corruption with empty history file")
	}
	return nil
}

// attemptEntrySalvage tries to extract valid entries from corrupted JSON data
func (h *HistoryManager) attemptEntrySalvage(data []byte) []PromptHistoryEntry {
	var entries []PromptHistoryEntry

	// Try parsing as complete file first
	var historyFile HistoryFile
	if err := json.Unmarshal(data, &historyFile); err == nil {
		// File is actually valid, return all entries
		return historyFile.Entries
	}

	// If that fails, try to find individual entry objects in the data
	// This is a best-effort attempt to recover partial data

	// Look for entry-like patterns (this is heuristic and may not catch everything)
	// In a production system, you might want more sophisticated recovery
	log.Printf("Attempting heuristic entry salvage from %d bytes of corrupted data", len(data))

	// For now, return empty slice - sophisticated JSON recovery would be complex
	// and might not be worth the effort for this feature
	return entries
}

// getHistoryFilePath returns the path to the history file
func getHistoryFilePath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Printf("Failed to get user home directory, using current directory: %v", err)
		// Fallback to current directory
		return ".rovobridge"
	}
	return filepath.Join(homeDir, ".rovobridge")
}
