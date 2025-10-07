package index

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// scanOnce rescans the tree and updates entries if changed.
func (ix *Indexer) scanOnce() {
	root := ix.Root
	if root == "" {
		return
	}

	rootAbs, err := filepath.Abs(root)
	if err != nil {
		rootAbs = root
	}

	// Build entries using iterative stack to minimize recursion overhead.
	type dirState struct {
		absPath string
		relPath string // relative to root
		rules   []rule // ordered from root to current; last match wins
	}

	var newEntries []Entry
	var rootRules []rule
	if lines := readIgnoreLines(filepath.Join(rootAbs, ".gitignore")); len(lines) > 0 {
		rootRules = append(rootRules, rule{baseAbs: rootAbs, baseRel: ".", ign: compileIgnoreLines(lines)})
	}
	stack := []dirState{{absPath: rootAbs, relPath: "", rules: rootRules}}

	for len(stack) > 0 {
		// pop last
		d := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		entries, err := os.ReadDir(d.absPath)
		if err != nil {
			continue
		}
		for _, de := range entries {
			name := de.Name()
			if name == ".git" { // always ignore VCS dir
				continue
			}
			abs := filepath.Join(d.absPath, name)
			rel := filepath.Join(d.relPath, name)
			if strings.HasPrefix(rel, "."+string(filepath.Separator)) {
				rel = rel[2:]
			}

			// Check ignore rules: evaluate against each rule's base; last match wins
			if ignoredByRules(d.rules, rel) {
				// If dir is ignored, skip traversal entirely
				if de.IsDir() {
					continue
				}
				continue
			}

			// Record entry
			entry := Entry{Path: rel, Name: name, IsDir: de.IsDir()}
			newEntries = append(newEntries, entry)
			// If dir, queue traversal with appended rule if this dir has its own .gitignore
			if de.IsDir() {
				childRules := d.rules
				if lines := readIgnoreLines(filepath.Join(abs, ".gitignore")); len(lines) > 0 {
					// copy-on-write
					childRules = append(append([]rule(nil), d.rules...), rule{baseAbs: abs, baseRel: rel, ign: compileIgnoreLines(lines)})
				}
				stack = append(stack, dirState{absPath: abs, relPath: rel, rules: childRules})
			}
		}
	}

	// Sort entries by path for stable order
	sort.Slice(newEntries, func(i, j int) bool { return strings.Compare(newEntries[i].Path, newEntries[j].Path) < 0 })

	// Compute short names with disambiguation
	computeShortNames(newEntries)

	// Count files for logging
	files := 0
	for _, e := range newEntries {
		if !e.IsDir {
			files++
		}
	}

	// Publish atomically by replacing the slice under lock
	ix.mu.Lock()
	ix.entries = newEntries
	changed := (ix.prevFiles != files) || (ix.prevEntries != len(newEntries))
	ix.prevFiles = files
	ix.prevEntries = len(newEntries)
	ix.mu.Unlock()

	if changed {
		fmt.Printf("index: %d files, %d entries\n", files, len(newEntries))
	}
}
