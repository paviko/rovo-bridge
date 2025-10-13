package ws

import (
	"bufio"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/example/rovobridge/internal/fileutil"
	"github.com/example/rovobridge/internal/history"
	"github.com/example/rovobridge/internal/index"
	"github.com/example/rovobridge/internal/session"
	"github.com/gorilla/websocket"
)

type Router struct {
	mu              sync.Mutex
	sessions        map[string]*session.Session
	sessionStates   map[string]*sessionState
	connSessions    map[*websocket.Conn]map[string]bool
	customCommand   string
	currentFontSize int // Store the current font size from frontend

	// file indexer
	indexer *index.Indexer

	// prompt history manager
	historyManager *history.HistoryManager
}

// Max frequency for stdout sends to the client.
// Adjust as needed; 200ms means up to 5 messages/sec.
const stdoutThrottleInterval = 200 * time.Millisecond

type sessionState struct {
	mu               sync.Mutex
	replay           []byte
	lastSeq          uint64
	currentConn      *websocket.Conn
	orphanTimer      *time.Timer
	suppressNextExit bool

	// stdout throttling/buffering
	outBuf        []byte
	lastSend      time.Time // last time we sent a stdout message to client
	lastEnqueue   time.Time // last time we enqueued data from PTY into outBuf
	throttleTimer *time.Timer
	needImmediate bool

	// session working directory for prompt history
	workingDir string

	// whether to use system clipboard when injecting files (default: true)
	useClipboard bool
}

func NewRouter(customCommand string) *Router {
	r := &Router{
		sessions:        map[string]*session.Session{},
		sessionStates:   map[string]*sessionState{},
		connSessions:    map[*websocket.Conn]map[string]bool{},
		customCommand:   customCommand,
		currentFontSize: 0, // 0 means no font size change received yet
		historyManager:  history.NewHistoryManager(),
	}
	// initialize indexer for current working directory
	if cwd, err := os.Getwd(); err == nil {
		r.indexer = index.New(cwd)
		r.indexer.Start()
	}
	return r
}

func (r *Router) getSessionConfig() map[string]any {
	sessionConfig := map[string]any{
		"cmd":  "acli",
		"args": []string{"rovodev", "run"},
		"pty":  true,
		"env":  []string{"LANG=C.UTF-8"},
	}

	// Override with custom command if provided
	if r.customCommand != "" {
		// Parse custom command into cmd and args
		parts := strings.Fields(r.customCommand)
		if len(parts) > 0 {
			sessionConfig["cmd"] = parts[0]
			if len(parts) > 1 {
				sessionConfig["args"] = parts[1:]
			} else {
				sessionConfig["args"] = []string{}
			}
		}
	}

	return sessionConfig
}

func (r *Router) Attach(s *Server) {
	s.OnMessage = func(conn *websocket.Conn, msg map[string]any) {
		_ = r.handle(conn, msg)
	}
	s.OnClose = func(conn *websocket.Conn) {
		r.cleanupConn(conn)
	}
}

func (r *Router) handle(conn *websocket.Conn, m map[string]any) error {
	switch m["type"] {
	case "hello":
		return SendJSON(conn, map[string]any{
			"type":          "welcome",
			"sessionId":     "ctrl",
			"features":      map[string]bool{"streaming": true, "pty": true},
			"sessionConfig": r.getSessionConfig(),
		})
	case "searchIndex":
		// { type: "searchIndex", pattern: string, opened: [string], limit: number }
		pattern, _ := m["pattern"].(string)
		limit := asInt(m["limit"])
		var opened []string
		if arr, ok := anyToStrings(m["opened"]); ok {
			opened = arr
		}
		// Normalize opened paths to be relative to the index root so backend can match them
		if len(opened) > 0 && r.indexer != nil && r.indexer.Root != "" {
			if rootAbs, err := filepath.Abs(r.indexer.Root); err == nil {
				norm := make([]string, 0, len(opened))
				sep := string(filepath.Separator)
				for _, op := range opened {
					if op == "" {
						continue
					}
					rel := op
					if filepath.IsAbs(op) {
						if rp, err := filepath.Rel(rootAbs, op); err == nil && rp != "" && !strings.HasPrefix(rp, "..") {
							rel = rp
						}
					}
					// Clean and strip leading "./" to align with index entries
					rel = filepath.Clean(rel)
					if strings.HasPrefix(rel, "."+sep) {
						rel = strings.TrimPrefix(rel, "."+sep)
					}
					norm = append(norm, rel)
				}
				opened = norm
			}
		}
		// Trigger a background, rate-limited refresh if needed
		if r.indexer != nil {
			r.indexer.RequestRefresh()
		}
		if r.indexer == nil {
			return SendJSON(conn, map[string]any{"type": "searchResult", "results": []any{}, "openedResults": []any{}})
		}
		snap := r.indexer.Snapshot()
		res, ores := snap.Search(pattern, limit, opened)
		pack := func(in []index.Entry) []map[string]any {
			out := make([]map[string]any, 0, len(in))
			for _, e := range in {
				out = append(out, map[string]any{
					"short": e.Short,
					"path":  e.Path,
					"isDir": e.IsDir,
				})
			}
			return out
		}
		return SendJSON(conn, map[string]any{
			"type":          "searchResult",
			"results":       pack(res),
			"openedResults": pack(ores),
		})
	case "updateSessionConfig":
		// Allow dynamic updates to session configuration
		if newCmd, ok := m["customCommand"].(string); ok {
			r.customCommand = newCmd
			// Broadcast updated config to all connected clients
			return SendJSON(conn, map[string]any{
				"type":          "sessionConfigUpdated",
				"sessionConfig": r.getSessionConfig(),
			})
		}
		return nil
	case "openSession":
		id := "s1"
		if v, ok := m["id"].(string); ok {
			id = v
		}
		cmd, _ := m["cmd"].(string)
		args, _ := anyToStrings(m["args"])
		resumeReq := false
		if v, ok := m["resume"].(bool); ok {
			resumeReq = v
		}
		cols := asInt(m["cols"])
		rows := asInt(m["rows"])

		// If resume requested and session exists, adopt without restarting
		r.mu.Lock()
		existing := r.sessions[id]
		if _, ok := r.sessionStates[id]; !ok {
			r.sessionStates[id] = &sessionState{}
		}
		st := r.sessionStates[id]
		r.mu.Unlock()
		if resumeReq && existing != nil {
			// Attach to existing session
			// If caller provided useClipboard, update stored preference
			if v, ok := m["useClipboard"].(bool); ok {
				st.mu.Lock()
				st.useClipboard = v
				st.mu.Unlock()
			}
			st.mu.Lock()
			st.currentConn = conn
			if st.orphanTimer != nil {
				st.orphanTimer.Stop()
				st.orphanTimer = nil
			}
			st.mu.Unlock()
			r.mu.Lock()
			if r.connSessions[conn] == nil {
				r.connSessions[conn] = map[string]bool{}
			}
			r.connSessions[conn][id] = true
			r.mu.Unlock()
			// Apply initial resize if provided
			if cols > 0 && rows > 0 {
				_ = existing.Resize(cols, rows)
			}

			// Load prompt history for session resume with enhanced error handling
			promptHistory, err := r.historyManager.LoadHistory()
			if err != nil {
				log.Printf("Failed to load prompt history for session resume: %v", err)
				promptHistory = []history.PromptHistoryEntry{} // Continue with empty history
			}

			// Ack opened and proactively send a snapshot; include PID, resumed=true, and prompt history
			SendJSON(conn, map[string]any{
				"type":          "opened",
				"id":            m["id"],
				"sessionId":     id,
				"pid":           existing.PID(),
				"resumed":       true,
				"promptHistory": promptHistory,
			})
			st.mu.Lock()
			data := make([]byte, len(st.replay))
			copy(data, st.replay)
			last := st.lastSeq
			st.mu.Unlock()
			data = sanitizeSnapshot(data)
			SendJSON(conn, map[string]any{"type": "snapshot", "sessionId": id, "dataBase64": base64.StdEncoding.EncodeToString(data), "lastSeq": last})
			return nil
		}

		// Override with custom command if provided via --cmd flag
		if r.customCommand != "" {
			// Parse custom command into cmd and args
			parts := strings.Fields(r.customCommand)
			if len(parts) > 0 {
				cmd = parts[0]
				if len(parts) > 1 {
					args = parts[1:]
				} else {
					args = []string{}
				}
			}
		}

		env, _ := anyToStrings(m["env"]) // ["KEY=VALUE", ...]
		dir, _ := m["cwd"].(string)
		ptyFlag := true
		if v, ok := m["pty"].(bool); ok {
			ptyFlag = v
		}
		mode := session.ModeAutoPTY
		if !ptyFlag {
			mode = session.ModeNoPTY
		}

		ctx, cancel := context.WithCancel(context.Background())
		sess, err := session.Start(ctx, session.Config{Cmd: cmd, Args: args, Env: env, Dir: dir, Mode: mode})
		if err != nil {
			// Ensure we do not leak context when start fails
			cancel()
			Errorf(conn, "failed to start: %v", err)
			return nil
		}
		if cols > 0 && rows > 0 {
			_ = sess.Resize(cols, rows)
		}
		r.mu.Lock()
		// If a previous session with the same id exists and not resuming, mark to suppress its exit and close it
		if old := r.sessions[id]; old != nil {
			if st2, ok := r.sessionStates[id]; ok && st2 != nil {
				st2.mu.Lock()
				st2.suppressNextExit = true
				st2.mu.Unlock()
			}
			_ = old.Close()
			delete(r.sessions, id)
		}
		r.sessions[id] = sess
		if r.connSessions[conn] == nil {
			r.connSessions[conn] = map[string]bool{}
		}
		r.connSessions[conn][id] = true
		if _, ok := r.sessionStates[id]; !ok {
			r.sessionStates[id] = &sessionState{}
		}
		st = r.sessionStates[id]
		r.mu.Unlock()
		// initialize/attach state
		st.mu.Lock()
		// Persist caller-provided useClipboard if present, default true otherwise
		if v, ok := m["useClipboard"].(bool); ok {
			st.useClipboard = v
		} else {
			st.useClipboard = true
		}
		st.replay = nil
		st.lastSeq = 0
		st.currentConn = conn
		st.suppressNextExit = false // clear any suppression from the previously replaced session
		// Store working directory for prompt history
		if dir != "" {
			st.workingDir = dir
		} else {
			if cwd, err := os.Getwd(); err == nil {
				st.workingDir = cwd
			}
		}
		if st.orphanTimer != nil {
			st.orphanTimer.Stop()
			st.orphanTimer = nil
		}
		// reset stdout throttling state
		if st.throttleTimer != nil {
			st.throttleTimer.Stop()
			st.throttleTimer = nil
		}
		st.outBuf = nil
		st.lastSend = time.Time{}
		st.needImmediate = false
		st.mu.Unlock()

		// Load prompt history for session initialization with enhanced error handling
		promptHistory, err := r.historyManager.LoadHistory()
		if err != nil {
			log.Printf("Failed to load prompt history for session initialization: %v", err)
			promptHistory = []history.PromptHistoryEntry{} // Continue with empty history
		}

		// Send opened with PID, resumed=false, and prompt history
		SendJSON(conn, map[string]any{
			"type":          "opened",
			"id":            m["id"],
			"sessionId":     id,
			"pid":           sess.PID(),
			"resumed":       false,
			"promptHistory": promptHistory,
		})
		go r.pipeStdout(id, sess)
		go func(localID string, localSess *session.Session) {
			defer cancel()
			err := localSess.Wait()
			// check if this session is still the current one; if replaced, do not cleanup or notify
			r.mu.Lock()
			current := r.sessions[localID]
			st := r.sessionStates[localID]
			replaced := current != localSess
			r.mu.Unlock()
			if replaced {
				return
			}
			// notify current connection if present
			if st != nil {
				st.mu.Lock()
				suppress := st.suppressNextExit
				if suppress {
					st.suppressNextExit = false
				}
				c := st.currentConn
				// stop any orphan timer since process ended
				if st.orphanTimer != nil {
					st.orphanTimer.Stop()
					st.orphanTimer = nil
				}
				// stop any stdout throttle timer
				if st.throttleTimer != nil {
					st.throttleTimer.Stop()
					st.throttleTimer = nil
				}
				st.mu.Unlock()
				if c != nil && !suppress {
					SendJSON(c, map[string]any{"type": "exit", "sessionId": localID, "code": exitCode(err)})
				}
			}
			// cleanup maps (still the same session)
			r.mu.Lock()
			delete(r.sessions, localID)
			delete(r.sessionStates, localID)
			r.mu.Unlock()
		}(id, sess)
	case "stdin":
		sid, _ := m["sessionId"].(string)
		dataB64, _ := m["dataBase64"].(string)
		b, err := base64.StdEncoding.DecodeString(dataB64)
		if err != nil {
			Errorf(conn, "bad base64")
			return nil
		}
		r.mu.Lock()
		sess := r.sessions[sid]
		st := r.sessionStates[sid]
		r.mu.Unlock()

		// Save history entry first (non-blocking), even if there's no active session
		if historyData, ok := m["historyEntry"].(map[string]any); ok {
			// Extract history entry fields
			id, _ := historyData["id"].(string)
			serializedContent, _ := historyData["serializedContent"].(string)

			// Determine projectCwd using session state if available
			var projectCwd string
			if st != nil {
				st.mu.Lock()
				projectCwd = st.workingDir
				st.mu.Unlock()
			}
			if projectCwd == "" {
				// Fallback to current process working directory
				if cwd, err := os.Getwd(); err == nil {
					projectCwd = cwd
				}
			}

			// Save prompt to history with frontend-provided ID (async to avoid blocking)
			go func() {
				if err := r.historyManager.SavePromptWithID(id, serializedContent, projectCwd); err != nil {
					log.Printf("Failed to save prompt to history (non-blocking): %v", err)
				}
			}()
		}

		// If there's no active session, we still saved the history above.
		if sess == nil {
			Errorf(conn, "no session")
			return nil
		}

		_, _ = sess.Stdin().Write(b)
		// Mark that the next stdout should be sent immediately.
		if st != nil {
			st.mu.Lock()
			// If there's already buffered output and an active connection, flush it now; else mark immediate
			if len(st.outBuf) > 0 && st.currentConn != nil {
				st.needImmediate = false
				if st.throttleTimer != nil {
					st.throttleTimer.Stop()
					st.throttleTimer = nil
				}
				st.mu.Unlock()
				r.flushStdout(sid)
			} else {
				st.needImmediate = true
				st.mu.Unlock()
			}
		}
	case "resize":
		sid, _ := m["sessionId"].(string)
		cols := asInt(m["cols"])
		rows := asInt(m["rows"])
		r.mu.Lock()
		sess := r.sessions[sid]
		r.mu.Unlock()
		if sess != nil {
			_ = sess.Resize(cols, rows)
		}
	case "injectFiles":
		// Inject file contents either directly or via clipboard+paste depending on session preference
		sid, _ := m["sessionId"].(string)
		paths, _ := anyToStrings(m["paths"])

		r.mu.Lock()
		sess := r.sessions[sid]
		st := r.sessionStates[sid]
		r.mu.Unlock()

		if sess == nil {
			Errorf(conn, "no session")
			return nil
		}

		// Read file contents once
		contents := fileutil.ReadMultipleFiles(paths)
		var b strings.Builder
		for _, content := range contents {
			if content == "" {
				continue
			}
			b.WriteString(content)
			if !strings.HasSuffix(content, " ") {
				b.WriteString(" ")
			}
		}
		payload := b.String()
		if payload == "" {
			return nil
		}

		// If useClipboard is enabled for this session, perform clipboard-based paste.
		useClipboard := false
		if st != nil {
			st.mu.Lock()
			useClipboard = st.useClipboard
			st.mu.Unlock()
		}
		if useClipboard {
			// 1) backup clipboard, 2) set payload exact as-is, 3) send Ctrl+V, 4) restore clipboard after terminal becomes idle (~1s)
			prev, prevErr := getClipboard()
			if err := setClipboard(payload); err == nil {
				// send Ctrl+V (0x16)
				r.waitStdoutIdle(sid, 2*stdoutThrottleInterval)
				_, _ = sess.Stdin().Write([]byte{0x16})
				// Restore previous clipboard content after terminal output becomes idle
				r.waitStdoutIdle(sid, 1*time.Second)
				if prevErr == nil {
					_ = setClipboard(prev)
				}
				return nil
			}
			// If setting clipboard failed, fall through to direct injection as a robust fallback
		}

		// Fallback: direct injection with normalized and escaped newlines (legacy behavior)
		var b2 strings.Builder
		for _, content := range contents {
			if content == "" {
				continue
			}
			processed := strings.ReplaceAll(content, "\r\n", "\n")
			processed = strings.ReplaceAll(processed, "\r", "\n")
			processed = strings.ReplaceAll(processed, "\n", "\\\n")
			if processed != "" && !strings.HasSuffix(processed, " ") {
				processed += " "
			}
			b2.WriteString(processed)
		}
		payload2 := b2.String()
		if payload2 == "" {
			return nil
		}
		w := bufio.NewWriterSize(sess.Stdin(), 64*1024)
		_, _ = io.WriteString(w, payload2)
		_ = w.Flush()
		// Hint stdout pipeline to flush promptly after large injection
		r.mu.Lock()
		st = r.sessionStates[sid]
		r.mu.Unlock()
		if st != nil {
			st.mu.Lock()
			if len(st.outBuf) > 0 && st.currentConn != nil {
				st.needImmediate = false
				if st.throttleTimer != nil {
					st.throttleTimer.Stop()
					st.throttleTimer = nil
				}
				st.mu.Unlock()
				r.flushStdout(sid)
			} else {
				st.needImmediate = true
				st.mu.Unlock()
			}
		}
	case "snapshot":
		// Client requests replay of recent stdout bytes for resynchronization
		sid, _ := m["sessionId"].(string)
		r.mu.Lock()
		st := r.sessionStates[sid]
		r.mu.Unlock()
		if st == nil {
			return SendJSON(conn, map[string]any{"type": "snapshot", "sessionId": sid, "dataBase64": "", "lastSeq": 0})
		}
		st.mu.Lock()
		data := make([]byte, len(st.replay))
		copy(data, st.replay)
		last := st.lastSeq
		st.mu.Unlock()
		data = sanitizeSnapshot(data)
		return SendJSON(conn, map[string]any{"type": "snapshot", "sessionId": sid, "dataBase64": base64.StdEncoding.EncodeToString(data), "lastSeq": last})
	case "fontSizeChanged":
		// Frontend notifies that font size has changed in the UI
		fontSize := asInt(m["fontSize"])
		if fontSize > 0 && fontSize >= 8 && fontSize <= 72 {
			// Store the font size change
			r.mu.Lock()
			r.currentFontSize = fontSize
			r.mu.Unlock()
		}
	case "updateUseClipboard":
		// Frontend notifies that useClipboard setting has changed
		useClipboard, ok := m["useClipboard"].(bool)
		if !ok {
			log.Printf("Invalid useClipboard value in updateUseClipboard message")
			return nil
		}

		// If sessionId is provided, update that specific session
		if sid, hasSid := m["sessionId"].(string); hasSid && sid != "" {
			r.mu.Lock()
			st := r.sessionStates[sid]
			r.mu.Unlock()

			if st != nil {
				st.mu.Lock()
				st.useClipboard = useClipboard
				st.mu.Unlock()
			} else {
				log.Printf("Warning: received updateUseClipboard for unknown session %s", sid)
			}
		} else {
			// No sessionId provided - update all active sessions
			r.mu.Lock()
			for _, st := range r.sessionStates {
				if st != nil {
					st.mu.Lock()
					st.useClipboard = useClipboard
					st.mu.Unlock()
				}
			}
			r.mu.Unlock()
		}
	case "savePrompt":
		// Persist a prompt history entry without sending anything to stdin
		if historyData, ok := m["historyEntry"].(map[string]any); ok {
			id, _ := historyData["id"].(string)
			serializedContent, _ := historyData["serializedContent"].(string)

			// Determine projectCwd from session state if available
			sid, _ := m["sessionId"].(string)
			var projectCwd string
			r.mu.Lock()
			st := r.sessionStates[sid]
			r.mu.Unlock()
			if st != nil {
				st.mu.Lock()
				projectCwd = st.workingDir
				st.mu.Unlock()
			}
			if projectCwd == "" {
				if cwd, err := os.Getwd(); err == nil {
					projectCwd = cwd
				}
			}

			// Save asynchronously; do not block router
			go func() {
				if err := r.historyManager.SavePromptWithID(id, serializedContent, projectCwd); err != nil {
					log.Printf("Failed to save prompt via savePrompt: %v", err)
				}
			}()
		}
		return SendJSON(conn, map[string]any{"type": "promptSaved"})
	case "removePrompt":

		// Remove a prompt from history
		promptId, ok := m["promptId"].(string)
		if !ok || promptId == "" {
			log.Printf("Invalid or missing promptId in removePrompt message")
			return fmt.Errorf("invalid promptId")
		}

		// Remove from persistent storage (async to avoid blocking WebSocket)
		go func() {
			if err := r.historyManager.RemovePrompt(promptId); err != nil {
				log.Printf("Failed to remove prompt %s from history: %v", promptId, err)
				// Note: This is intentionally non-blocking - removal failures should not affect UI
			} else {
				log.Printf("Successfully removed prompt %s from history", promptId)
			}
		}()

		// Send acknowledgment to frontend (optional, but helps with error handling)
		return SendJSON(conn, map[string]any{
			"type":     "promptRemoved",
			"promptId": promptId,
		})
	case "send":
		// Combined send message that handles text, history, and file injection in one go
		// Behaves like 'injectFiles' for file handling (respects useClipboard) and like 'stdin' for history
		sid, _ := m["sessionId"].(string)
		dataB64, _ := m["dataBase64"].(string)
		paths, _ := anyToStrings(m["paths"])

		// Decode text data
		var textData []byte
		var err error
		if dataB64 != "" {
			textData, err = base64.StdEncoding.DecodeString(dataB64)
			if err != nil {
				Errorf(conn, "bad base64 in send message")
				return nil
			}
		}

		r.mu.Lock()
		sess := r.sessions[sid]
		st := r.sessionStates[sid]
		r.mu.Unlock()

		// Save history entry first (non-blocking), even if there's no active session
		if historyData, ok := m["historyEntry"].(map[string]any); ok {
			// Extract history entry fields
			id, _ := historyData["id"].(string)
			serializedContent, _ := historyData["serializedContent"].(string)

			// Determine projectCwd using session state if available
			var projectCwd string
			if st != nil {
				st.mu.Lock()
				projectCwd = st.workingDir
				st.mu.Unlock()
			}
			if projectCwd == "" {
				// Fallback to current process working directory
				if cwd, err := os.Getwd(); err == nil {
					projectCwd = cwd
				}
			}

			// Save prompt to history with frontend-provided ID (async to avoid blocking)
			go func() {
				if err := r.historyManager.SavePromptWithID(id, serializedContent, projectCwd); err != nil {
					log.Printf("Failed to save prompt to history (non-blocking): %v", err)
				}
			}()
		}

		// If there's no active session, we still saved the history above.
		if sess == nil {
			Errorf(conn, "no session")
			return nil
		}

		// Build combined payload: text + file contents
		var combinedPayload strings.Builder

		// Add text data first if present
		if len(textData) > 0 {
			combinedPayload.Write(textData)
		}

		// Add file contents if paths provided
		if len(paths) > 0 {
			contents := fileutil.ReadMultipleFiles(paths)
			for _, content := range contents {
				if content == "" {
					continue
				}
				combinedPayload.WriteString(content)
				if !strings.HasSuffix(content, " ") {
					combinedPayload.WriteString(" ")
				}
			}
		}

		finalPayload := combinedPayload.String()
		if finalPayload == "" {
			return nil
		}

		// If useClipboard is enabled for this session, perform clipboard-based paste (like injectFiles).
		useClipboard := false
		if st != nil {
			st.mu.Lock()
			useClipboard = st.useClipboard
			st.mu.Unlock()
		}
		if useClipboard {
			// 1) backup clipboard, 2) set payload exact as-is, 3) send Ctrl+V, 4) restore clipboard after terminal becomes idle (~1s)
			prev, prevErr := getClipboard()
			if err := setClipboard(finalPayload); err == nil {
				// send Ctrl+V (0x16)
				r.waitStdoutIdle(sid, 2*stdoutThrottleInterval)
				_, _ = sess.Stdin().Write([]byte{0x16})
				// Restore previous clipboard content after terminal output becomes idle
				r.waitStdoutIdle(sid, 1*time.Second)
				if prevErr == nil {
					_ = setClipboard(prev)
				}

				// Mark that the next stdout should be sent immediately.
				if st != nil {
					st.mu.Lock()
					if len(st.outBuf) > 0 && st.currentConn != nil {
						st.needImmediate = false
						if st.throttleTimer != nil {
							st.throttleTimer.Stop()
							st.throttleTimer = nil
						}
						st.mu.Unlock()
						r.flushStdout(sid)
					} else {
						st.needImmediate = true
						st.mu.Unlock()
					}
				}
				return nil
			}
			// If setting clipboard failed, fall through to direct injection as a robust fallback
		}

		// Fallback: direct injection with normalized and escaped newlines (like injectFiles)
		var processedPayload strings.Builder

		// Process text data if present
		if len(textData) > 0 {
			textStr := string(textData)
			processed := strings.ReplaceAll(textStr, "\r\n", "\n")
			processed = strings.ReplaceAll(processed, "\r", "\n")
			processed = strings.ReplaceAll(processed, "\n", "\\\n")
			processedPayload.WriteString(processed)
		}

		// Process file contents if present
		if len(paths) > 0 {
			contents := fileutil.ReadMultipleFiles(paths)
			for _, content := range contents {
				if content == "" {
					continue
				}
				processed := strings.ReplaceAll(content, "\r\n", "\n")
				processed = strings.ReplaceAll(processed, "\r", "\n")
				processed = strings.ReplaceAll(processed, "\n", "\\\n")
				if processed != "" && !strings.HasSuffix(processed, " ") {
					processed += " "
				}
				processedPayload.WriteString(processed)
			}
		}

		finalProcessedPayload := processedPayload.String()
		if finalProcessedPayload == "" {
			return nil
		}

		w := bufio.NewWriterSize(sess.Stdin(), 64*1024)
		_, _ = io.WriteString(w, finalProcessedPayload)
		_ = w.Flush()

		// Mark that the next stdout should be sent immediately.
		if st != nil {
			st.mu.Lock()
			if len(st.outBuf) > 0 && st.currentConn != nil {
				st.needImmediate = false
				if st.throttleTimer != nil {
					st.throttleTimer.Stop()
					st.throttleTimer = nil
				}
				st.mu.Unlock()
				r.flushStdout(sid)
			} else {
				st.needImmediate = true
				st.mu.Unlock()
			}
		}
	}
	return nil
}

func (r *Router) pipeStdout(sid string, sess *session.Session) {
	const maxReplay = 256 * 1024 // keep last 256KiB of output for snapshot
	buf := make([]byte, 32*1024)
	reader := sess.Stdout()
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			// Update session state (replay buffer and seq)
			r.mu.Lock()
			st := r.sessionStates[sid]
			r.mu.Unlock()
			if st != nil {
				st.mu.Lock()
				st.replay = append(st.replay, buf[:n]...)
				if len(st.replay) > maxReplay {
					// trim from the front to keep within cap
					st.replay = st.replay[len(st.replay)-maxReplay:]
				}
				// Accumulate into throttled buffer
				st.outBuf = append(st.outBuf, buf[:n]...)
				st.lastEnqueue = time.Now()
				// Decide whether to flush now or schedule
				c := st.currentConn
				if c != nil {
					now := time.Now()
					if st.needImmediate || now.Sub(st.lastSend) >= stdoutThrottleInterval {
						// flush immediately
						st.mu.Unlock()
						r.flushStdout(sid)
					} else {
						// schedule flush if not already scheduled
						if st.throttleTimer == nil {
							rem := stdoutThrottleInterval - now.Sub(st.lastSend)
							if rem < 0 {
								rem = 0
							}
							localSid := sid
							st.throttleTimer = time.AfterFunc(rem, func() {
								r.flushStdout(localSid)
							})
						}
						st.mu.Unlock()
					}
				} else {
					// No active connection; keep buffering only
					st.mu.Unlock()
				}
				// No state available; continue buffering reads without sending
			}
		}
		if err != nil {
			if !isExpectedReadError(err) {
				log.Printf("stdout err: %v", err)
			}
			return
		}
	}
}

// flushStdout flushes the buffered stdout for a session if any, respecting the throttle interval.
func (r *Router) flushStdout(sid string) {
	r.mu.Lock()
	st := r.sessionStates[sid]
	r.mu.Unlock()
	if st == nil {
		return
	}
	st.mu.Lock()
	c := st.currentConn
	if c == nil || len(st.outBuf) == 0 {
		// Nothing to send
		st.throttleTimer = nil
		st.mu.Unlock()
		return
	}
	data := make([]byte, len(st.outBuf))
	copy(data, st.outBuf)
	st.outBuf = nil
	// Advance sequence only when we actually send
	st.lastSeq++
	seq := st.lastSeq
	st.needImmediate = false
	if st.throttleTimer != nil {
		st.throttleTimer.Stop()
		st.throttleTimer = nil
	}
	st.mu.Unlock()
	if err := SendJSON(c, map[string]any{
		"type": "stdout", "sessionId": sid, "dataBase64": base64.StdEncoding.EncodeToString(data), "seq": seq,
	}); err != nil {
		log.Printf("ws write error: %v", err)
	}
	// Record lastSend after the write completes to better reflect delivery timing
	r.mu.Lock()
	st = r.sessionStates[sid]
	r.mu.Unlock()
	if st != nil {
		st.mu.Lock()
		st.lastSend = time.Now()
		st.mu.Unlock()
	}
}

// waitStdoutIdle waits until stdout for the given session has been fully flushed
// and no data has been sent for at least the specified idle period.
// It returns early after a safety timeout to avoid indefinite blocking if the
// session is closed or no stdout activity occurs.
func (r *Router) waitStdoutIdle(sid string, idle time.Duration) {
	// Safety cap: don't block forever
	maxWait := 60 * time.Second
	deadline := time.Now().Add(maxWait)
	start := time.Now()
	//log.Printf("waitStdoutIdle: start sid=%s idle=%s", sid, idle)
	for {
		r.mu.Lock()
		st := r.sessionStates[sid]
		r.mu.Unlock()
		if st == nil {
			return
		}
		st.mu.Lock()
		outEmpty := len(st.outBuf) == 0
		lastSend := st.lastSend
		lastEnqueue := st.lastEnqueue
		tt := st.throttleTimer
		st.mu.Unlock()

		now := time.Now()
		// Determine the most recent activity since we started waiting
		lastActivity := lastSend
		if lastEnqueue.After(lastActivity) {
			lastActivity = lastEnqueue
		}
		// If we've seen activity after 'start', require a full idle window AND no pending buffers/flushes
		if lastActivity.After(start) {
			if outEmpty && tt == nil && now.Sub(lastActivity) >= idle {
				//log.Printf("waitStdoutIdle: stop sid=%s reason=idleWindow wait=%s", sid, time.Since(start))
				return
			}
		} else {
			// No activity yet; do not return immediately just because previous activity was long ago
			// Wait up to 'idle' as a minimal debounce; after that, we assume nothing will come
			if now.Sub(start) >= idle {
				//log.Printf("waitStdoutIdle: stop sid=%s reason=noActivity wait=%s", sid, time.Since(start))
				return
			}
		}
		if now.After(deadline) {
			//log.Printf("waitStdoutIdle: stop sid=%s reason=deadline wait=%s", sid, time.Since(start))
			return
		}
		// Sleep a small amount; adapt to remaining idle time if any
		sleep := 25 * time.Millisecond
		if lastActivity.After(start) {
			rem := idle - now.Sub(lastActivity)
			if rem > 0 && rem < sleep {
				sleep = rem
			}
		} else {
			rem := idle - now.Sub(start)
			if rem > 0 && rem < sleep {
				sleep = rem
			}
		}
		time.Sleep(sleep)
	}
}

func (r *Router) cleanupConn(conn *websocket.Conn) {
	r.mu.Lock()
	ids := r.connSessions[conn]
	delete(r.connSessions, conn)
	r.mu.Unlock()
	for sid := range ids {
		// Detach: clear currentConn and start orphan timer for graceful cleanup
		r.mu.Lock()
		st := r.sessionStates[sid]
		r.mu.Unlock()
		if st != nil {
			st.mu.Lock()
			if st.currentConn == conn {
				st.currentConn = nil
			}
			if st.orphanTimer != nil {
				st.orphanTimer.Stop()
				st.orphanTimer = nil
			}
			localSid := sid
			st.orphanTimer = time.AfterFunc(30*time.Second, func() {
				// If not resumed within grace period, terminate and cleanup
				r.mu.Lock()
				sess := r.sessions[localSid]
				delete(r.sessions, localSid)
				st2 := r.sessionStates[localSid]
				delete(r.sessionStates, localSid)
				r.mu.Unlock()
				if sess != nil {
					_ = sess.Close()
				}
				if st2 != nil {
					st2.mu.Lock()
					st2.replay = nil
					st2.lastSeq = 0
					st2.currentConn = nil
					st2.orphanTimer = nil
					st2.mu.Unlock()
				}
			})
			st.mu.Unlock()
		} else {
			// No state; best-effort close session after grace
			r.mu.Lock()
			sess := r.sessions[sid]
			r.mu.Unlock()
			if sess != nil {
				localSid := sid
				time.AfterFunc(30*time.Second, func() { _ = sess.Close(); r.mu.Lock(); delete(r.sessions, localSid); r.mu.Unlock() })
			}
		}
	}
}

func anyToStrings(a any) ([]string, bool) {
	if a == nil {
		return nil, true
	}
	arr, ok := a.([]any)
	if !ok {
		return nil, false
	}
	res := make([]string, 0, len(arr))
	for _, v := range arr {
		if s, ok := v.(string); ok {
			res = append(res, s)
		}
	}
	return res, true
}

func asInt(v any) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	default:
		return 0
	}
}

// sanitizeSnapshot removes a truncated OSC 10/11 sequence near the beginning of the
// snapshot buffer. If the replay starts mid-OSC (missing the leading ESC), terminals
// may render text like "]11;rgb:0000/0000/0000". We detect a stray ']' followed by
// "10;" or "11;" within the first ~64 bytes (after optional CR/LF), and drop it
// through its terminator (BEL or ST: ESC '\\').
func sanitizeSnapshot(b []byte) []byte {
	if len(b) == 0 {
		return b
	}
	// Skip leading CR/LF
	base := 0
	for base < len(b) && (b[base] == 0x0D || b[base] == 0x0A) {
		base++
	}
	limit := base + 64
	if limit > len(b) {
		limit = len(b)
	}
	for p := base; p+3 < limit; p++ {
		if b[p] != ']' {
			continue
		}
		// If previous is ESC, this is a proper OSC, skip
		if p > 0 && b[p-1] == 0x1B {
			continue
		}
		if b[p+1] == '1' && (b[p+2] == '0' || b[p+2] == '1') && b[p+3] == ';' {
			// Find BEL or ST
			for q := p + 4; q < len(b)-1; q++ {
				if b[q] == 0x07 { // BEL
					// remove [p, q+1)
					out := make([]byte, 0, len(b)-(q+1-p))
					out = append(out, b[:p]...)
					out = append(out, b[q+1:]...)
					return out
				}
				if b[q] == 0x1B && b[q+1] == '\\' { // ESC '\\' (ST)
					out := make([]byte, 0, len(b)-(q+2-p))
					out = append(out, b[:p]...)
					out = append(out, b[q+2:]...)
					return out
				}
			}
			// No terminator found: drop from p to end
			return b[:p]
		}
	}
	return b
}

func isExpectedReadError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, io.EOF) {
		return true
	}
	// Some platforms return EIO when the PTY slave is closed
	var pathErr *os.PathError
	if errors.As(err, &pathErr) {
		if errno, ok := pathErr.Err.(syscall.Errno); ok {
			if errno == syscall.EIO {
				return true
			}
		}
	}
	return false
}

// GetAndResetFontSize returns the current font size and resets it to 0
// Returns 0 if no font size change has been received
func (r *Router) GetAndResetFontSize() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	fontSize := r.currentFontSize
	r.currentFontSize = 0 // Reset after reading
	return fontSize
}

func exitCode(err error) int {
	if err == nil {
		return 0
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode()
	}
	return -1
}
