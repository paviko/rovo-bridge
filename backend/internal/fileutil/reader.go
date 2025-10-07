package fileutil

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// GetFileExtensionLanguage maps file extensions to language identifiers for syntax highlighting
func GetFileExtensionLanguage(filePath string) string {
	extMap := map[string]string{
		".py":         "python",
		".java":       "java",
		".js":         "javascript",
		".ts":         "typescript",
		".cpp":        "cpp",
		".c":          "c",
		".h":          "c",
		".hpp":        "cpp",
		".cs":         "csharp",
		".php":        "php",
		".rb":         "ruby",
		".go":         "go",
		".rs":         "rust",
		".swift":      "swift",
		".kt":         "kotlin",
		".scala":      "scala",
		".sh":         "bash",
		".bat":        "batch",
		".ps1":        "powershell",
		".html":       "html",
		".css":        "css",
		".scss":       "scss",
		".sass":       "sass",
		".xml":        "xml",
		".json":       "json",
		".yaml":       "yaml",
		".yml":        "yaml",
		".toml":       "toml",
		".ini":        "ini",
		".cfg":        "ini",
		".conf":       "ini",
		".md":         "markdown",
		".txt":        "text",
		".sql":        "sql",
		".r":          "r",
		".m":          "matlab",
		".pl":         "perl",
		".lua":        "lua",
		".vim":        "vim",
		".dockerfile": "dockerfile",
		".makefile":   "makefile",
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	filename := strings.ToLower(filepath.Base(filePath))

	// Special cases for files without extensions or special names
	if filename == "dockerfile" || filename == "makefile" {
		return filename
	} else if strings.HasPrefix(filename, ".") {
		return "text"
	}

	if lang, exists := extMap[ext]; exists {
		return lang
	}
	return "text"
}

// quotePathIfNeeded wraps p in single quotes if it contains characters outside
// of a conservative allowed set useful for display and copy-paste.
// Allowed: letters, digits, '_', '.', '/', '\\', ':', '-'
// Single quotes inside are escaped as '\” for readability/consistency.
func quotePathIfNeeded(p string) string {
	needs := false
	for _, r := range p {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			continue
		}
		switch r {
		case '_', '.', '/', '\\', ':', '-':
			// allowed
		default:
			needs = true
		}
		if needs {
			break
		}
	}
	if !needs {
		return p
	}
	// Escape single quotes similarly to UI convention
	escaped := strings.ReplaceAll(p, "'", "'\\''")
	return "'" + escaped + "'"
}

// ReadFileContent reads file content (optionally a line range) and returns it formatted similar to the Python rdcb tool.
// If filePath ends with ":start-end" (0-based, inclusive), only that range of lines is returned.
// Example: "/abs/path/src/main.go:8-25" -> returns lines 8..25 inclusive.
func ReadFileContent(filePath string) (string, error) {
	// Support optional ":start-end" suffix (0-based, inclusive). Handle Windows drive letter colon safely.
	basePath, hasRange, startLine, endLine, perr := parsePathLineSpec(filePath)
	if perr != nil {
		return "", perr
	}

	// Check if file exists
	if _, err := os.Stat(basePath); os.IsNotExist(err) {
		return "", fmt.Errorf("file not found: %s", basePath)
	}

	// Open and read file
	file, err := os.Open(basePath)
	if err != nil {
		return "", fmt.Errorf("error opening %s: %v", basePath, err)
	}
	defer file.Close()

	// Read file content
	content, err := io.ReadAll(file)
	if err != nil {
		return "", fmt.Errorf("error reading %s: %v", basePath, err)
	}

	// Check if content is valid UTF-8, if not try to handle it gracefully
	if !utf8.Valid(content) {
		// For binary files or non-UTF8, return an error message
		return "", fmt.Errorf("file %s contains non-UTF8 content", basePath)
	}

	contentStr := string(content)

	// Get language for syntax highlighting
	language := GetFileExtensionLanguage(basePath)

	// Split content into lines and add line numbers
	lines := strings.Split(contentStr, "\n")

	// Remove the last empty line if the file ends with a newline
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}

	// If a range was requested, clamp and slice (0-based, inclusive)
	if hasRange {
		if startLine < 0 {
			startLine = 0
		}
		if endLine >= len(lines) {
			endLine = len(lines) - 1
		}
		if endLine < startLine {
			return "", fmt.Errorf("invalid line range %d-%d for %s", startLine, endLine, basePath)
		}
		lines = lines[startLine : endLine+1]
	}

	// Format the output similar to open_files
	var result strings.Builder
	headerPath := filePath // keep any provided suffix (e.g., :8-25) for clarity
	result.WriteString(fmt.Sprintf("Successfully opened %s:\n\n````%s\n", quotePathIfNeeded(headerPath), language))

	for i, line := range lines {
		num := i
		if hasRange {
			num = startLine + i
		}
		result.WriteString(fmt.Sprintf("%4d %s\n", num, line))
	}

	result.WriteString("````")

	return result.String(), nil
}

// ReadMultipleFiles reads multiple files and returns their contents with header
func ReadMultipleFiles(paths []string) []string {
	if len(paths) == 0 {
		return []string{}
	}

	// Prepare the output content similar to Python rdcb tool
	var outputLines []string

	// Add header (with newline at the beginning as requested)
	outputLines = append(outputLines, "")
	outputLines = append(outputLines, "")
	outputLines = append(outputLines, "")
	outputLines = append(outputLines, "The referenced content is provided below. There is no need to read it again.")
	outputLines = append(outputLines, "")
	outputLines = append(outputLines, "---")
	outputLines = append(outputLines, "")

	// Process each file
	for _, path := range paths {
		if path == "" {
			errorMsg := "Error: empty file path"
			outputLines = append(outputLines, errorMsg)
			outputLines = append(outputLines, "")
			continue
		}

		content, err := ReadFileContent(path)
		if err != nil {
			errorMsg := fmt.Sprintf("Error reading %s: %v", quotePathIfNeeded(path), err)
			outputLines = append(outputLines, errorMsg)
			outputLines = append(outputLines, "")
		} else {
			outputLines = append(outputLines, content)
			outputLines = append(outputLines, "")
		}
	}

	// Join all lines into a single string and return as single element
	fullContent := strings.Join(outputLines, "\n")
	return []string{fullContent}
}

// parsePathLineSpec parses an optional ":start-end" suffix from a path string.
// Returns base path, whether a range exists, start, end, and error if parsing fails.
func parsePathLineSpec(p string) (string, bool, int, int, error) {
	// Find last ':' and see if it looks like a range "<num>-<num>"
	last := strings.LastIndexByte(p, ':')
	if last == -1 {
		return p, false, 0, 0, nil
	}
	suffix := p[last+1:]
	if suffix == "" || !strings.Contains(suffix, "-") {
		// Not a range (could be Windows drive letter like "C:")
		return p, false, 0, 0, nil
	}
	parts := strings.SplitN(suffix, "-", 2)
	if len(parts) != 2 {
		return p, false, 0, 0, nil
	}
	// Validate both are non-negative integers
	var (
		start int
		end   int
	)
	// Use Atoi safely without importing strconv by delegating to fmt.Sscanf
	if _, err := fmt.Sscanf(parts[0], "%d", &start); err != nil || start < 0 {
		return p, false, 0, 0, fmt.Errorf("invalid start line in range: %q", suffix)
	}
	if _, err := fmt.Sscanf(parts[1], "%d", &end); err != nil || end < 0 {
		return p, false, 0, 0, fmt.Errorf("invalid end line in range: %q", suffix)
	}
	// Ensure there's at least one character before ':' for a real path segment
	base := p[:last]
	if base == "" {
		return p, false, 0, 0, nil
	}
	return base, true, start, end, nil
}
