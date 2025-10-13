package ws

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/gorilla/websocket"
)

var wsWriteMu sync.Map // map[*websocket.Conn]*sync.Mutex

type Server struct {
	Token     string
	Upgrader  websocket.Upgrader
	OnMessage func(conn *websocket.Conn, msg map[string]any)
	// OnClose is called when the websocket connection is about to close.
	// It can be used by higher layers to perform cleanup tied to this connection.
	OnClose func(conn *websocket.Conn)
	seq     uint64
}

func NewServer(token string) *Server {
	return &Server{
		Token: token,
		Upgrader: websocket.Upgrader{
			// Enforce same-origin from loopback and allow null (JCEF). Cross-site WS blocked.
			CheckOrigin: func(r *http.Request) bool {
				// Accept explicit null origin (e.g., JCEF)
				origin := r.Header.Get("Origin")
				if origin == "null" {
					return true
				}
				if origin == "" {
					// No origin header: allow only if remote addr is loopback
					host, _, err := net.SplitHostPort(r.RemoteAddr)
					if err != nil {
						return false
					}
					ip := net.ParseIP(host)
					return ip != nil && ip.IsLoopback()
				}
				u, err := url.Parse(origin)
				if err != nil {
					return false
				}
				if u.Scheme != "http" && u.Scheme != "https" {
					return false
				}
				h := u.Hostname()
				if h == "localhost" || h == "127.0.0.1" || h == "::1" {
					return true
				}
				// Additional allowance: RFC6874 IPv6 loopback variants like "[::1]"
				if ip := net.ParseIP(h); ip != nil && ip.IsLoopback() {
					return true
				}
				return false
			},
		},
	}
}

func (s *Server) HandleWS(w http.ResponseWriter, r *http.Request) {
	// 1) Try to authenticate via WebSocket subprotocol: auth.bearer.<token>
	var respHdr http.Header
	var ok bool
	if raw := r.Header.Get("Sec-WebSocket-Protocol"); raw != "" {
		parts := strings.Split(raw, ",")
		for _, p := range parts {
			p = strings.TrimSpace(p)
			const pref = "auth.bearer."
			if strings.HasPrefix(p, pref) {
				tok := strings.TrimPrefix(p, pref)
				if tok == s.Token {
					ok = true
					// Echo back the selected subprotocol
					respHdr = http.Header{}
					respHdr.Set("Sec-WebSocket-Protocol", p)
					break
				}
			}
		}
	}
	if !ok {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	c, err := s.Upgrader.Upgrade(w, r, respHdr)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}
	defer func() {
		// notify upper layers first, then close the socket
		if s.OnClose != nil {
			s.OnClose(c)
		}
		// remove write lock for this connection
		if v, ok := wsWriteMu.Load(c); ok {
			wsWriteMu.Delete(c)
			_ = v // allow GC of the mutex
		}
		_ = c.Close()
	}()

	for {
		_, data, err := c.ReadMessage()
		if err != nil {
			return
		}
		var m map[string]any
		if err := json.Unmarshal(data, &m); err != nil {
			log.Printf("bad json: %v", err)
			continue
		}
		if s.OnMessage != nil {
			s.OnMessage(c, m)
		}
	}
}

func SendJSON(c *websocket.Conn, v any) error {
	buf, err := json.Marshal(v)
	if err != nil {
		return err
	}
	// serialize writes per connection
	var mu *sync.Mutex
	if v, ok := wsWriteMu.Load(c); ok {
		mu = v.(*sync.Mutex)
	} else {
		m := &sync.Mutex{}
		actual, _ := wsWriteMu.LoadOrStore(c, m)
		mu = actual.(*sync.Mutex)
	}
	mu.Lock()
	defer mu.Unlock()
	return c.WriteMessage(websocket.TextMessage, buf)
}

func B64(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

func (s *Server) NextSeq() uint64 { return atomic.AddUint64(&s.seq, 1) }

func Hello(c *websocket.Conn) {
	_ = SendJSON(c, map[string]any{
		"type":      "welcome",
		"sessionId": "ctrl",
		"features":  map[string]bool{"streaming": true, "pty": true},
	})
}

func Stdout(c *websocket.Conn, session string, data []byte, seq uint64) error {
	return SendJSON(c, map[string]any{
		"type":       "stdout",
		"sessionId":  session,
		"dataBase64": B64(data),
		"seq":        seq,
	})
}

func Errorf(c *websocket.Conn, format string, args ...any) {
	_ = SendJSON(c, map[string]any{
		"type":    "error",
		"message": fmt.Sprintf(format, args...),
	})
}
