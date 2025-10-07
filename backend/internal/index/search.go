package index

import (
	"container/heap"
	"path/filepath"
	"sort"
	"strings"
)

// Search finds up to limit entries matching the pattern.
// It also searches within a provided subset of paths (opened) and returns their matches separately.
func (s Snapshot) Search(pattern string, limit int, opened []string) (results []Entry, openedResults []Entry) {
	if limit <= 0 {
		limit = 100
	}
	p := compilePattern(pattern)

	// Normalize opened list to relative paths if possible
	root := ""
	// opened are matched by base name primarily
	openedSet := make(map[string]bool)
	for _, op := range opened {
		if op == "" {
			continue
		}
		// Try to make relative if it is absolute and under root
		rel := op
		if filepath.IsAbs(op) && root != "" {
			if r, err := filepath.Rel(root, op); err == nil {
				rel = r
			}
		}
		openedSet[normalizeSlash(rel)] = true
	}

	// Fast path for empty pattern: keep behavior (take first 'limit' in stable order; list opened that match)
	if p.plain == "" {
		for _, e := range s.Entries {
			if p.match(e) {
				results = append(results, e)
				if len(results) >= limit {
					break
				}
			}
		}
		if len(openedSet) > 0 {
			for _, e := range s.Entries {
				if !openedSet[normalizeSlash(e.Path)] {
					continue
				}
				if p.match(e) {
					openedResults = append(openedResults, e)
				}
			}
		}
		return
	}

	// Ranked search: compute scores and keep top-K using a min-heap for efficiency
	h := &scoredHeap{}
	heap.Init(h)
	openedScored := make([]scoredEntry, 0)

	for _, e := range s.Entries {
		ok, sc := scoreEntry(e, p)
		if !ok {
			continue
		}

		if len(*h) < limit {
			heap.Push(h, scoredEntry{entry: e, score: sc})
		} else if (*h)[0].score < sc {
			heap.Pop(h)
			heap.Push(h, scoredEntry{entry: e, score: sc})
		}

		if len(openedSet) > 0 && openedSet[normalizeSlash(e.Path)] {
			openedScored = append(openedScored, scoredEntry{entry: e, score: sc})
		}
	}

	// Extract and sort by score descending
	thresholdScore := 0
	if h.Len() > 0 {
		tmp := make([]scoredEntry, h.Len())
		for i := range tmp {
			tmp[i] = heap.Pop(h).(scoredEntry)
		}
		sort.Slice(tmp, func(i, j int) bool { return tmp[i].score > tmp[j].score })
		results = make([]Entry, len(tmp))
		for i, se := range tmp {
			results[i] = se.entry
		}
		// Determine the 10th-best score among results (or 0 if fewer than 10)
		if len(tmp) >= 10 {
			thresholdScore = tmp[9].score
		} else {
			thresholdScore = 0
		}
	}

	if len(openedScored) > 0 {
		sort.Slice(openedScored, func(i, j int) bool { return openedScored[i].score > openedScored[j].score })
		// Keep only entries with score >= thresholdScore
		filtered := make([]scoredEntry, 0, len(openedScored))
		for _, se := range openedScored {
			if se.score >= thresholdScore {
				filtered = append(filtered, se)
			}
		}
		openedResults = make([]Entry, len(filtered))
		for i, se := range filtered {
			openedResults[i] = se.entry
		}
	}
	return
}

// pattern matching

type compiledPattern struct {
	raw   string
	plain string // without '*' and spaces
	lower string
}

func compilePattern(p string) compiledPattern {
	p = strings.TrimSpace(p)
	p = strings.ReplaceAll(p, "*", "")
	p = strings.ReplaceAll(p, " ", "")
	return compiledPattern{raw: p, plain: p, lower: strings.ToLower(p)}
}

func (p compiledPattern) match(e Entry) bool {
	if p.plain == "" {
		return true
	}
	// Try base name, short, then path
	if camelOrSubseqMatch(e.Name, p) {
		return true
	}
	if camelOrSubseqMatch(e.Short, p) {
		return true
	}
	if camelOrSubseqMatch(normalizeSlash(e.Path), p) {
		return true
	}
	return false
}

// --- Ranking helpers ---

type scoredEntry struct {
	entry Entry
	score int
}

type scoredHeap []scoredEntry

func (h scoredHeap) Len() int           { return len(h) }
func (h scoredHeap) Less(i, j int) bool { return h[i].score < h[j].score } // min-heap by score
func (h scoredHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *scoredHeap) Push(x any)        { *h = append(*h, x.(scoredEntry)) }
func (h *scoredHeap) Pop() any          { old := *h; n := len(old); x := old[n-1]; *h = old[:n-1]; return x }

// scoreEntry computes the best score among name/short/path with weights.
func scoreEntry(e Entry, p compiledPattern) (bool, int) {
	if p.plain == "" {
		return true, 0
	}
	const (
		weightName  = 4000
		weightShort = 2500
		weightPath  = 1000
	)

	bestOK := false
	bestScore := -1 << 30

	if ok, sc := scoreString(e.Name, p); ok {
		// exact base-name match bonus
		if strings.EqualFold(e.Name, p.plain) {
			sc += 800
		}
		sc += weightName
		bestOK, bestScore = true, max(bestScore, sc)
	}
	if e.Short != "" {
		if ok, sc := scoreString(e.Short, p); ok {
			sc += weightShort
			bestOK, bestScore = true, max(bestScore, sc)
		}
	}
	path := normalizeSlash(e.Path)
	if ok, sc := scoreString(path, p); ok {
		// prefer matches near the end of path (i.e., closer to filename)
		sc += weightPath
		bestOK, bestScore = true, max(bestScore, sc)
	}
	return bestOK, bestScore
}

func scoreString(s string, p compiledPattern) (bool, int) {
	if s == "" {
		return false, 0
	}
	sl := strings.ToLower(s)
	pl := p.lower

	// Prefer contiguous substring matches
	if idx := strings.Index(sl, pl); idx >= 0 {
		score := 2000
		// earlier is better
		score += max(0, 300-idx)
		// at word/start boosts
		if isWordStart(s, idx) {
			score += 200
		}
		if idx == 0 {
			score += 150
		}
		// boundary after the match
		end := idx + len(pl)
		if end == len(s) || isBoundary(s[end]) {
			score += 60
		}
		// shorter overall string preferred
		score -= max(0, len(sl)-len(pl))
		return true, score
	}

	// Fallback to subsequence greedy matching
	ok, ws, first, last := subseqGreedy(sl, pl, s)
	if !ok {
		return false, 0
	}
	score := 1000
	score += ws * 40
	if first >= 0 {
		score += max(0, 120-first)
	}
	// compactness penalty: extra span beyond required
	if first >= 0 && last >= first {
		extra := (last - first + 1) - len(pl)
		if extra > 0 {
			score -= extra * 6
		}
	}
	return true, score
}

// subseqGreedy matches pl as a subsequence of sl, counting word-start hits and span.
// Returns ok, wordStartsMatched, firstIndex, lastIndex.
func subseqGreedy(sl, pl, orig string) (bool, int, int, int) {
	si, pi := 0, 0
	ws := 0
	first, last := -1, -1
	for si < len(sl) && pi < len(pl) {
		if sl[si] == pl[pi] {
			if first == -1 {
				first = si
			}
			if isWordStart(orig, si) {
				ws++
			}
			last = si
			si++
			pi++
			continue
		}
		si++
	}
	if pi == len(pl) {
		return true, ws, first, last
	}
	return false, 0, -1, -1
}

func isBoundary(b byte) bool {
	return b == '/' || b == '\\' || b == '-' || b == '_' || b == '.'
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// camelOrSubseqMatch performs a case-insensitive subsequence match with camel-case boosts
func camelOrSubseqMatch(s string, p compiledPattern) bool {
	if s == "" {
		return false
	}
	sl := strings.ToLower(s)
	pl := p.lower
	// quick substring check
	if strings.Contains(sl, pl) {
		return true
	}
	// subsequence with camel awareness
	return subseqWithWordStarts(sl, p.lower, s)
}

// subseqWithWordStarts tries to match pattern as subsequence, preferring word starts (letters after separators or camel humps)
func subseqWithWordStarts(sl string, pl string, orig string) bool {
	si := 0
	pi := 0
	for si < len(sl) && pi < len(pl) {
		cs := sl[si]
		cp := pl[pi]
		if cs == cp {
			// accept
			si++
			pi++
			continue
		}
		// If this is a word start in orig, allow skipping until next match
		if isWordStart(orig, si) {
			// try to align cp with next occurrence from here
			idx := strings.IndexByte(sl[si:], cp)
			if idx < 0 {
				return false
			}
			si += idx + 1
			pi++
			continue
		}
		si++
	}
	return pi == len(pl)
}

func isWordStart(s string, i int) bool {
	if i <= 0 {
		return true
	}
	prev := s[i-1]
	cur := s[i]
	if prev == '/' || prev == '\\' || prev == '-' || prev == '_' || prev == '.' {
		return true
	}
	// camel hump: prev is lower and cur is upper in original casing
	if isLower(prev) && isUpper(cur) {
		return true
	}
	return false
}

func isLower(b byte) bool { return b >= 'a' && b <= 'z' }
func isUpper(b byte) bool { return b >= 'A' && b <= 'Z' }
