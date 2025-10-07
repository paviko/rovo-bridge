package index

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/fsnotify/fsnotify"
)

// applyPendingIncremental mutates ix.entries based on a set of changed relative paths.
// It handles file creates/updates/removes and directory subtree changes. If the scope
// becomes too complex, call scanOnce() instead.
func (ix *Indexer) applyPendingIncremental(pend map[string]fsnotify.Op) {
	rootAbs, _ := filepath.Abs(ix.Root)

	// Track removals separately to prune obsolete entries
	dirsToRescan := make(map[string]struct{})
	filesToCheck := make(map[string]struct{})
	dirsRemoved := make(map[string]struct{})
	filesRemoved := make(map[string]struct{})

	for rel, op := range pend {
		abs := filepath.Join(rootAbs, rel)
		info, err := os.Lstat(abs)
		if err != nil {
			// treat as removal
			if strings.HasSuffix(rel, "/") {
				rel = strings.TrimSuffix(rel, "/")
			}
			if filepath.Base(rel) == ".gitignore" {
				// handled earlier; but keep safety to force full scan by caller if needed
			}
			// Can't know if it was dir or file reliably; try to infer by op
			if op&fsnotify.Remove != 0 || op&fsnotify.Rename != 0 {
				// assume both file and directory removal may happen
				dirsRemoved[rel] = struct{}{}
				filesRemoved[rel] = struct{}{}
			} else {
				filesRemoved[rel] = struct{}{}
			}
			continue
		}
		if info.IsDir() {
			// rescan entire subtree
			dirsToRescan[rel] = struct{}{}
		} else {
			filesToCheck[rel] = struct{}{}
		}
	}

	// Remove redundant file checks covered by dir rescans
	for f := range filesToCheck {
		for d := range dirsToRescan {
			if isUnderSubtree(f, d) {
				delete(filesToCheck, f)
				break
			}
		}
	}
	for r := range filesRemoved {
		for d := range dirsToRescan {
			if isUnderSubtree(r, d) {
				delete(filesRemoved, r)
				break
			}
		}
	}

	// Mutate entries under lock
	ix.mu.Lock()
	// Start with current entries
	cur := ix.entries
	out := cur[:0]

	// Build a quick ignore rule cache for subtrees we touch
	ruleCache := make(map[string][]rule) // key: dir rel path ("" for root)
	getRules := func(dirRel string) []rule {
		if r, ok := ruleCache[dirRel]; ok {
			return r
		}
		// Build rule chain from root to dirRel
		rootRules := []rule{}
		rootAbs2, _ := filepath.Abs(ix.Root)
		if lines := readIgnoreLines(filepath.Join(rootAbs2, ".gitignore")); len(lines) > 0 {
			rootRules = append(rootRules, rule{baseAbs: rootAbs2, baseRel: ".", ign: compileIgnoreLines(lines)})
		}
		r := rootRules
		if dirRel != "" {
			segs := splitPath(dirRel)
			accumRel := ""
			accumAbs := rootAbs2
			for _, s := range segs {
				if accumRel == "" {
					accumRel = s
				} else {
					accumRel = filepath.Join(accumRel, s)
				}
				accumAbs = filepath.Join(accumAbs, s)
				if lines := readIgnoreLines(filepath.Join(accumAbs, ".gitignore")); len(lines) > 0 {
					r = append(r, rule{baseAbs: accumAbs, baseRel: accumRel, ign: compileIgnoreLines(lines)})
				}
			}
		}
		ruleCache[dirRel] = r
		return r
	}

	// Helper to scan a subtree relative path and append entries
	appendSubtree := func(relDir string) []Entry {
		absDir := filepath.Join(rootAbs, relDir)
		// BFS stack
		type dirState struct {
			absPath string
			relPath string
			rules   []rule
		}
		var newEntries []Entry
		stack := []dirState{{absPath: absDir, relPath: relDir, rules: getRules(relDir)}}
		for len(stack) > 0 {
			d := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			entries, err := os.ReadDir(d.absPath)
			if err != nil {
				continue
			}
			// include the directory itself if not root
			if d.relPath != "" {
				name := filepath.Base(d.relPath)
				if !ignoredByRules(d.rules, d.relPath) {
					newEntries = append(newEntries, Entry{Path: d.relPath, Name: name, IsDir: true})
				}
			}
			for _, de := range entries {
				name := de.Name()
				if name == ".git" {
					continue
				}
				abs := filepath.Join(d.absPath, name)
				rel := filepath.Join(d.relPath, name)
				if strings.HasPrefix(rel, "."+string(filepath.Separator)) {
					rel = rel[2:]
				}
				if ignoredByRules(d.rules, rel) {
					if de.IsDir() {
						continue
					}
					continue
				}
				entry := Entry{Path: rel, Name: name, IsDir: de.IsDir()}
				newEntries = append(newEntries, entry)
				if de.IsDir() {
					childRules := d.rules
					if lines := readIgnoreLines(filepath.Join(abs, ".gitignore")); len(lines) > 0 {
						childRules = append(append([]rule(nil), d.rules...), rule{baseAbs: abs, baseRel: rel, ign: compileIgnoreLines(lines)})
					}
					stack = append(stack, dirState{absPath: abs, relPath: rel, rules: childRules})
				}
			}
		}
		return newEntries
	}

	// First, drop removed directories and files from current entries
	hasDirRemoval := func(p string) bool {
		if _, ok := dirsRemoved[p]; ok {
			return true
		}
		// if any parent directory removed
		for d := range dirsRemoved {
			if isUnderSubtree(p, d) {
				return true
			}
		}
		return false
	}

	for _, e := range cur {
		// Skip anything under removed directories
		if hasDirRemoval(e.Path) {
			continue
		}
		// Skip removed files
		if _, ok := filesRemoved[e.Path]; ok && !e.IsDir {
			continue
		}
		// Skip paths that will be fully replaced by a rescan of their ancestor directory
		replaced := false
		for d := range dirsToRescan {
			if isUnderSubtree(e.Path, d) || e.Path == d {
				replaced = true
				break
			}
		}
		if replaced {
			continue
		}
		out = append(out, e)
	}

	// Append rescanned directories
	for d := range dirsToRescan {
		entries := appendSubtree(d)
		out = append(out, entries...)
	}
	// Append/ensure files
	for f := range filesToCheck {
		abs := filepath.Join(rootAbs, f)
		info, err := os.Lstat(abs)
		if err != nil || info.IsDir() {
			continue
		}
		// Evaluate ignore rules for its directory
		dir := filepath.Dir(f)
		rules := getRules(dir)
		if ignoredByRules(rules, f) {
			continue
		}
		out = append(out, Entry{Path: f, Name: filepath.Base(f), IsDir: false})
	}

	// Sort and recompute short names
	sort.Slice(out, func(i, j int) bool { return strings.Compare(out[i].Path, out[j].Path) < 0 })
	computeShortNames(out)
	ix.entries = out
	ix.mu.Unlock()
}
