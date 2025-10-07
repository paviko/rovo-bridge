package index

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"io/fs"

	ignore "github.com/sabhiram/go-gitignore"
)

// readIgnoreLines reads non-empty lines from a .gitignore file, ignoring comments.
func readIgnoreLines(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	var lines []string
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := s.Text()
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "#") {
			continue
		}
		lines = append(lines, line)
	}
	return lines
}

func compileIgnoreLines(lines []string) *ignore.GitIgnore {
	if len(lines) == 0 {
		return nil
	}
	// The library treats patterns relative to current working directory; we only pass
	// the patterns and evaluate on a path already sliced relative to the .gitignore base.
	return ignore.CompileIgnoreLines(lines...)
}

func normalizeSlash(p string) string { return strings.ReplaceAll(p, string(filepath.Separator), "/") }

// ignoredByRules evaluates gitignore rules in order and returns true if the path is ignored.
// Later rules override earlier ones. We approximate by evaluating each rule matcher
// against the path relative to the rule's base directory and remembering the last decision.
func ignoredByRules(rules []rule, relPath string) bool {
	if len(rules) == 0 {
		return false
	}
	// Normalize
	relNorm := normalizeSlash(relPath)
	ignored := false
	for _, r := range rules {
		base := r.baseRel
		var p string
		if base == "." {
			p = relNorm
		} else {
			p = normalizeSlash(strings.TrimPrefix(relNorm, normalizeSlash(base)+"/"))
		}
		if r.ign == nil {
			continue
		}
		if p == "" { // the directory itself
			// .gitignore at this dir should not ignore the directory entry itself
			continue
		}
		if r.ign.MatchesPath(p) {
			ignored = true
		} else {
			// If there is a negation pattern that matches, MatchesPath returns false.
			// Proper handling would require MatchesPath fuzz with negations.
			// For simplicity we keep last true as ignore; otherwise leave as is.
		}
	}
	return ignored
}

// computeShortNames fills Short for entries, disambiguating duplicate base names by
// prefixing with parent directories from nearest upwards until unique.
func computeShortNames(entries []Entry) {
	byBase := make(map[string][]int)
	for i, e := range entries {
		byBase[e.Name] = append(byBase[e.Name], i)
	}
	for base, idxs := range byBase {
		if len(idxs) == 1 {
			entries[idxs[0]].Short = base
			continue
		}
		// need disambiguation: use parent segments from nearest upwards
		// Collect parent paths
		type info struct {
			segs []string
			i    int
		}
		infos := make([]info, 0, len(idxs))
		maxDepth := 0
		for _, i := range idxs {
			p := entries[i].Path
			dir := filepath.Dir(p)
			var segs []string
			if dir != "." {
				segs = splitPath(dir)
			}
			// reverse for nearest-first
			rev(segs)
			infos = append(infos, info{segs: segs, i: i})
			if len(segs) > maxDepth {
				maxDepth = len(segs)
			}
		}
		for depth := 1; depth <= maxDepth; depth++ {
			m := make(map[string][]int)
			for _, inf := range infos {
				prefix := pickPrefix(inf.segs, depth)
				key := prefix + "/" + base
				m[key] = append(m[key], inf.i)
			}
			uniqueCount := 0
			for k, is := range m {
				if len(is) == 1 {
					entries[is[0]].Short = k
					uniqueCount++
				}
			}
			if uniqueCount == len(infos) {
				break
			}
			// continue increasing depth
		}
		// Fill any unresolved with full relative path
		for _, i := range idxs {
			if entries[i].Short == "" {
				entries[i].Short = entries[i].Path
			}
		}
	}
}

func splitPath(p string) []string {
	p = normalizeSlash(p)
	if p == "." || p == "" {
		return nil
	}
	segs := strings.Split(p, "/")
	// drop leading . if present
	if len(segs) > 0 && segs[0] == "." {
		segs = segs[1:]
	}
	return segs
}

func rev[T any](s []T) {
	for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
		s[i], s[j] = s[j], s[i]
	}
}

func pickPrefix(segs []string, depth int) string {
	if depth <= 0 || len(segs) == 0 {
		return ""
	}
	if depth > len(segs) {
		depth = len(segs)
	}
	chosen := make([]string, 0, depth)
	for i := 0; i < depth; i++ {
		chosen = append(chosen, segs[i])
	}
	// reverse back to root->leaf order for readability
	rev(chosen)
	return strings.Join(chosen, "/")
}

// Utility to filter directory entries by predicate; not used directly but kept for future
func filterDirEntries(entries []fs.DirEntry, pred func(fs.DirEntry) bool) []fs.DirEntry {
	out := entries[:0]
	for _, e := range entries {
		if pred(e) {
			out = append(out, e)
		}
	}
	return out
}
