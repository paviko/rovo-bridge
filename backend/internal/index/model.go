package index

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/fsnotify/fsnotify"
	ignore "github.com/sabhiram/go-gitignore"
)

// Entry represents a single file or directory in the index.
type Entry struct {
	Path  string // relative to root, with OS-specific separators
	Name  string // base name
	Short string // short display name, possibly parent prefixes to disambiguate
	IsDir bool
}

// rule describes a .gitignore rule set anchored at a directory
// baseRel is the path relative to Root at which this ignore file lives ("." for root)
// We keep it unexported since it's internal plumbing for the indexer.
type rule struct {
	baseAbs string
	baseRel string // relative to root
	ign     *ignore.GitIgnore
}

// Snapshot is an immutable copy of the index state used for searching.
type Snapshot struct {
	Entries []Entry
	// map base name -> indexes within Entries
	byName map[string][]int
}

// Indexer maintains an index of files/directories under Root.
type Indexer struct {
	Root string

	mu      sync.RWMutex
	entries []Entry
	closed  chan struct{}
	wg      sync.WaitGroup

	// last reported sizes for stdout logging
	prevFiles   int
	prevEntries int

	// scanning strategy
	interval         time.Duration
	mode             string // "poll" or "fsnotify"
	watcher          *fsnotify.Watcher
	watched          map[string]struct{}
	debounce         time.Duration
	massiveThreshold int // choose fsnotify if entries exceed this
	maxWatchDirs     int // cap number of directories to watch; fallback to poll if exceeded

	// on-demand refresh control
	changed         atomic.Bool   // set true by fsnotify when events arrive; if no fsnotify, always treated as true
	refreshRunning  atomic.Bool   // prevent concurrent refreshes
	lastRefreshNano atomic.Int64  // unix nano timestamp of last refresh

	// incremental fsnotify buffering
	evMu        sync.Mutex
	pending     map[string]fsnotify.Op // dedup by rel path; op is OR of events
	changeCount atomic.Int64
	overflowed  atomic.Bool
	maxPending  int // threshold; fallback to full scan if exceeded
}

// New creates an Indexer for a given root directory.
func New(root string) *Indexer {
	return &Indexer{
		Root:             root,
		closed:           make(chan struct{}),
		interval:         5 * time.Second,
		debounce:         5 * time.Second,
		massiveThreshold: 0,
		maxWatchDirs:     10000,
		watched:          make(map[string]struct{}),
		pending:          make(map[string]fsnotify.Op),
		maxPending:       1000,
	}
}

// Snapshot returns an immutable copy of current entries with auxiliary indices.
func (ix *Indexer) Snapshot() Snapshot {
	ix.mu.RLock()
	defer ix.mu.RUnlock()
	entries := make([]Entry, len(ix.entries))
	copy(entries, ix.entries)
	byName := make(map[string][]int)
	for i, e := range entries {
		byName[e.Name] = append(byName[e.Name], i)
	}
	return Snapshot{Entries: entries, byName: byName}
}
