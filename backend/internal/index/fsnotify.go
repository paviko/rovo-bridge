package index

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Start performs an initial scan synchronously and attempts to start fsnotify.
// It does not start periodic polling; refreshes are triggered on demand.
func (ix *Indexer) Start() {
	ix.scanOnce()
	ix.lastRefreshNano.Store(time.Now().UnixNano())
	// Try to start fsnotify regardless of size; if it fails, we won't poll automatically
	if ix.tryStartFsnotify() {
		ix.mode = "fsnotify"
	} else {
		ix.mode = "no-fsnotify"
		// Without fsnotify, we treat as always changed so on-demand refresh will run (rate-limited)
		ix.changed.Store(true)
	}
}

func (ix *Indexer) tryStartFsnotify() bool {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		// fsnotify unavailable; fall back to polling
		fmt.Printf("index: fsnotify unavailable (%v); will use on-demand rescans without watchers\n", err)
		return false
	}
	ix.watcher = w
	// subscribe to directories (capped)
	dirs := ix.currentDirs()
	// Always watch root
	rootAbs, _ := filepath.Abs(ix.Root)
	// initialize watched set
	ix.mu.Lock()
	ix.watched = make(map[string]struct{})
	ix.mu.Unlock()
	added := 0
	if err := w.Add(rootAbs); err == nil {
		added++
		ix.mu.Lock()
		ix.watched[rootAbs] = struct{}{}
		ix.mu.Unlock()
	}
	for _, d := range dirs {
		if d == "" {
			continue
		}
		abs := filepath.Join(rootAbs, d)
		if len(ix.watched) >= ix.maxWatchDirs {
			break
		}
		if err := w.Add(abs); err == nil {
			added++
			ix.mu.Lock()
			ix.watched[abs] = struct{}{}
			ix.mu.Unlock()
			// we pre-checked cap; no need to break on cap here
		}
	}
	fmt.Printf("index: using fsnotify (added %d watches, cap %d)\n", added, ix.maxWatchDirs)
	ix.wg.Add(1)
	go func() {
		defer ix.wg.Done()
		rootAbs, _ := filepath.Abs(ix.Root)
		for {
			select {
			case <-ix.closed:
				w.Close()
				return
			case ev := <-w.Events:
				// mark that changes were detected; rescan will be triggered on-demand by searchIndex
				ix.changed.Store(true)
				// If already overflowed, skip buffering
				if ix.overflowed.Load() {
					continue
				}
				// Normalize to rel path under root
				rel := ev.Name
				if rel != "" {
					if abs, err := filepath.Abs(ev.Name); err == nil {
						if r, err2 := filepath.Rel(rootAbs, abs); err2 == nil {
							rel = r
						}
					}
				}
				if rel != "" {
					if ix.changeCount.Add(1) > int64(ix.maxPending) {
						ix.evMu.Lock()
						ix.pending = make(map[string]fsnotify.Op)
						ix.evMu.Unlock()
						ix.overflowed.Store(true)
						continue
					}
					ix.evMu.Lock()
					ix.pending[normalizeSlash(rel)] |= ev.Op
					ix.evMu.Unlock()
				}
			case <-w.Errors:
				// ignore errors; rely on periodic rebuild
			}
		}
	}()
	return true
}

// RequestRefresh triggers a background rescan if needed, rate-limited by debounce.
// In fsnotify mode, it only runs if changes were detected. Without fsnotify,
// it behaves as if changes are always pending.
func (ix *Indexer) RequestRefresh() {
	// Avoid duplicate refreshes
	if ix.refreshRunning.Load() {
		return
	}
	// If fsnotify is active, require a change signal
	if ix.mode == "fsnotify" && !ix.changed.Load() {
		return
	}
	// Rate-limit by debounce interval
	now := time.Now()
	last := time.Unix(0, ix.lastRefreshNano.Load())
	if now.Sub(last) < ix.debounce {
		return
	}
	if !ix.refreshRunning.CompareAndSwap(false, true) {
		return
	}
	ix.wg.Add(1)
	go func() {
		defer ix.wg.Done()
		defer ix.refreshRunning.Store(false)

		// In fsnotify mode, try incremental apply if not overflowed and there are pending events
		didIncremental := false
		if ix.mode == "fsnotify" && !ix.overflowed.Load() {
			// snapshot pending
			ix.evMu.Lock()
			pend := make(map[string]fsnotify.Op, len(ix.pending))
			for p, op := range ix.pending {
				pend[p] = op
			}
			// reset buffers for new events while we apply
			ix.pending = make(map[string]fsnotify.Op)
			ix.changeCount.Store(0)
			ix.evMu.Unlock()

			if len(pend) > 0 {
				// If any .gitignore changed, fallback to full rescan
				fallback := false
				for p := range pend {
					if filepath.Base(p) == ".gitignore" {
						fallback = true
						break
					}
				}
				if !fallback {
					ix.applyPendingIncremental(pend)
					didIncremental = true
				}
			}
		}

		if !didIncremental {
			ix.scanOnce()
		}

		ix.lastRefreshNano.Store(time.Now().UnixNano())
		ix.rebuildWatchers()
		ix.changed.Store(false)
		ix.overflowed.Store(false)
	}()
}

// isUnderSubtree reports whether path p is under directory subtree d (both relative paths)
func isUnderSubtree(p, d string) bool {
	p = normalizeSlash(p)
	d = normalizeSlash(d)
	if d == "" {
		return true
	}
	if p == d {
		return true
	}
	if !strings.HasSuffix(d, "/") {
		d = d + "/"
	}
	return strings.HasPrefix(p, d)
}

func (ix *Indexer) rebuildWatchers() {
	// Incrementally add/remove watches to match currentDirs(), honoring .gitignore via scanOnce() output.
	w := ix.watcher
	if w == nil {
		return
	}

	rootAbs, _ := filepath.Abs(ix.Root)
	// Build desired set outside of locks to avoid deadlocks with Snapshot()'s locks.
	desired := make(map[string]struct{})
	desired[rootAbs] = struct{}{}
	for _, d := range ix.currentDirs() {
		if d == "" {
			continue
		}
		abs := filepath.Join(rootAbs, d)
		desired[abs] = struct{}{}
	}

	ix.mu.Lock()
	if ix.watched == nil {
		ix.watched = make(map[string]struct{})
	}
	// Remove unwatched paths
	for p := range ix.watched {
		if _, ok := desired[p]; !ok {
			_ = w.Remove(p)
			delete(ix.watched, p)
		}
	}
	// Ensure root is watched
	if _, ok := ix.watched[rootAbs]; !ok {
		if err := w.Add(rootAbs); err == nil {
			ix.watched[rootAbs] = struct{}{}
		}
	}
	// Add desired paths up to cap
	remaining := ix.maxWatchDirs - len(ix.watched)
	if remaining < 0 {
		remaining = 0
	}
	for p := range desired {
		if _, ok := ix.watched[p]; ok {
			continue
		}
		if remaining <= 0 {
			break
		}
		if err := w.Add(p); err == nil {
			ix.watched[p] = struct{}{}
			remaining--
		}
	}
	ix.mu.Unlock()
}

func (ix *Indexer) currentDirs() []string {
	snap := ix.Snapshot()
	dirs := make([]string, 0)
	for _, e := range snap.Entries {
		if e.IsDir {
			dirs = append(dirs, e.Path)
		}
	}
	return dirs
}

// Close stops the background scanner.
func (ix *Indexer) Close() {
	close(ix.closed)
	if ix.watcher != nil {
		_ = ix.watcher.Close()
	}
	ix.wg.Wait()
}
